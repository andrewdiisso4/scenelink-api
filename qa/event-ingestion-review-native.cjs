'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const connection = process.env.TEST_DATABASE_URL;
const uri = new URL(connection);
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(uri.protocol, 'postgresql:');
assert.equal(uri.hostname, '127.0.0.1');
assert.equal(uri.pathname, '/scenelink_test_event_review');
assert.ok(uri.port && !uri.search && !uri.hash);
assert.ok(!fs.existsSync('.env'));
assert.ok(!process.env.OPENAI_API_KEY && !process.env.ADMIN_SECRET && !process.env.SMTP_HOST);
process.env.DATABASE_URL = connection;
process.env.JWT_SECRET = randomUUID()+randomUUID();
process.env.ADMIN_SECRET = randomUUID()+randomUUID();
process.env.EMAIL_PROVIDER = 'disabled';
process.env.ALLOW_DEMO_SEED = 'false';
process.env.FORCE_RESEED = 'false';
const pool = require('../src/config/database');
const events = require('../src/services/event-ingestion-store');
const {normalizeEvent} = require('../src/services/ticketmaster-staging');
const {EVENT_TODAY_SQL} = require('../src/services/event-calendar');
const reviewModule = require('../src/launch/event-ingestion-review');
let server;
(async()=>{
  assert.equal((await pool.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,0);
  assert.match((await pool.query('select version()')).rows[0].version,/PostgreSQL 18\.3/);
  const app = require('../src/server');
  await app.locals.initializeDatabase();
  for(const migration of ['event_ingestion_staging.sql','event_ingestion_review.sql']) {
    const sql=fs.readFileSync('qa/migrations/'+migration,'utf8');
    await pool.query(sql);
    await pool.query(sql);
  }
  await pool.query(fs.readFileSync('migrations/017_venue_fact_reviews.sql','utf8'));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port+'/api';
  async function call(method,path,body,token,status=200,headers={}) {
    const r=await fetch(base+path,{method,headers:{'content-type':'application/json',
      ...(token?{authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await r.json();
    assert.equal(r.status,status,method+' '+path+' returned '+r.status+' ('+result.code+')');
    if(path.startsWith('/admin/event-ingestion')) assert.match(r.headers.get('cache-control') || '',/no-store/);
    return result;
  }
  async function member(name,role,verifies=true) {
    const {user,token}=await call('POST','/auth/signup',{email:name+'@example.invalid',username:name,
      password:'A synthetic example password 321!'},null,201);
    await pool.query('UPDATE users SET role=$2,email_verified_at=CASE WHEN $3 THEN now() END,verified_email=CASE WHEN $3 THEN email END WHERE id=$1',
      [user.id,role,verifies]);
    return {id:user.id,token};
  }
  const [admin,viewer,unverified]=[await member('review_owner','admin'),await member('review_viewer','user'),await member('review_unverified','admin',false)];
  const available=randomUUID(),closed=randomUUID(),wrong=randomUUID(),alias=randomUUID();
  await pool.query(`INSERT INTO venues (id,name,slug,type,neighborhood,cuisine,is_active,business_status,address,city,state,zip_code,duplicate_of)
    VALUES($1,'Demo Night Hall','review-demo-night-hall','restaurant','North End','Other',true,'OPERATIONAL','99 Fixture Street','Boston','MA','02109',NULL),
      ($2,'Demo Closed Hall','review-demo-closed-hall','restaurant','North End','Other',true,'CLOSED_TEMPORARILY','99 Fixture Street','Boston','MA','02109',NULL),
      ($3,'Demo Night Hall','review-wrong-address','restaurant','North End','Other',true,'OPERATIONAL','101 Fixture Street','Boston','MA','02109',NULL),
      ($4,'Demo Night Hall','review-duplicate-alias','restaurant','North End','Other',true,'OPERATIONAL','99 Fixture Street','Boston','MA','02109',$1)`,[available,closed,wrong,alias]);
  const path=key=>'/admin/event-ingestion/ticketmaster/'+key;
  const get=(key,who=admin)=>call('GET',path(key),undefined,who?.token);
  const put=(key,b,status=200,t=admin.token)=>call('PUT',path(key)+'/review',b,t,status);
  const up=(revision,venue_id=available)=>({decision:'publish',revision,venue_id});
  let epoch=Date.now();
  async function stage(key,{day=1,time='19:30:00',status='onsale',title='Fictional Review Show',sourceUrl='https://www.ticketmaster.com/event/qa-example?marketing=drop#drop',mismatch=false,place=true,runStatus='complete'}={}) {
    const d=(await pool.query(`SELECT to_char(${EVENT_TODAY_SQL}+$1::int,'YYYY-MM-DD') AS date,
      to_char(((${EVENT_TODAY_SQL}+$1::int + $2::time) AT TIME ZONE 'America/New_York') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS utc`,[day,time])).rows[0];
    const observedAt=new Date(epoch+=20).toISOString();
    const record=normalizeEvent({id:key,name:title,url:sourceUrl,dates:{status:{code:status},timezone:'America/New_York',
      start:{localDate:d.date,localTime:time,dateTime:mismatch?'2020-01-01T00:00:00Z':d.utc}},
      _embedded:{venues:place?[{name:'Demo Night Hall', address:{line1:'99 Fixture Street'},
        city:{name:'Boston'},state:{stateCode:'MA'},country:{countryCode:'US'},postalCode:'02109'}]:[]}},observedAt);
    return events.persistBatch(pool,{scopeKey:'fictional-review-fixture',observedAt,status:runStatus,records:[record]});
  }
  const visible=async()=> (await call('GET','/events?q=Fictional%20Review')).events;
  const one=async(sql,args)=> (await pool.query(sql,args)).rows[0];
  const history=id=>one('SELECT row_to_json(r) AS r FROM event_rsvps r WHERE event_id=$1 AND user_id=$2',[id,viewer.id]);
  assert.equal(reviewModule.enabled({...process.env,NODE_ENV:'production',SCENELINK_EVENT_SOURCE_REVIEW_MODE:'local-test'}),false);
  assert.equal(reviewModule.enabled({...process.env,DATABASE_URL:connection.replace('127.0.0.1','10.0.0.42'),SCENELINK_EVENT_SOURCE_REVIEW_MODE:'local-test'}),false);
  await call('GET',path('qa-a'),undefined,admin.token,404);
  process.env.SCENELINK_EVENT_SOURCE_REVIEW_MODE='local-test';
  const key='qa-a', other='qa-b';
  assert.equal((await stage(key)).saved_records,1);
  assert.equal((await stage(other)).saved_records,1);
  await call('GET',path(key),undefined,null,401,{'x-admin-secret':process.env.ADMIN_SECRET});
  await call('GET',path(key),undefined,viewer.token,403,{'x-admin-secret':process.env.ADMIN_SECRET});
  await call('GET',path(key),undefined,unverified.token,403);
  const staged=await get(key);
  assert.equal(staged.proposed_decision,'publish');
  assert.equal(staged.source_url,'https://www.ticketmaster.com/event/qa-example');
  assert.equal((await visible()).length,0);
  await put(key,{...up(staged.revision),reviewer_id:viewer.id},400);
  await put(key,up(staged.revision,closed),409);
  assert.equal((await put(key,up(staged.revision,alias),409)).code,'EVENT_VENUE_UNAVAILABLE');
  assert.equal((await put(key,up(staged.revision,wrong),409)).code,'EVENT_VENUE_MISMATCH');
  await put(key,{decision:'cancel',revision:staged.revision},409);
  const duplicate=randomUUID();
  await pool.query(`INSERT INTO venues(id,name,slug,city,state,zip_code,address,is_active,business_status)
    VALUES ($1,'Demo Night Hall','review-duplicate-active','Boston','MA','02109','99 Fixture Street',true,'OPERATIONAL')`,[duplicate]);
  assert.equal((await put(key,up(staged.revision),409)).code,'EVENT_VENUE_AMBIGUOUS');
  await pool.query('UPDATE venues SET is_active=false WHERE id=$1',[duplicate]);
  console.log('PASS production/default/remote disabled and exact verified session needed; staging remains private');
  console.log('PASS review body cannot supply an actor and requires the decision and an eligible venue');

  // PostgreSQL lock proves both concurrent HTTP approvals reached the staged record
  // before release; Promise.all by itself could be accidentally sequential.
  const blocker=await pool.connect();
  let a,b;
  try {
    await blocker.query('BEGIN');
    await blocker.query("SELECT 1 FROM event_ingestion_records WHERE source='ticketmaster' AND external_id=$1 FOR UPDATE",[key]);
    a=put(key,up(staged.revision)); b=put(key,up(staged.revision));
    a.catch(()=>{}); b.catch(()=>{});
    let waits=0;
    for(let i=0;i<120 && waits<2;i++){
      waits=(await one("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%event_ingestion_records s%'")).n;
      if(waits<2) await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(waits,2);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
  const [x,y]=await Promise.all([a,b]);
  assert.equal(x.event_id,y.event_id);
  assert.deepEqual([x.replayed,y.replayed].sort(),[false,true]);
  const id=x.event_id;
  assert.equal((await one("SELECT count(*)::int n FROM event_source_reviews WHERE event_id=$1 AND reviewer_id=$2",[id,admin.id])).n,1);
  assert.equal((await one("SELECT count(*)::int n FROM event_ingestion_publication_reviews WHERE event_id=$1",[id])).n,1);
  assert.equal((await put(key,up(staged.revision,closed),409)).code,'EVENT_REVIEW_CONFLICT');
  const two=await put(other,up((await get(other)).revision));
  assert.notEqual(id,two.event_id);
  assert.equal((await visible()).length,2);
  assert.equal((await call('GET','/events/'+id)).event.booking.status,'not_available');
  console.log('PASS database-verified concurrent HTTP approvals converge; separate same-day performances remain separate');

  await call('PUT','/events/'+id+'/rsvp',{status:'going',audience:'private'},viewer.token);
  const before=await history(id);
  await stage(key,{day:3,title:'Fictional Review Corrected'});
  assert.equal((await put(key,up(staged.revision),409)).code,'STALE_EVENT_SOURCE');
  assert.equal((await call('GET','/events/'+id)).event.title,'Fictional Review Show');
  const changed=await get(key);
  assert.equal((await put(key,up(changed.revision))).event_id,id);
  assert.equal((await call('GET','/events/'+id)).event.date,changed.schedule.date);
  assert.deepEqual(await history(id),before);
  await stage(key,{status:'cancelled',runStatus:'partial'});
  assert.equal((await get(key)).revision,changed.revision);
  await stage('qa-absent-from-scope');
  assert.equal((await get(key)).revision,changed.revision);
  assert.equal((await call('GET','/events/'+id)).event.title,'Fictional Review Corrected');
  console.log('PASS stale or unreviewed corrections do not publish; reschedule preserves URL and complete RSVP; partial runs and source silence do not cancel');

  await stage('qa-initial-cancel',{status:'cancelled'});
  assert.equal((await put('qa-initial-cancel',{decision:'cancel',revision:(await get('qa-initial-cancel')).revision},409)).code,'EVENT_CANCELLATION_HOLD');
  await stage(key,{status:'cancelled'});
  const cancellation=await get(key);
  assert.equal(cancellation.proposed_decision,'cancel');
  assert.equal((await call('GET','/events/'+id)).event.title,'Fictional Review Corrected');
  assert.equal((await put(key,{decision:'cancel',revision:cancellation.revision})).event_id,id);
  assert.equal((await put(key,{decision:'cancel',revision:cancellation.revision})).replayed,true);
  await call('GET','/events/'+id,undefined,null,404);
  assert.deepEqual(await history(id),before);
  assert.equal((await call('GET','/events/rsvps/mine',undefined,viewer.token)).rsvps[0].event_available,false);
  await stage(key);
  assert.equal((await put(key,up((await get(key)).revision),409)).code,'EVENT_CANCELLATION_HOLD');
  console.log('PASS only explicit reviewed cancellation hides event; history retained and later publish does not silently reactivate');

  await call('PUT','/admin/events/'+two.event_id+'/source-review',
    {source:'ticketmaster',status:'unreviewed',external_id:other,source_url:staged.source_url},admin.token);
  await stage(other,{day:2});
  assert.equal((await put(other,up((await get(other)).revision),409)).code,'EVENT_MANUAL_OVERRIDE');
  await call('GET','/events/'+two.event_id,undefined,null,404);
  await assert.rejects(pool.query('DELETE FROM events WHERE id=$1',[two.event_id]),{code:'23001'});
  const manual=randomUUID();
  await pool.query("INSERT INTO events(id,title,source,external_id) VALUES($1,'Manual prior event','ticketmaster','qa-manual')",[manual]);
  await stage('qa-manual');
  assert.equal((await put('qa-manual',up((await get('qa-manual')).revision),409)).code,'EVENT_IDENTITY_EXISTS');
  assert.equal((await one("SELECT count(*)::int n FROM events WHERE source='ticketmaster' AND external_id='qa-manual'")).n,1);
  console.log('PASS manual review override/deletion and legacy exact provider identity are protected from source replay');

  const dst=(await one(`WITH next_year AS (SELECT extract(year from ${EVENT_TODAY_SQL})::int + 1 n),
    days AS (SELECT make_date(n,11,1) AS fall,make_date(n,3,8) AS spring FROM next_year)
    SELECT (fall + ((7-extract(dow FROM fall)::int)%7) - ${EVENT_TODAY_SQL}) AS fold,
    (spring + ((7-extract(dow FROM spring)::int)%7) - ${EVENT_TODAY_SQL}) AS gap FROM days`));
  for(const [k,opt] of [
    ['qa-past',{day:-1}],['qa-time-mismatch',{mismatch:true}],['qa-source-spoof',{sourceUrl:'https://ticketmaster.com.example.invalid/event/qa'}],
    ['qa-no-supported-status',{status:'postponed'}],['qa-no-address',{place:false}],
    ['qa-fall-fold',{day:dst.fold,time:'01:30:00'}],['qa-spring-gap',{day:dst.gap,time:'02:30:00'}],
  ]) {
    await stage(k,opt);
    assert.equal((await put(k,up((await get(k)).revision),409)).code,'EVENT_SOURCE_HOLD');
  }
  assert.equal((await one('SELECT count(*)::int n FROM event_ingestion_publications')).n,2);
  console.log('PASS past date, inconsistent Boston time and DST gap/fold, unofficial source, missing venue and unspecified status stay unpublished');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  await pool.end();
});
