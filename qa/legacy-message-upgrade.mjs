#!/usr/bin/env node
// Synthetic old-main -> candidate upgrade regression. Never use an existing DB.
// Fixtures and legacy SQL shapes are pinned to GitHub main f852f97d69414cab819ca916fb67599d1159b57a.
// HAZARD passes document unsafe old-API behavior, NOT approval of mixed-version serving.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const url=process.env.TEST_DATABASE_URL;
const refusal='REFUSED: explicit disposable literal-loopback scenelink_test_* database and SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes required; query/fragment overrides forbidden.';
let u;try{u=new URL(url);}catch{throw Error(refusal);}
if(process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT!=='yes'||!['postgres:','postgresql:'].includes(u.protocol)
 ||!['127.0.0.1','[::1]'].includes(u.hostname)||!u.port||Number(u.port)<1
 ||!/^\/scenelink_test_[a-z0-9_]+$/.test(u.pathname)||u.search||u.hash||/[?#]/.test(url))throw Error(refusal);
// No filesystem access or database-module import occurs before target guards.
const here=path.dirname(fileURLToPath(import.meta.url)),backend=path.resolve(here,'..');
const fixtures=path.join(here,'fixtures/legacy-message-upgrade');
try{await fs.access(path.join(backend,'.env'));throw Error('REFUSED: backend .env present');}catch(e){if(e.code!=='ENOENT')throw e;}
process.chdir(backend);
const req=createRequire(path.join(backend,'package.json'));const {Pool}=req('pg');
let pool,server;let count=0;
const pass=name=>{count++;console.log('PASS',count,name);};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
try{
 pool=new Pool({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:10000,max:16});
 const state=await pool.query("SELECT current_database() AS db, (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') AS tables");
 assert.equal(state.rows[0].db,u.pathname.slice(1),'REFUSED: connected database mismatch');
 assert.equal(state.rows[0].tables,0,'REFUSED: public schema must be empty; this harness never drops preexisting data');
 const version=(await pool.query('SHOW server_version')).rows[0].server_version;
 const expected=process.env.QA_EXPECTED_PG_VERSION||'18.3';assert.equal(version.split(' ')[0],expected,'unexpected PostgreSQL version');
 console.log('NATIVE POSTGRESQL',version);pass('native PostgreSQL expected version');
 const fixtureHashes={"003_compliance_push-main-f852f97.sql": "d0416c7ab8f3331dbdb176ff6e57096e6da498754e9e2b92d8ddc641c9ba87b2", "013-before-compat.sql": "4607be7f58f67f84ddd47ef50e806bc6653a0d8f1dbf4bcf5eeb355f1a00ccfe", "schema-main-f852f97.sql": "36b9f44ad3c4a5e9539a67aa76ed9481290e07626f81597d112f84c386da8fed"};
 for(const [name,expectedHash] of Object.entries(fixtureHashes)){const content=await fs.readFile(path.join(fixtures,name));assert.equal(crypto.createHash('sha256').update(content).digest('hex'),expectedHash,'pinned fixture changed: '+name);}
 await pool.query(await fs.readFile(path.join(fixtures,'schema-main-f852f97.sql'),'utf8'));
 const filenames=(await fs.readdir(path.join(backend,'migrations'))).sort();
 for(const f of filenames.filter(f=>/^00[2-6]_/.test(f)))await pool.query(await fs.readFile(path.join(backend,'migrations',f),'utf8'));
 await pool.query(await fs.readFile(path.join(fixtures,'003_compliance_push-main-f852f97.sql'),'utf8'));
 const a=crypto.randomUUID(),b=crypto.randomUUID(),cid=crypto.randomUUID(),venue=crypto.randomUUID();
 await pool.query("INSERT INTO users(id,email,username,display_name) VALUES($1,'old-a@example.invalid','old_a','Old A'),($2,'old-b@example.invalid','old_b','Old B')",[a,b]);
 await pool.query("INSERT INTO venues(id,slug,name) VALUES($1,'fictional-venue','Fictional venue')",[venue]);
 await pool.query('INSERT INTO conversations(id,created_by,is_group) VALUES($1,$2,false)',[cid,a]);
 await pool.query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)',[cid,a,b]);
 const oldWrite=async(client,body)=> (await client.query('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3) RETURNING id',[cid,a,body])).rows[0].id;
 const oldId=await oldWrite(pool,'Original before upgrade 🦊');pass('old-main schema and exact old message INSERT accept synthetic fixture');
 for(const f of filenames.filter(f=>/^00[7-9]_|^01[0-2]_/.test(f)))await pool.query(await fs.readFile(path.join(backend,'migrations',f),'utf8'));
 await oldWrite(pool,'During additive007-012');pass('old message INSERT remains valid through007-012');
 const original013=await fs.readFile(path.join(fixtures,'013-before-compat.sql'),'utf8');
 await pool.query(original013);
 await assert.rejects(oldWrite(pool,'Must fail after013'),e=>e.code==='23502'&&e.column==='send_body_hash');pass('unpatched013 reproduces old writer NOT NULL failure');
 const old=(await pool.query('SELECT * FROM messages WHERE id=$1',[oldId])).rows[0];assert.equal(old.send_body_hash,hash('Original before upgrade 🦊'));assert(BigInt(old.change_seq)>0n);pass('existing original body hash and sequence backfill');
 await pool.query(`CREATE FUNCTION test_hash_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.send_body_hash IS NULL THEN NEW.send_body_hash:=encode(sha256(convert_to(NEW.body,'UTF8')),'hex'); END IF; RETURN NEW; END $$; CREATE TRIGGER test_hash_only BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION test_hash_only()`);
 const high=(await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid])).rows[0].message_version;
 const missed=await oldWrite(pool,'Hash-only silently misses cursor');
 assert.equal((await pool.query('SELECT change_seq FROM messages WHERE id=$1',[missed])).rows[0].change_seq,'0');
 assert.equal((await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid])).rows[0].message_version,high);pass('hash-only shim demonstrably leaves message invisible to incremental synchronization');
 await pool.query('DROP TRIGGER test_hash_only ON messages; DROP FUNCTION test_hash_only()');
 const patched013=await fs.readFile(path.join(backend,'migrations/013_social_profile_messaging.sql'),'utf8');await pool.query(patched013);
 const id=await oldWrite(pool,'Legacy after compatibility 🦊');const row=(await pool.query('SELECT * FROM messages WHERE id=$1',[id])).rows[0];assert.equal(row.send_body_hash,hash('Legacy after compatibility 🦊'));assert(BigInt(row.change_seq)>BigInt(high));pass('complete shim fills original hash and canonical conversation sequence');
 await pool.query(patched013);assert.equal((await pool.query('SELECT send_body_hash FROM messages WHERE id=$1',[id])).rows[0].send_body_hash,row.send_body_hash);pass('reapplication preserves hash');
 await pool.query('INSERT INTO posts(user_id,body) VALUES($1,$2)',[a,'Legacy post after007-013']);
 await pool.query('INSERT INTO checkins(user_id,venue_id,note) VALUES($1,$2,$3)',[a,venue,'Legacy checkin']);
 await pool.query("INSERT INTO users(email,username) VALUES('legacy-new@example.invalid','legacy_new')");pass('legacy posts/checkins/signup SQL remains schema-compatible');
 const checkin=(await pool.query('SELECT audience FROM checkins WHERE user_id=$1',[a])).rows[0];assert.equal(checkin.audience,'private');pass('legacy checkin defaults private under007');
 const leaked=(await pool.query('SELECT c.id FROM checkins c JOIN users u ON u.id=c.user_id JOIN venues v ON v.id=c.venue_id WHERE 1=1 ORDER BY c.created_at DESC LIMIT $1',[30])).rows;assert(leaked.length>0);pass('HAZARD: old public feed SQL still returns newly-private checkins');
 const profileRevision=(await pool.query('SELECT profile_revision FROM users WHERE id=$1',[a])).rows[0].profile_revision;
 await pool.query('UPDATE users SET display_name=COALESCE($1,display_name),updated_at=NOW() WHERE id=$2',['Legacy profile overwrite',a]);
 assert.equal((await pool.query('SELECT profile_revision FROM users WHERE id=$1',[a])).rows[0].profile_revision,profileRevision);pass('HAZARD: old profile update bypasses optimistic profile revision');
 const authVersion=(await pool.query('SELECT auth_version FROM users WHERE id=$1',[a])).rows[0].auth_version;
 await pool.query('UPDATE users SET password_hash=$1,reset_token=NULL,reset_token_expires=NULL WHERE id=$2',['not-a-real-password-hash',a]);
 assert.equal((await pool.query('SELECT auth_version FROM users WHERE id=$1',[a])).rows[0].auth_version,authVersion);pass('HAZARD: old reset writer does not invalidate new versioned sessions');
 const email=(await pool.query('SELECT email_verified_at,verified_email FROM users WHERE id=$1',[a])).rows[0];assert.equal(email.email_verified_at,null);pass('existing users intentionally remain email-unverified');
 // Simultaneous canonical/legacy writers must serialize on the same conversation.
 const c1=await pool.connect(),c2=await pool.connect();let pending;try{await c1.query('BEGIN');await c1.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[cid]);
 const v=(await c1.query('UPDATE conversations SET message_version=message_version+1 WHERE id=$1 RETURNING message_version',[cid])).rows[0].message_version;
 const modern=crypto.randomUUID();await c1.query('INSERT INTO messages(id,conversation_id,sender_id,body,send_body_hash,change_seq) VALUES($1,$2,$3,$4,$5,$6)',[modern,cid,a,'Modern canonical',hash('Modern canonical'),v]);
 let complete=false;pending=oldWrite(c2,'Concurrent old writer').then(x=>{complete=true;return x;});let blocked=false;for(let i=0;i<100;i++){const activity=await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[c2.processID]);if(activity.rows[0]?.wait_event_type==='Lock'){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(blocked,true,'legacy insert must visibly wait on canonical conversation lock');assert.equal(complete,false);await c1.query('COMMIT');const later=await pending;
 assert.equal(BigInt((await pool.query('SELECT change_seq FROM messages WHERE id=$1',[later])).rows[0].change_seq),BigInt(v)+1n);}finally{await c1.query('ROLLBACK');if(pending)await pending.catch(()=>{});c1.release();c2.release();}pass('legacy writer waits behind canonical transaction and commits next sequence');
 const many=await Promise.all(Array.from({length:12},(_,i)=>oldWrite(pool,'Concurrent legacy '+i)));const seqs=(await pool.query('SELECT change_seq FROM messages WHERE id=ANY($1::uuid[])',[many])).rows.map(x=>x.change_seq);assert.equal(new Set(seqs).size,12);pass('12 simultaneous legacy writers allocate unique per-conversation versions');
 const rollback=await pool.connect();const pre=(await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid])).rows[0].message_version;try{await rollback.query('BEGIN');await oldWrite(rollback,'Rolled back');}finally{await rollback.query('ROLLBACK');rollback.release();}assert.equal((await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid])).rows[0].message_version,pre);pass('legacy rollback atomically restores version and message');
 // Exercise actual new HTTP handlers against upgraded old-main database.
 process.env.DATABASE_URL=url;process.env.NODE_ENV='test';process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');process.env.EMAIL_PROVIDER='disabled';
 for(const n of ['SMTP_HOST','SMTP_USER','SMTP_PASS','CLOUDINARY_URL','CLOUDINARY_UPLOAD_PRESET','SENTRY_DSN','OPENAI_API_KEY','ADMIN_SECRET'])delete process.env[n];
 await pool.query('UPDATE users SET email_verified_at=now(),verified_email=email WHERE id=ANY($1::uuid[])',[[a,b]]);
 const app=req('./src/server');await req('./src/routes/business').initialize();server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const token=req('./src/middleware/auth').generateToken({id:a,role:'user',auth_version:0});
 async function api(method,p,body,status=200){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+p,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body===undefined?{}:{body:JSON.stringify(body)})});const j=await r.json();assert.equal(r.status,status,method+' '+p+' '+JSON.stringify(j));return j;}
 const route='/conversations/'+cid+'/messages/'+id;
 await api('PATCH',route,{body:'Edited body',revision:1});assert.equal((await pool.query('SELECT send_body_hash FROM messages WHERE id=$1',[id])).rows[0].send_body_hash,row.send_body_hash);pass('actual candidate edit preserves legacy original-body hash');
 const retry=await api('POST','/conversations/'+cid+'/messages',{client_id:id,body:'Legacy after compatibility 🦊'});assert.equal(retry.replayed,true);assert.equal(retry.message.body,'Edited body');pass('original-body retry after edit replays edited record');
 await api('POST','/conversations/'+cid+'/messages',{client_id:id,body:'Edited body'},409);pass('edited-body retry cannot replace original send idempotency identity');
 await api('DELETE',route,{revision:2});const deleted=await api('POST','/conversations/'+cid+'/messages',{client_id:id,body:'Legacy after compatibility 🦊'});assert.equal(deleted.replayed,true);assert.equal(deleted.message.body,null);assert(deleted.message.deleted_at);pass('original-body retry after delete returns tombstone, never resurrects');
 await pool.query(patched013);assert.equal((await pool.query('SELECT send_body_hash FROM messages WHERE id=$1',[id])).rows[0].send_body_hash,row.send_body_hash);pass('migration repeat after edit/delete preserves immutable send hash');
 const changes=await api('GET','/conversations/'+cid+'/changes?after_seq='+pre);assert(changes.messages.some(m=>m.id===id&&m.deleted_at));pass('candidate changes API sees legacy message edits/deletion');
 const fresh=crypto.randomUUID();const before=BigInt((await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid])).rows[0].message_version);
 await api('POST','/conversations/'+cid+'/messages',{client_id:fresh,body:'Canonical post-shim'},201);assert.equal(BigInt((await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid])).rows[0].message_version),before+1n);pass('canonical HTTP insert not double-incremented by shim');
 console.log('UPGRADE CHECKS PASSED',count);
 await new Promise(r=>server.close(r));server=null;
}finally{
 if(server)await new Promise(r=>server.close(r));
 const dbPath=req.resolve('./src/config/database');
 if(req.cache[dbPath])await req.cache[dbPath].exports.end();
 if(pool)await pool.end();
}
