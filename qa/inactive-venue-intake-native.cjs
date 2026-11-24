#!/usr/bin/env node
'use strict';
// Native PostgreSQL + complete application schema. This harness refuses every
// remote or nonempty database and does not read application .env files.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),connection=process.env.TEST_DATABASE_URL;
const refused='REFUSED: new literal-loopback named native/CI fixture database and explicit QA opt-in required';
let url;try{url=new URL(connection);}catch(_){throw Error(refused);}
if(process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT!=='yes'||!['postgres:','postgresql:'].includes(url.protocol)
  ||!['127.0.0.1','[::1]'].includes(url.hostname)||!url.port||!['/scenelink_test_official_occurrences','/scenelink_test_ci'].includes(url.pathname)
  ||url.search||url.hash||/[?#]/.test(connection)||fs.existsSync(path.join(root,'.env')))throw Error(refused);
process.chdir(root);process.env.NODE_ENV='test';process.env.DATABASE_URL=connection;
process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');process.env.ALLOW_DEMO_SEED='false';process.env.FORCE_RESEED='false';process.env.EMAIL_PROVIDER='disabled';
for(const key of ['SMTP_HOST','SMTP_USER','SMTP_PASS','CLOUDINARY_URL','CLOUDINARY_UPLOAD_PRESET','SENTRY_DSN','OPENAI_API_KEY','ADMIN_SECRET'])delete process.env[key];
const req=createRequire(path.join(root,'package.json')),intake=req('./src/operations/inactive-venue-intake.cjs'),{Pool}=req('pg');
const target=intake.targetFromEnv({INTAKE_DATABASE_URL:connection,INTAKE_TLS_MODE:'disable'});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'scenelink-native-intake-'));
let appPool,operatorPool,server;
const sha=intake.hash,release='native-fixture-2026-11-20';
function candidate(id,name,address,extra={}){
  return {source:'overture',external_id:id,name,address,type:'restaurant',category:'restaurant',city:'Boston',state:'MA',
    zip_code:'02110',lat:42.35512345,lng:-71.06123456,is_active:false,needs_manual_review:true,phone:null,website:null,...extra};
}
function packet(name,rows,{keys={},held=[],provenancePatch={},reportPatch={}}={}){
  const directory=path.join(temporary,name);fs.mkdirSync(directory,{recursive:true});
  const write=(file,value)=>{const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');fs.writeFileSync(path.join(directory,file),bytes);return sha(bytes);};
  const provenance={};
  for(const row of rows)provenance[row.external_id]={release,existence_confidence:.99,verification_status:'provider_record_not_independently_verified',
    sources:[{dataset:'fictional_native_qa_only',property:'',record_id:row.external_id}],intake_identity_keys:keys[row.external_id]||[],
    raw_provider_fields:{phones:['fictional-contact-kept-in-provenance-only'],websites:['https://example.com/native-fixture']},...provenancePatch};
  const manifest={version:1,scope:'inactive_venue_intake',files:{
    'candidate-import.json':write('candidate-import.json',{ifExists:'skip',rows}),
    'provenance.json':write('provenance.json',provenance),
    'report.json':write('report.json',{release,input_sha256:sha('fictional native source'),candidate_count:rows.length,production_import_ready:false,production_writes:false,...reportPatch})},
    evidence:[{kind:'source',path:'source.txt',sha256:write('source.txt','Synthetic fixture; no provider call or real factual claim.\n')},
      {kind:'notice',path:'notice.txt',sha256:write('notice.txt','Synthetic test evidence only, not a source license assessment.\n')}],held};
  const packetSha=write('intake-manifest.json',manifest);
  return {directory,packetSha,loaded:intake.loadPacket(directory,packetSha)};
}
async function allRows(table){
  return (await appPool.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows.map(item=>item.row);
}
async function snapshot(){
  const result={};for(const table of ['venues','venue_source_records','venue_import_batches','users','favorites'])result[table]=await allRows(table);return result;
}
async function waitForRelationWaiters(want){
  let n=0;
  for(let attempt=0;attempt<100;attempt++){
    n=(await appPool.query(`SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database()
      AND wait_event_type='Lock' AND wait_event='relation' AND query LIKE 'LOCK TABLE public.venues,%'`)).rows[0].n;
    if(n>=want)return n;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('Expected '+want+' actual PostgreSQL relation waiters; observed '+n);
}
function inactiveClaims(row){
  assert.equal(row.is_active,false);assert.equal(row.needs_manual_review,true);
  const facts=new Set(['id','slug','source','external_id','name','type','category','address','city','state','zip_code','lat','lng',
    'is_active','needs_manual_review','is_claimed','has_real_photo','featured','trending','spotlight','review_reasons','field_provenance','duplicate_review','created_at','updated_at']);
  for(const [key,value]of Object.entries(row))if(!facts.has(key))assert.equal(value,null,'Unknown claim must be null: '+key);
  for(const key of ['is_claimed','has_real_photo','featured','trending','spotlight'])if(Object.hasOwn(row,key))assert.equal(row[key],false);
  for(const key of ['field_provenance','duplicate_review'])if(Object.hasOwn(row,key))assert.deepEqual(row[key],{});
  assert.deepEqual(row.review_reasons,['inactive_source_intake_pending_review']);
}
async function assertHidden(rows){
  const base='http://127.0.0.1:'+server.address().port+'/api';
  for(const row of rows){
    assert.equal((await fetch(base+'/venues/'+row.id)).status,404);
    assert.equal((await fetch(base+'/venues/slug/'+row.slug)).status,404);
  }
  const list=await(await fetch(base+'/venues?limit=100')).json();
  assert(list.venues&&!list.venues.some(row=>rows.some(inserted=>inserted.id===row.id)));
}
async function applyPacket(p,plan){return intake.apply(operatorPool,p.loaded,target,{planSha:plan.plan_sha256,operator:'native-disposable-qa'});}
async function nativeFictional(){
  const v1=crypto.randomUUID(),v2=crypto.randomUUID(),user=crypto.randomUUID(),batch=crypto.randomUUID();
  await appPool.query(`INSERT INTO venues(id,slug,name,address,type,category,city,state,lat,lng,source,external_id,is_active)
    VALUES($1,'native-baseline-bistro','Baseline Bistro','10 Main Street','restaurant','restaurant','Boston','MA',42.30,-71.10,'overture','existing-source',true),
    ($2,'native-baseline-orchid','Existing Orchid','21 Plain Road','restaurant','restaurant','Boston','MA',42.31,-71.11,'manual','manual-preserved',true)`,[v1,v2]);
  await appPool.query(`INSERT INTO venue_import_batches(id,source,source_release,input_sha256,provenance_sha256,notices_sha256,input_count)
    VALUES($1,'overture','historical-native-fixture',$2,$2,$2,1)`,[batch,'a'.repeat(64)]);
  await appPool.query(`INSERT INTO venue_source_records(source,external_id,venue_id,import_batch_id,source_release,provenance)
    VALUES('overture','existing-ledger',$1,$2,'historical-native-fixture',$3::jsonb)`,[v2,batch,JSON.stringify({intake_identity_keys:['city-food-identity:existing-city-key'],private_fixture_note:'preserve exact ledger'})]);
  await appPool.query("INSERT INTO users(id,username,email,display_name) VALUES($1,'native_intake_private','native-intake@example.invalid','Private local fixture')",[user]);
  await appPool.query('INSERT INTO favorites(user_id,venue_id) VALUES($1,$2)',[user,v1]);
  const baseline=await snapshot();
  const rows=[candidate('fresh-one','Marigold Hall','501 Meadow Street'),candidate('fresh-two','Juniper Room','502 Meadow Street'),
    candidate('alias-exact','  BASELINE BISTRO  ','10 Main St.',{city:'Boston locality alias'}),
    candidate('existing-source','Different source title','600 Distant Road'),
    candidate('batch-name-one','Twin Peony','700 Water Street'),candidate('batch-name-two','Twin Peony','700 Water St.'),
    candidate('batch-key-one','Lavender Place','801 West Street'),candidate('batch-key-two','Hyacinth Hall','802 East Street'),
    candidate('registry-held','Held Magnolia','900 Garden Avenue')];
  const p=packet('main',rows,{keys:{'batch-key-one':['city-food-identity:cohort-key'],'batch-key-two':['city-food-identity:cohort-key']},held:[{external_id:'registry-held',reasons:['independent_identity_review']}]});
  assert.throws(()=>intake.targetFromEnv({DATABASE_URL:connection}),error=>error.code==='TARGET_REQUIRED');
  assert.throws(()=>intake.targetFromEnv({INTAKE_DATABASE_URL:connection+'?host=example.com',INTAKE_TLS_MODE:'disable'}),error=>error.code==='INVALID_TARGET');
  assert.throws(()=>intake.targetFromEnv({INTAKE_DATABASE_URL:'postgresql://user@example.com:5432/db',INTAKE_TLS_MODE:'disable'}),error=>error.code==='INVALID_TARGET');
  assert.throws(()=>intake.loadPacket(p.directory,'f'.repeat(64)),error=>error.code==='PACKET_HASH_MISMATCH');
  await assert.rejects(intake.preview(operatorPool,structuredClone(p.loaded),target),error=>error.code==='INVALID_PACKET');
  assert.throws(()=>{p.loaded.bundle.rows[0].name='Unreviewed mutation';},TypeError);
  await assert.rejects(intake.preview({options:{connectionString:'postgresql://wrong@127.0.0.1:5432/db',ssl:false}},p.loaded,target),error=>error.code==='INVALID_TARGET');
  const tampered=packet('tamper',[candidate('tampered','Evidence Aster','1 Fiction Street')]);
  fs.appendFileSync(path.join(tampered.directory,'source.txt'),'changed');
  assert.throws(()=>intake.loadPacket(tampered.directory,tampered.packetSha),error=>error.code==='PACKET_HASH_MISMATCH');
  assert.throws(()=>packet('claim',[candidate('claim','Unreviewed Contact','2 Fiction Street',{website:'https://example.com'})]),error=>error.code==='INVALID_PACKET');
  assert.throws(()=>packet('active',[candidate('active','Active Claim','3 Fiction Street',{is_active:true})]),error=>error.code==='INVALID_PACKET');
  console.log('PASS explicit isolated target, reviewed immutable packet, exact file/evidence hashes, and unknown-claim validation');
  const plan=await intake.preview(operatorPool,p.loaded,target);
  assert.deepEqual([plan.input_count,plan.insert_count,plan.skip_count,plan.hold_count],[9,2,2,5]);
  assert.equal(plan.outcomes.find(row=>row.external_id==='registry-held').action,'hold');
  const beforeBadDigest=await snapshot();
  await assert.rejects(intake.apply(operatorPool,p.loaded,target,{planSha:'0'.repeat(64),operator:'native'}),error=>error.code==='PLAN_CHANGED');
  assert.deepEqual(await snapshot(),beforeBadDigest);
  const result=await applyPacket(p,plan);assert.deepEqual([result.inserted,result.skipped,result.held],[2,2,5]);
  const audit=(await appPool.query('SELECT source_report FROM venue_import_batches WHERE id=$1',[result.batch_id])).rows[0].source_report;
  assert.deepEqual(audit.preparation_report,p.loaded.report);assert.equal(audit.preparation_report_sha256,p.loaded.fileHashes['report.json']);
  assert.equal(Object.hasOwn(audit,'production_writes'),false);assert.equal(Object.hasOwn(audit,'production_import_ready'),false);
  assert.equal(audit.database_write_mode,'insert_only_inactive');assert.equal(audit.publication_ready,false);
  const inserted=(await appPool.query('SELECT to_jsonb(v) AS row FROM venues v JOIN venue_source_records s ON s.venue_id=v.id WHERE s.import_batch_id=$1 ORDER BY v.external_id',[result.batch_id])).rows.map(item=>item.row);
  assert.equal(inserted.length,2);inserted.forEach(inactiveClaims);await assertHidden(inserted);
  const source=(await appPool.query('SELECT provenance FROM venue_source_records WHERE import_batch_id=$1 ORDER BY external_id',[result.batch_id])).rows;
  for(const row of source){assert.equal(row.provenance.sources[0].property,'');assert.equal(row.provenance.intake_metadata.publication_ready,false);assert.equal(row.provenance.raw_provider_fields.phones[0],'fictional-contact-kept-in-provenance-only');}
  const after=await snapshot();
  assert.deepEqual(after.venues.filter(row=>[v1,v2].includes(row.id)),baseline.venues);
  assert.deepEqual(after.venue_source_records.filter(row=>row.import_batch_id===batch),baseline.venue_source_records);
  assert.deepEqual(after.venue_import_batches.filter(row=>row.id===batch),baseline.venue_import_batches);
  assert.deepEqual(after.users,baseline.users);assert.deepEqual(after.favorites,baseline.favorites);
  const repeated=await applyPacket(p,plan);assert.equal(repeated.replayed,true);assert.equal(repeated.newly_inserted,0);assert.equal(repeated.batch_id,result.batch_id);
  assert.deepEqual(await snapshot(),after);assert.equal((await intake.preview(operatorPool,p.loaded,target)).already_applied,true);
  console.log('PASS exact reconciliation, hold-all cohorts, immutable source root pointer, private baseline preservation, inactive public exclusion and idempotent audit');
  const sourceCohort=packet('repeated-source',[candidate('same-source','Source Camellia','11 Alpha Street'),candidate('same-source','Source Dahlia','12 Beta Street')]);
  const cohortPlan=await intake.preview(operatorPool,sourceCohort.loaded,target);assert.deepEqual([cohortPlan.insert_count,cohortPlan.hold_count],[0,2]);
  const priorKey=packet('prior-key',[candidate('prior-key','Different Supplied Identity','13 Gamma Street')],{keys:{'prior-key':['city-food-identity:existing-city-key']}});
  assert.equal((await intake.preview(operatorPool,priorKey.loaded,target)).outcomes[0].action,'skip_existing');
  const ambiguous=packet('ambiguous',[candidate('existing-ledger','Baseline Bistro','10 Main Street')]);
  const ambiguousOutcome=(await intake.preview(operatorPool,ambiguous.loaded,target)).outcomes[0];
  assert.equal(ambiguousOutcome.action,'hold');assert(ambiguousOutcome.reasons.includes('ambiguous_existing_identity'));
  const aliasCases=[
    ['Skylark-Boston','100 Neon Street',42.30,-71.10,'Skylark','100 Neon St.',42.38,-71.08],
    ['Lantern & Lark','101 Amber St, Boston, MA 02110',42.30,-71.10,'Lantern and Lark','101 Amber Street',42.38,-71.08],
    ['Fables',null,42.35512,-71.06123,"Fable's Cafe",'102 Historic Street',42.355123,-71.061234],
    ['Piccolo Roma','Old provider address',42.35512,-71.06123,'Caffe Piccolo Roma','103 Historic Street',42.355123,-71.061234],
    ["Nando's Pollo Brasa",'Old provider address',42.35512,-71.06123,"Pollo Brasa Nando's",'104 Historic Street',42.355123,-71.061234]
  ],aliasRows=[];
  for(const [position,item]of aliasCases.entries()){
    await appPool.query("INSERT INTO venues(id,slug,name,address,lat,lng,is_active) VALUES($1,$2,$3,$4,$5,$6,false)",
      [crypto.randomUUID(),'native-alias-'+position,...item.slice(0,4)]);
    aliasRows.push(candidate('alias-'+position,item[4],item[5],{lat:item[6],lng:item[7]}));
  }
  const aliases=packet('potential-aliases',aliasRows),aliasPlan=await intake.preview(operatorPool,aliases.loaded,target);
  assert.deepEqual([aliasPlan.insert_count,aliasPlan.skip_count,aliasPlan.hold_count],[0,0,5]);
  for(const outcome of aliasPlan.outcomes){assert(outcome.reasons.includes('potential_existing_alias_review'));assert(outcome.existing_match_evidence.some(match=>match.match_status==='potential_alias_requires_review'));}
  const aliasVenues=await allRows('venues'),aliasSources=await allRows('venue_source_records');
  await applyPacket(aliases,aliasPlan);assert.deepEqual(await allRows('venues'),aliasVenues);assert.deepEqual(await allRows('venue_source_records'),aliasSources);
  const distant=packet('distant-brand',[candidate('distant','Skylark','999 Separate Street',{lat:42.45,lng:-70.95})]);
  assert.equal((await intake.preview(operatorPool,distant.loaded,target)).outcomes[0].action,'insert_inactive');
  const batchAliases=packet('batch-aliases',[candidate('batch-alias-a',"Tansy's Cafe",'111 Former Street'),candidate('batch-alias-b','Tansys','112 Changed Street')]);
  const batchAliasPlan=await intake.preview(operatorPool,batchAliases.loaded,target);
  assert.deepEqual([batchAliasPlan.insert_count,batchAliasPlan.hold_count],[0,2]);
  assert(batchAliasPlan.outcomes.every(outcome=>outcome.reasons.includes('batch_potential_alias_collision_hold_all')));
  console.log('PASS five potential alias patterns, including inactive catalog and bad coordinates, hold without adoption; separate distant same-brand location remains eligible');
  const stale=packet('stale',[candidate('stale','Periwinkle Garden','20 Delta Street')]),stalePlan=await intake.preview(operatorPool,stale.loaded,target);
  await appPool.query("UPDATE venues SET description='Independent concurrent correction' WHERE id=$1",[v1]);
  const staleBefore=await snapshot();await assert.rejects(applyPacket(stale,stalePlan),error=>error.code==='PLAN_CHANGED');assert.deepEqual(await snapshot(),staleBefore);
  console.log('PASS repeated source IDs held, prior supplied identity reconciled, and stale catalog plans rejected without writes');
  const schema=packet('unsafe-schema',[candidate('schema','Larkspur Estate','30 Epsilon Street')]),schemaPlan=await intake.preview(operatorPool,schema.loaded,target);
  await appPool.query("ALTER TABLE venues ADD COLUMN qa_required_claim text NOT NULL DEFAULT 'unreviewed'");
  const schemaBefore=await snapshot();await assert.rejects(applyPacket(schema,schemaPlan),error=>error.code==='UNSAFE_SCHEMA');assert.deepEqual(await snapshot(),schemaBefore);
  await appPool.query('ALTER TABLE venues DROP COLUMN qa_required_claim');
  const atomic=packet('atomic',[candidate('atomic-first','Clover Success','40 Zeta Street'),candidate('atomic-second','Zinnia Failure','41 Eta Street')]);
  await appPool.query("ALTER TABLE venues ADD CONSTRAINT qa_atomic_failure CHECK(name <> 'Zinnia Failure')");
  const atomicPlan=await intake.preview(operatorPool,atomic.loaded,target),atomicBefore=await snapshot();
  await assert.rejects(applyPacket(atomic,atomicPlan),error=>error.code==='23514');assert.deepEqual(await snapshot(),atomicBefore);
  await appPool.query('ALTER TABLE venues DROP CONSTRAINT qa_atomic_failure');
  console.log('PASS schema drift fails closed and a second-row database failure rolls back all first-row, source and audit writes');
  // These round coordinates make the old catalog fingerprint identical after
  // narrowing the type. Only schema bounds can catch this before a new insert.
  await appPool.query('UPDATE venues SET lat=42.30,lng=-71.10');
  const precision=packet('precision',[candidate('precision','Iris Precision','45 Kappa Street')]),precisionPlan=await intake.preview(operatorPool,precision.loaded,target);
  const precisionBefore=await snapshot();
  await appPool.query('ALTER TABLE venues ALTER COLUMN lat TYPE numeric(10,4),ALTER COLUMN lng TYPE numeric(10,4)');
  assert.deepEqual(await snapshot(),precisionBefore,'Existing JSON facts intentionally unchanged by type narrowing');
  await assert.rejects(applyPacket(precision,precisionPlan),error=>error.code==='UNSAFE_SCHEMA');
  assert.deepEqual(await snapshot(),precisionBefore);
  await appPool.query('ALTER TABLE venues ALTER COLUMN lat TYPE numeric(10,6),ALTER COLUMN lng TYPE numeric(10,6)');
  await appPool.query('ALTER TABLE venues ADD COLUMN qa_generated_public_rating numeric GENERATED ALWAYS AS (5.0) STORED');
  const generatedBefore=await snapshot();
  await assert.rejects(applyPacket(precision,precisionPlan),error=>error.code==='UNSAFE_SCHEMA');
  assert.deepEqual(await snapshot(),generatedBefore);await appPool.query('ALTER TABLE venues DROP COLUMN qa_generated_public_rating');
  console.log('PASS unchanged-row coordinate-scale drift and generated optional public claims fail closed before writes');
  const race=packet('race',[candidate('race','Verbena Pavilion','50 Theta Street')]),racePlan=await intake.preview(operatorPool,race.loaded,target);
  let control=await appPool.connect(),parallel;
  try{
    await control.query('BEGIN');await control.query('LOCK TABLE venues IN ROW EXCLUSIVE MODE');
    parallel=Promise.all([applyPacket(race,racePlan),applyPacket(race,racePlan)]);parallel.catch(()=>{});
    await waitForRelationWaiters(2);
  }finally{await control.query('ROLLBACK');control.release();}
  const raceResults=await parallel;assert.equal(raceResults.filter(row=>!row.replayed).length,1);assert.equal(raceResults.filter(row=>row.replayed).length,1);
  assert.equal(new Set(raceResults.map(row=>row.batch_id)).size,1);
  assert.equal((await appPool.query("SELECT count(*)::int n FROM venues WHERE external_id='race'")).rows[0].n,1);
  const writer=packet('ordinary-writer',[candidate('ordinary-writer','Freesia Corner','60 Iota Street')]),writerPlan=await intake.preview(operatorPool,writer.loaded,target);
  const receiptsBefore=(await allRows('venue_import_batches')).length;let pending;
  control=await appPool.connect();
  try{
    await control.query('BEGIN');await control.query("UPDATE venues SET short_desc='Independent writer retained' WHERE id=$1",[v2]);
    pending=applyPacket(writer,writerPlan);pending.catch(()=>{});await waitForRelationWaiters(1);await control.query('COMMIT');
  }finally{await control.query('ROLLBACK');control.release();}
  await assert.rejects(pending,error=>error.code==='PLAN_CHANGED');
  assert.equal((await allRows('venue_import_batches')).length,receiptsBefore);
  assert.equal((await appPool.query("SELECT count(*)::int n FROM venues WHERE external_id='ordinary-writer'")).rows[0].n,0);
  assert.equal((await appPool.query('SELECT short_desc FROM venues WHERE id=$1',[v2])).rows[0].short_desc,'Independent writer retained');
  console.log('PASS real PostgreSQL relation waits serialize concurrent operators and recompute after an ordinary writer commits');
}
async function nativeRealPacket(){
  const directory=process.env.SCENELINK_INTAKE_PACKET_DIR,expected=process.env.SCENELINK_INTAKE_PACKET_SHA,baselineFile=process.env.SCENELINK_INTAKE_BASELINE_FILE;
  if(!directory||!expected||!baselineFile)throw Error('Real fixture mode requires the reviewed packet directory/hash and public identity snapshot');
  const baselineBytes=fs.readFileSync(baselineFile),raw=baselineBytes.toString('utf8').trim();let parsed;
  try{parsed=JSON.parse(raw);}catch(_){parsed=raw.split(/\r?\n/).map(line=>JSON.parse(line));}
  const catalog=(Array.isArray(parsed)?parsed:parsed.rows).map(row=>{
    if(!Array.isArray(row.id))return row;
    assert(row.id.length===16&&row.id.every(value=>Number.isInteger(value)&&value>=0&&value<=255),'Invalid exported UUID bytes');
    const hex=Buffer.from(row.id).toString('hex');return {...row,id:[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')};
  });
  assert.equal(catalog.length,1710,'Use the explicitly described 1,710-row public identity fixture, not production credentials');
  assert.equal(new Set(catalog.map(row=>row.id)).size,catalog.length);
  const p={directory,packetSha:expected,loaded:intake.loadPacket(directory,expected)};
  assert.equal(sha(baselineBytes),p.loaded.report.catalog_sha256,'Use the exact catalog fixture reviewed in this packet');
  const fixtureDb=await appPool.connect();await fixtureDb.query('BEGIN');
  try{
    const columns=new Set((await fixtureDb.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='venues' AND is_generated='NEVER'")).rows.map(item=>item.column_name));
    for(const row of catalog){
      const values={...row,slug:row.slug||'baseline-'+row.id},keys=Object.keys(values).filter(key=>columns.has(key));
      await fixtureDb.query(`INSERT INTO venues(${keys.map(key=>'"'+key.replaceAll('"','""')+'"').join(',')}) VALUES(${keys.map((_,position)=>'$'+(position+1)).join(',')})`,keys.map(key=>values[key]));
    }
    await fixtureDb.query('COMMIT');
  }catch(error){await fixtureDb.query('ROLLBACK');throw error;}finally{fixtureDb.release();}
  const before=await snapshot();
  const plan=await intake.preview(operatorPool,p.loaded,target);
  assert.equal(plan.input_count,p.loaded.report.candidate_count);assert(plan.input_count>0&&plan.input_count<=25);
  assert.deepEqual([plan.insert_count,plan.skip_count,plan.hold_count],[plan.input_count,0,0],'Any fresh hold must return to data review; never force an expected count');
  const result=await applyPacket(p,plan),after=await snapshot(),ids=new Set(before.venues.map(row=>row.id));
  const inserted=after.venues.filter(row=>!ids.has(row.id));assert.equal(inserted.length,plan.input_count);inserted.forEach(inactiveClaims);await assertHidden(inserted);
  assert.deepEqual(after.venues.filter(row=>ids.has(row.id)),before.venues);
  assert.deepEqual(after.users,before.users);assert.deepEqual(after.favorites,before.favorites);
  for(const row of after.venue_source_records){const original=p.loaded.provenance[row.external_id];assert.deepEqual(row.provenance.sources,original.sources);assert.deepEqual(row.provenance.intake_identity_keys,original.intake_identity_keys);}
  const repeated=await applyPacket(p,plan);assert.equal(repeated.replayed,true);assert.equal(repeated.batch_id,result.batch_id);assert.equal(repeated.newly_inserted,0);assert.deepEqual(await snapshot(),after);
  console.log(JSON.stringify({test:'reviewed_real_packet_on_public_identity_fixture',native_postgres:true,packet_sha256:expected,
    baseline_rows:catalog.length,inserted_inactive:inserted.length,replayed_newly_inserted:0,baseline_unchanged:true,
    public_claims_unknown:true,production_writes:false,full_backup_restore:false}));
}
(async()=>{
  appPool=req('./src/config/database');
  assert.equal((await appPool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,'Refuse nonempty schema');
  const app=req('./src/server');await app.locals.initializeDatabase();
  assert(parseInt((await appPool.query('SHOW server_version_num')).rows[0].server_version_num)>=180000,'Requires native PostgreSQL 18+');
  operatorPool=new Pool({connectionString:target.connectionString,ssl:target.ssl,max:4,connectionTimeoutMillis:5000});operatorPool.on('error',()=>{});
  server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  if(process.env.SCENELINK_INTAKE_PACKET_DIR)await nativeRealPacket();else await nativeFictional();
  console.log('PASS inactive venue intake native acceptance completed');
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;}).finally(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));if(operatorPool)await operatorPool.end();if(appPool)await appPool.end();
  fs.rmSync(temporary,{recursive:true,force:true});
});
