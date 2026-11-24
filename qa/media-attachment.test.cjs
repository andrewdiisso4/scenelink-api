'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {once}=require('node:events');
const express=require('express');
const jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite');
const {makeAuth}=require('../src/launch/session');
const media=require('../src/launch/media');

test('media attachment rechecks current account and profile after provider work',async t=>{
 // Real HTTP/JWT/route/SQL with fictional accounts and a simulated provider.
 // Embedded PostgreSQL proves the interleavings below, not native lock contention
 // or external delivery/deletion of a provider object.
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(
  id uuid PRIMARY KEY,email text NOT NULL,role text DEFAULT 'user',auth_version int NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,is_suspended boolean DEFAULT false,is_private boolean DEFAULT true,
  allow_messages text DEFAULT 'friends',email_verified_at timestamptz,verified_email text,
  avatar_url text,profile_revision int NOT NULL DEFAULT 1,updated_at timestamptz DEFAULT now()
 );
 CREATE TABLE auth_revocations(token_hash char(64) PRIMARY KEY,user_id uuid REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz);
 CREATE TABLE media_assets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url text NOT NULL,thumb_url text,mime_type text,width int,height int,bytes int,kind text NOT NULL);`);
 let rejectAvatarWrite=false,providerCalls=0,onProvider;
 const query=(sql,values)=>{
  if(rejectAvatarWrite&&sql.startsWith('UPDATE users SET avatar_url='))throw Error('Synthetic avatar write failure');
  return db.query(sql,values);
 };
 const pool={query,connect:async()=>({query,release(){}})};
 const auth=makeAuth({jwt,pool,secret:randomBytes(48).toString('hex')});
 const env={CLOUDINARY_URL:'cloudinary://fixture-key:fixture-secret@fixturecloud',CLOUDINARY_UPLOAD_PRESET:'fixture-preset'};
 const app=express(),router=express.Router();app.use(express.json({limit:'6mb'}));
 media.install({router,pool,auth,write:(req,res,next)=>next(),env,fetchImpl:async(url,options)=>{
  providerCalls++;assert.equal(url,'https://api.cloudinary.com/v1_1/fixturecloud/image/upload');
  const publicId=options.body.get('public_id');
  const extra=onProvider?await onProvider(publicId.split('/')[1]):{};
  return{ok:true,json:async()=>({public_id:publicId,resource_type:'image',format:'webp',width:64,height:64,bytes:128,
   secure_url:'https://res.cloudinary.com/fixturecloud/image/upload/v1/'+publicId+'.webp',...extra})};
 }});
 app.use('/api',router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const image='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
 async function owner(verified=true){
  const id=randomUUID(),email=id+'@example.invalid';
  await db.query('INSERT INTO users(id,email,email_verified_at,verified_email) VALUES($1,$2,$3,$4)',[id,email,verified?new Date():null,verified?email:null]);
  return{id,token:auth.generateToken({id,role:'user',auth_version:0})};
 }
 async function upload(account,body={kind:'avatar',data:image,revision:1}){
  const response=await fetch(base+'/media/upload',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.token},body:JSON.stringify(body)});
  return{status:response.status,data:await response.json()};
 }
 async function saved(account){return(await db.query('SELECT avatar_url,profile_revision FROM users WHERE id=$1',[account.id])).rows[0];}
 async function count(account){return(await db.query('SELECT count(*)::int n FROM media_assets WHERE owner_id=$1',[account.id])).rows[0].n;}

 await t.test('confirmed avatar and asset commit together and advance the saved revision',async()=>{
  const account=await owner(),response=await upload(account);
  assert.equal(response.status,201);assert.equal(response.data.asset.kind,'avatar');assert(response.data.asset.id);
  assert.deepEqual(await saved(account),{avatar_url:response.data.asset.url,profile_revision:2});assert.equal(await count(account),1);
 });
 await t.test('existing upload clients without revision remain compatible; post photos do not alter avatars',async()=>{
  const account=await owner(),avatar=await upload(account,{kind:'avatar',data:image});assert.equal(avatar.status,201);
  const post=await upload(account,{kind:'post',data:image});assert.equal(post.status,201);assert.equal(post.data.asset.kind,'post');
  assert.deepEqual(await saved(account),{avatar_url:avatar.data.asset.url,profile_revision:2});assert.equal(await count(account),2);
 });
 await t.test('invalid avatar revisions stop before contacting the provider',async()=>{
  const account=await owner(),before=providerCalls;
  for(const revision of [null,0,'1',1.5])assert.equal((await upload(account,{kind:'avatar',data:image,revision})).status,400);
  assert.equal(providerCalls,before);assert.equal(await count(account),0);
 });
 for(const scenario of ['deleted','disabled','suspended','auth version changed','token revoked'])await t.test(scenario+' during provider work prevents attachment',async()=>{
  const account=await owner();
  onProvider=async id=>{
   assert.equal(id,account.id);
   if(scenario==='deleted')await db.query('DELETE FROM users WHERE id=$1',[id]);
   if(scenario==='disabled')await db.query('UPDATE users SET is_active=false WHERE id=$1',[id]);
   if(scenario==='suspended')await db.query('UPDATE users SET is_suspended=true WHERE id=$1',[id]);
   if(scenario==='auth version changed')await db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[id]);
   if(scenario==='token revoked')await db.query("INSERT INTO auth_revocations(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[createHash('sha256').update(account.token).digest('hex'),id]);
   return{};
  };
  let response;try{response=await upload(account);}finally{onProvider=null;}
  assert.equal(response.status,401);assert.equal(response.data.code,'SESSION_REVOKED');assert.equal(await count(account),0);
  if(scenario!=='deleted')assert.deepEqual(await saved(account),{avatar_url:null,profile_revision:1});
 });
 await t.test('a profile edit during upload keeps its newer photo and rejects the stale attachment',async()=>{
  const account=await owner();
  onProvider=async id=>{await db.query("UPDATE users SET avatar_url='https://example.invalid/newer.webp',profile_revision=2 WHERE id=$1",[id]);return{};};
  let response;try{response=await upload(account);}finally{onProvider=null;}
  assert.equal(response.status,409);assert.equal(response.data.code,'STALE_PROFILE');assert.equal(await count(account),0);
  assert.deepEqual(await saved(account),{avatar_url:'https://example.invalid/newer.webp',profile_revision:2});
 });
 await t.test('a failed avatar update rolls back the inserted asset',async()=>{
  const account=await owner();rejectAvatarWrite=true;
  let response;try{response=await upload(account);}finally{rejectAvatarWrite=false;}
  assert.equal(response.status,500);assert.equal(await count(account),0);assert.deepEqual(await saved(account),{avatar_url:null,profile_revision:1});
 });
 await t.test('provider moderation never attaches an unapproved photo',async()=>{
  const account=await owner();onProvider=async()=>({moderation:[{status:'pending'}]});
  let response;try{response=await upload(account);}finally{onProvider=null;}
  assert.equal(response.status,202);assert.equal(response.data.pending_review,true);assert.equal(response.data.asset,undefined);
  assert.equal(await count(account),0);assert.deepEqual(await saved(account),{avatar_url:null,profile_revision:1});
 });
 await t.test('unverified accounts cannot start uploads',async()=>{
  const account=await owner(false),before=providerCalls;
  const response=await upload(account);assert.equal(response.status,403);assert.equal(response.data.code,'EMAIL_VERIFICATION_REQUIRED');assert.equal(providerCalls,before);
 });
 await t.test('unconfigured storage is reported honestly and does not contact a provider',async()=>{
  const account=await owner(),before=providerCalls;delete env.CLOUDINARY_URL;
  const capability=await fetch(base+'/media/capability');assert.equal((await capability.json()).enabled,false);
  assert.equal((await upload(account)).status,503);assert.equal(providerCalls,before);assert.equal(await count(account),0);
 });
});
