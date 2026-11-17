'use strict';
// Disposable local PostgreSQL only. Never connects to a remotely named host.
const url=process.env.TEST_DATABASE_URL;
const refusal='REFUSED: explicit disposable literal-loopback scenelink_test_* database and SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes required';
let u;try{u=new URL(url);}catch{throw Error(refusal);}
if(process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT!=='yes'||!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||!u.port||!/^\/scenelink_test_[a-z0-9_]+$/.test(u.pathname)||u.search||u.hash||/[?#]/.test(url))throw Error(refusal);
const fs=require('node:fs'),assert=require('node:assert/strict');
if(fs.existsSync(require('node:path').join(__dirname,'../.env')))throw Error('REFUSED: backend .env present');
const {Pool}=require('pg'),{reserveProviderAttempt}=require('../src/services/concierge-quota');
const options={connectionString:url,max:20,connectionTimeoutMillis:5000,statement_timeout:10000};
const env={CONCIERGE_AI_ENABLED:'true',CONCIERGE_AI_DAILY_REQUEST_LIMIT:'7'};
(async()=>{let pool=new Pool(options),clients=[];try{
 const state=await pool.query("SELECT current_database() db,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') tables");assert.equal(state.rows[0].db,u.pathname.slice(1));assert.equal(state.rows[0].tables,0,'REFUSED: public schema must be empty');
 await pool.query(fs.readFileSync(require('node:path').join(__dirname,'proposed-migrations/concierge_ai_quota.sql'),'utf8'));
 const acquired=await Promise.allSettled(Array.from({length:20},async()=>{const client=await pool.connect();clients.push(client);}));
 assert(acquired.every(result=>result.status==='fulfilled'),'could not acquire native test connections');
 const pids=await Promise.all(clients.map(c=>c.query('SELECT pg_backend_pid() pid')));assert.equal(new Set(pids.map(r=>r.rows[0].pid)).size,20);
 const results=await Promise.all(clients.map(c=>reserveProviderAttempt(c,env)));assert.equal(results.filter(r=>r.allowed).length,7);assert.equal((await clients[0].query('SELECT attempts FROM concierge_ai_daily_quota')).rows[0].attempts,7);
 clients.forEach(c=>c.release());clients=[];await pool.end();pool=new Pool(options);
 assert.equal((await reserveProviderAttempt(pool,env)).allowed,false,'new pool cannot reset allowance');
 assert.equal((await reserveProviderAttempt(pool,{...env,CONCIERGE_AI_DAILY_REQUEST_LIMIT:'3'})).allowed,false);
 console.log('PASS: 20 distinct native connections, exactly 7 admitted; new pool/lower limit cannot reset durable allowance');
 }finally{clients.forEach(c=>c.release());await pool.end();}})().catch(()=>{console.error('Native quota acceptance failed (details intentionally omitted to avoid connection disclosure)');process.exitCode=1;});
