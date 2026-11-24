'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {randomUUID,randomBytes,createHash,generateKeyPairSync}=require('node:crypto');
const {once}=require('node:events');
const express=require('express');
const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');
const {PGlite}=require('@electric-sql/pglite');
const {uuid_ossp}=require('@electric-sql/pglite/contrib/uuid_ossp');
const {pg_trgm}=require('@electric-sql/pglite/contrib/pg_trgm');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const identity=require('../src/launch/identity');
const {makeAuth}=require('../src/launch/session');

test('account deletion uses verified confirmation, real schema cleanup and immediate session invalidation',async t=>{
  const db=await PGlite.create({extensions:{uuid_ossp,pg_trgm,pgcrypto}});
  t.after(()=>db.close());
  const root=path.resolve(__dirname,'..');
  await db.exec(fs.readFileSync(path.join(root,'src/config/schema.sql'),'utf8'));
  const migrations=['migrations','src/migrations'].flatMap(dir=>fs.readdirSync(path.join(root,dir))
    .filter(file=>/^(002_|003_|004_|005_|006_|007_|008_|009_|010_|011_|012_|013_|014_|016_|018_).*\.sql$/.test(file))
    .map(file=>path.join(root,dir,file))).sort((a,b)=>path.basename(a).localeCompare(path.basename(b))||a.localeCompare(b));
  for(const file of migrations)await db.exec(fs.readFileSync(file,'utf8'));
  // This optional table is created by the real analytics router, not by SQL migrations.
  const analyticsSource=fs.readFileSync(path.join(root,'src/routes/analytics.js'),'utf8');
  await db.exec(analyticsSource.match(/CREATE TABLE IF NOT EXISTS analytics_events \([\s\S]*?\);/)[0]);
  let failDelete=false,beforeTransaction;
  const query=async(sql,values)=>{
    if(failDelete&&/^DELETE FROM users WHERE id=\$1/.test(sql))throw Error('Synthetic deletion commit failure');
    return db.query(sql,values);
  };
  const pool={query,connect:async()=>{if(beforeTransaction){const fn=beforeTransaction;beforeTransaction=null;await fn();}return{query,release(){}};}};
  const secret=randomBytes(48).toString('hex');
  const auth=makeAuth({jwt,pool,secret});
  const next=(_req,_res,pass)=>pass();
  const router=express.Router();
  identity.install({router,pool,auth,write:next,authLimit:next,resetLimit:next,bcrypt,mailer:{isReady:()=>false}});
  const app=express();app.use(express.json());app.use('/api',router);

  let googlePayload;
  const appleKeys=generateKeyPairSync('rsa',{modulusLength:2048});
  const oauthFile=path.join(root,'src/routes/oauth.js'),requireFromOAuth=createRequire(oauthFile),loaded={exports:{}};
  vm.runInNewContext(fs.readFileSync(oauthFile,'utf8'),{
    module:loaded,console,process:{env:{GOOGLE_CLIENT_ID:'fictional-google-client',APPLE_CLIENT_ID:'fictional-apple-client'}},
    require(name){
      if(name==='../config/database')return pool;
      if(name==='../middleware/auth')return auth;
      if(name==='../middleware/rateLimits')return{authLimiter:next};
      if(name==='google-auth-library')return{OAuth2Client:class{
        async verifyIdToken(options){assert.equal(options.audience,'fictional-google-client');assert.equal(options.idToken,'fictional-provider-credential');return{getPayload:()=>googlePayload};}
      }};
      if(name==='jwks-rsa')return options=>{
        assert.equal(options.jwksUri,'https://appleid.apple.com/auth/keys');
        return{getSigningKey(kid,done){assert.equal(kid,'fictional-apple-key');done(null,{getPublicKey:()=>appleKeys.publicKey});}};
      };
      return requireFromOAuth(name);
    }
  },{filename:oauthFile});
  app.use('/api/auth',loaded.exports);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin='http://127.0.0.1:'+server.address().port;
  async function api(method,route,body,token){
    const response=await fetch(origin+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const raw=await response.text();let data;try{data=JSON.parse(raw);}catch(_){data={};}
    return{status:response.status,data};
  }
  const password='Fictional password for deletion 123';
  const hash=await bcrypt.hash(password,4);
  async function account(provider=null,withPassword=!provider){
    const id=randomUUID(),email=id+'@example.invalid',subject=provider?'subject-'+id:null;
    const row=(await db.query(`INSERT INTO users(id,email,username,password_hash,oauth_provider,oauth_id,email_verified_at,verified_email)
      VALUES($1,$2::text,$3,$4,$5,$6,NOW(),$2::text) RETURNING *`,[id,email,'fixture_'+id.slice(0,8),withPassword?hash:null,provider,subject])).rows[0];
    return{...row,token:auth.generateToken(row)};
  }
  async function freshGoogle(user){
    googlePayload={sub:user.oauth_id,email:user.email,email_verified:true,name:'Fictional Google owner'};
    const result=await api('POST','/auth/google',{id_token:'fictional-provider-credential'});
    assert.equal(result.status,200);return result.data.token;
  }
  const exists=async id=>(await db.query('SELECT id FROM users WHERE id=$1',[id])).rows.length===1;

  await t.test('OAuth-only owner can delete after real provider-route reauthentication and explicit confirmation',async()=>{
    const user=await account('google'),token=await freshGoogle(user);
    const requirements=await api('GET','/auth/account/deletion',undefined,token);
    assert.equal(requirements.status,200);
    assert.deepEqual(requirements.data.confirmation,{method:'recent_provider_sign_in',provider:'google',recent_sign_in_required:false,recent_sign_in_window_seconds:300,can_delete:true});
    assert.equal((await api('DELETE','/auth/account',{},token)).status,400);
    assert.equal((await api('DELETE','/auth/account',{confirmation:'delete'},token)).status,400);
    assert(await exists(user.id));
    const unrelated=await account();
    const result=await api('DELETE','/auth/account',{confirmation:'DELETE',user_id:unrelated.id},token);
    assert.equal(result.status,200);assert.equal(result.data.deleted,true);
    assert.equal(await exists(user.id),false);assert(await exists(unrelated.id));
    assert.equal((await api('GET','/auth/me',undefined,token)).status,401);
    assert.equal((await api('GET','/auth/me',undefined,user.token)).status,401);
  });

  await t.test('generic, stale, future, mismatched and changed-provider sessions cannot authorize OAuth deletion',async()=>{
    const user=await account('google'),token=await freshGoogle(user),payload=jwt.decode(token),now=Math.floor(Date.now()/1000);
    const signed=changes=>{const p={...payload,...changes};delete p.exp;return jwt.sign(p,secret,{algorithm:'HS256',expiresIn:'1d'});};
    const proof=payload.provider_auth||{provider:'google',subject_hash:'baseline-has-no-proof',at:now};
    for(const invalid of [user.token,
      signed({iat:now-301,provider_auth:{...proof,at:now-301}}),
      signed({iat:now+60,provider_auth:{...proof,at:now+60}}),
      signed({provider_auth:{...proof,provider:'apple'}}),
      signed({provider_auth:{...proof,subject_hash:createHash('sha256').update('different-subject').digest('hex')}}),
      jwt.sign({id:user.id,v:0,provider_auth:proof},secret,{algorithm:'HS256',expiresIn:'1d',noTimestamp:true})]){
      const requirements=await api('GET','/auth/account/deletion',undefined,invalid);
      assert.equal(requirements.status,200);assert.equal(requirements.data.confirmation.can_delete,false);
      const result=await api('DELETE','/auth/account',{confirmation:'DELETE',provider_auth:proof},invalid);
      assert.equal(result.status,409);assert.equal(result.data.code,'ACCOUNT_REAUTHENTICATION_REQUIRED');assert(await exists(user.id));
    }
    await db.query("UPDATE users SET oauth_id='changed-provider-subject' WHERE id=$1",[user.id]);
    assert.equal((await api('DELETE','/auth/account',{confirmation:'DELETE'},token)).status,409);
  });

  await t.test('Apple proof is minted only after actual route signature, issuer and audience validation',async()=>{
    const user=await account('apple');
    const credential=(overrides={})=>jwt.sign({sub:user.oauth_id,email:user.email,email_verified:'true',...overrides},appleKeys.privateKey,{algorithm:'RS256',keyid:'fictional-apple-key',issuer:'https://appleid.apple.com',audience:'fictional-apple-client',expiresIn:'5m'});
    const wrong=jwt.sign({sub:user.oauth_id,email:user.email,email_verified:'true'},appleKeys.privateKey,{algorithm:'RS256',keyid:'fictional-apple-key',issuer:'https://appleid.apple.com',audience:'different-client',expiresIn:'5m'});
    assert.equal((await api('POST','/auth/apple',{id_token:wrong})).status,401);
    const result=await api('POST','/auth/apple',{id_token:credential()});
    assert.equal(result.status,200);
    const requirements=await api('GET','/auth/account/deletion',undefined,result.data.token);
    assert.equal(requirements.data.confirmation.provider,'apple');assert.equal(requirements.data.confirmation.can_delete,true);
    const deleted=await api('DELETE','/auth/account',{confirmation:'DELETE'},result.data.token);
    assert.equal(deleted.status,200);assert.equal(deleted.data.apple_revocation_required,true);
    assert.equal((await api('GET','/auth/me',undefined,result.data.token)).status,401);
  });

  await t.test('a password account still needs its password even when a fresh OAuth sign-in exists',async()=>{
    const user=await account('google',true),token=await freshGoogle(user);
    const requirements=await api('GET','/auth/account/deletion',undefined,token);
    assert.equal(requirements.data.confirmation.method,'password');
    for(const wrong of [undefined,'wrong',{},'\u0000']){
      assert.equal((await api('DELETE','/auth/account',{password:wrong,confirmation:'DELETE'},token)).status,400);
      assert(await exists(user.id));
    }
    assert.equal((await api('DELETE','/auth/account',{password},token)).status,200);
  });

  await t.test('cleanup cascades authored content and removes identifiers without deleting another account',async()=>{
    const user=await account(),other=await account(),post=randomUUID(),otherPost=randomUUID(),conversation=randomUUID();
    await db.query('INSERT INTO posts(id,user_id,body) VALUES($1,$2,$3),($4,$5,$6)',[post,user.id,'Delete authored content',otherPost,other.id,'Keep other content']);
    await db.query('INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3)',[otherPost,user.id,'Delete authored comment']);
    await db.query('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2)',[otherPost,user.id]);
    await db.query('INSERT INTO friendships(user_a_id,user_b_id,requester_id) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$1)',[user.id,other.id]);
    await db.query('INSERT INTO conversations(id,created_by) VALUES($1,$2)',[conversation,user.id]);
    await db.query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)',[conversation,user.id,other.id]);
    await db.query('INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,$3),($1,$4,$5)',[conversation,user.id,'Delete my message',other.id,'Keep their message']);
    await db.query("INSERT INTO media_assets(owner_id,url,kind) VALUES($1,'https://example.invalid/fake-image.webp','avatar')",[user.id]);
    await db.query("INSERT INTO push_tokens(user_id,token,platform) VALUES($1,'fictional-push','ios')",[user.id]);
    await db.query("INSERT INTO notifications(user_id,actor_id,type) VALUES($1,$2,'post_like'),($2,$1,'post_like'),($1,$1,'post_like')",[other.id,user.id]);
    await db.query("INSERT INTO analytics_events(event,user_id) VALUES('profile',$1),('profile',$2)",[user.id,other.id]);
    await db.query("INSERT INTO lists(user_id,name) VALUES($1,'Owned list')",[user.id]);
    await db.query("INSERT INTO plans(user_id,name) VALUES($1,'Owned plan')",[user.id]);
    const result=await api('DELETE','/auth/account',{password,reason:'Fictional account cleanup check'},user.token);
    assert.equal(result.status,200);assert.equal(result.data.deleted,true);assert.equal(result.data.apple_revocation_required,false);
    for(const [table,column]of [['posts','user_id'],['post_comments','user_id'],['post_likes','user_id'],['messages','sender_id'],['media_assets','owner_id'],['push_tokens','user_id'],['conversation_participants','user_id'],['lists','user_id'],['plans','user_id'],['analytics_events','user_id']]){
      assert.equal(Number((await db.query(`SELECT count(*) AS n FROM ${table} WHERE ${column}=$1`,[user.id])).rows[0].n),0,table+' must not retain the deleted account');
    }
    assert.equal((await db.query('SELECT * FROM notifications WHERE user_id=$1',[other.id])).rows.length,1,'Notices caused by the deleted actor must not survive as anonymous notices');
    assert.equal((await db.query('SELECT * FROM posts WHERE id=$1',[otherPost])).rows.length,1);
    assert.equal((await db.query('SELECT * FROM messages WHERE sender_id=$1',[other.id])).rows.length,1);
    assert.equal((await db.query('SELECT * FROM analytics_events WHERE user_id=$1',[other.id])).rows.length,1);
    const receipt=(await db.query('SELECT * FROM user_deletions WHERE user_id=$1',[user.id])).rows[0];
    assert(receipt.deleted_at);assert.equal(receipt.email_hash,null);assert.equal(receipt.ip_address,null);assert.equal(receipt.deletion_reason,null);
    assert(await exists(other.id));
    assert.equal((await api('GET','/auth/me',undefined,user.token)).status,401);
  });

  await t.test('failed deletion rolls back account, cleanup and audit receipt together',async()=>{
    const user=await account(),other=await account();
    await db.query("INSERT INTO analytics_events(event,user_id) VALUES('profile',$1)",[user.id]);
    await db.query("INSERT INTO notifications(user_id,actor_id,type) VALUES($1,$2,'post_like')",[other.id,user.id]);
    failDelete=true;let result;
    try{result=await api('DELETE','/auth/account',{password},user.token);}finally{failDelete=false;}
    assert.equal(result.status,500);assert.equal(result.data.deleted,undefined);assert(await exists(user.id));
    assert.equal((await db.query('SELECT * FROM analytics_events WHERE user_id=$1',[user.id])).rows.length,1);
    assert.equal((await db.query('SELECT * FROM notifications WHERE actor_id=$1',[user.id])).rows.length,1);
    assert.equal((await db.query('SELECT * FROM user_deletions WHERE user_id=$1',[user.id])).rows.length,0);
    assert.equal((await api('GET','/auth/me',undefined,user.token)).status,200);
  });

  await t.test('session or account changes after middleware verification are rechecked under the account lock',async()=>{
    for(const change of ['version','suspension','logout']){
      const user=await account();
      beforeTransaction=()=>change==='version'?db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[user.id]):
        change==='suspension'?db.query('UPDATE users SET is_suspended=true WHERE id=$1',[user.id]):
        db.query("INSERT INTO auth_revocations(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[user.id,createHash('sha256').update(user.token).digest('hex')]);
      const result=await api('DELETE','/auth/account',{password},user.token);
      assert.equal(result.status,401,change);assert(await exists(user.id));
      assert.equal((await db.query('SELECT * FROM user_deletions WHERE user_id=$1',[user.id])).rows.length,0);
    }
  });

  await t.test('unverified owners can withdraw their accounts and optional analytics absence does not block deletion',async()=>{
    const user=await account();
    await db.query('UPDATE users SET email_verified_at=NULL,verified_email=NULL WHERE id=$1',[user.id]);
    await db.exec('DROP TABLE analytics_events');
    assert.equal((await api('GET','/auth/account/deletion',undefined,user.token)).data.confirmation.method,'password');
    assert.equal((await api('DELETE','/auth/account',{password},user.token)).status,200);
    assert.equal(await exists(user.id),false);
  });
});
