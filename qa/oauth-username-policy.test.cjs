'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const crypto=require('node:crypto');
const {once}=require('node:events');
const express=require('express');
const jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite');
const {makeAuth}=require('../src/launch/session');
const {username}=require('../src/launch/identity');
const welcome=require('../src/services/welcome');

test('OAuth usernames remain editable under the shared profile policy',async t=>{
 // Actual HTTP routes, JWT middleware, SQL and welcome enqueue. The provider
 // verifier and username entropy are offline fixtures; no external service runs.
 const db=new PGlite();let server;
 t.after(async()=>{if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});await db.close();});
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email varchar(255) UNIQUE NOT NULL,password_hash text,
  display_name text,username varchar(100) UNIQUE,avatar_url text,bio text,neighborhood text,city text DEFAULT 'Boston',role text DEFAULT 'user',
  created_at timestamptz DEFAULT NOW(),updated_at timestamptz DEFAULT NOW(),auth_version int DEFAULT 0,is_active boolean DEFAULT true,
  is_suspended boolean DEFAULT false,email_verified_at timestamptz,verified_email text,oauth_provider text,oauth_id text,profile_revision int DEFAULT 1,
  is_private boolean DEFAULT false,allow_messages text DEFAULT 'everyone',social_links jsonb DEFAULT '[]',discoverable boolean DEFAULT true,
  show_achievements boolean DEFAULT false,share_read_receipts boolean DEFAULT false);
  CREATE UNIQUE INDEX idx_users_username_lower ON users(LOWER(username));
  CREATE TABLE auth_revocations(token_hash text PRIMARY KEY,expires_at timestamptz);
  CREATE TABLE signup_welcome_emails(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,recipient_hash text NOT NULL);`);
 const query=(sql,values)=>db.query(sql,values),pool={query,connect:async()=>({query,release(){}})};
 const auth=makeAuth({jwt,pool,secret:crypto.randomBytes(48).toString('hex')});
 let payload,entropy=[],entropyCalls=0;
 const filename=path.resolve(__dirname,'../src/routes/oauth.js'),fromOAuth=createRequire(filename),moduleFixture={exports:{}};
 const offlineMath=Object.create(Math);offlineMath.random=()=>0.123456789;
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:moduleFixture,console:{error(){}},Math:offlineMath,process:{env:{GOOGLE_CLIENT_ID:'fictional-google-client'}},require(name){
  if(name==='../config/database')return pool;
  if(name==='../middleware/auth')return auth;
  if(name==='../middleware/rateLimits')return{authLimiter:(_req,_res,next)=>next()};
  if(name==='../services/welcome')return{enqueue:welcome.enqueue,kick(){}};
  if(name==='node:crypto')return{...crypto,randomBytes(size){entropyCalls++;return entropy.length?Buffer.alloc(size,entropy.shift()):crypto.randomBytes(size);}};
  if(name==='google-auth-library')return{OAuth2Client:class{async verifyIdToken(options){assert.equal(options.audience,'fictional-google-client');assert.equal(options.idToken,'fictional-provider-credential');return{getPayload:()=>payload};}}};
  return fromOAuth(name);
 }},{filename});
 const app=express();app.use(express.json());app.use('/api/auth',moduleFixture.exports);
 const router=express.Router();require('../src/launch/people').install({router,pool,auth,write:(_req,_res,next)=>next()});app.use('/api',router);
 server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 async function api(route,body,token,method='POST'){
  const response=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  return{status:response.status,data:await response.json()};
 }
 async function login(email){
  payload={sub:'fictional-subject:'+email,email,email_verified:true,name:'Provider display name',picture:'https://example.invalid/provider-picture.webp'};
  return api('/auth/google',{id_token:'fictional-provider-credential'});
 }
 const stored=async id=>(await query('SELECT username,display_name,profile_revision FROM users WHERE id=$1',[id])).rows[0];
 const queued=async id=>(await query('SELECT count(*)::int AS n FROM signup_welcome_emails WHERE user_id=$1',[id])).rows[0].n;

 for(const local of ['a','a'.repeat(19),'b'.repeat(20),'c'.repeat(64),'punctuation.+-name'])await t.test('signup and profile edit for local part '+local.length,async()=>{
  const result=await login(local+'@example.invalid');assert.equal(result.status,200);
  const {user,token}=result.data;
  const edit=await api('/auth/profile',{username:user.username,display_name:'Edited display name',revision:1},token,'PUT');
  assert.equal(edit.status,200);assert.equal(username(user.username),user.username);assert.deepEqual(await stored(user.id),{username:user.username,display_name:'Edited display name',profile_revision:2});
  assert.equal(await queued(user.id),1);
 });

 await t.test('a case-insensitive username collision retries without changing the existing account',async()=>{
  entropy=[17];const first=await login('collision.fixture@example.invalid');assert.equal(first.status,200);
  await query('UPDATE users SET username=upper(username) WHERE id=$1',[first.data.user.id]);
  const before=await stored(first.data.user.id);entropy=[17,34];const calls=entropyCalls;
  const second=await login('collision.fixture@other.invalid');assert.equal(second.status,200);
  assert.notEqual(second.data.user.username,first.data.user.username);assert.equal(entropyCalls-calls,2);
  assert.equal(username(second.data.user.username),second.data.user.username);
  assert.deepEqual(await stored(first.data.user.id),before);assert.equal(await queued(first.data.user.id),1);assert.equal(await queued(second.data.user.id),1);
 });

 await t.test('collision retry exhaustion is bounded and creates no account or welcome job',async()=>{
  entropy=[51];const first=await login('exhaustion.fixture@example.invalid');assert.equal(first.status,200);
  const before=(await query('SELECT count(*)::int AS n FROM signup_welcome_emails')).rows[0].n;
  entropy=Array(10).fill(51);const calls=entropyCalls;
  const result=await login('exhaustion.fixture@other.invalid');assert.equal(result.status,503);
  assert(entropyCalls-calls>1&&entropyCalls-calls<=5,'Allocation must have a small finite retry bound');
  assert.equal((await query('SELECT count(*)::int AS n FROM users WHERE email=$1',['exhaustion.fixture@other.invalid'])).rows[0].n,0);
  assert.equal((await query('SELECT count(*)::int AS n FROM signup_welcome_emails')).rows[0].n,before);entropy=[];
 });

 await t.test('an unverified existing email cannot be linked or replaced during OAuth signup',async()=>{
  const email='unverified.existing@example.invalid';
  const user=(await query("INSERT INTO users(email,username,display_name) VALUES($1,'unverified_existing','Existing account') RETURNING id",[email])).rows[0];
  const result=await login(email);assert.equal(result.status,409);assert.equal(result.data.code,'ACCOUNT_LINK_VERIFICATION_REQUIRED');
  assert.deepEqual((await query('SELECT oauth_provider,oauth_id,email_verified_at FROM users WHERE id=$1',[user.id])).rows[0],{oauth_provider:null,oauth_id:null,email_verified_at:null});
  assert.equal(await queued(user.id),0);
 });

 await t.test('an exact unchanged legacy name permits profile edits but new invalid names do not',async()=>{
  const legacy='legacy_generated_username_over24',email='legacy.username@example.invalid';
  const user=(await query(`INSERT INTO users(email,username,display_name,email_verified_at,verified_email,oauth_provider,oauth_id)
   VALUES($1::text,$2,'Original name',NOW(),$1::text,'google',$3) RETURNING id`,[email,legacy,'fictional-subject:'+email])).rows[0];
  const loginResult=await login(email);assert.equal(loginResult.status,200);const token=loginResult.data.token;
  const body={username:legacy,display_name:'Updated legacy profile',revision:1};
  const result=await api('/auth/profile',body,token,'PUT');assert.equal(result.status,200);
  const saved={username:legacy,display_name:body.display_name,profile_revision:2};assert.deepEqual(await stored(user.id),saved);
  const replay=await api('/auth/profile',body,token,'PUT');assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
  for(const invalid of [legacy+'x',legacy.toUpperCase(),' '+legacy,legacy+' ',null,42,{},['new_name']]){
   const rejected=await api('/auth/profile',{username:invalid,display_name:'Must not save',revision:2},token,'PUT');assert.equal(rejected.status,400);assert.deepEqual(await stored(user.id),saved);
  }
  const renamed=await api('/auth/profile',{username:'valid_new_username',revision:2},token,'PUT');assert.equal(renamed.status,200);
  assert.deepEqual(await stored(user.id),{...saved,username:'valid_new_username',profile_revision:3});
 });
});
