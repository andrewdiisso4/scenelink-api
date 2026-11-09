'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../src/services/list-membership');
test('list optimistic revisions require exact positive integers',()=>{
 assert.throws(()=>L.revision({revision:4}),e=>e.status===428);
 for(const value of [null,'4',0,-1,1.5,NaN])assert.throws(()=>L.revision({revision:4},value),e=>e.status===400);
 assert.throws(()=>L.revision({revision:4},3),e=>e.status===409&&e.code==='STALE_LIST');
 assert.doesNotThrow(()=>L.revision({revision:4},4));
});
test('list visibility requires accepted consent and valid friendship, blocks and actors',()=>{
 for(const part of ["mine.status='accepted'","f.status = 'accepted'",'user_blocks','is_suspended','peer.status=\'accepted\''])assert(L.SHARED.includes(part),part);
 for(const part of ["lm.status='pending'",'invitation_id',"INTERVAL '7 days'",'user_blocks'])assert(L.NOTICE.includes(part),part);
});
test('private list schema is additive, retry safe and does not rewrite existing public choices',()=>{
 const sql=fs.readFileSync(require.resolve('../migrations/016_private_list_invitations.sql'),'utf8');
 assert(sql.includes('ON DELETE CASCADE'));assert(sql.includes('ON DELETE SET NULL'));assert(sql.includes('body_hash'));assert(sql.includes('UNIQUE INDEX IF NOT EXISTS list_create_requests_client_idx'));assert(sql.includes('list_id_reservations (id uuid PRIMARY KEY)'));assert(sql.includes('DEFAULT false'));
 assert(!/UPDATE\s+(?:users|lists)\s/i.test(sql));assert(!/DELETE FROM|DROP TABLE/i.test(sql));
});
test('startup refuses a missing private list migration before accepting traffic',async()=>{
 let listening=false;
 await assert.rejects(require('../src/launch/bootstrap').start({initialize:async()=>{},port:0,app:{listen(){listening=true;}},pool:{query:async sql=>({rows:sql.includes('private-list-invitations-2026-11-09')?[]:[{version:'fixture'}]})}}),/migration 016 is missing/);
 assert.equal(listening,false);
});

test('normal migration allowlist includes016 without RUN_ALL_SQL_MIGRATIONS',()=>{const source=fs.readFileSync(require.resolve('../src/server'),'utf8');assert.match(source,/014_\|016_/);assert.match(source,/app\.locals\.initializeDatabase = initDatabase/);});
