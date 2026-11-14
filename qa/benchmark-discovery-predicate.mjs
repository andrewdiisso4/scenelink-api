// Optional native PostgreSQL rehearsal. Never consumes DATABASE_URL or app data.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import discovery from '../src/services/venue-duplicate-discovery.js';
import helpers from '../src/services/venue-helpers.js';
import {legacyDiscoverySQL,verifyEquivalence} from './fixtures/duplicate-discovery-equivalence.mjs';
const connection=process.env.NATIVE_DISCOVERY_DATABASE_URL;
let url;try {url=new URL(connection);}catch {throw Error('Explicit isolated native database required');}
if(process.env.SCENELINK_DISCOVERY_BENCHMARK!=='local-only'||process.env.NODE_ENV==='production'||
  !['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
  !/^\/scenelink_test_discovery_[a-z0-9_]+$/.test(url.pathname)||url.search||url.hash) throw Error('Only explicit loopback scenelink_test_discovery_* databases are allowed');
const db=new pg.Client({connectionString:connection,connectionTimeoutMillis:5000});
await db.connect();
try {
  await db.query("SET statement_timeout='60s'");
  const server=(await db.query('SELECT version() AS version')).rows[0].version;
  const equivalence=await verifyEquivalence(db);
  assert.equal((await db.query("SELECT to_regclass('public.venues') AS table_name")).rows[0].table_name,null,'Fresh isolated DB required');
  const schema=await readFile(new URL('../src/config/schema.sql',import.meta.url),'utf8');
  const table=schema.match(/CREATE TABLE IF NOT EXISTS venues \([\s\S]*?\n\);/)[0].replace('DEFAULT uuid_generate_v4()','');
  await db.query(table);
  await db.query('ALTER TABLE venues ADD COLUMN business_status text, ADD COLUMN external_id text, ADD COLUMN source_payload jsonb');
  await db.query(`INSERT INTO venues(id,slug,name,type,category,address,neighborhood,city,state,zip_code,lat,lng,
    description,short_desc,phone,website,email,hours_json,hours_display,image_url,image_urls,cover_image_url,
    tags,badges,features,vibe,highlight,why_hot,pair_with,reservation_url,opentable_url,resy_url,yelp_url,
    google_maps_url,place_id,source,business_status,is_active,external_id,source_payload)
    SELECT md5(i::text)::uuid,'fictional-benchmark-'||i,'Fictional Benchmark Venue '||i,'restaurant','restaurant',
    i||' Test Street','Synthetic Area','Boston','MA','02110',42.36,-71.06,
    repeat(md5('description'||i),32),repeat(md5('short'||i),4),'6170000000','https://example.invalid/venue/'||i,
    'fixture@example.invalid',jsonb_build_object('days',jsonb_build_array('Mon','Tue','Wed','Thu','Fri','Sat','Sun'),'source',repeat(md5('hours'||i),16)),
    'Synthetic hours only','https://example.invalid/image/'||repeat(md5('photo'||i),32),
    (SELECT jsonb_agg('https://example.invalid/photo/'||md5((i*10+j)::text)||repeat(md5('media'||j),8)) FROM generate_series(1,8) j),
    'https://example.invalid/cover/'||repeat(md5('cover'||i),16),
    '["fictional","benchmark"]'::jsonb,'[]'::jsonb,'["synthetic"]'::jsonb,
    repeat(md5('vibe'||i),4),repeat(md5('highlight'||i),4),NULL,NULL,
    'https://example.invalid/reservations/'||i,'https://example.invalid/open/'||i,'https://example.invalid/resy/'||i,
    'https://example.invalid/yelp/'||i,'https://example.invalid/map/'||i,'synthetic-'||i,'fictional-benchmark',
    CASE WHEN i BETWEEN 1623 AND 1630 THEN 'CLOSED_PERMANENTLY' END,i<=1630,'synthetic-'||i,
    jsonb_build_object('license','fictional-test-only','evidence',repeat(md5('source'||i),32)) FROM generate_series(1,1710) i`);
  const size=(await db.query('SELECT COUNT(*)::int AS total,ROUND(AVG(pg_column_size(v)))::int AS stored_bytes,ROUND(AVG(octet_length(to_jsonb(v)::text)))::int AS json_bytes FROM venues v')).rows[0];
  const cases=[];
  async function benchmark(name,expectedCount) {
    await db.query('ANALYZE venues');
    const statements={legacy:`SELECT COUNT(*)::int AS n FROM venues v WHERE ${helpers.availableVenueSQL('v')} AND ${legacyDiscoverySQL()}`,
      guarded:`SELECT COUNT(*)::int AS n FROM venues v WHERE ${helpers.availableVenueSQL('v')} AND ${discovery.visibleDiscoveryVenueSQL()}`};
    for(const query of Object.values(statements)) assert.equal((await db.query(query)).rows[0].n,expectedCount,name);
    const runs=[];
    for(let round=0;round<3;round++) for(const variant of round%2?['guarded','legacy']:['legacy','guarded']) {
      const explain=(await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+statements[variant])).rows[0]['QUERY PLAN'][0];
      const canonical=[];const visit=node=>{if(node.Alias==='duplicate_canonical')canonical.push({node:node['Node Type'],loops:node['Actual Loops'],rows:node['Actual Rows']});for(const child of node.Plans||[])visit(child);};visit(explain.Plan);
      runs.push({round,variant,execution_ms:explain['Execution Time'],canonical_scans:canonical,explain});
    }
    if(['pre017-wide-rows','post017-null-targets'].includes(name)) for(const run of runs.filter(r=>r.variant==='guarded')) assert.ok(run.canonical_scans.every(scan=>scan.loops===0),'NULL-only guard must skip canonical subplan');
    const median=variant=>runs.filter(r=>r.variant===variant).map(r=>r.execution_ms).sort((a,b)=>a-b)[1];
    cases.push({name,count:expectedCount,median_legacy_ms:median('legacy'),median_guarded_ms:median('guarded'),speedup:median('legacy')/median('guarded'),runs});
  }
  await benchmark('pre017-wide-rows',1622);
  await db.query('ALTER TABLE venues ADD COLUMN duplicate_of uuid, ADD COLUMN duplicate_review jsonb NOT NULL DEFAULT \'{}\'');
  await db.query('CREATE INDEX venues_duplicate_of ON venues(duplicate_of) WHERE duplicate_of IS NOT NULL');
  await benchmark('post017-null-targets',1622);
  await db.query(`UPDATE venues v SET name=c.name,address=c.address,city=c.city,duplicate_of=c.id,
    duplicate_review=jsonb_build_object('status','reviewed_duplicate','canonical_id',c.id::text,
      'alias_identity',jsonb_build_object('name',c.name,'address',c.address,'city',c.city),
      'canonical_identity',jsonb_build_object('name',c.name,'address',c.address,'city',c.city))
    FROM venues c WHERE c.id=md5('1')::uuid AND v.id IN (SELECT md5(i::text)::uuid FROM generate_series(2,18) i)`);
  await benchmark('post017-reviewed-aliases',1605);
  await db.query(`UPDATE venues SET duplicate_of=md5('missing-canonical')::uuid,
    duplicate_review=jsonb_set(duplicate_review,'{canonical_id}',to_jsonb(md5('missing-canonical')::uuid::text)) WHERE duplicate_of IS NOT NULL`);
  await benchmark('post017-missing-targets',1622);
  const report={server,synthetic_only:true,production_accessed:false,row_size:size,equivalence,cases};
  if(process.argv[2]) await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({...report,equivalence:{case_count:equivalence.case_count,outer_alias_checks:equivalence.outer_alias_checks},cases:cases.map(({runs,...rest})=>rest)},null,2)+'\n');
} finally {await db.end();}
