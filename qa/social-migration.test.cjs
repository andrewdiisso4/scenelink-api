'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('migration013 backfills original message hashes and ordered sequences without rewriting content or subsequent edits',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=await PGlite.create();
 try{
  // Minimal faithful pre-013 columns isolate additive migration behavior. No external DB.
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE conversations(id uuid PRIMARY KEY);CREATE TABLE messages(id uuid PRIMARY KEY,conversation_id uuid NOT NULL REFERENCES conversations(id),body text NOT NULL,created_at timestamptz NOT NULL);CREATE TABLE launch_schema_versions(version text PRIMARY KEY);`);
  const cid=crypto.randomUUID(),u=crypto.randomUUID(),first='00000000-0000-0000-0000-000000000001',second='00000000-0000-0000-0000-000000000002';
  await db.query('INSERT INTO users(id) VALUES($1)',[u]);await db.query('INSERT INTO conversations(id) VALUES($1)',[cid]);
  await db.query("INSERT INTO messages(id,conversation_id,body,created_at) VALUES($1,$3,'First historical message','2026-10-30T12:00:00.000001Z'),($2,$3,'Second historical message','2026-10-30T12:00:00.000002Z')",[first,second,cid]);
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/013_social_profile_messaging.sql'),'utf8');await db.exec(sql);
  let rows=(await db.query('SELECT id,body,send_body_hash,revision,change_seq FROM messages ORDER BY created_at,id')).rows;
  assert.deepEqual(rows.map(m=>m.change_seq),[1,2]);assert.equal(rows[0].send_body_hash,crypto.createHash('sha256').update(rows[0].body).digest('hex'));assert(rows.every(m=>m.revision===1));
  assert.equal((await db.query('SELECT message_version FROM conversations')).rows[0].message_version,2);
  await db.query("UPDATE messages SET body='',deleted_at=NOW(),revision=2,change_seq=3 WHERE id=$1",[first]);await db.query('UPDATE conversations SET message_version=3');
  const before=(await db.query('SELECT * FROM messages ORDER BY id')).rows;await db.exec(sql);assert.deepEqual((await db.query('SELECT * FROM messages ORDER BY id')).rows,before);
  assert.equal((await db.query('SELECT message_version FROM conversations')).rows[0].message_version,3);
  const user=(await db.query('SELECT * FROM users')).rows[0];assert.deepEqual(user.social_links,[]);assert.equal(user.profile_revision,1);assert.equal(user.show_achievements,false);assert.equal(user.share_read_receipts,false);
 }finally{await db.close();}
});
