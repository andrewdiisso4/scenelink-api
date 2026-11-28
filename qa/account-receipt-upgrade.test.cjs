'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID,randomBytes}=require('node:crypto');
const {once}=require('node:events');
const express=require('express');
const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');
const {PGlite}=require('@electric-sql/pglite');
const {uuid_ossp}=require('@electric-sql/pglite/contrib/uuid_ossp');
const {makeAuth}=require('../src/launch/session');
const identity=require('../src/launch/identity');
const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'migrations/018_account_deletion_receipts.sql'),'utf8');

test('historical required-hash receipts upgrade without changing old rows or blocking account deletion',async t=>{
 // Actual historical DDL, current deletion route, real JWT/bcrypt and embedded
 // PostgreSQL. No production database, external provider or native lock claim.
 const db=await PGlite.create({extensions:{uuid_ossp}});t.after(()=>db.close());
 await db.exec(`CREATE EXTENSION "uuid-ossp";
  CREATE TABLE users(id uuid PRIMARY KEY,email text,role text DEFAULT 'user',auth_version int DEFAULT 0,
   is_active boolean DEFAULT true,is_suspended boolean DEFAULT false,is_private boolean DEFAULT true,
   allow_messages text DEFAULT 'friends',email_verified_at timestamptz,verified_email text,password_hash text,oauth_provider text,oauth_id text);
  CREATE TABLE auth_revocations(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz);
  CREATE TABLE notifications(actor_id uuid);
  CREATE TABLE launch_schema_versions(version text PRIMARY KEY);`);
 for(const file of ['migrations/004_phase8_launch_completion.sql','src/migrations/003_compliance_push.sql']){
  const ddl=fs.readFileSync(path.join(root,file),'utf8').match(/CREATE TABLE IF NOT EXISTS user_deletions \([\s\S]*?\);/)[0];
  await db.exec(ddl);
 }
 const oldId=randomUUID();
 await db.query("INSERT INTO user_deletions(user_id,email_hash,deletion_reason,ip_address,deleted_at) VALUES($1,'fictional-historical-hash','Fictional historical receipt','192.0.2.1','2026-01-01T00:00:00Z')",[oldId]);
 const historical=(await db.query('SELECT * FROM user_deletions WHERE user_id=$1',[oldId])).rows[0];
 const pool={query:(sql,values)=>db.query(sql,values),connect:async()=>({query:(sql,values)=>db.query(sql,values),release(){}})};
 const auth=makeAuth({jwt,pool,secret:randomBytes(48).toString('hex')});
 const router=express.Router(),next=(req,res,pass)=>pass();
 identity.install({router,pool,auth,write:next,authLimit:next,resetLimit:next,bcrypt,mailer:{isReady:()=>false}});
 const app=express();app.use(express.json());app.use('/api',router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const id=randomUUID(),email=id+'@example.invalid',password='Fictional upgrade password';
 await db.query('INSERT INTO users(id,email,password_hash,email_verified_at,verified_email) VALUES($1,$2,$3,NOW(),$2)',[id,email,await bcrypt.hash(password,4)]);
 const token=auth.generateToken({id,role:'user',auth_version:0});
 async function remove(){
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/account',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({password,confirmation:'DELETE'})});
  return{status:response.status,data:await response.json()};
 }
 await t.test('reapplying old CREATE TABLE variants does not fix the legacy constraint',async()=>{
  assert.equal((await db.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='user_deletions' AND column_name='email_hash'")).rows[0].is_nullable,'NO');
  assert.equal((await remove()).status,500);assert.equal((await db.query('SELECT id FROM users WHERE id=$1',[id])).rows.length,1);
  assert.deepEqual((await db.query('SELECT * FROM user_deletions')).rows,[historical]);
 });
 await t.test('migration repeats safely and keeps every historical receipt value',async()=>{
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='user_deletions' AND column_name='email_hash'")).rows[0].is_nullable,'YES');
  assert.equal((await db.query("SELECT version FROM launch_schema_versions WHERE version='account-deletion-receipts-2026-11-24'")).rows.length,1);
  assert.deepEqual((await db.query('SELECT * FROM user_deletions')).rows,[historical]);
 });
 await t.test('current deletion now commits an ID/time receipt without new identifying metadata',async()=>{
  const result=await remove();assert.equal(result.status,200);assert.equal(result.data.deleted,true);
  assert.equal((await db.query('SELECT id FROM users WHERE id=$1',[id])).rows.length,0);
  const receipt=(await db.query('SELECT * FROM user_deletions WHERE user_id=$1',[id])).rows[0];
  assert(receipt.deleted_at);assert.equal(receipt.email_hash,null);assert.equal(receipt.deletion_reason,null);assert.equal(receipt.ip_address,null);
  assert.deepEqual((await db.query('SELECT * FROM user_deletions WHERE user_id=$1',[oldId])).rows[0],historical);
 });
});

test('normal startup admits receipt migration018 without enabling unrelated venue migration017',async()=>{
 // Execute the actual selection function with a recording pool. Full startup
 // also asserts this marker in connected-launch-integration.cjs.
 const source=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
 const start=source.indexOf('async function applySqlMigrations()'),end=source.indexOf('// ==================== DATABASE INIT',start);
 assert(start>=0&&end>start);const submitted=[];
 const context={fs,path,__dirname:path.join(root,'src'),process:{env:{}},pool:{query:async sql=>submitted.push(sql)},console:{log(){},error(){}}};
 vm.runInNewContext(source.slice(start,end)+'\nthis.run=applySqlMigrations;',context);
 await context.run();assert(submitted.includes(migration));
 assert(!submitted.includes(fs.readFileSync(path.join(root,'migrations/017_venue_fact_reviews.sql'),'utf8')));
});

test('startup refuses missing receipt migration before accepting traffic',async()=>{
 let listening=false;
 await assert.rejects(require('../src/launch/bootstrap').start({initialize:async()=>{},port:0,app:{listen(){listening=true;}},pool:{query:async sql=>({rows:sql.includes('account-deletion-receipts-2026-11-24')?[]:[{version:'fixture'}]})}}),/migration 018 is missing/);
 assert.equal(listening,false);
});
