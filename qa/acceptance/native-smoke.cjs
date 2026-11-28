#!/usr/bin/env node
'use strict';
// Caller creates a fresh QA database. This script refuses existing tables and
// owns only the synthetic marker/schema/fixtures it creates there.
const assert=require('node:assert/strict');
const path=require('node:path');
const crypto=require('node:crypto');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {Pool}=require('pg');
const nav=require('./test-request.cjs');
const {DATABASE_PATTERN,ENVIRONMENT_ID}=require('./guard.cjs');

const root=path.resolve(__dirname,'../..');
let target;
try {target=new URL(process.env.ACCEPTANCE_SMOKE_DATABASE_URL);} catch {throw Error('Fresh local ACCEPTANCE_SMOKE_DATABASE_URL required');}
if(process.env.SCENELINK_ACCEPTANCE_NATIVE_SMOKE!=='yes'||!['postgres:','postgresql:'].includes(target.protocol)
  ||!['127.0.0.1','[::1]'].includes(target.hostname)||!target.port||target.search||target.hash
  ||!DATABASE_PATTERN.test(target.pathname.slice(1)))throw Error('Refused: explicit native smoke opt-in and fresh literal-loopback QA database required');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let child, pool;
const logs=[];
async function stop(){if(!child||child.exitCode!==null)return;const stopping=child;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{stopping.kill('SIGKILL');reject(Error('Acceptance child did not stop'));},5000);stopping.once('exit',()=>{clearTimeout(timer);resolve();});stopping.kill('SIGTERM');});child=null;}
async function main(){
  pool=new Pool({connectionString:process.env.ACCEPTANCE_SMOKE_DATABASE_URL,max:2});
  assert.equal((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,'Refused: smoke database must start empty');
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const origin='http://127.0.0.1:'+port;
  const password=crypto.randomBytes(24).toString('hex'), access=crypto.randomBytes(32).toString('hex');
  const env={PATH:process.env.PATH,NODE_ENV:'test',PORT:String(port),ACCEPTANCE_MODE:'isolated-synthetic',ACCEPTANCE_ENVIRONMENT_ID:ENVIRONMENT_ID,
    ACCEPTANCE_DB_HOST:target.hostname,ACCEPTANCE_DB_NAME:target.pathname.slice(1),DATABASE_URL:process.env.ACCEPTANCE_SMOKE_DATABASE_URL,
    ACCEPTANCE_PUBLIC_ORIGIN:origin,JWT_SECRET:crypto.randomBytes(32).toString('hex'),ACCEPTANCE_ACCESS_SECRET:access,ACCEPTANCE_FIXTURE_PASSWORD:password};
  async function launch(expectFailure=false){
    logs.length=0;child=spawn(process.execPath,['qa/acceptance/start.cjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',data=>logs.push(String(data)));child.stderr.on('data',data=>logs.push(String(data)));
    if(expectFailure){const exit=await new Promise(resolve=>child.once('exit',resolve));assert.equal(exit,1);assert(logs.join('').includes('empty public schema'));child=null;return;}
    for(let i=0;i<300;i++){if(child.exitCode!==null)throw Error('Acceptance child failed before readiness: '+logs.join('').replaceAll(password,'[REDACTED]').replaceAll(access,'[REDACTED]'));try{const r=await fetch(origin+'/__acceptance/health');if(r.status===200)return;}catch{}await delay(100);}
    throw Error('Acceptance readiness timeout');
  }
  await pool.query('CREATE TABLE acceptance_smoke_foreign(id integer)');
  await launch(true);
  assert.equal((await pool.query("SELECT to_regclass('public.scenelink_acceptance_environment') AS name")).rows[0].name,null);
  await pool.query('DROP TABLE acceptance_smoke_foreign');
  console.log('PASS foreign nonempty schema refused before initialization');
  await launch();
  const request=(url,options={})=>fetch(origin+url,{...options,redirect:'manual'});
  async function formResponse(response,status,action) {
    assert.equal(response.status,status);
    assert.equal(response.headers.get('referrer-policy'),'strict-origin',response.url+' form policy');
    const form=(await response.text()).match(/<form\b[^>]*>/i)?.[0];
    assert(form&&form.includes('action="'+action+'"'),'Expected the real '+action+' form');
    assert.match(form,/method="post"/i);
  }
  for(const [route,status] of [
    ['/__acceptance/unlock?next=%2Fadmin.html',200],
    ['/admin.html',401],
    ['/reset-password.html?token=synthetic-test-token',401]
  ]) await formResponse(await request(route),status,'/__acceptance/unlock');
  let r;
  r=await request('/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'qa.admin@example.invalid',password})});assert.equal(r.status,401);
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  r=await request('/__acceptance/unlock',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:'incorrect'})});
  assert.equal(r.headers.has('set-cookie'),false);
  await formResponse(r,401,'/__acceptance/unlock');
  const unlock=()=>request('/__acceptance/unlock',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:access})});
  r=await unlock();assert.equal(r.status,303);let cookie=r.headers.get('set-cookie').split(';')[0];
  await formResponse(await request('/__acceptance/',{headers:{Cookie:cookie}}),200,'/__acceptance/lock');
  const rejectedOrigins=[
    ['missing',{Referer:origin+'/__acceptance/','Sec-Fetch-Site':'same-origin'}],
    ['null',{Origin:'null','Sec-Fetch-Site':'same-origin'}],
    ['foreign',{Origin:'https://other.example.invalid','Sec-Fetch-Site':'same-origin'}],
    ['cross-site',{Origin:origin,'Sec-Fetch-Site':'cross-site'}]
  ];
  for(const route of ['/__acceptance/unlock','/__acceptance/lock','/api/auth/login']) {
    for(const [name,headers] of rejectedOrigins) {
      const isAPI=route.startsWith('/api/');
      r=await request(route,{method:'POST',headers:{Cookie:cookie,
        'Content-Type':isAPI?'application/json':'application/x-www-form-urlencoded',...headers},
        body:isAPI?JSON.stringify({email:'qa.admin@example.invalid',password}):new URLSearchParams({secret:access})});
      assert.equal(r.status,403,route+' rejects '+name+' origin');
      assert.equal(r.headers.has('set-cookie'),false,route+' must not issue or clear a cookie');
      assert.deepEqual(await r.json(),{error:'Same-origin acceptance request required'});
    }
  }
  const api=async(route,method='GET',body,token)=>{const response=await request('/api'+route,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
  r=await request('/admin.html',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert((await r.text()).includes('sl-admin-portal.js'));
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);
  for(const file of ['/_redirects','/%5fredirects','/%6eetlify.toml']){r=await request(file,{headers:{Cookie:cookie}});assert.equal(r.status,404);}
  for(const page of ['reset-password','business-reset-password','verify-email']) {
    for(const suffix of ['.html','']) {
      r=await request('/'+page+suffix+'?token=synthetic-test-token',{headers:{Cookie:cookie}});
      assert.equal(r.status,200,page+suffix);
      assert.equal(r.headers.get('referrer-policy'),'no-referrer',page+suffix);
      assert.match(await r.text(),/<meta\s+name="referrer"\s+content="no-referrer"\s*\/?\s*>/i);
    }
  }
  r=await request('/env.js',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert((await r.text()).includes("credentials:'same-origin'"));
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  console.log('PASS outer gate protects both static frontend and same-origin API');
  const admin=await api('/auth/login','POST',{email:'qa.admin@example.invalid',password});assert.equal(admin.status,200);assert.equal(admin.data.user.role,'admin');
  assert.equal((await api('/admin/stats','GET',undefined,admin.data.token)).status,200);
  const member=await api('/auth/login','POST',{email:'qa.member@example.invalid',password});assert.equal(member.status,200);assert.equal((await api('/admin/stats','GET',undefined,member.data.token)).status,403);
  const owner=await api('/business/login','POST',{email:'qa.owner@example.invalid',password});assert.equal(owner.status,200);
  assert.equal((await api('/business/venues','GET',undefined,owner.data.token)).data.venues.length,2);
  assert.equal((await api('/business/login','POST',{email:'qa.pending@example.invalid',password})).status,403);
  assert.equal((await api('/business/forgot-password','POST',{email:'qa.owner@example.invalid'})).status,503);
  console.log('PASS real synthetic admin, member, approved owner and pending owner account boundaries');
  // Prove cross-site inbox navigation is public only for the static document,
  // then exercise the real persisted ownership token with the gate still on.
  const inboxHeaders={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
  r=await nav(origin+'/verify-email.html',inboxHeaders);
  assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.match(await r.text(),/qaUnlockRecovery/);
  assert.equal((await nav(origin+'/profile.html',inboxHeaders)).status,403);
  const email='qa.member@example.invalid', raw=crypto.randomBytes(32).toString('hex');
  const hash=crypto.createHash('sha256').update(raw).digest('hex');
  const userId=member.data.user.id;
  await pool.query('UPDATE users SET email_verified_at=NULL,verified_email=NULL WHERE id=$1',[userId]);
  await pool.query(`INSERT INTO email_verification_tokens(token_hash,user_id,email,expires_at)
    VALUES ($1,$2,$3,NOW()+INTERVAL '1 hour')`,[hash,userId,email]);
  r=await request('/api/auth/verification/confirm',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:raw})});
  assert.equal(r.status,401);
  const confirm=await api('/auth/verification/confirm','POST',{token:raw});
  assert.equal(confirm.status,200);assert.equal(confirm.data.ok,true);
  assert.equal((await api('/auth/verification/confirm','POST',{token:raw})).status,400);
  const ownerCheck=await pool.query('SELECT email_verified_at,verified_email FROM users WHERE id=$1',[userId]);
  assert(ownerCheck.rows[0].email_verified_at);assert.equal(ownerCheck.rows[0].verified_email,email);
  console.log('PASS QA inbox landing leads to gated, one-use email ownership confirmation');
  const venue='b532045e-1a5f-4d78-950a-4daa0c802001';
  assert.equal((await api('/business/venue?venue_id='+venue,'PATCH',{hours_display:'QA edited hours'},owner.data.token)).status,200);
  const counts=(await pool.query('SELECT (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM business_users)::int owners,(SELECT count(*) FROM venues)::int venues')).rows[0];
  assert.deepEqual(counts,{users:2,owners:2,venues:4});
  await stop();await launch();
  r=await unlock();cookie=r.headers.get('set-cookie').split(';')[0];
  assert.equal((await pool.query('SELECT hours_display FROM venues WHERE id=$1',[venue])).rows[0].hours_display,'QA edited hours');
  assert.deepEqual((await pool.query('SELECT (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM business_users)::int owners,(SELECT count(*) FROM venues)::int venues')).rows[0],counts);
  assert.equal((await api('/admin/stats','GET',undefined,admin.data.token)).status,200);
  console.log('PASS marked database restart preserves edits, sessions and fixture counts');
  r=await request('/__acceptance/status',{headers:{Cookie:cookie}});const status=await r.json();assert.equal(status.mail,'disabled-not-tested');assert.equal(status.model,'disabled-not-tested');
  assert(!JSON.stringify(status).includes(password));assert(!JSON.stringify(status).includes(access));
  assert(!logs.join('').includes(password));assert(!logs.join('').includes(access));
  console.log('PASS scope status and startup logs contain no fixture or gate credentials');
  await stop();
  await pool.query("UPDATE scenelink_acceptance_environment SET environment_id='different-synthetic-environment'");
  logs.length=0;child=spawn(process.execPath,['qa/acceptance/start.cjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>logs.push(String(data)));child.stderr.on('data',data=>logs.push(String(data)));
  assert.equal(await new Promise(resolve=>child.once('exit',resolve)),1);child=null;assert(logs.join('').includes('foreign or malformed'));
  assert.equal((await pool.query('SELECT hours_display FROM venues WHERE id=$1',[venue])).rows[0].hours_display,'QA edited hours');
  console.log('PASS foreign environment marker refuses restart without overwriting fixture edits');
  console.log('ACCEPTANCE_HOST_SMOKE '+JSON.stringify({engine:'native PostgreSQL',fictionalOnly:true,groups:7,externalProviders:false,realMail:false,physicalDevice:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{await stop();if(pool)await pool.end();});
