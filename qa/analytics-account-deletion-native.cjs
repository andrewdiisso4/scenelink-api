#!/usr/bin/env node
'use strict';
// Real PostgreSQL row-lock races, using only an explicitly named fresh loopback
// fixture database. No provider requests, production sessions, or real accounts.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{once}=require('node:events');
const crypto=require('node:crypto'),{Pool}=require('pg'),express=require('express');
const jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');
const {makeAuth}=require('../src/launch/session');
const identity=require('../src/launch/identity');
const root=path.resolve(__dirname,'..'),connection=process.env.TEST_DATABASE_URL;
let target;try{target=new URL(connection);}catch(_){throw Error('REFUSED: explicit fresh native analytics fixture URL required');}
assert(process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT==='yes'&&['postgres:','postgresql:'].includes(target.protocol)&&
  ['127.0.0.1','[::1]'].includes(target.hostname)&&target.port&&target.pathname==='/scenelink_test_account_analytics'&&
  !target.search&&!target.hash&&!/[?#]/.test(connection),'REFUSED: fresh literal-loopback scenelink_test_account_analytics database required');
assert(!fs.existsSync(path.join(root,'.env')),'REFUSED: use a prepared checkout without a .env file');
const deferred=()=>Promise.withResolvers();
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Timed out: '+label)),5000);})]);}finally{clearTimeout(timer);}}

function loadRoute(file,replacements){
  const filename=path.join(root,file),realRequire=createRequire(filename),loaded={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:loaded,console,require:name=>Object.hasOwn(replacements,name)?replacements[name]:realRequire(name)},{filename});
  return loaded.exports;
}

test('native PostgreSQL serializes every authenticated analytics writer with account deletion',async t=>{
  const pool=new Pool({connectionString:connection,max:10,connectionTimeoutMillis:3000,application_name:'scenelink-native-account-analytics'});
  t.after(()=>pool.end());
  assert.equal((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,'Refuse nonempty database');
  const version=(await pool.query('SHOW server_version')).rows[0].server_version;
  assert(Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num)>=180000,'Native PostgreSQL 18+ required');
  await pool.query(fs.readFileSync(path.join(root,'src/config/schema.sql'),'utf8'));
  const migrations=['migrations','src/migrations'].flatMap(dir=>fs.readdirSync(path.join(root,dir))
    .filter(file=>/^(002_|003_|004_|005_|006_|007_|008_|009_|010_|011_|012_|013_|014_|016_|018_).*\.sql$/.test(file))
    .map(file=>path.join(root,dir,file))).sort((a,b)=>path.basename(a).localeCompare(path.basename(b))||a.localeCompare(b));
  for(const file of migrations)await pool.query(fs.readFileSync(file,'utf8'));
  const analyticsSource=fs.readFileSync(path.join(root,'src/routes/analytics.js'),'utf8');
  await pool.query(analyticsSource.match(/CREATE TABLE IF NOT EXISTS analytics_events \([\s\S]*?\);/)[0]);

  let control=null;
  const isInsert=sql=>/^\s*INSERT\s+INTO\s+analytics_events\b/i.test(sql);
  const writerPool={
    async query(sql,values){
      if(!isInsert(sql)||!control)return pool.query(sql,values);
      const c=control;
      if(c.order==='delete-first'){c.started.resolve();await c.gate.promise;}
      try{const result=await pool.query(sql,values);if(c.order==='insert-first'){c.started.resolve();await c.gate.promise;}return result;}
      finally{c.finished.resolve();}
    },
    async connect(){
      const c=control;
      if(c?.order==='delete-first'){c.started.resolve();await c.gate.promise;}
      const client=await pool.connect();if(c)c.writerPid=client.processID;
      return{async query(sql,values){
        if(c?.order==='fail-insert'&&isInsert(sql))throw Error('Synthetic analytics INSERT failure');
        if(c?.order==='fail-commit'&&sql==='COMMIT')throw Error('Synthetic analytics COMMIT failure');
        const result=await client.query(sql,values);
        if(c&&c.order==='insert-first'&&isInsert(sql)){c.started.resolve();await c.gate.promise;}
        return result;
      },release(){client.release();c?.finished.resolve();}};
    }
  };
  const deletionPool={query:(...args)=>pool.query(...args),async connect(){
    const client=await pool.connect();
    return{query(sql,values){
      if(control&&/FROM users WHERE id=\$1 FOR UPDATE/.test(sql)){control.deletionPid=client.processID;control.deletionStarted.resolve();}
      return client.query(sql,values);
    },release:()=>client.release()};
  }};
  const auth=makeAuth({jwt,pool,secret:crypto.randomBytes(48).toString('hex')});
  const next=(_req,_res,done)=>done(),app=express(),router=express.Router();app.use(express.json());
  identity.install({router,pool:deletionPool,auth,write:next,authLimit:next,resetLimit:next,bcrypt,mailer:{isReady:()=>false}});
  app.use('/api',router);
  const dependencies={'../config/database':writerPool,'../middleware/auth':auth,'../middleware/rateLimits':{aiLimiter:next}};
  app.use('/api/analytics',loadRoute('src/routes/analytics.js',dependencies));
  for(const model of [false,true])app.use(model?'/api/concierge-model':'/api/concierge-directory',loadRoute('src/routes/concierge.js',{
    ...dependencies,'./conciergeAI':{isEnabled:()=>model,runAIConcierge:async()=>({source:'openai',reply:'Fictional response',candidates:[],recommendedVenues:[],recommendedPlan:null})}
  }));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin='http://127.0.0.1:'+server.address().port;
  const originalFetch=global.fetch;let externalAttempts=0;
  global.fetch=(url,options)=>{if(new URL(String(url)).origin!==origin){externalAttempts++;throw Error('External requests are forbidden');}return originalFetch(url,options);};
  t.after(()=>{global.fetch=originalFetch;});
  async function api(method,route,body,token){
    const response=await fetch(origin+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    return{status:response.status,data:await response.json()};
  }
  const password='Fictional native deletion password',hash=await bcrypt.hash(password,4);
  async function account(){
    const id=crypto.randomUUID();
    const user=(await pool.query(`INSERT INTO users(id,email,username,password_hash,email_verified_at,verified_email)
      VALUES($1,$2::text,$3,$4,NOW(),$2::text) RETURNING *`,[id,id+'@example.invalid','native_'+id.slice(0,8),hash])).rows[0];
    return{...user,token:auth.generateToken(user)};
  }
  const other=await account();await pool.query("INSERT INTO analytics_events(event,user_id,anon) VALUES('keep_fixture',$1,false)",[other.id]);
  const writers=[['batch','/analytics/event',{events:[{event:'page_view'},{event:'profile_open'}]}],
    ['directory','/concierge-directory',{message:'Find restaurants',session_id:'native-directory-delete-race'}],
    ['model','/concierge-model',{message:'Find restaurants',ai:true,session_id:'native-model-delete-race'}]];
  const orders=process.env.SCENELINK_ANALYTICS_DELETE_BASELINE==='yes'?['delete-first']:['delete-first','insert-first'];
  for(const order of orders)for(const [name,route,body]of writers)await t.test(order+' '+name,async()=>{
    const user=await account();
    const c=control={order,started:deferred(),finished:deferred(),gate:deferred(),deletionStarted:deferred(),deletionDone:false};
    let writing,deleting;
    try{
      writing=api('POST',route,{...body,user_id:other.id,userId:other.id},user.token);
      await bounded(c.started.promise,'writer reached controlled ordering point');
      deleting=api('DELETE','/auth/account',{password},user.token).then(result=>{c.deletionDone=true;return result;});
      if(order==='delete-first'){
        assert.equal((await bounded(deleting,'account deleted before delayed writer resumes')).status,200);
      }else{
        await bounded(c.deletionStarted.promise,'deletion attempts account lock');
        const deadline=Date.now()+4000;let blocked=false;
        while(Date.now()<deadline&&!c.deletionDone){
          const state=(await pool.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[c.writerPid||0,c.deletionPid])).rows[0];
          if(state.blocked){blocked=true;break;}
        }
        assert.equal(blocked,true,'The real DELETE must wait for the analytics transaction row lock');
      }
      c.gate.resolve();
      const result=await bounded(writing,'writer HTTP response');assert.equal(result.status,200);assert.equal(result.data.ok,true);
      if(name==='batch'&&order==='delete-first')assert.equal(result.data.inserted,0,'Deleted account events must be dropped');
      await bounded(c.finished.promise,'actual writer transaction completion');
      assert.equal((await bounded(deleting,'deletion completion')).status,200);
      assert.equal((await pool.query('SELECT count(*)::int n FROM analytics_events WHERE user_id=$1',[user.id])).rows[0].n,0,'No account identifier may reappear after deletion');
      assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE id=$1',[user.id])).rows[0].n,0);
      assert.equal((await pool.query('SELECT count(*)::int n FROM analytics_events WHERE user_id=$1',[other.id])).rows[0].n,1,'Preserve unrelated account analytics');
    }finally{
      c.gate.resolve();await Promise.allSettled([writing,deleting]);await bounded(c.finished.promise,'cleanup writer completion').catch(()=>{});control=null;
    }
  });
  if(process.env.SCENELINK_ANALYTICS_DELETE_BASELINE!=='yes')for(const failure of ['fail-insert','fail-commit'])for(const [name,route,body]of writers)await t.test(failure+' '+name+' keeps best-effort behavior and rolls back',async()=>{
    const user=await account(),c=control={order:failure,finished:deferred()};
    try{
      const result=await api('POST',route,body,user.token);assert.equal(result.status,200);
      assert.equal(result.data.ok,name!=='batch');
      if(name!=='batch')assert.equal(result.data.source,name==='model'?'openai':'rule-based');
      await bounded(c.finished.promise,'failed transaction rollback and release');
      assert.equal((await pool.query('SELECT count(*)::int n FROM analytics_events WHERE user_id=$1',[user.id])).rows[0].n,0);
      assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE id=$1',[user.id])).rows[0].n,1);
    }finally{control=null;}
  });
  await t.test('guest analytics remains anonymous and batch count reflects inserted events',async()=>{
    const result=await api('POST','/analytics/event',{events:[{event:'guest_fixture',user_id:other.id},{}]});
    assert.equal(result.status,200);assert.equal(result.data.inserted,1);
    const rows=(await pool.query("SELECT user_id,anon FROM analytics_events WHERE event='guest_fixture'")).rows;
    assert.deepEqual(rows,[{user_id:null,anon:true}]);
  });
  assert.equal(externalAttempts,0);
  console.log(JSON.stringify({native_postgres:version,actual_routes:['analytics batch','concierge directory','concierge model','account deletion'],multi_connection_row_locks:true,external_requests:externalAttempts,production_access:false}));
});
