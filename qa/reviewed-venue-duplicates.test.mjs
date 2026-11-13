import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {planDuplicateSuppression,suppressDuplicates,rollbackDuplicates} from '../src/operations/reviewed-venue-duplicates.mjs';
import discovery from '../src/services/venue-duplicate-discovery.js';
const {visibleDiscoveryVenueSQL:visible}=discovery;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const identity={name:'Fictional Cafe',address:'10 Test Street',city:'Test City'};
const manifest=()=>({version:1,pairs:[{alias_id:A,canonical_id:B,expected_alias:{...identity},expected_canonical:{...identity},evidence:{source_url:'https://example.org/contact',observed_at:'2026-11-10',note:'Fictional official address matches both records; same branch.'}}]});
const gate=m=>({apply:true,confirmDigest:planDuplicateSuppression(m).digest,operator:'QA reviewer'});
async function db(migrate=true) {
  const d=new PGlite();await d.exec('CREATE TABLE venues(id uuid PRIMARY KEY,name text,address text,city text,is_active boolean DEFAULT true,business_status text,updated_at timestamptz DEFAULT now()); CREATE TABLE favorites(user_id text,venue_id uuid REFERENCES venues(id));');
  for(const id of [A,B,C]) await d.query('INSERT INTO venues(id,name,address,city) VALUES ($1,$2,$3,$4)',[id,...Object.values(identity)]);
  await d.query('INSERT INTO favorites VALUES ($1,$2)',['fictional-user',A]);
  if(migrate){const sql=await readFile(new URL('../migrations/017_venue_fact_reviews.sql',import.meta.url),'utf8');await d.exec(sql);await d.exec(sql);}return d;
}
async function ids(d){return (await d.query(`SELECT v.id FROM venues v WHERE ${visible('v')} ORDER BY v.id`)).rows.map(r=>r.id);}
test('strict pair review rejects chains, cycles, branches, ambiguous IDs and missing evidence',()=>{
  assert.equal(planDuplicateSuppression(manifest()).database_accessed,false);
  for(const edit of [m=>m.pairs[0].alias_id=B,m=>m.pairs[0].expected_alias.address='20 Other Street',m=>m.pairs[0].expected_alias.city='',m=>m.pairs[0].evidence.source_url='http://example.org',m=>m.pairs[0].evidence.observed_at='2099-01-01',m=>m.pairs.push({...m.pairs[0],alias_id:B,canonical_id:C}),m=>m.pairs.push({...m.pairs[0],alias_id:B,canonical_id:A}),m=>delete m.pairs[0].evidence.note]){const m=manifest();edit(m);assert.throws(()=>planDuplicateSuppression(m));}
  assert.throws(()=>visible('v;DROP TABLE venues'));assert.throws(()=>visible(''));
});
test('pre-migration schema remains visible, while mutation requires migration and explicit gating',async()=>{
  const d=await db(false);try{
    assert.deepEqual(await ids(d),[A,B,C]);
    await assert.rejects(suppressDuplicates({query(){throw Error('DB touched');}},manifest(),{}),/Explicit apply/);
    await assert.rejects(suppressDuplicates(d,manifest(),gate(manifest())),/Migration 017/);
  }finally{await d.close();}
});
test('suppression preserves rows and saved references; direct details remain reachable; rollback retains history',async()=>{
  const d=await db();try{
    const m=manifest(),r=await suppressDuplicates(d,m,gate(m));
    assert.deepEqual(await ids(d),[B,C]);
    assert.equal((await d.query('SELECT v.id FROM favorites f JOIN venues v ON v.id=f.venue_id')).rows[0].id,A);
    assert.equal((await d.query('SELECT id FROM venues WHERE id=$1 AND is_active=true',[A])).rows[0].id,A);
    await rollbackDuplicates(d,r.audit_id,{apply:true,confirmDigest:r.audit_id,operator:'QA reviewer'});
    assert.deepEqual(await ids(d),[A,B,C]);
    assert.equal((await d.query('SELECT COUNT(*)::int AS n FROM venue_duplicate_review_audit')).rows[0].n,2);
    await assert.rejects(rollbackDuplicates(d,r.audit_id,{apply:true,confirmDigest:r.audit_id,operator:'QA reviewer'}),/Already rolled back/);
    await assert.rejects(suppressDuplicates(d,m,gate(m)));assert.deepEqual(await ids(d),[A,B,C]);
  }finally{await d.close();}
});
test('missing, inactive, closed, changed, self-linked or chained canonical fails visible',async()=>{
  const d=await db();try{
    const m=manifest();await suppressDuplicates(d,m,gate(m));
    for(const status of ['CLOSED_TEMPORARILY','temporarily_closed','permanently_closed']){
      await d.query('UPDATE venues SET business_status=$2 WHERE id=$1',[B,status]);assert.deepEqual(await ids(d),[A,B,C]);
    }
    await d.query('UPDATE venues SET business_status=NULL,is_active=false WHERE id=$1',[B]);assert.deepEqual(await ids(d),[A,B,C]);
    await d.query('UPDATE venues SET is_active=true,name=$2 WHERE id=$1',[B,'Different Branch']);assert.deepEqual(await ids(d),[A,B,C]);
    await d.query('UPDATE venues SET name=$2,duplicate_of=$3 WHERE id=$1',[B,identity.name,C]);assert.deepEqual(await ids(d),[A,B,C]);
    await d.query('DELETE FROM venues WHERE id=$1',[B]);assert.deepEqual(await ids(d),[A,C]);
  }finally{await d.close();}
});
test('identity drift, inactive target and existing graph links are refused atomically',async()=>{
  const d=await db();try{
    let m=manifest();await d.query('UPDATE venues SET address=$2 WHERE id=$1',[B,'Other address']);
    await assert.rejects(suppressDuplicates(d,m,gate(m)),/Identity drift/);
    await d.query('UPDATE venues SET address=$2,is_active=false WHERE id=$1',[B,identity.address]);await assert.rejects(suppressDuplicates(d,m,gate(m)),/must be active/);
    await d.query('UPDATE venues SET is_active=true,duplicate_of=$2 WHERE id=$1',[B,C]);await assert.rejects(suppressDuplicates(d,m,gate(m)),/chains prohibited/);
    await d.query('UPDATE venues SET duplicate_of=NULL WHERE id=$1',[B]);await d.query('UPDATE venues SET duplicate_of=$2 WHERE id=$1',[C,A]);await assert.rejects(suppressDuplicates(d,m,gate(m)),/canonical target/);
    assert.equal((await d.query('SELECT COUNT(*)::int AS n FROM venue_duplicate_review_audit')).rows[0].n,0);
  }finally{await d.close();}
});
test('rollback refuses post-review canonical and alias drift',async()=>{
  const d=await db();try{
    const m=manifest(),r=await suppressDuplicates(d,m,gate(m));
    await d.query('UPDATE venues SET name=$2 WHERE id=$1',[A,'Alias edited']);
    await assert.rejects(rollbackDuplicates(d,r.audit_id,{apply:true,confirmDigest:r.audit_id,operator:'QA reviewer'}),/Post-edit drift/);
    assert.deepEqual(await ids(d),[A,B,C]);
    await d.query('UPDATE venues SET name=$2 WHERE id=$1',[A,identity.name]);
    await d.query('UPDATE venues SET is_active=false WHERE id=$1',[B]);
    await assert.rejects(rollbackDuplicates(d,r.audit_id,{apply:true,confirmDigest:r.audit_id,operator:'QA reviewer'}),/Post-edit drift/);
  }finally{await d.close();}
});
test('CLI offline rollback preview and remote-target mutation refusal',()=>{
  const cli='qa/review-venue-duplicates.mjs';
  const r=spawnSync(process.execPath,[cli,'--rollback',A],{encoding:'utf8',env:{...process.env,DATABASE_URL:'postgres://never-connect'}});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).database_accessed,false);
  const no=spawnSync(process.execPath,[cli,'--rollback',A,'--apply','--confirm',A,'--operator','QA reviewer'],{encoding:'utf8',env:{...process.env,SCENELINK_CORRECTIONS_LOCAL_ONLY:'yes',CORRECTIONS_DATABASE_URL:'postgres://remote:5432/prod'}});assert.equal(no.status,1);assert.match(no.stderr,/Only explicit loopback/);
});
test('later missing pair aborts earlier suppression; unreviewed and self links never hide rows',async()=>{
  const d=await db();try{
    const m=manifest();m.pairs.push({...structuredClone(m.pairs[0]),alias_id:C,canonical_id:'44444444-4444-4444-8444-444444444444'});
    await assert.rejects(suppressDuplicates(d,m,gate(m)),/Missing venue/);
    assert.deepEqual(await ids(d),[A,B,C]);
    assert.equal((await d.query('SELECT COUNT(*)::int AS n FROM venue_duplicate_review_audit')).rows[0].n,0);
    await d.query('UPDATE venues SET duplicate_of=$2 WHERE id=$1',[A,B]);assert.deepEqual(await ids(d),[A,B,C]);
    await d.query('UPDATE venues SET duplicate_of=$1,duplicate_review=$2::jsonb WHERE id=$1',[A,JSON.stringify({status:'reviewed_duplicate',canonical_id:A,alias_identity:identity,canonical_identity:identity})]);assert.deepEqual(await ids(d),[A,B,C]);
  }finally{await d.close();}
});
test('fact correction and duplicate suppression compose in reverse without weakening full-row drift guards',async()=>{
  const {planCorrections,applyCorrections,rollbackCorrections}=await import('../src/operations/reviewed-venue-corrections.mjs');
  const d=await db();
  const snapshot=async id=>(await d.query('SELECT to_jsonb(v) AS row FROM venues v WHERE id=$1',[id])).rows[0].row;
  try {
    // Preserve sub-millisecond database precision across the exact restoration.
    await d.query("UPDATE venues SET updated_at='2026-11-01T12:34:56.123456Z'::timestamptz");
    const originals=await Promise.all([snapshot(A),snapshot(B)]);
    const facts={version:1,corrections:[A,B].map(venue_id=>({venue_id,expected_identity:{...identity},changes:{city:{expected:identity.city,value:'Reviewed City',source_url:'https://example.org/contact',observed_at:'2026-11-10'}}}))};
    const applied=await applyCorrections(d,facts,{apply:true,confirmDigest:planCorrections(facts).digest,operator:'QA factual reviewer'});
    const factSnapshots=await Promise.all([snapshot(A),snapshot(B)]);
    const pairs=manifest();pairs.pairs[0].expected_alias.city='Reviewed City';pairs.pairs[0].expected_canonical.city='Reviewed City';
    const suppressed=await suppressDuplicates(d,pairs,gate(pairs));
    await rollbackDuplicates(d,suppressed.audit_id,{apply:true,confirmDigest:suppressed.audit_id,operator:'QA duplicate reversal'});
    assert.deepEqual(await Promise.all([snapshot(A),snapshot(B)]),factSnapshots);
    await rollbackCorrections(d,applied.audit_id,{apply:true,confirmDigest:applied.audit_id,operator:'QA factual reversal'});
    const final=await Promise.all([snapshot(A),snapshot(B)]);
    for(let i=0;i<final.length;i++) {
      assert.notEqual(final[i].updated_at,originals[i].updated_at); // fact rollback still records its own update time
      const withoutTimestamp=({updated_at,...rest})=>rest;
      assert.deepEqual(withoutTimestamp(final[i]),withoutTimestamp(originals[i]));
    }
    assert.equal((await d.query('SELECT COUNT(*)::int AS n FROM venue_fact_review_audit')).rows[0].n,2);
    assert.equal((await d.query('SELECT COUNT(*)::int AS n FROM venue_duplicate_review_audit')).rows[0].n,2);
    assert.equal((await d.query('SELECT venue_id FROM favorites')).rows[0].venue_id,A);
  }finally{await d.close();}
});
