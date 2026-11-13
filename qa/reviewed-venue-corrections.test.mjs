import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {planCorrections,applyCorrections,rollbackCorrections} from '../src/operations/reviewed-venue-corrections.mjs';
const id='11111111-1111-4111-8111-111111111111';
const manifest=()=>({version:1,corrections:[{venue_id:id,expected_identity:{name:'Test Cafe',address:'10 Test St',city:'Old City'},changes:{city:{expected:'Old City',value:'New City',source_url:'https://example.org/contact',observed_at:'2026-11-10'}}}]});
const gate=m=>({apply:true,confirmDigest:planCorrections(m).digest,operator:'QA operator'});
async function database() {
  const db=new PGlite();
  await db.exec(`CREATE TABLE venues(id uuid PRIMARY KEY,name text,address text,city text,hours_json jsonb,price_level int,updated_at timestamptz DEFAULT now(),source text DEFAULT 'curated'); INSERT INTO venues(id,name,address,city) VALUES ('${id}','Test Cafe','10 Test St','Old City');`);
  const sql=await readFile(new URL('../migrations/017_venue_fact_reviews.sql',import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql); return db;
}
test('offline plan is deterministic and rejects unsafe manifests',()=>{
  const m=manifest(); assert.equal(planCorrections(m).database_accessed,false);
  assert.equal(planCorrections(m).digest,planCorrections(JSON.parse(JSON.stringify(m))).digest);
  for (const alter of [m=>m.corrections.push(m.corrections[0]),m=>m.corrections[0].venue_id='name-like',m=>m.corrections[0].changes.source={expected:'curated',value:'verified'},m=>delete m.corrections[0].changes.city.expected,m=>m.corrections[0].changes.city.source_url='http://example.org',m=>m.corrections[0].changes.city.observed_at='2099-01-01',m=>m.corrections[0].changes.city.observed_at='2026-02-30',m=>m.corrections[0].changes.city.value=null,m=>m.corrections[0].changes.lat={expected:null,value:42,source_url:'https://example.org',observed_at:'2026-11-10'}]) { const bad=manifest(); alter(bad); assert.throws(()=>planCorrections(bad)); }
});
test('gating occurs before any database access',async()=>{
  const noDB={query(){throw new Error('DATABASE TOUCHED');}};
  await assert.rejects(applyCorrections(noDB,manifest(),{}),/Explicit apply/);
  await assert.rejects(rollbackCorrections(noDB,id,{}),/Explicit apply/);
});
test('apply, evidence, audit, rollback; never promotes source or loses history',async()=>{
  const db=await database(); try {
    const m=manifest(), result=await applyCorrections(db,m,gate(m));
    const v=(await db.query('SELECT * FROM venues')).rows[0];
    assert.equal(v.city,'New City'); assert.equal(v.source,'curated');
    assert.deepEqual(v.field_provenance.city,{status:'reviewed',value:'New City',source_url:'https://example.org/contact',observed_at:'2026-11-10'});
    const r=await rollbackCorrections(db,result.audit_id,{apply:true,confirmDigest:result.audit_id,operator:'QA rollback'});
    assert.equal(r.mode,'rolled-back');
    assert.equal((await db.query('SELECT city FROM venues')).rows[0].city,'Old City');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM venue_fact_review_audit')).rows[0].n,2);
    await assert.rejects(rollbackCorrections(db,result.audit_id,{apply:true,confirmDigest:result.audit_id,operator:'QA rollback'}),/Already rolled back/);
    await assert.rejects(applyCorrections(db,m,gate(m))); // unique digest blocks replay
    assert.equal((await db.query('SELECT city FROM venues')).rows[0].city,'Old City');
  } finally { await db.close(); }
});
test('identity drift, old-value drift and missing IDs abort without partial edits',async()=>{
  const db=await database(); try {
    let m=manifest();m.corrections[0].expected_identity.address='other branch';
    await assert.rejects(applyCorrections(db,m,gate(m)),/Identity drift/);
    m=manifest();m.corrections[0].changes.city.expected='stale';
    await assert.rejects(applyCorrections(db,m,gate(m)),/Value drift/);
    m=manifest();m.corrections.push({...structuredClone(m.corrections[0]),venue_id:'22222222-2222-4222-8222-222222222222'});
    await assert.rejects(applyCorrections(db,m,gate(m)),/Venue missing/);
    assert.equal((await db.query('SELECT city FROM venues')).rows[0].city,'Old City');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM venue_fact_review_audit')).rows[0].n,0);
  } finally { await db.close(); }
});
test('rollback refuses even unrelated post-edit drift and retains apply history',async()=>{
  const db=await database(); try {
    const m=manifest(), r=await applyCorrections(db,m,gate(m));
    await db.query("UPDATE venues SET source='external-edit'");
    await assert.rejects(rollbackCorrections(db,r.audit_id,{apply:true,confirmDigest:r.audit_id,operator:'QA rollback'}),/Post-edit drift/);
    assert.equal((await db.query('SELECT city FROM venues')).rows[0].city,'New City');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM venue_fact_review_audit')).rows[0].n,1);
  } finally { await db.close(); }
});
test('null clears are explicit unknown evidence and unchanged value can receive evidence',async()=>{
  const db=await database(); try {
    const m=manifest(); m.corrections[0].changes.city={expected:'Old City',value:null,status:'unknown',note:'Published source does not establish city.',source_url:'https://example.org',observed_at:'2026-11-10'};
    await applyCorrections(db,m,gate(m));
    assert.equal((await db.query('SELECT field_provenance FROM venues')).rows[0].field_provenance.city.status,'unknown');
  } finally { await db.close(); }
});
test('CLI dry-run does not load or connect DATABASE_URL and rejects unexpected args',()=>{
  const r=spawnSync(process.execPath,['qa/review-venue-corrections.mjs','--rollback',id],{encoding:'utf8',env:{...process.env,DATABASE_URL:'postgres://invalid'}});
  assert.equal(r.status,0,r.stderr); assert.equal(JSON.parse(r.stdout).database_accessed,false);
  const bad=spawnSync(process.execPath,['qa/review-venue-corrections.mjs','--rollback',id,'--apply','--confirm',id,'--operator','Test operator'],{encoding:'utf8',env:{...process.env,SCENELINK_CORRECTIONS_LOCAL_ONLY:'yes',CORRECTIONS_DATABASE_URL:'postgres://remote:5432/prod'}});
  assert.equal(bad.status,1); assert.match(bad.stderr,/Only explicit loopback/);
});
