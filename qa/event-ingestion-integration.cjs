// Reconciled November 1 ingestion tests against the authoritative social candidate.
// Default is supplemental single-backend PGlite, NOT native concurrency proof.
// Native mode requires explicit disposable loopback DB and refuses existing tables.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { persistBatch, freshness } = require('../src/services/event-ingestion-store');
const { runIngestion } = require('../src/services/event-ingestion-job');
const { acquireLease, releaseLease, reserveRequest } = require('../src/services/event-provider-control');
const engine = process.env.SCENELINK_INGESTION_ENGINE || 'embedded';
const root = path.resolve(__dirname, '..');
let backend, psql, close;
async function open() {
  if (fs.existsSync(path.join(root, '.env'))) throw new Error('Refuse backend .env for isolated ingestion tests');
  if (engine === 'native') {
    if (process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT !== 'yes') throw new Error('Explicit local schema initialization approval required');
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname)
        || !url.port || url.search || url.hash || !/^\/scenelink_test_[a-z0-9_]+$/.test(url.pathname)) {
      throw new Error('REFUSED: explicit disposable loopback scenelink_test_* database required');
    }
    const { Pool } = require('pg');
    backend = new Pool({ connectionString: url.href, ssl: false, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
    psql = sql => backend.query(sql); close = () => backend.end();
  } else if (engine === 'embedded') {
    const { PGlite } = require('@electric-sql/pglite');
    const { uuid_ossp } = require('@electric-sql/pglite/contrib/uuid_ossp');
    const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
    const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
    backend = await PGlite.create({ extensions: { uuid_ossp, pg_trgm, pgcrypto } });
    psql = sql => backend.exec(sql); close = () => backend.close();
  } else throw new Error('Unsupported ingestion test engine');
  console.log(engine === 'native' ? 'Native PostgreSQL / node-pg ingestion gate' : 'Supplemental PGlite ingestion gate; serialized SQL is not native concurrency proof');
}
// Preserve original archived assertions while using real parameterized SQL transport.
const db = { query: async (sql, values = []) => {
  const result = await backend.query(sql, values);
  return { rows: result.rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k,
    typeof v === 'boolean' ? (v ? 't' : 'f') : typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString() : v]))) };
}};
async function initializeCandidate() {
  await psql(fs.readFileSync(path.join(root, 'src/config/schema.sql'), 'utf8'));
  const migrations = ['migrations', 'src/migrations'].flatMap(dir => fs.readdirSync(path.join(root, dir))
    .filter(file => file.endsWith('.sql')).map(file => path.join(root, dir, file)))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)) || a.localeCompare(b));
  for (const file of migrations) await psql(fs.readFileSync(file, 'utf8'));
}
let candidateSnapshot;
async function snapshotCandidate() {
  const result = {};
  for (const table of ['events', 'event_source_reviews', 'event_rsvps', 'users']) {
    result[table] = (await db.query('SELECT row_to_json(r) AS row FROM ' + table + ' r')).rows;
  }
  return result;
}
async function saveCandidateFixtures() {
  const user = randomUUID(), event = randomUUID();
  await db.query(`INSERT INTO users(id,email,username,display_name,is_private,social_links)
    VALUES($1,'ingestion-preservation@example.invalid','ingestion_fixture','Fictional private member',true,'[]')`, [user]);
  await db.query(`INSERT INTO events(id,title,date,is_active,source,source_url,source_review_status,source_reviewed_at)
    VALUES($1,'Fictional manually reviewed existing event',CURRENT_DATE+7,true,'official_venue','https://example.com/fictional-event','reviewed',now())`, [event]);
  await db.query(`INSERT INTO event_source_reviews(event_id,reviewer_id,source,source_url,status)
    VALUES($1,$2,'official_venue','https://example.com/fictional-event','reviewed')`, [event,user]);
  await db.query("INSERT INTO event_rsvps(event_id,user_id,status,audience) VALUES($1,$2,'going','private')", [event,user]);
  candidateSnapshot = await snapshotCandidate();
}
async function assertCandidatePreserved() {
  assert.deepEqual(await snapshotCandidate(), candidateSnapshot);
  const { PUBLIC_EVENT } = require('../src/launch/events');
  assert.equal((await db.query(`SELECT count(*) AS n FROM events e LEFT JOIN venues v ON v.id=e.venue_id WHERE ${PUBLIC_EVENT()}`)).rows[0].n,'1');
  assert.equal((await db.query('SELECT count(*) AS n FROM event_ingestion_records WHERE is_active OR NOT requires_review')).rows[0].n,'0');
}
const event = (id, status = 'onsale') => ({ source: 'ticketmaster', external_id: id, provider_status: status,
  title: "Fictional O'Brien fixture", is_active: false, requires_review: true });
const batch = (records, extra = {}) => ({ runId: randomUUID(), scopeKey: 'Boston:MA:fixture-window', observedAt: '2026-11-01T12:00:00Z', status: 'complete', records, ...extra });

test(`${engine} ingestion: candidate schema, replay, atomicity, identity, freshness and failures`, async t => {
  await open(); t.after(close);
  const tables = await db.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'");
  assert.equal(tables.rows[0].n, '0', 'Refuse nonempty test database; create a NEW isolated database for reruns');
  await initializeCandidate();
  const migration = fs.readFileSync(new URL('./migrations/event_ingestion_staging.sql', `file://${__filename}`), 'utf8');
  await psql(migration); await psql(migration);
  await saveCandidateFixtures();
  await psql("CREATE TABLE manual_event_fixture(id text PRIMARY KEY,title text); INSERT INTO manual_event_fixture VALUES('manual','Do not touch');");

  await t.test('repeat same run and repeated provider ID are idempotent', async () => {
    const b = batch([event('one'), event('one')]);
    assert.equal((await persistBatch(db,b)).saved_records,'1');
    assert.equal((await persistBatch(db,b)).accepted_runs,'0');
    assert.equal((await db.query('SELECT count(*) AS n FROM event_ingestion_records')).rows[0].n,'1');
  });
  await t.test('concurrent runs upsert one identity and newest status wins', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => persistBatch(db,batch([event('race', i === 7 ? 'cancelled':'onsale')], { observedAt: `2026-11-01T13:0${i}:00Z` }))));
    const r = (await db.query("SELECT cancelled,is_active,requires_review FROM event_ingestion_records WHERE external_id='race'")).rows[0];
    assert.deepEqual(r,{cancelled:'t',is_active:'f',requires_review:'t'});
    await persistBatch(db,batch([event('race')], { observedAt:'2026-11-01T12:59:00Z' }));
    assert.equal((await db.query("SELECT cancelled FROM event_ingestion_records WHERE external_id='race'")).rows[0].cancelled,'t');
  });
  await t.test('a second search scope records observation without overwriting newer provider payload', async () => {
    await persistBatch(db,batch([event('race')], {scopeKey:'second-scope'}));
    assert.equal((await freshness(db,{scopeKey:'second-scope',asOf:'2026-11-04T00:00:00Z'}))[0].stale,'t');
  });
  await t.test('partial and failed collection preserve records; repeat failed run does not refetch', async () => {
    const partial = batch([]);
    await runIngestion(db,{...partial, collect:async()=>({complete:false,truncated:true,records:[event('partial')]})});
    const failed = batch([]);
    await assert.rejects(runIngestion(db,{...failed,collect:async()=>{throw Error('fixture failure');}}));
    assert.equal((await runIngestion(db,{...failed,collect:()=>assert.fail('refetch')})).duplicate,true);
    assert.equal((await db.query("SELECT count(*) AS n FROM event_ingestion_records WHERE external_id='partial'")).rows[0].n,'0');
    assert.equal((await db.query("SELECT count(*) AS n FROM event_ingestion_records")).rows[0].n,'2');
  });
  await t.test('complete empty search marks nothing cancelled; age signals stale without mutation', async () => {
    await persistBatch(db,batch([],{observedAt:'2026-11-05T12:00:00Z'}));
    const rows=await freshness(db,{scopeKey:'Boston:MA:fixture-window',asOf:'2026-11-05T12:00:00Z'});
    assert.ok(rows.every(r=>r.stale==='t'));
    assert.equal((await db.query("SELECT cancelled FROM event_ingestion_records WHERE external_id='one'")).rows[0].cancelled,'f');
    assert.equal((await db.query('SELECT title FROM manual_event_fixture')).rows[0].title,'Do not touch');
  });
  await t.test('DB constraints prevent activation; invalid input creates no receipt', async () => {
    await assert.rejects(db.query('UPDATE event_ingestion_records SET is_active=true'));
    const bad=batch([event('bad')]);bad.records[0].source='manual';
    await assert.rejects(persistBatch(db,bad));
    assert.equal((await db.query('SELECT count(*) AS n FROM event_ingestion_runs WHERE run_id=$1',[bad.runId])).rows[0].n,'0');
  });
  await t.test('concurrent same-run attempts save one receipt', async () => {
    const same=batch([event('same-run')]);
    const results=await Promise.all(Array.from({length:6},()=>persistBatch(db,same)));
    assert.equal(results.reduce((sum,r)=>sum+Number(r.accepted_runs),0),1);
    assert.equal((await db.query("SELECT count(*) AS n FROM event_ingestion_records WHERE external_id='same-run'")).rows[0].n,'1');
  });
  await t.test('mid-statement DB failure rolls back receipt and every record', async () => {
    await psql("ALTER TABLE event_ingestion_records ADD CONSTRAINT fixture_rejection CHECK (external_id <> 'reject-fixture')");
    const bad=batch([event('rollback-good'),event('reject-fixture')]);
    await assert.rejects(persistBatch(db,bad));
    assert.equal((await db.query('SELECT count(*) AS n FROM event_ingestion_runs WHERE run_id=$1',[bad.runId])).rows[0].n,'0');
    assert.equal((await db.query("SELECT count(*) AS n FROM event_ingestion_records WHERE external_id='rollback-good'")).rows[0].n,'0');
  });
  await t.test('held lease excludes a second worker; expiry allows recovery and fences old writes', async () => {
    const owner=await acquireLease(db);assert.ok(owner);
    const busy=await runIngestion(db,{...batch([]),collect:()=>assert.fail('No overlapping fetch')});
    assert.equal(busy.status,'busy');
    await db.query("UPDATE event_ingestion_leases SET expires_at=now()-interval '1 second'");
    const replacement=await acquireLease(db);assert.ok(replacement);assert.notEqual(replacement,owner);
    const fenced=await persistBatch(db,{...batch([event('expired-worker')]),leaseToken:owner});
    assert.equal(fenced.accepted_runs,'0');
    await assert.rejects(reserveRequest(db,1000,owner),/expired/);
    await releaseLease(db,owner);
    assert.equal((await db.query('SELECT owner FROM event_ingestion_leases')).rows[0].owner,replacement);
    await releaseLease(db,replacement);
  });
  await t.test('known-ID cancellation is refreshed with mocked transport; 404 preserves state', async () => {
    const scopeKey='known-refresh';
    await persistBatch(db,batch([event('known')],{scopeKey}));
    const statuses=[200,404];
    for(const [index,detailStatus] of statuses.entries()) {
      const calls=[];
      const outcome=await runIngestion(db,{...batch([],{scopeKey,observedAt:`2026-11-0${index+2}T12:00:00Z`}),
        providerOptions:{apiKey:'fictional',startDateTime:'2026-11-01T00:00:00Z',endDateTime:'2026-12-01T00:00:00Z',pause:async()=>{},
          fetchImpl:async url=>{
            calls.push(new URL(url).pathname);
            return {status:url.includes('/known.json')?detailStatus:200,ok:true,headers:{get:()=>null},json:async()=>url.includes('/known.json')
              ?{id:'known',name:'Fictional known',dates:{status:{code:'cancelled'}}}:{page:{totalPages:0}}};
          }}});
      assert.equal(outcome.status,'complete');assert.equal(calls.length,2);
      assert.equal((await db.query("SELECT cancelled FROM event_ingestion_records WHERE external_id='known'")).rows[0].cancelled,'t');
    }
  });
  await t.test('refresh failure after search data preserves all prior event payloads', async () => {
    const scopeKey='known-failure';await persistBatch(db,batch([event('kept')],{scopeKey}));
    let calls=0;
    await assert.rejects(runIngestion(db,{...batch([],{scopeKey,observedAt:'2026-11-06T00:00:00Z'}),providerOptions:{apiKey:'fictional',
      startDateTime:'2026-11-01T00:00:00Z',endDateTime:'2026-12-01T00:00:00Z',pause:async()=>{},fetchImpl:async url=>{
        calls++;return url.includes('/kept.json')?{ok:false,status:503,headers:{get:()=>null}}:
        {ok:true,status:200,headers:{get:()=>null},json:async()=>({page:{totalPages:1},_embedded:{events:[{id:'kept',name:'Fictional',dates:{status:{code:'cancelled'}}}]}})};
      }}}));
    assert.equal(calls,4);assert.equal((await db.query("SELECT cancelled FROM event_ingestion_records WHERE external_id='kept'")).rows[0].cancelled,'f');
    assert.equal((await db.query('SELECT count(*) AS n FROM event_ingestion_leases')).rows[0].n,'0');
  });
  await t.test('staging cannot change candidate event reviews, RSVP intent or private profiles', assertCandidatePreserved);
  await t.test('concurrent quota reservations cannot exceed configured budget', async () => {
    const current=await db.query('SELECT COALESCE(sum(requests),0) AS n FROM event_ingestion_quotas');
    const limit=Number(current.rows[0].n)+3;
    const attempts=await Promise.allSettled(Array.from({length:8},()=>reserveRequest(db,limit)));
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,3);
    assert.equal((await db.query('SELECT sum(requests) AS n FROM event_ingestion_quotas')).rows[0].n,String(limit));
    assert.equal((await db.query('SELECT count(*) AS n FROM event_ingestion_records WHERE is_active OR NOT requires_review')).rows[0].n,'0');
  });
});
