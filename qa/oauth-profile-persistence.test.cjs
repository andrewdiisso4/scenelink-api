'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {randomUUID,randomBytes}=require('node:crypto');
const {once}=require('node:events');
const express=require('express');
const jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite');
const {makeAuth}=require('../src/launch/session');

test('verified OAuth sign-in preserves existing SceneLink profile choices',async t=>{
 // Actual OAuth HTTP route, JWT signing and SQL; the provider verifier is an
 // offline fixture. This checks profile persistence, not live provider sign-in.
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE NOT NULL,password_hash text,
  display_name text,username text UNIQUE,avatar_url text,bio text,neighborhood text,city text DEFAULT 'Boston',role text DEFAULT 'user',
  created_at timestamptz DEFAULT NOW(),updated_at timestamptz DEFAULT NOW(),auth_version int DEFAULT 0,is_active boolean DEFAULT true,
  is_suspended boolean DEFAULT false,email_verified_at timestamptz,verified_email text,oauth_provider text,oauth_id text,profile_revision int DEFAULT 1);`);
 const pool={query:(sql,values)=>db.query(sql,values),connect:async()=>({query:(sql,values)=>db.query(sql,values),release(){}})};
 const auth=makeAuth({jwt,pool,secret:randomBytes(48).toString('hex')});
 let providerPayload;const enqueued=[];
 const filename=path.resolve(__dirname,'../src/routes/oauth.js'),fromOAuth=createRequire(filename),moduleFixture={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:moduleFixture,console,process:{env:{GOOGLE_CLIENT_ID:'fictional-google-client'}},require(name){
  if(name==='../config/database')return pool;
  if(name==='../middleware/auth')return auth;
  if(name==='../middleware/rateLimits')return{authLimiter:(req,res,next)=>next()};
  if(name==='../services/welcome')return{enqueue:async(_db,user)=>enqueued.push(user.id),kick(){}};
  if(name==='google-auth-library')return{OAuth2Client:class{async verifyIdToken(options){assert.equal(options.audience,'fictional-google-client');assert.equal(options.idToken,'fictional-provider-credential');return{getPayload:()=>providerPayload};}}};
  return fromOAuth(name);
 }},{filename});
 const app=express();app.use(express.json());app.use('/api/auth',moduleFixture.exports);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 async function login(email,subject){
  providerPayload={sub:subject,email,email_verified:true,name:'Provider display name',picture:'https://example.invalid/provider-picture.webp'};
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_token:'fictional-provider-credential'})});
  assert.equal(response.status,200);return response.json();
 }
 async function existing(avatar,linked){
  const id=randomUUID(),email=id+'@example.invalid',subject='subject-'+id;
  await db.query(`INSERT INTO users(id,email,password_hash,username,display_name,avatar_url,bio,profile_revision,oauth_provider,oauth_id,email_verified_at,verified_email)
   VALUES($1,$2,'fictional-existing-hash',$3,'My chosen display name',$4,'My saved bio',7,$5,$6,NOW(),$2)`,[id,email,'fixture_'+id.slice(0,8),avatar,linked?'google':null,linked?subject:null]);
  return{id,email,subject};
 }
 for(const linked of [true,false])for(const avatar of ['https://example.invalid/my-chosen-photo.webp',null])await t.test((linked?'returning provider':'linking verified email')+' preserves '+(avatar?'custom photo':'intentional photo removal'),async()=>{
  const user=await existing(avatar,linked),result=await login(user.email,user.subject);
  assert.equal(result.user.id,user.id);assert.equal(result.user.avatar_url,avatar);
  const read=(await db.query('SELECT avatar_url,profile_revision,display_name,bio,oauth_provider,oauth_id FROM users WHERE id=$1',[user.id])).rows[0];
  assert.deepEqual(read,{avatar_url:avatar,profile_revision:7,display_name:'My chosen display name',bio:'My saved bio',oauth_provider:'google',oauth_id:user.subject});
  assert.equal(result.is_new,false);assert.equal(enqueued.length,0);
 });
 await t.test('first OAuth signup can still initialize its provider photo and enqueue welcome',async()=>{
  const result=await login('new-oauth-fixture@example.invalid','new-provider-subject');
  const read=(await db.query('SELECT avatar_url,profile_revision FROM users WHERE id=$1',[result.user.id])).rows[0];
  assert.equal(result.is_new,true);assert.equal(read.avatar_url,'https://example.invalid/provider-picture.webp');assert.equal(read.profile_revision,1);assert.deepEqual(enqueued,[result.user.id]);
 });
});
