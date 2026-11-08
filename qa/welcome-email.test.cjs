'use strict';
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {enqueue,recipientHash,createDispatcher}=require('../src/services/welcome');
let pool,close;
const statements=fs.readFileSync(path.join(__dirname,'../migrations/014_signup_welcome_email.sql'),'utf8');
process.env.EMAIL_PROVIDER='disabled';
const templates=require('../src/services/mailer');
const silent={warn(){}};
let ready,sends,mailer,dispatcher;
before(async()=>{
 const target=process.env.TEST_WELCOME_DATABASE_URL;
 if(target){
  const u=new URL(target);
  assert(process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT==='yes' && ['postgres:','postgresql:'].includes(u.protocol) && ['127.0.0.1','[::1]'].includes(u.hostname) && u.port && /^\/scenelink_test_[a-z0-9_]+$/.test(u.pathname) && !u.search && !u.hash && !/[?#]/.test(target),'REFUSED: fresh local welcome test database required');
  pool=new (require('pg').Pool)({connectionString:target});close=()=>pool.end();
  assert.equal((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,'REFUSED: nonempty database');
 } else {
  const db=new (require('@electric-sql/pglite').PGlite)();await db.waitReady;
  pool={query:async(sql,args)=>args?db.query(sql,args):(await db.exec(sql)).at(-1)};close=()=>db.close();
 }
 await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY,email text NOT NULL,display_name text,is_active boolean DEFAULT true,is_suspended boolean DEFAULT false,email_verified_at timestamptz,verified_email text);
  CREATE TABLE launch_schema_versions(version text PRIMARY KEY);`);
 await pool.query(statements);await pool.query(statements);
});
after(async()=>{dispatcher?.stop();await close?.();});
beforeEach(async()=>{
 dispatcher?.stop();await pool.query('TRUNCATE users CASCADE');ready=true;sends=[];
 mailer={isReady:()=>ready,welcomeEmail:templates.welcomeEmail,sendMail:async msg=>{sends.push(msg);return{ok:true};}};
 dispatcher=createDispatcher({pool,mailer,logger:silent,sendTimeoutMs:50});
});
async function account(options={}){
 const u={id:crypto.randomUUID(),email:'fictional-'+crypto.randomUUID()+'@example.invalid',display_name:'Test <Person>',...options};
 await pool.query('INSERT INTO users(id,email,display_name,email_verified_at,verified_email) VALUES($1,$2,$3,$4,$5)',[u.id,u.email,u.display_name,u.verified?new Date():null,u.verified?u.email:null]);return u;
}
async function job(u){return(await pool.query('SELECT * FROM signup_welcome_emails WHERE user_id=$1',[u.id])).rows[0];}
test('migration repeats safely, queues no existing accounts and stores no copied email/body/token',async()=>{
 await account();await pool.query(statements);
 assert.equal((await pool.query('SELECT count(*)::int n FROM signup_welcome_emails')).rows[0].n,0);
 const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='signup_welcome_emails'")).rows.map(r=>r.column_name);
 assert.deepEqual(columns.sort(),['user_id','recipient_hash','status','created_at','claimed_at','completed_at'].sort());
});
test('duplicate enqueues, repeated drains and independent dispatchers send once',async()=>{
 const u=await account();await enqueue(pool,u);await enqueue(pool,u);
 const second=createDispatcher({pool,mailer,logger:silent});
 await Promise.all([dispatcher.drain(),dispatcher.drain(),second.drain()]);await second.drain();
 assert.equal(sends.length,1);assert.equal(sends[0].to.address,u.email);assert.equal(sends[0].retry,false);assert.equal(sends[0].privateLog,true);
 assert.equal((await job(u)).status,'accepted');assert.equal((await job(u)).recipient_hash,recipientHash(u.email));
 assert(!JSON.stringify(await job(u)).includes(u.email));
});
test('missing SMTP leaves a durable pending job and later availability sends it once',async()=>{
 const u=await account();await enqueue(pool,u);ready=false;await dispatcher.drain();assert.equal(sends.length,0);assert.equal((await job(u)).status,'pending');
 ready=true;await dispatcher.drain();assert.equal(sends.length,1);assert.equal((await job(u)).status,'accepted');
});
test('explicit mailer-not-ready after claim is safe to retry',async()=>{
 const u=await account();await enqueue(pool,u);mailer.sendMail=async()=>({ok:false,skipped:true,reason:'mailer-not-ready'});
 await dispatcher.drain();assert.equal((await job(u)).status,'pending');
 mailer.sendMail=async msg=>{sends.push(msg);return{ok:true};};await dispatcher.drain();assert.equal(sends.length,1);
});
test('mail failure stays unknown and is not replayed',async()=>{
 const u=await account();await enqueue(pool,u);mailer.sendMail=async msg=>{sends.push(msg);return{ok:false,error:'private provider message'};};
 await dispatcher.drain();await dispatcher.drain();assert.equal(sends.length,1);assert.equal((await job(u)).status,'unknown');
});
test('thrown provider error is redacted and never replayed',async()=>{
 const u=await account();await enqueue(pool,u);const logs=[];
 mailer.sendMail=async msg=>{sends.push(msg);throw new Error('secret token '+u.email);};
 dispatcher=createDispatcher({pool,mailer,logger:{warn:x=>logs.push(x)}});await dispatcher.drain();await dispatcher.drain();
 assert.equal(sends.length,1);assert.equal((await job(u)).status,'unknown');assert(!logs.join('').includes(u.email));assert(!logs.join('').includes('secret'));
});
test('timeout and late acceptance never cause automatic retry',async()=>{
 const u=await account();await enqueue(pool,u);let resolve;
 mailer.sendMail=async msg=>{sends.push(msg);return new Promise(r=>{resolve=r;});};
 await dispatcher.drain();assert.equal((await job(u)).status,'unknown');resolve({ok:true});await dispatcher.drain();assert.equal(sends.length,1);
});
test('crashed claimed job is not reclaimed on restart',async()=>{
 const u=await account();await enqueue(pool,u);await pool.query("UPDATE signup_welcome_emails SET status='sending',claimed_at=NOW()-INTERVAL '2 hours' WHERE user_id=$1",[u.id]);
 await dispatcher.drain();assert.equal(sends.length,0);assert.equal((await job(u)).status,'sending');
});
test('account deletion cascades jobs; disabled, suspended and changed addresses cancel',async()=>{
 const deleted=await account();await enqueue(pool,deleted);await pool.query('DELETE FROM users WHERE id=$1',[deleted.id]);assert.equal(await job(deleted),undefined);
 for(const change of ['is_active=false','is_suspended=true',"email='changed@example.invalid'"]){
  const u=await account();await enqueue(pool,u);await pool.query('UPDATE users SET '+change+' WHERE id=$1',[u.id]);await dispatcher.drain();assert.equal((await job(u)).status,'cancelled');
 }assert.equal(sends.length,0);
});
test('unverified welcome explains separate verification without granting ownership',async()=>{
 const u=await account();await enqueue(pool,u);await dispatcher.drain();
 assert.match(sends[0].text,/sign in and verify your email first/);assert(!sends[0].html.includes('Test'));assert(!sends[0].html.includes('<Person>'));
 assert.equal((await pool.query('SELECT email_verified_at FROM users WHERE id=$1',[u.id])).rows[0].email_verified_at,null);
 assert.doesNotMatch(sends[0].text,/token=|1,600|AI Concierge/);assert.equal(sends[0].subject,'Welcome to SceneLink');
});
test('verified OAuth welcome has no unnecessary verification instruction',async()=>{
 const u=await account({verified:true});await enqueue(pool,u);await dispatcher.drain();assert.doesNotMatch(sends[0].text,/verify your email first/);assert.match(sends[0].html,/Test &lt;Person&gt;/);
});
test('queue write and user creation roll back together',async()=>{
 const db=pool.connect?await pool.connect():pool;
 const u={id:crypto.randomUUID(),email:'rollback@example.invalid'};
 try {await db.query('BEGIN');await db.query('INSERT INTO users(id,email) VALUES($1,$2)',[u.id,u.email]);await enqueue(db,u);await db.query('ROLLBACK');} finally {db.release?.();}
 assert.equal(await job(u),undefined);assert.equal((await pool.query('SELECT id FROM users WHERE id=$1',[u.id])).rows.length,0);
});
test('SMTP acceptance followed by DB failure is never automatically resent',async()=>{
 const u=await account();await enqueue(pool,u);
 const flaky={query:(sql,args)=>sql.startsWith('UPDATE signup_welcome_emails SET status=$2')?Promise.reject(Error('database unavailable')):pool.query(sql,args)};
 const first=createDispatcher({pool:flaky,mailer,logger:silent});await first.drain();await dispatcher.drain();
 assert.equal(sends.length,1);assert.equal((await job(u)).status,'sending');
});
test('new migration is required before accepting HTTP traffic',async()=>{
 let listening=false;await assert.rejects(require('../src/launch/bootstrap').start({initialize:async()=>{},port:0,app:{listen(){listening=true;}},pool:{query:async sql=>({rows:sql.includes('signup-welcome-2026-11-08')?[]:[{version:'fixture'}]})}}),/migration 014 is missing/);assert.equal(listening,false);
});

test('account lookup failure before SMTP safely recovers on a later drain',async()=>{
 const u=await account();await enqueue(pool,u);let fail=true;
 const flaky={query:(sql,args)=>fail && sql.startsWith('SELECT id,email,display_name')?Promise.reject(Error('private database error')):pool.query(sql,args)};
 const worker=createDispatcher({pool:flaky,mailer,logger:silent});await worker.drain();assert.equal(sends.length,0);assert.equal((await job(u)).status,'pending');
 fail=false;await worker.drain();assert.equal(sends.length,1);assert.equal((await job(u)).status,'accepted');
});
test('template preparation failure before SMTP safely recovers without looping',async()=>{
 const u=await account();await enqueue(pool,u);let preparations=0;
 mailer.welcomeEmail=()=>{preparations++;throw Error('private configuration error');};
 await dispatcher.drain();assert.equal(preparations,1);assert.equal(sends.length,0);assert.equal((await job(u)).status,'pending');
 mailer.welcomeEmail=templates.welcomeEmail;await dispatcher.drain();assert.equal(sends.length,1);assert.equal((await job(u)).status,'accepted');
});
test('uncertain reset to pending is not written twice before another worker can reclaim',async()=>{
 const u=await account();await enqueue(pool,u);let resets=0;
 const flaky={query:async(sql,args)=>{if(sql.startsWith("UPDATE signup_welcome_emails SET status='pending'")){resets++;await pool.query(sql,args);throw Error('lost acknowledgement');}return pool.query(sql,args);}};
 mailer.sendMail=async()=>({ok:false,skipped:true,reason:'mailer-not-ready'});
 const worker=createDispatcher({pool:flaky,mailer,logger:silent});await worker.drain();assert.equal(resets,1);assert.equal((await job(u)).status,'pending');
 mailer.sendMail=async msg=>{sends.push(msg);return{ok:true};};await dispatcher.drain();assert.equal(sends.length,1);assert.equal((await job(u)).status,'accepted');
});
test('startup and repeated wakeups coalesce without replaying jobs',async()=>{
 const u=await account();await enqueue(pool,u);dispatcher.start();dispatcher.start();dispatcher.kick();dispatcher.kick();
 await new Promise(resolve=>setImmediate(resolve));await dispatcher.drain();dispatcher.stop();assert.equal(sends.length,1);assert.equal((await job(u)).status,'accepted');
});
