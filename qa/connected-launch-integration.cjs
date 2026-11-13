#!/usr/bin/env node
'use strict';
/** REAL Express + JWT + bcrypt + PostgreSQL integration gate.
 * Supplemental PGlite runs are labeled explicitly; native PostgreSQL CI is a separate gate.
 * Refuses remote databases and nonempty schemas. Never connect this to production.
 * It creates fictional data ONLY in a fresh literal-loopback scenelink_test_* database.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve(process.env.SCENELINK_API_ROOT||'');
const connection=process.env.TEST_DATABASE_URL;
if(!connection||process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT!=='yes')throw Error('Set TEST_DATABASE_URL and SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes for a NEW local test database only.');
// node-pg accepts query parameters that override host/port/database. Check the
// complete connection string before reading app config or loading a DB driver.
const refused='REFUSED: literal loopback, explicit port and scenelink_test_* database required; URL query/fragment overrides are forbidden.';
let u;try{u=new URL(connection);}catch{throw Error(refused);}
if(!['127.0.0.1','[::1]'].includes(u.hostname)||!u.port||Number(u.port)<1
  ||!/^\/scenelink_test_[a-z0-9_]+$/.test(u.pathname)||!['postgres:','postgresql:'].includes(u.protocol)
  ||u.search||u.hash||/[?#]/.test(connection))throw Error(refused);
if(!fs.existsSync(path.join(root,'src/launch/router.js'))||fs.existsSync(path.join(root,'.env')))throw Error('Use the prepared backend with no .env file.');
process.chdir(root);process.env.NODE_ENV='test';process.env.DATABASE_URL=connection;process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');process.env.ALLOW_DEMO_SEED='false';process.env.FORCE_RESEED='false';
for(const name of ['SMTP_HOST','SMTP_USER','SMTP_PASS','CLOUDINARY_URL','CLOUDINARY_UPLOAD_PRESET','SENTRY_DSN','OPENAI_API_KEY','ADMIN_SECRET'])delete process.env[name];process.env.EMAIL_PROVIDER='disabled';
const req=createRequire(path.join(root,'package.json'));
let pool,server;const checks=[];
async function main(){
 pool=req('./src/config/database');const existing=await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'");assert.equal(existing.rows[0].n,0,'REFUSED: public schema must be empty; no tables are dropped by this harness');
 // Use the same default initialization as normal startup, not an all-files migration shortcut.
 // This detects missing release-migration allowlist entries before deployment.
 delete process.env.RUN_ALL_SQL_MIGRATIONS;
 const app=req('./src/server');await app.locals.initializeDatabase();
 assert.equal((await pool.query("SELECT count(*)::int n FROM launch_schema_versions WHERE version='private-list-invitations-2026-11-09'")).rows[0].n,1,'Default startup must apply migration016 without opt-in');
 // Repeating migration 007 must not reset privacy or duplicate schema objects.
 await pool.query(fs.readFileSync(path.join(root,'migrations/007_launch_social_integrity.sql'),'utf8'));
 await pool.query(fs.readFileSync(path.join(root,'migrations/008_connected_decision_rooms.sql'),'utf8'));
 await pool.query(fs.readFileSync(path.join(root,'migrations/009_launch_account_compatibility.sql'),'utf8'));
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port+'/api';
 async function api(method,route,body,token,status=200){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();const safe=(k,v)=>/token|password|secret/i.test(k)?'[REDACTED]':v;assert.equal(r.status,status,method+' '+route+' returned '+r.status+': '+JSON.stringify(data,safe));return data;}
 async function check(name,fn){await fn();checks.push({name,result:'pass'});console.log('PASS',name);}
 let a,b,c,secondA,post,conversation,message;
 const password='Local integration password 123';const venue=crypto.randomUUID();
 await check('default startup applies private-list migration016 without opt-in',async()=>{assert.equal(process.env.RUN_ALL_SQL_MIGRATIONS,undefined);assert.equal((await pool.query("SELECT count(*)::int n FROM launch_schema_versions WHERE version='private-list-invitations-2026-11-09'")).rows[0].n,1);});
 await check('real schema and route contract',async()=>assert.equal((await api('GET','/launch/capabilities')).contract,'social-search-2026-09-09'));
 await check('signup and independent real JWT sessions',async()=>{
  a=await api('POST','/auth/signup',{email:'alex@example.invalid',username:'alex_test',display_name:'Alex Test',password},null,201);
  b=await api('POST','/auth/signup',{email:'maya@example.invalid',username:'maya_test',display_name:'Maya Test',password},null,201);
  c=await api('POST','/auth/signup',{email:'jordan@example.invalid',username:'jordan_test',display_name:'Jordan Test',password},null,201);
  secondA=await api('POST','/auth/login',{email:'alex@example.invalid',password});assert.notEqual(secondA.token,a.token);
  assert.equal((await api('GET','/auth/me',undefined,a.token)).user.id,a.user.id);
  assert.equal((await pool.query('SELECT count(*)::int n FROM signup_welcome_emails')).rows[0].n,3);
  await api('POST','/auth/signup',{email:'alex@example.invalid',username:'alex_test',password},null,409);
  assert.equal((await pool.query('SELECT count(*)::int n FROM signup_welcome_emails')).rows[0].n,3);
 });
 await check('unverified sessions stay read-only but retain privacy, block, report and account controls',async()=>{
  assert.equal(a.user.email_verified,false);assert.equal(a.verification_required,true);
  await api('GET','/auth/me',undefined,a.token);
  await api('POST','/posts',{body:'must not publish',client_id:crypto.randomUUID()},a.token,403);
  await api('POST','/friends/request',{user_id:b.user.id},a.token,403);
  await api('POST','/conversations',{user_id:b.user.id},a.token,403);
  await api('POST','/media/upload',{kind:'avatar',data:'invalid'},a.token,403);
  await api('PATCH','/users/me/settings/',{is_private:true,allow_messages:'none'},a.token);
  await api('POST','/users/'+b.user.id+'/block',{},a.token,201);
  await api('DELETE','/users/'+b.user.id+'/block/',undefined,a.token);
  await api('POST','/reports',{target_type:'user',target_id:b.user.id,reason:'other'},a.token,201);
  await api('PATCH','/users/me/settings',{is_private:false,allow_messages:'everyone'},a.token);
  const stale=req('jsonwebtoken').sign({id:a.user.id,v:0,role:'user',email_verified:true},process.env.JWT_SECRET,{expiresIn:'1h',algorithm:'HS256'});
  await api('POST','/friends/request',{user_id:b.user.id},stale,403);
  const disposable=await api('POST','/auth/signup',{email:'delete-unverified@example.invalid',username:'delete_unverified',password},null,201);
  await api('POST','/auth/logout',{},disposable.token);await api('GET','/auth/me',undefined,disposable.token,401);
  const deletionLogin=await api('POST','/auth/login',{email:'delete-unverified@example.invalid',password});assert.equal(deletionLogin.user.email_verified,false);
  await api('DELETE','/auth/account',{password},deletionLogin.token);
 });
 await check('email verification uses owner-bound expiring digests, safe resend and single use',async()=>{
  const mailer=req('./src/services/mailer'),oldReady=mailer.isReady,oldSend=mailer.sendMail;
  let raw,recipient;
  await api('POST','/auth/verification/request',{},a.token,503);
  assert.equal(Number((await pool.query('SELECT count(*) FROM email_verification_tokens')).rows[0].count),0);
  try {
   mailer.isReady=()=>true;mailer.sendMail=async msg=>{recipient=msg.to;raw=new URL(msg.text.match(/https:\/\/[^\s]+/)[0]).hash.slice(7);return{ok:true};};
   await api('POST','/auth/verification/request',{email:'not-the-owner@example.invalid'},a.token,202);
   assert.equal(recipient,'alex@example.invalid');assert.match(raw,/^[0-9a-f]{64}$/);
   const stored=(await pool.query('SELECT token_hash,expires_at FROM email_verification_tokens WHERE user_id=$1',[a.user.id])).rows[0];assert.notEqual(stored.token_hash,raw);assert.equal(stored.token_hash,crypto.createHash('sha256').update(raw).digest('hex'));
   await api('POST','/auth/verification/request',{},a.token,429);
   const expired=raw;await pool.query("UPDATE email_verification_tokens SET expires_at=NOW()-INTERVAL '1 second',created_at=NOW()-INTERVAL '2 minutes' WHERE user_id=$1",[a.user.id]);
   await api('POST','/auth/verification/confirm',{token:expired},null,400);
   await api('POST','/auth/verification/request',{},a.token,202);const prior=raw;
   await pool.query("UPDATE email_verification_tokens SET created_at=NOW()-INTERVAL '2 minutes' WHERE user_id=$1",[a.user.id]);
   await api('POST','/auth/verification/request',{},a.token,202);assert.notEqual(raw,prior);
   await api('POST','/auth/verification/confirm',{token:prior},null,400);
   await api('POST','/auth/verification/confirm',{token:raw});
   await api('POST','/auth/verification/confirm',{token:raw},null,400);
   await api('GET','/auth/me',undefined,a.token,401);
   a=await api('POST','/auth/login',{email:'alex@example.invalid',password});secondA=await api('POST','/auth/login',{email:'alex@example.invalid',password});assert.equal(a.user.email_verified,true);
  } finally {mailer.isReady=oldReady;mailer.sendMail=oldSend;}
  const ready=mailer.isReady,send=mailer.sendMail;let rawB;
  try {
   mailer.isReady=()=>true;mailer.sendMail=async()=>({ok:false});
   await api('POST','/auth/verification/request',{},b.token,503);
   assert.equal((await pool.query('SELECT count(*)::int n FROM email_verification_tokens WHERE user_id=$1 AND consumed_at IS NULL',[b.user.id])).rows[0].n,0);
   await pool.query("UPDATE email_verification_tokens SET created_at=NOW()-INTERVAL '2 hours' WHERE user_id=$1",[b.user.id]);
   mailer.sendMail=async msg=>{rawB=new URL(msg.text.match(/https:\/\/[^\s]+/)[0]).hash.slice(7);return{ok:true};};
   await api('POST','/auth/verification/request',{},b.token,202);
   await pool.query("UPDATE users SET email='changed@example.invalid' WHERE id=$1",[b.user.id]);
   await api('POST','/auth/verification/confirm',{token:rawB},null,400);
   await pool.query("UPDATE users SET email='maya@example.invalid',is_suspended=true WHERE id=$1",[b.user.id]);
   await api('POST','/auth/verification/confirm',{token:rawB},null,400);
   await pool.query('UPDATE users SET is_suspended=false WHERE id=$1',[b.user.id]);
   const statuses=await Promise.all([1,2].map(async()=>{const r=await fetch(base+'/auth/verification/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:rawB})});return r.status;}));assert.deepEqual(statuses.sort(),[200,400]);
   b=await api('POST','/auth/login',{email:'maya@example.invalid',password});
   // Persistent per-account hourly bound is independent from the IP limiter.
   for(let i=0;i<5;i++)await pool.query("INSERT INTO email_verification_tokens(token_hash,user_id,email,created_at,expires_at,consumed_at) VALUES($1,$2,$3,NOW()-INTERVAL '2 minutes',NOW(),NOW())",[crypto.randomBytes(32).toString('hex'),c.user.id,c.user.email]);
   await api('POST','/auth/verification/request',{},c.token,429);
  } finally {mailer.isReady=ready;mailer.sendMail=send;}
  // Remaining social scenarios use explicitly marked isolated fixtures, never production backfill.
  await pool.query('UPDATE users SET email_verified_at=NOW(),verified_email=lower(email) WHERE id=ANY($1::uuid[])',[[b.user.id,c.user.id]]);
 });
 await check('verified OAuth adapter claims persist ownership without unsafe unverified-email linking',async()=>{
  const {OAuth2Client}=req('google-auth-library'),oldVerify=OAuth2Client.prototype.verifyIdToken,oldClient=process.env.GOOGLE_CLIENT_ID;
  let payload={sub:'isolated-google-fixture',email:'oauth-verified@example.invalid',email_verified:false,name:'Local OAuth Fixture'};
  try {
   process.env.GOOGLE_CLIENT_ID='isolated-client.invalid';OAuth2Client.prototype.verifyIdToken=async()=>({getPayload:()=>payload});
   await api('POST','/auth/google',{id_token:'isolated-provider-adapter-fixture'},null,401);
   payload.email_verified=true;const oauth=await api('POST','/auth/google',{id_token:'isolated-provider-adapter-fixture'});assert.equal(oauth.user.email_verified,true);
   assert.equal((await api('GET','/auth/me',undefined,oauth.token)).user.email_verified,true);
   assert.equal((await pool.query('SELECT status FROM signup_welcome_emails WHERE user_id=$1',[oauth.user.id])).rows[0].status,'pending');
   const again=await api('POST','/auth/google',{id_token:'isolated-provider-adapter-fixture'});assert.equal(again.is_new,false);
   assert.equal((await pool.query('SELECT count(*)::int n FROM signup_welcome_emails WHERE user_id=$1',[oauth.user.id])).rows[0].n,1);
   await api('POST','/auth/signup',{email:'oauth-link-unverified@example.invalid',username:'oauth_link_pending',password},null,201);
   payload={...payload,sub:'different-isolated-provider',email:'oauth-link-unverified@example.invalid'};
   await api('POST','/auth/google',{id_token:'isolated-provider-adapter-fixture'},null,409);
   assert.equal((await pool.query("SELECT email_verified_at FROM users WHERE email='oauth-link-unverified@example.invalid'")).rows[0].email_verified_at,null);
  } finally {OAuth2Client.prototype.verifyIdToken=oldVerify;if(oldClient===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=oldClient;}
 });
 await check('new Apple signup queues one welcome and repeat sign-in does not queue extras',async()=>{
  // Isolate this offline provider fixture from later business auth rate-limit scenarios.
  const limiter=req('./src/middleware/rateLimits').authLimiter;limiter.resetKey('127.0.0.1');
  const jwt=req('jsonwebtoken'),jwksPath=req.resolve('jwks-rsa');req(jwksPath);const savedJwks=require.cache[jwksPath].exports;
  const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const oldClient=process.env.APPLE_CLIENT_ID;
  try {
   process.env.APPLE_CLIENT_ID='isolated-apple-client.invalid';require.cache[jwksPath].exports=()=>({getSigningKey:(kid,cb)=>cb(null,{getPublicKey:()=>publicKey.export({type:'spki',format:'pem'})})});
   const id_token=jwt.sign({sub:'isolated-apple-subject',email:'apple-fixture@example.invalid',email_verified:true},privateKey,{algorithm:'RS256',keyid:'local-key',issuer:'https://appleid.apple.com',audience:process.env.APPLE_CLIENT_ID,expiresIn:'5m'});
   const first=await api('POST','/auth/apple',{id_token,user:{name:{firstName:'Local',lastName:'Apple'}}});assert.equal(first.is_new,true);
   const second=await api('POST','/auth/apple',{id_token});assert.equal(second.is_new,false);assert.equal(second.user.id,first.user.id);
   assert.equal((await pool.query('SELECT count(*)::int n FROM signup_welcome_emails WHERE user_id=$1',[first.user.id])).rows[0].n,1);
   assert.equal((await pool.query('SELECT status FROM signup_welcome_emails WHERE user_id=$1',[first.user.id])).rows[0].status,'pending');
  } finally {limiter.resetKey('127.0.0.1');require.cache[jwksPath].exports=savedJwks;if(oldClient===undefined)delete process.env.APPLE_CLIENT_ID;else process.env.APPLE_CLIENT_ID=oldClient;}
 });
 await check('literal search and accurate count from real rows',async()=>{
  for(const [id,name,slug]of[[venue,'Harbor & Pine','test-harbor-pine'],[crypto.randomUUID(),'Harbor & Pine Annex','test-harbor-pine-annex']])await pool.query("INSERT INTO venues(id,name,slug,type,neighborhood,cuisine,description,is_active,lat,lng) VALUES($1,$2,$3,'restaurant','South Boston','Italian','Fictional QA venue only',true,42.34,-71.04)",[id,name,slug]);
  const r=await api('GET','/venues?q=Harbor%20%26%20Pine&limit=1');assert.equal(r.total,2);assert.equal(r.venues[0].name,'Harbor & Pine');assert(r.has_more);
  assert.equal((await api('GET','/venues?q=literal%25none')).total,0);await api('GET','/venues?limit=-1',undefined,null,400);
 });
 let eventId,eventPast,eventUnreviewed;
 await check('events publish only reviewed sources, not legacy synthetic attendance or orphan venue names',async()=>{
  eventId=crypto.randomUUID();eventPast=crypto.randomUUID();eventUnreviewed=crypto.randomUUID();
  for(const [id,title,days]of[[eventId,'Fictional QA Event',14],[eventPast,'Past QA Event',-1],[eventUnreviewed,'Unreviewed QA Event',14]])await pool.query(`INSERT INTO events(id,title,description,venue_id,venue_name,date,event_url,attending_count,rating)
    VALUES($1,$2,'Fictional event only in isolated local database',$3,'Stale venue label',CURRENT_DATE+$4::integer,'https://example.com/isolated-qa-ticket',987,4.9)`,[id,title,venue,days]);
  assert.equal((await api('GET','/events')).total,0);
  await api('GET','/events/'+eventId,undefined,null,404);
  await api('PUT','/admin/events/'+eventId+'/source-review',{source:'official_venue',source_url:'https://example.com/isolated-qa-event',status:'reviewed'},a.token,403);
  await pool.query("UPDATE users SET role='admin' WHERE id=$1",[c.user.id]);
  for(const id of [eventId,eventPast])await api('PUT','/admin/events/'+id+'/source-review',{source:'official_venue',source_url:'https://example.com/isolated-qa-event',status:'reviewed'},c.token);
  await api('PUT','/admin/events/'+eventUnreviewed+'/source-review',{source:'official_venue',source_url:'javascript:alert(1)',status:'reviewed'},c.token,400);
  await pool.query("UPDATE users SET role='user' WHERE id=$1",[c.user.id]);
  const events=await api('GET','/events');assert.equal(events.total,1);
  const e=events.events[0];assert.equal(e.id,eventId);assert.equal(e.attending_count,0);assert.equal(e.rating,null);assert.equal(e.venue_name,'Harbor & Pine');
  assert.equal(e.attending_count_source,'public_scenelink_rsvps');assert.equal(e.rsvp_is_reservation,false);assert.equal(e.booking_status,'not_booked');assert.equal(e.booking.reservation_confirmed,false);
  assert.equal((await api('GET','/events?include_past=true')).total,2);
  assert.equal((await pool.query('SELECT count(*)::int n FROM event_source_reviews')).rows[0].n,2);
  await api('GET','/events?date=2026-02-31',undefined,null,400);
  await api('GET','/events?venue_id=invalid',undefined,null,400);
  await api('GET','/events/not-a-uuid',undefined,null,400);
  assert.deepEqual((await api('GET','/venues/'+venue+'/activity')).checkins,[]);
  await api('GET','/venues/'+venue+'/unknown-legacy-path',undefined,null,404);
 });
 await check('RSVP requires current verified account and reviewed upcoming event without client impersonation',async()=>{
  await api('PUT','/events/'+eventId+'/rsvp',{status:'going'},null,401);
  const unverified=await api('POST','/auth/signup',{email:'rsvp-unverified@example.invalid',username:'rsvp_unverified',password},null,201);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'going'},unverified.token,403);
  await api('PUT','/events/'+eventUnreviewed+'/rsvp',{status:'going'},a.token,404);
  await api('PUT','/events/'+eventPast+'/rsvp',{status:'going'},a.token,404);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'booked'},a.token,400);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'going',audience:'friends'},a.token,400);
  const result=await api('PUT','/events/'+eventId+'/rsvp',{status:'going',user_id:b.user.id,reservation_confirmed:true},a.token);
  assert.equal(result.rsvp.audience,'private');assert.equal(result.rsvp_is_reservation,false);assert.equal(result.booking_status,'not_booked');assert.equal(result.rsvp.user_id,undefined);
  assert.equal((await api('GET','/events/'+eventId,undefined,secondA.token)).event.my_rsvp,'going');
  assert.equal((await api('GET','/events/'+eventId,undefined,b.token)).event.my_rsvp,null);
  assert.equal((await api('GET','/events/'+eventId)).event.my_rsvp,null);
  assert.equal((await api('GET','/events/rsvps/mine?user_id='+a.user.id,undefined,b.token)).rsvps.length,0);
  const mine=await api('GET','/events/rsvps/mine',undefined,a.token);assert.equal(mine.rsvps.length,1);assert.equal(mine.rsvps[0].status,'going');
  assert.equal((await api('GET','/events/'+eventId)).event.attending_count,0);
 });
 await check('RSVP repeated and concurrent submissions keep one persisted row and monotonic revisions',async()=>{
  const results=await Promise.all([1,2].map(()=>api('PUT','/events/'+eventId+'/rsvp',{status:'going'},a.token)));
  assert(results.every(r=>r.replayed&&r.rsvp.revision===1));
  assert.equal((await pool.query('SELECT count(*)::int n FROM event_rsvps WHERE event_id=$1 AND user_id=$2',[eventId,a.user.id])).rows[0].n,1);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'going',revision:'bad'},a.token,400);
  const statuses=await Promise.all(['going','interested'].map(async status=>{
   const r=await fetch(base+'/events/'+eventId+'/rsvp',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+b.token},body:JSON.stringify({status,revision:0})});return r.status;
  }));assert.deepEqual(statuses.sort(),[200,409]);
  const mine=(await api('GET','/events/'+eventId,undefined,b.token)).event;
  assert.equal(mine.my_rsvp_revision,1);
  const changed=await api('PUT','/events/'+eventId+'/rsvp',{status:'not_going',revision:1},b.token);assert.equal(changed.my_rsvp_revision,2);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'interested',revision:1},b.token,409);
  assert.equal((await api('GET','/events/'+eventId,undefined,b.token)).event.my_rsvp,'not_going');
 });
 await check('only opt-in public RSVP intent counts; private/suspended accounts and private state never leak',async()=>{
  await api('PUT','/events/'+eventId+'/rsvp',{status:'going',audience:'public'},a.token);
  assert.equal((await api('GET','/events/'+eventId)).event.attending_count,1);
  await api('PATCH','/users/me/settings',{is_private:true,allow_messages:'everyone'},a.token);
  assert.equal((await api('GET','/events/'+eventId)).event.attending_count,0);
  await api('PATCH','/users/me/settings',{is_private:false,allow_messages:'everyone'},a.token);
  await pool.query('UPDATE users SET is_suspended=true WHERE id=$1',[a.user.id]);
  assert.equal((await api('GET','/events/'+eventId)).event.attending_count,0);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'interested'},a.token,401);
  await pool.query('UPDATE users SET is_suspended=false WHERE id=$1',[a.user.id]);
  const r=await api('GET','/events/'+eventId,undefined,b.token);
  assert.equal(r.event.my_rsvp,'not_going');assert.equal(r.event.attendees,undefined);assert.equal(r.event.user_id,undefined);
  assert.equal((await api('GET','/events?q=Fictional%20QA')).events[0].attending_count,1);
 });
 await check('loss of verification blocks new RSVP participation but not private withdrawal',async()=>{
  await pool.query('UPDATE users SET email_verified_at=NULL,verified_email=NULL WHERE id=$1',[a.user.id]);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'interested'},a.token,403);
  const removed=await api('DELETE','/events/'+eventId+'/rsvp/',undefined,a.token);assert.equal(removed.removed,true);
  assert.equal((await api('GET','/events/'+eventId,undefined,a.token)).event.my_rsvp,null);
  assert.equal((await pool.query('SELECT count(*)::int n FROM event_rsvps WHERE event_id=$1 AND user_id=$2',[eventId,b.user.id])).rows[0].n,1);
  await pool.query('UPDATE users SET email_verified_at=NOW(),verified_email=lower(email) WHERE id=$1',[a.user.id]);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'going',audience:'public'},a.token);
 });
 await check('revoking event source or venue availability blocks RSVP but withdrawal always persists',async()=>{
  await pool.query("UPDATE venues SET business_status='CLOSED_TEMPORARILY' WHERE id=$1",[venue]);
  await api('GET','/events/'+eventId,undefined,null,404);
  await api('PUT','/events/'+eventId+'/rsvp',{status:'going'},b.token,404);
  await pool.query('UPDATE venues SET business_status=NULL WHERE id=$1',[venue]);
  await pool.query("UPDATE events SET source_review_status='rejected' WHERE id=$1",[eventId]);
  assert.equal((await api('GET','/events')).total,0);
  const unavailable=(await api('GET','/events/rsvps/mine',undefined,a.token)).rsvps[0];assert.equal(unavailable.event_available,false);assert.equal(unavailable.title,null);
  const first=await api('DELETE','/events/'+eventId+'/rsvp',undefined,a.token);assert.equal(first.removed,true);
  const retry=await api('DELETE','/events/'+eventId+'/rsvp',undefined,a.token);assert.equal(retry.removed,false);
  assert.equal((await api('GET','/events/rsvps/mine',undefined,a.token)).rsvps.length,0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM event_rsvps WHERE event_id=$1 AND user_id=$2',[eventId,b.user.id])).rows[0].n,1);
  await api('DELETE','/events/'+eventId+'/rsvp',undefined,b.token);
  await pool.query("UPDATE events SET source_review_status='reviewed' WHERE id=$1",[eventId]);
  assert.equal((await api('GET','/events/'+eventId)).event.attending_count,0);
 });
 await check('friend requests are recipient-only, duplicate-safe and block-aware',async()=>{
  const requests=await Promise.all([1,2].map(()=>api('POST','/friends/request',{user_id:b.user.id},a.token)));
  assert.equal(requests[0].friendship_id,requests[1].friendship_id);
  const fid=requests[0].friendship_id;
  assert.equal((await pool.query("SELECT count(*)::int n FROM notifications WHERE type='friend_request' AND ref_id=$1",[fid])).rows[0].n,1);
  await api('POST','/friends/accept',{friendship_id:fid},a.token,403);
  await api('POST','/friends/accept',{friendship_id:fid},c.token,404);
  assert.equal((await api('GET','/friends/pending',undefined,b.token)).incoming.length,1);
  assert.equal((await api('GET','/friends',undefined,a.token)).friends.length,0);
  await api('POST','/friends/request',{user_id:a.user.id},a.token,400);
  await pool.query('UPDATE users SET is_suspended=true WHERE id=$1',[c.user.id]);
  await api('POST','/friends/request',{user_id:c.user.id},a.token,404);
  await pool.query('UPDATE users SET is_suspended=false WHERE id=$1',[c.user.id]);
 });
 await check('private profile and accepted friendship permissions',async()=>{
  await api('PATCH','/users/me/settings',{is_private:true,allow_messages:'everyone'},b.token);const privateProfile=await api('GET','/users/'+b.user.id,undefined,a.token);assert.equal(privateProfile.can_view,false);assert.equal(privateProfile.user.bio,null);
  const f=await api('POST','/friends/request',{user_id:b.user.id},a.token);await api('POST','/friends/accept',{friendship_id:f.friendship_id},b.token);assert.equal((await api('GET','/users/'+b.user.id,undefined,a.token)).can_view,true);
 });
 await check('retry-safe post, audience filtering, real persistence',async()=>{
  const client_id=crypto.randomUUID(),body={client_id,body:'Integration friends post',venue_id:venue,audience:'friends'};
  post=(await api('POST','/posts',body,b.token,201)).post;await api('POST','/posts',body,b.token,200);
  assert.equal(Number((await pool.query('SELECT count(*) FROM posts WHERE id=$1',[client_id])).rows[0].count),1);
  assert((await api('GET','/posts/feed',undefined,a.token)).items.some(p=>p.id===post.id));assert(!(await api('GET','/posts/feed',undefined,c.token)).items.some(p=>p.id===post.id));await api('GET','/posts/'+post.id,undefined,c.token,404);
 });
 await check('concurrent explicit likes are idempotent; comment survives re-read',async()=>{
  await Promise.all([api('PUT','/posts/'+post.id+'/like',{liked:true},a.token),api('PUT','/posts/'+post.id+'/like',{liked:true},a.token)]);
  const r=await api('GET','/posts/'+post.id,undefined,a.token);assert.equal(r.post.like_count,1);
  await api('POST','/posts/'+post.id+'/comments',{body:'See you there',client_id:crypto.randomUUID()},a.token,201);assert.equal((await api('GET','/posts/'+post.id+'/comments',undefined,a.token)).comments[0].body,'See you there');
 });
 await check('conversation membership, send replay and read-through semantics',async()=>{
  conversation=(await api('POST','/conversations',{user_id:b.user.id},a.token,201)).conversation;
  const payload={body:'Message with retry-safe ID',client_id:crypto.randomUUID()};message=(await api('POST','/conversations/'+conversation.id+'/messages',payload,a.token,201)).message;
  await api('POST','/conversations/'+conversation.id+'/messages',payload,a.token,200);assert.equal((await api('GET','/conversations/'+conversation.id+'/messages',undefined,b.token)).messages.length,1);
  await api('GET','/conversations/'+conversation.id+'/messages',undefined,c.token,404);assert.equal((await api('GET','/conversations/unread-count',undefined,b.token)).unread,1);
  await api('POST','/conversations/'+conversation.id+'/read',{through_id:message.id},b.token);assert.equal((await api('GET','/conversations/unread-count',undefined,b.token)).unread,0);
 });
 let roomId,rev;
 await check('private plan create is replay-safe and capabilities are truthful',async()=>{
  assert.equal((await api('GET','/launch/capabilities')).features.decision_rooms,true);
  roomId=crypto.randomUUID();const payload={client_id:roomId,name:'Fictional local test plan',event_date:'2026-10-09',description:'Isolated integration only'};
  await api('POST','/rooms',payload,a.token,201);await api('POST','/rooms',payload,a.token,200);
  assert.equal(Number((await pool.query('SELECT count(*) FROM launch_rooms WHERE id=$1',[roomId])).rows[0].count),1);
  await api('GET','/rooms/'+roomId,undefined,c.token,404);await api('GET','/rooms/'+roomId,undefined,null,401);
 });
 await check('invitation is not membership until explicitly accepted',async()=>{
  await api('POST','/rooms/'+roomId+'/invitations',{user_id:b.user.id},a.token);
  await api('POST','/rooms/'+roomId+'/invitations',{user_id:b.user.id},a.token);
  assert.equal(Number((await pool.query("SELECT count(*) FROM notifications WHERE user_id=$1 AND ref_id=$2 AND type='room_invitation'",[b.user.id,roomId])).rows[0].count),1);
  await api('GET','/rooms/'+roomId,undefined,b.token,404);
  assert((await api('GET','/rooms/invitations',undefined,b.token)).invitations.some(x=>x.id===roomId));
  await api('PUT','/rooms/'+roomId+'/invitation',{response:'accepted'},b.token);
  await api('PUT','/rooms/'+roomId+'/invitation',{response:'accepted'},b.token);
  assert((await api('GET','/rooms/'+roomId,undefined,b.token)).room.members.some(x=>x.id===b.user.id&&x.status==='accepted'));
 });
 await check('private room invitations expire, revoke, and reissue without granting uninvited access',async()=>{
  const rid=crypto.randomUUID();await api('POST','/rooms',{client_id:rid,name:'Temporary invite boundary fixture'},a.token,201);
  await api('POST','/rooms/'+rid+'/invitations',{user_id:b.user.id},a.token);
  const invitation=(await api('GET','/rooms/invitations',undefined,b.token)).invitations.find(x=>x.id===rid);assert(invitation.expires_at);
  await api('PUT','/rooms/'+rid+'/invitation',{response:'accepted'},c.token,404);
  await pool.query("UPDATE launch_room_members SET created_at=NOW()-INTERVAL '8 days' WHERE room_id=$1 AND user_id=$2",[rid,b.user.id]);
  assert(!(await api('GET','/rooms/invitations',undefined,b.token)).invitations.some(x=>x.id===rid));
  assert(!(await api('GET','/notifications',undefined,b.token)).notifications.some(x=>x.ref_id===rid));
  await api('PUT','/rooms/'+rid+'/invitation',{response:'accepted'},b.token,404);
  await api('POST','/rooms/'+rid+'/invitations',{user_id:b.user.id},a.token);
  assert.equal((await api('GET','/notifications',undefined,b.token)).notifications.filter(n=>n.ref_id===rid&&n.type==='room_invitation').length,1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND ref_id=$2 AND type='room_invitation'",[b.user.id,rid])).rows[0].n,1);
  await api('DELETE','/rooms/'+rid+'/members/'+b.user.id,undefined,a.token);
  await api('PUT','/rooms/'+rid+'/invitation',{response:'accepted'},b.token,409);
  await api('POST','/rooms/'+rid+'/invitations',{user_id:b.user.id},a.token);
  await Promise.all([1,2].map(()=>api('PUT','/rooms/'+rid+'/invitation',{response:'accepted'},b.token)));
  const head=(await api('GET','/rooms/'+rid,undefined,a.token)).room;assert.equal(head.members.filter(m=>m.id===b.user.id).length,1);
  assert(!(await api('GET','/notifications',undefined,b.token)).notifications.some(n=>n.ref_id===rid&&n.type==='room_invitation'&&!n.read_at));
  assert.equal((await pool.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND ref_id=$2 AND type='room_accepted'",[a.user.id,rid])).rows[0].n,1);
  await api('DELETE','/rooms/'+rid,{revision:head.revision},a.token);
 });
 await check('shortlist and concurrent vote replay produce real single-member totals',async()=>{
  await api('PUT','/rooms/'+roomId+'/options/'+venue,{},a.token);await api('PUT','/rooms/'+roomId+'/options/'+venue,{},b.token);
  await Promise.all([api('PUT','/rooms/'+roomId+'/options/'+venue+'/vote',{choice:'yes'},b.token),api('PUT','/rooms/'+roomId+'/options/'+venue+'/vote',{choice:'yes'},b.token)]);
  const r=(await api('GET','/rooms/'+roomId,undefined,a.token)).room;assert.equal(r.options.length,1);assert.equal(r.options[0].yes_count,1);
  assert.equal(Number((await pool.query('SELECT count(*) FROM launch_room_votes WHERE room_id=$1',[roomId])).rows[0].count),1);rev=r.revision;
 });
 await check('plan editing and decisions reject stale revisions and enforce ownership',async()=>{
  await api('PUT','/rooms/'+roomId+'/details',{name:'Attempted unauthorized rename',revision:rev},b.token,404);
  await api('PUT','/rooms/'+roomId+'/details',{name:'Updated local plan',event_date:'2026-10-10',description:'Changed in integration',revision:rev},a.token);
  await api('PUT','/rooms/'+roomId+'/decision',{venue_id:venue,revision:rev},a.token,409);
  const head=(await api('GET','/rooms/'+roomId,undefined,a.token)).room;assert.equal(head.name,'Updated local plan');assert.equal(head.state,'planning');rev=head.revision;
  await api('PUT','/rooms/'+roomId+'/decision',{venue_id:venue,revision:rev},b.token,404);
  const r=await api('PUT','/rooms/'+roomId+'/decision',{venue_id:venue,revision:rev},a.token);assert.equal(r.confirmed_is_reservation,false);
  await api('PUT','/rooms/'+roomId+'/options/'+venue+'/vote',{choice:'no'},b.token,409);
  rev=(await api('GET','/rooms/'+roomId,undefined,a.token)).room.revision;await api('PUT','/rooms/'+roomId+'/state',{state:'planning',revision:rev},a.token);
 });
 await check('leaving revokes access and removes former votes and notifications',async()=>{
  await api('DELETE','/rooms/'+roomId+'/members/'+b.user.id,undefined,b.token);
  await api('GET','/rooms/'+roomId,undefined,b.token,404);
  assert.equal((await api('GET','/rooms/'+roomId,undefined,a.token)).room.options[0].yes_count,0);
  assert(!(await api('GET','/notifications',undefined,b.token)).notifications.some(n=>n.ref_type==='room'&&n.ref_id===roomId));
  await api('POST','/rooms/'+roomId+'/invitations',{user_id:b.user.id},a.token);await api('PUT','/rooms/'+roomId+'/invitation',{response:'accepted'},b.token);
 });
 await check('blocking disables existing conversations and content',async()=>{
  await api('POST','/users/'+a.user.id+'/block',{},b.token,201);await api('POST','/conversations/'+conversation.id+'/messages',{body:'Must not send',client_id:crypto.randomUUID()},a.token,404);await api('GET','/posts/'+post.id,undefined,a.token,404);await api('GET','/rooms/'+roomId,undefined,a.token,404);await api('GET','/rooms/'+roomId,undefined,b.token,404);
  const management=await api('GET','/rooms/'+roomId+'/manage-members',undefined,a.token);assert(management.members.some(x=>x.id===b.user.id&&x.display_name==='Unavailable member'));
  await api('DELETE','/rooms/'+roomId+'/members/'+b.user.id,undefined,a.token);await api('GET','/rooms/'+roomId,undefined,a.token);
  await api('DELETE','/users/'+a.user.id+'/block',undefined,b.token);
  assert.equal((await api('GET','/friends',undefined,a.token)).friends.length,0);
 });
 await check('favorites/lists are server-persistent and private by default',async()=>{
  await api('POST','/favorites/'+venue,{},a.token);assert.equal((await api('GET','/favorites',undefined,a.token)).favorites.length,1);
  const list=(await api('POST','/lists',{name:'Local integration saved list'},a.token,201)).list;assert.equal(list.is_public,false);await api('POST','/lists/'+list.id+'/venues',{venue_id:venue},a.token);assert.equal((await api('GET','/lists',undefined,a.token)).lists[0].venues.length,1);await api('GET','/lists/'+list.id,undefined,c.token,404);
 });
 await check('saved catalog remains factual and unavailable venues cannot regain active actions',async()=>{
  const list=(await api('POST','/lists',{name:'Saved unavailable QA'},a.token,201)).list;
  await api('POST','/lists/'+list.id+'/venues',{venue_id:venue},a.token);
  await pool.query("UPDATE venues SET rating=4.9,review_count=900,buzz_score=99,going_count=50,trending=true,reservation_url='https://example.com/isolated-booking',reservation_live=true,business_status='temporarily_closed' WHERE id=$1",[venue]);
  const saved=(await api('GET','/favorites',undefined,a.token)).favorites[0];assert.equal(saved.venue_available,false);assert.equal(saved.venue_rating,null);assert.equal(saved.booking.status,'not_available');
  const listed=(await api('GET','/lists/'+list.id,undefined,a.token)).list.venues[0];assert.equal(listed.venue_available,false);assert.equal(listed.rating,null);assert.equal(listed.reservation_is_confirmed,false);
  assert.equal((await api('GET','/venues?q=Harbor%20%26%20Pine')).total,1);
  await api('POST','/favorites/'+venue,{},b.token,404);
  await api('POST','/lists/'+list.id+'/venues',{venue_id:venue},a.token,404);
  await api('POST','/checkins',{venue_id:venue},a.token,404);
  await api('PUT','/rooms/'+roomId+'/options/'+venue,{},a.token,404);
  await pool.query('UPDATE venues SET business_status=NULL WHERE id=$1',[venue]);
  await Promise.all([1,2].map(()=>api('POST','/favorites/'+venue,{},a.token)));
  assert.equal((await pool.query('SELECT count(*)::int n FROM favorites WHERE user_id=$1 AND venue_id=$2',[a.user.id,venue])).rows[0].n,1);
  const detail=await api('GET','/venues/'+venue);assert.equal(detail.rating,null);assert.equal(detail.trending,null);assert.equal(detail.booking.status,'external_link');assert.equal(detail.reservation_is_confirmed,false);
  const recommendation=await api('POST','/concierge',{message:'Italian in Southie',ai:false});
  const rec=recommendation.venues.find(v=>v.id===venue);assert.equal(rec.rating,null);assert.equal(rec.buzz_score,null);assert.equal(rec.reservation_is_confirmed,false);
 });
 await check('public saved lists still respect owner profile privacy and suspension',async()=>{
  const list=(await api('POST','/lists',{name:'Owner privacy QA',is_public:true},b.token,201)).list;
  await api('GET','/lists/'+list.id,undefined,c.token,404);
  await api('PATCH','/users/me/settings',{is_private:false,allow_messages:'everyone'},b.token);
  await api('GET','/lists/'+list.id,undefined,c.token);
  await pool.query('UPDATE users SET is_suspended=true WHERE id=$1',[b.user.id]);
  await api('GET','/lists/'+list.id,undefined,c.token,404);
  await pool.query('UPDATE users SET is_suspended=false WHERE id=$1',[b.user.id]);
  await api('PATCH','/users/me/settings',{is_private:true,allow_messages:'everyone'},b.token);
 });
 await check('historical plans preserve owner data without bypassing canonical invitation privacy',async()=>{
  const plan=(await api('POST','/plans',{name:'Historical isolated fixture'},a.token,201)).plan;
  await api('POST','/plans/'+plan.id+'/venues',{venue_id:venue},a.token);
  await pool.query("INSERT INTO plan_members(plan_id,user_id,role) VALUES($1,$2,'member')",[plan.id,b.user.id]);
  const invite=(await pool.query('INSERT INTO plan_invites(plan_id,inviter_id,invitee_id) VALUES($1,$2,$3) RETURNING id',[plan.id,a.user.id,c.user.id])).rows[0];
  const detail=(await api('GET','/plans/'+plan.id,undefined,b.token)).plan;assert.equal(detail.invites.length,0);assert.equal(detail.confirmed_is_reservation,false);assert.equal(detail.stops[0].rating,null);
  await api('GET','/plans/'+plan.id,undefined,c.token,404);
  await api('POST','/plans/'+plan.id+'/invites',{user_id:c.user.id},a.token,409);
  await api('POST','/plans/'+plan.id+'/invites/'+invite.id+'/accept',{},c.token,409);
  await api('POST','/plans/'+plan.id+'/share',{},a.token,409);
  await api('POST','/users/'+b.user.id+'/block',{},a.token,201);
  await api('GET','/plans/'+plan.id,undefined,b.token,404);
  assert(!(await api('GET','/plans',undefined,b.token)).plans.some(p=>p.id===plan.id));
  assert(!(await api('GET','/plans/'+plan.id,undefined,a.token)).plan.members.some(m=>m.id===b.user.id));
  await api('DELETE','/users/'+b.user.id+'/block',undefined,a.token);
  assert((await api('GET','/plans',undefined,a.token)).plans.some(p=>p.id===plan.id));
 });
 await check('logout revokes one session while another remains valid',async()=>{await api('POST','/auth/logout',{},a.token);await api('GET','/auth/me',undefined,a.token,401);await api('GET','/auth/me',undefined,secondA.token);});
 await check('reset token consumes once and revokes prior sessions',async()=>{
  const raw=crypto.randomBytes(32).toString('hex');await pool.query("UPDATE users SET reset_token=$1,reset_token_expires=NOW()+INTERVAL '10 minutes' WHERE id=$2",[crypto.createHash('sha256').update(raw).digest('hex'),a.user.id]);
  const next='Changed integration password 123';await api('POST','/auth/reset-password',{token:raw,password:next});await api('POST','/auth/reset-password',{token:raw,password:next},null,400);await api('GET','/auth/me',undefined,secondA.token,401);const fresh=await api('POST','/auth/login',{email:'alex@example.invalid',password:next});a.token=fresh.token;
  await api('DELETE','/auth/account',{password:next},a.token);await api('GET','/auth/me',undefined,a.token,401);
 });
 let business, businessSecond;
 await check('operator sessions use the operator table and cannot access consumer data',async()=>{
  const hash=await req('bcryptjs').hash(password,12);
  const owner=await pool.query("INSERT INTO business_users(email,password_hash,venue_name,venue_id,status,tier) VALUES('owner@example.invalid',$1,'Fictional operator',$2,'active','pro') RETURNING id",[hash,venue]);
  business=await api('POST','/business/login',{email:'owner@example.invalid',password});
  businessSecond=await api('POST','/business/login',{email:'owner@example.invalid',password});
  assert.equal((await api('GET','/business/me',undefined,business.token)).user.id,owner.rows[0].id);
  await api('GET','/auth/me',undefined,business.token,401);
  await api('GET','/business/me',undefined,c.token,401);
 });
 await check('unreviewed claim cannot acquire venue edit permissions',async()=>{
  const claim=await api('POST','/business/claim',{venue_name:'Harbor & Pine',email:'claim@example.invalid',password},null,202);
  assert.equal(claim.pending_review,true);assert.equal(claim.token,undefined);assert.equal(claim.user.status,'pending');
  await api('POST','/business/login',{email:'claim@example.invalid',password},null,403);
 });
 await check('operator cannot add or edit another existing venue by identifier',async()=>{
  const other=(await pool.query('SELECT id FROM venues WHERE id<>$1 LIMIT 1',[venue])).rows[0].id;
  await api('POST','/business/venues/add',{existing_venue_id:other},business.token,403);
  await api('PATCH','/business/venue',{venue_id:other,name:'Unauthorized rename'},business.token,403);
  assert.equal((await pool.query('SELECT name FROM venues WHERE id=$1',[other])).rows[0].name,'Harbor & Pine Annex');
 });
 await check('business logout revokes exactly one operator session',async()=>{
  await api('POST','/business/logout',{},business.token);await api('GET','/business/me',undefined,business.token,401);
  await api('GET','/business/me',undefined,businessSecond.token);
 });
 await check('operator password reset is single-use and revokes prior sessions',async()=>{
  const raw=crypto.randomBytes(32).toString('hex');
  await pool.query("UPDATE business_users SET reset_token=$1,reset_token_expires=NOW()+INTERVAL '10 minutes' WHERE email='owner@example.invalid'",[crypto.createHash('sha256').update(raw).digest('hex')]);
  await api('POST','/business/reset-password',{token:raw,password:'New operator password 123'});
  await api('POST','/business/reset-password',{token:raw,password:'New operator password 123'},null,400);
  await api('GET','/business/me',undefined,businessSecond.token,401);
  business=await api('POST','/business/login',{email:'owner@example.invalid',password:'New operator password 123'});
 });
 await check('disabled operator loses access immediately',async()=>{
  await pool.query("UPDATE business_users SET status='disabled' WHERE email='owner@example.invalid'");
  await api('GET','/business/me',undefined,business.token,401);
 });
 await check('consumer profile update survives independent session reads',async()=>{
  await api('PUT','/auth/profile',{display_name:'Changed Jordan'},c.token);
  const second=await api('POST','/auth/login',{email:'jordan@example.invalid',password});
  assert.equal((await api('GET','/auth/me',undefined,second.token)).user.display_name,'Changed Jordan');
  await api('POST','/auth/logout-all',{},c.token);await api('GET','/auth/me',undefined,second.token,401);
 });
 await check('existing short password can login but new short passwords are rejected',async()=>{
  const hash=await req('bcryptjs').hash('old123',12);
  await pool.query("INSERT INTO users(email,username,password_hash) VALUES('legacy@example.invalid','legacy_test',$1)",[hash]);
  const login=await api('POST','/auth/login',{email:'legacy@example.invalid',password:'old123'});
  assert(login.token);await api('POST','/auth/login',{email:'legacy@example.invalid',password:'wrong!'},null,401);
  await api('POST','/auth/signup',{email:'newshort@example.invalid',username:'newshort',password:'old123'},null,400);
 });
 await check('concierge fallback respects Southie and excludes inactive venues',async()=>{
  await pool.query("INSERT INTO venues(name,slug,type,cuisine,neighborhood,is_active,buzz_score) VALUES('Inactive QA','inactive-qa','restaurant','Italian','South Boston',false,99)");
  const r=await api('POST','/concierge',{message:'Italian in Southie',ai:false});
  assert.equal(r.source,'rule-based');assert.equal(r.venues.length,2);
  assert(r.venues.every(v=>v.neighborhood==='South Boston'&&v.name!=='Inactive QA'));
  assert(r.venues.every(v=>v.is_open_now===null));
  await api('POST','/concierge',{message:{invalid:true}},null,400);
  const none=await api('POST','/concierge',{message:'Japanese in Southie',ai:false});assert.equal(none.venues.length,0);
 });
 await check('AI candidate filters never silently drop cuisine or budget',async()=>{
  const ai=req('./src/routes/conciergeAI');assert.deepEqual(ai.parseFilters('Southie').neighborhoods,['South Boston']);
  assert.deepEqual(ai.parseFilters('East Boston').neighborhoods,['East Boston']);
  await pool.query("INSERT INTO venues(name,slug,type,cuisine,neighborhood,is_active,price_level) VALUES('Expensive QA','expensive-qa','restaurant','Italian','South Boston',true,4)");
  // Code-only rollout supports the old schema, but an imported default price
  // must not satisfy an explicit budget filter. Review is independently opt-in.
  assert.equal((await ai.fetchCandidateVenues(ai.parseFilters('cheap Italian dinner in Southie'))).length,0);
  await pool.query(fs.readFileSync(path.join(root,'migrations/017_venue_fact_reviews.sql'),'utf8'));
  await pool.query("UPDATE venues SET field_provenance=jsonb_build_object('price_level',jsonb_build_object('status','reviewed','value',price_level,'source_url','https://fixture.example.com/menu','observed_at','2026-01-01')) WHERE neighborhood='South Boston' AND cuisine='Italian' AND is_active");
  const rows=await ai.fetchCandidateVenues(ai.parseFilters('cheap Italian dinner in Southie'));
  assert.equal(rows.length,2);assert(rows.every(v=>v.price_level<=2&&v.price_status==='source_checked'&&v.cuisine==='Italian'));
  const filtered=await api('GET','/venues?price_level=2');assert(filtered.venues.length>=2);assert(filtered.venues.every(v=>v.price_level===2&&v.price_status==='source_checked'));
  assert.equal((await ai.fetchCandidateVenues(ai.parseFilters('Japanese dinner in Southie'))).length,0);
 });
 await check('AI route invokes provider adapter and grounds cards in database facts',async()=>{
  const realFetch=globalThis.fetch;let calls=0;
  process.env.OPENAI_API_KEY='isolated-provider-fixture';
  globalThis.fetch=async(url,opts)=>{
    if(String(url)==='https://api.openai.com/v1/responses'){
      calls++;const body=JSON.parse(opts.body);assert(!JSON.stringify(body).includes('alex@example.invalid'));
      return new Response(JSON.stringify({output_text:JSON.stringify({reply:'A suggested place; confirm details with the venue.',intent:'plan_night',
        recommendedPlan:{title:'An evening',summary:'A suggestion',stops:[{venueId:venue,name:'Invented name',neighborhood:'Wrong area',category:'Wrong category',priceLevel:'$$$$',bestTime:'Guaranteed 7pm',vibeTags:['invented'],whyItFits:'Suggested stop'}]},
        recommendedVenues:[{venueId:venue,whyItFits:'A suggestion'},{venueId:crypto.randomUUID(),whyItFits:'Invented'}],quickReplies:['Explore']})}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return realFetch(url,opts);
  };
  try{
    const r=await api('POST','/concierge',{message:'cheap Italian dinner in Southie'});
    assert.equal(calls,1);assert.equal(r.source,'openai');assert.equal(r.venues.length,1);assert.equal(r.venues[0].id,venue);
    assert.equal(r.itinerary.stops[0].name,'Harbor & Pine');assert.equal(r.itinerary.stops[0].neighborhood,'South Boston');
    assert.equal(r.itinerary.stops[0].bestTime,null);assert.deepEqual(r.itinerary.stops[0].vibeTags,[]);
    globalThis.fetch=async(url,opts)=>String(url)==='https://api.openai.com/v1/responses'?Promise.reject(new Error('fixture outage')):realFetch(url,opts);
    const fallback=await api('POST','/concierge',{message:'cheap Italian dinner in Southie'});assert.equal(fallback.source,'rule-based');assert.equal(fallback.venues.length,2);
  }finally{globalThis.fetch=realFetch;delete process.env.OPENAI_API_KEY;}
 });
 await check('admin endpoints require current database role and reject revoked sessions',async()=>{
  await api('GET','/analytics/summary',undefined,null,401);
  const currentVersion=(await pool.query('SELECT auth_version FROM users WHERE id=$1',[b.user.id])).rows[0].auth_version;
  const signed=req('./src/middleware/auth').generateToken({id:b.user.id,role:'admin',auth_version:currentVersion});
  await api('GET','/admin/stats',undefined,signed,403);
  await pool.query("UPDATE users SET role='admin' WHERE id=$1",[b.user.id]);
  const login=await api('POST','/auth/login',{email:'maya@example.invalid',password});
  await api('GET','/admin/stats',undefined,login.token);
  await api('GET','/analytics/summary',undefined,login.token);
  await api('POST','/auth/logout',{},login.token);
  await api('GET','/admin/stats',undefined,login.token,401);
  await api('GET','/analytics/summary',undefined,login.token,401);
 });
 await check('known-closed venues are excluded from discovery and recommendations',async()=>{
  const id=crypto.randomUUID();await pool.query("INSERT INTO venues(id,name,slug,type,cuisine,neighborhood,is_active,business_status) VALUES($1,'Closed QA','closed-qa','restaurant','Italian','South Boston',true,'CLOSED_TEMPORARILY')",[id]);
  assert.equal((await api('GET','/venues?q=Closed%20QA')).total,0);
  await api('GET','/venues/'+id,undefined,null,404);
  const r=await api('POST','/concierge',{message:'Italian in Southie',ai:false});assert(!r.venues.some(v=>v.id===id));
  const ai=req('./src/routes/conciergeAI');assert(!(await ai.fetchCandidateVenues(ai.parseFilters('Italian in Southie'))).some(v=>v.id===id));
 });
 await check('city and street search use stored rows, with honest empty results',async()=>{
  await pool.query("UPDATE venues SET city='Quincy',address='120 Fictional Wharf Road' WHERE id=$1",[venue]);
  const cityResult=await api('GET','/venues?q=Quincy&view=detail&limit=100&offset=0');
  assert.equal(cityResult.limit,100);assert.equal(cityResult.offset,0);assert.equal(cityResult.total,1);assert.equal(cityResult.view,'detail');
  const page1=await api('GET','/venues?q=Harbor%20%26%20Pine&view=detail&limit=1&offset=0');
  const page2=await api('GET','/venues?q=Harbor%20%26%20Pine&view=detail&limit=1&offset=1');
  assert.equal(page1.total,2);assert.equal(page2.total,2);assert.equal(page1.has_more,true);assert.equal(page2.has_more,false);assert.notEqual(page1.venues[0].id,page2.venues[0].id);
  assert((await api('GET','/venues?neighborhood=Southie&view=detail&limit=100&offset=0')).venues.every(v=>v.neighborhood==='South Boston'));
  const card=cityResult.venues.find(v=>v.id===venue);assert(card);assert.equal(card.city,'Quincy');assert.equal(card.rating,null);assert.equal(card.review_count,null);assert.equal(card.metrics_status,'unverified');
  assert((await api('GET','/venues?q=Fictional%20Wharf')).venues.some(v=>v.id===venue));
  assert.equal((await api('GET','/venues?city=Quincy')).total,1);
  assert.equal((await api('GET','/venues?city=NoSuchCityQA')).total,0);
  assert.equal((await api('GET','/venues?city=Quincy%25')).total,0);
 });
 await check('moderator-hidden reviews disappear from venue reviews and feed',async()=>{
  const login=await api('POST','/auth/login',{email:'maya@example.invalid',password});
  const id=crypto.randomUUID();
  await pool.query("INSERT INTO reviews(id,user_id,venue_id,rating,content) VALUES($1,$2,$3,4,'Moderation QA only')",[id,b.user.id,venue]);
  assert((await api('GET','/reviews?venue_id='+venue,undefined,login.token)).reviews.some(r=>r.id===id));
  await api('PATCH','/admin/reviews/'+id,{is_hidden:true},login.token);
  assert(!(await api('GET','/reviews?venue_id='+venue,undefined,login.token)).reviews.some(r=>r.id===id));
  assert(!(await api('GET','/posts/feed',undefined,login.token)).items.some(r=>r.id===id));
  await api('PATCH','/admin/reviews/'+id,{is_hidden:false},login.token);
  assert((await api('GET','/reviews?venue_id='+venue,undefined,login.token)).reviews.some(r=>r.id===id));
  await api('POST','/admin/seed-demo-account',{},login.token,404);
 });
 await check('legacy query-token streams cannot bypass canonical authentication',async()=>{
  const login=await api('POST','/auth/login',{email:'maya@example.invalid',password});
  await api('GET','/events/stream?token=isolated-noncredential-fixture',undefined,null,401);
  await api('GET','/events/stream',undefined,login.token,409);
  await api('POST','/auth/logout',{},login.token);
  await api('GET','/events/stream',undefined,login.token,401);
 });
 await check('repeat migrations 007-012 preserve populated account privacy and social rows',async()=>{
  await pool.query("INSERT INTO event_rsvps(event_id,user_id,status,audience) VALUES($1,$2,'interested','private')",[eventId,b.user.id]);
  const snapshot=async()=>({users:(await pool.query('SELECT id,auth_version,is_private,allow_messages,email_verified_at,verified_email FROM users ORDER BY id')).rows,posts:(await pool.query('SELECT id,audience,is_public FROM posts ORDER BY id')).rows,rooms:(await pool.query('SELECT id,revision,state FROM launch_rooms ORDER BY id')).rows,events:(await pool.query('SELECT id,source,source_review_status,source_reviewed_at FROM events ORDER BY id')).rows,rsvps:(await pool.query('SELECT * FROM event_rsvps ORDER BY event_id,user_id')).rows});
  const before=await snapshot();
  for(const file of ['007_launch_social_integrity.sql','008_connected_decision_rooms.sql','009_launch_account_compatibility.sql','010_email_ownership.sql','011_staged_venue_provenance.sql','012_event_rsvps.sql'])await pool.query(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  assert.deepEqual(await snapshot(),before);
 });
 await check('staging venue import preserves provenance, skips identities, and never activates listings',async()=>{
  const importer=req('./qa/tools/stage-venue-import.cjs');
  const rows=[1,2].map(n=>({name:'Fictional Same Brand QA',address:n+' Fictional Street',city:'Quincy',state:'MA',lat:42.25,lng:-71,type:'cafe',category:'cafe',source:'overture',external_id:'isolated-import-'+n}));
  const provenance=Object.fromEntries(rows.map(r=>[r.external_id,{release:'isolated-fixture-release',sources:[{dataset:'fictional-only'}],verification_status:'provider_record_not_independently_verified',existence_confidence:0.9}]));
  const bundle={rows,ifExists:'skip'},report={release:'isolated-fixture-release',candidate_count:2,production_import_ready:false,input_sha256:'d'.repeat(64)};
  const evidence={input_sha256:'a'.repeat(64),provenance_sha256:'b'.repeat(64),notices_sha256:'c'.repeat(64)};
  const first=await importer.apply(pool,bundle,provenance,report,evidence);assert.equal(first.inserted,2);assert.equal(first.skipped,0);
  const actual=(await pool.query("SELECT id,name,is_active,rating,review_count,price_level FROM venues WHERE source='overture' AND external_id LIKE 'isolated-import-%' ORDER BY external_id")).rows;assert.equal(actual.length,2);assert(actual.every(x=>x.is_active===false&&x.rating===null&&x.review_count===null&&x.price_level===null));
  const saved=(await pool.query('SELECT provenance,source_release FROM venue_source_records WHERE import_batch_id=$1',[first.batch_id])).rows;assert.equal(saved.length,2);assert.equal(saved[0].provenance.sources[0].dataset,'fictional-only');
  const again=await importer.apply(pool,bundle,provenance,report,evidence);assert.equal(again.inserted,0);assert.equal(again.skipped,2);
  const addressMatch={...rows[0],external_id:'isolated-import-other-source-id'};
  const duplicate=await importer.apply(pool,{rows:[addressMatch],ifExists:'skip'},{[addressMatch.external_id]:provenance[rows[0].external_id]},{...report,candidate_count:1},evidence);assert.equal(duplicate.skipped,1);
  assert.deepEqual((await pool.query("SELECT id,name,is_active,rating,review_count,price_level FROM venues WHERE source='overture' AND external_id LIKE 'isolated-import-%' ORDER BY external_id")).rows,actual);
  assert.equal((await api('GET','/venues?q=Fictional%20Same%20Brand%20QA')).total,0);
  const before=(await pool.query('SELECT count(*)::int n FROM venue_import_batches')).rows[0].n;
  const brokenRows=[{...rows[0],name:'Rollback Fixture One',address:'900 Fictional Street',external_id:'rollback-one'},{...rows[1],name:'Rollback Fixture Two',address:'901 Fictional Street',external_id:'rollback-two'}];
  const brokenProvenance=Object.fromEntries(brokenRows.map(r=>[r.external_id,provenance[rows[0].external_id]]));
  await pool.query("ALTER TABLE venues ADD CONSTRAINT isolated_qa_import_reject CHECK(name <> 'Rollback Fixture Two')");
  try{await assert.rejects(importer.apply(pool,{rows:brokenRows,ifExists:'skip'},brokenProvenance,report,evidence));}finally{await pool.query('ALTER TABLE venues DROP CONSTRAINT isolated_qa_import_reject');}
  assert.equal((await pool.query("SELECT count(*)::int n FROM venues WHERE external_id IN ('rollback-one','rollback-two')")).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM venue_import_batches')).rows[0].n,before);
 });
 await req('./qa/social-messaging-integration.cjs')({api,pool,check,crypto});
 await req('./qa/list-invitations-integration.cjs')({api,pool,check,crypto,req,root});
 await req('./qa/integrated-ui-integration.cjs')({api,pool,check,crypto,req,root,base});
 await req('./qa/social-profile-integration.cjs')({api,pool,check,crypto,req,root});
 await req('./qa/event-ingestion-api-integration.cjs')({api,pool,check,crypto,req,root});
 console.log(JSON.stringify({scope:process.env.SCENELINK_TEST_ENGINE==='pglite'?'Real localhost HTTP/JWT/bcrypt and embedded PostgreSQL WASM; not native concurrency proof':'Real localhost HTTP and native PostgreSQL, fictional test data only',checks},null,2));
}
main().catch(e=>{console.error('INTEGRATION FAILED:',e.message);console.error(e.stack?.split('\n').slice(1).join('\n'));process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();});
