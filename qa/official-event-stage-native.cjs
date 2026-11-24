#!/usr/bin/env node
'use strict';
/** REAL Express + JWT + bcrypt + PostgreSQL integration gate.
 * Supplemental PGlite runs are labeled explicitly; native PostgreSQL CI is a separate gate.
 * Refuses remote databases and nonempty schemas. Never connect this to production.
 * It creates fictional data ONLY in a fresh literal-loopback scenelink_test_* database.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const connection=process.env.TEST_DATABASE_URL;
if(!connection||process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT!=='yes')throw Error('Set TEST_DATABASE_URL and SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes for a NEW local test database only.');
// node-pg accepts query parameters that override host/port/database. Check the
// complete connection string before reading app config or loading a DB driver.
const refused='REFUSED: literal loopback, explicit port and scenelink_test_* database required; URL query/fragment overrides are forbidden.';
let u;try{u=new URL(connection);}catch{throw Error(refused);}
if(!['127.0.0.1','[::1]'].includes(u.hostname)||!u.port||Number(u.port)<1
  ||u.pathname!=='/scenelink_test_official_occurrences'||!['postgres:','postgresql:'].includes(u.protocol)
  ||u.search||u.hash||/[?#]/.test(connection))throw Error(refused);
if(!fs.existsSync(path.join(root,'src/launch/router.js'))||fs.existsSync(path.join(root,'.env')))throw Error('Use the prepared backend with no .env file.');
process.chdir(root);process.env.NODE_ENV='test';process.env.DATABASE_URL=connection;process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');process.env.ALLOW_DEMO_SEED='false';process.env.FORCE_RESEED='false';
for(const name of ['SMTP_HOST','SMTP_USER','SMTP_PASS','CLOUDINARY_URL','CLOUDINARY_UPLOAD_PRESET','SENTRY_DSN','OPENAI_API_KEY','ADMIN_SECRET'])delete process.env[name];process.env.ADMIN_SECRET=crypto.randomBytes(32).toString('hex');process.env.EMAIL_PROVIDER='disabled';
const req=createRequire(path.join(root,'package.json'));
let pool,server;
(async()=>{
 pool=req('./src/config/database');
 assert.equal((await pool.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,0);
 const app=req('./src/server');await app.locals.initializeDatabase();
 assert(parseInt((await pool.query('SHOW server_version_num')).rows[0].server_version_num)>=180000, 'Requires native PostgreSQL 18+');
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const api=async(method,route,body,token,want=200,extra={})=>{
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...extra,...(token?{Authorization:'Bearer '+token}:{})},...(body==null?{}:{body:JSON.stringify(body)})});
  const json=await r.json();assert.equal(r.status,want,method+' '+route+': '+JSON.stringify(json));return json
 };
 const password='Only a local synthetic password 381!';
 const uo={email:'event-admin@example.invalid',username:'event_admin',password};
 const vo={email:'event-viewer@example.invalid',username:'event_viewer',password};
 const u=await api('POST','/auth/signup',uo,null,201);
 const v=await api('POST','/auth/signup',vo,null,201);
 await pool.query("update users set role='admin',email_verified_at=now(),verified_email=email where id=$1",[u.user.id]);
 const admin=(await api('POST','/auth/login',{email:uo.email,password})).token;
 await pool.query("update users set email_verified_at=now(),verified_email=email where id=$1",[v.user.id]);
 const viewer=(await api('POST','/auth/login',{email:vo.email,password})).token;
 const venue=crypto.randomUUID(), differentVenue=crypto.randomUUID();
 await pool.query(`INSERT INTO venues(id,name,slug,type,neighborhood,cuisine,address,is_active,business_status)
 VALUES($1,'City Winery Boston','qa-city-winery','restaurant','North End','Other','80 Beverly Street',true,'OPERATIONAL'),
 ($2,'Another Boston Venue','qa-other-venue','restaurant','North End','Other','82 Beverly Street',true,'OPERATIONAL')`,[venue,differentVenue]);
 const {enabled}=req('./src/launch/official-event-stage');
 assert.equal(enabled({NODE_ENV:'production',SCENELINK_OFFICIAL_EVENT_STAGE_MODE:'local-test',DATABASE_URL:connection}),false);
 assert.equal(enabled({NODE_ENV:'test',SCENELINK_OFFICIAL_EVENT_STAGE_MODE:'local-test',DATABASE_URL:connection+'?host=127.0.0.2'}),false);
 assert.equal(enabled({NODE_ENV:'test',SCENELINK_OFFICIAL_EVENT_STAGE_MODE:'local-test',DATABASE_URL:connection.replace('127.0.0.1','localhost')}),false);
 const {rows:[{day}]}=await pool.query("SELECT to_char((NOW() AT TIME ZONE 'America/New_York')::date+3,'YYYY-MM-DD') AS day");
 const mk=(slug,time='15:00',title='Synthetic official performance',extra={})=>({
   source:'official_venue',source_url:'https://tickets.citywinery.com/event/'+slug,external_id:slug,
   title,date:day,start_time:time,venue_id:venue,category:'Music',...extra
 });
 const first=mk('qa-no-remote-1');
 const reviews=(stage,status='reviewed')=>({source:'official_venue',source_url:stage.source_url,external_id:stage.external_id,status});
 const post=(b=first,want=200)=>api('POST','/admin/events',b,admin,want);
 await api('POST','/admin/events',first,null,401);
 await api('POST','/admin/events',first,viewer,403);
 await api('POST','/admin/events',first,null,403,{'X-Admin-Secret':process.env.ADMIN_SECRET});
 await pool.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[u.user.id]);
 await api('POST','/admin/events',first,admin,403);
 await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1',[u.user.id]);
 delete process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE;
 assert.equal((await post(first,503)).code,'OFFICIAL_EVENT_STAGING_OFF');
 process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE='local-test';
 await post(first,503);
 // Preserve exact data on an existing schema, not just a fresh install.
 // Use the unrelated venue and remove this fixture after byte-level row replay
 // so the business-flow assertions below still start with no published event.
 const historicId=crypto.randomUUID();
 await pool.query(`INSERT INTO events(id,title,venue_id,date,start_time,source,source_url,source_review_status,source_reviewed_at,source_reviewed_by)
 VALUES($1,'Historic local QA event',$2,current_date-4,'16:00','organizer','https://example.invalid/historic','reviewed',now(),$3)`,[historicId,differentVenue,u.user.id]);
 await pool.query(`INSERT INTO event_source_reviews(event_id,reviewer_id,source,source_url,status)
 VALUES($1,$2,'organizer','https://example.invalid/historic','reviewed')`,[historicId,u.user.id]);
 await pool.query("INSERT INTO event_rsvps(event_id,user_id,status,audience,revision) VALUES($1,$2,'going','private',7)",[historicId,v.user.id]);
 const snapshot=async()=> (await pool.query(`SELECT to_jsonb(e) AS event,to_jsonb(a) AS audit,to_jsonb(r) AS rsvp,to_jsonb(v) AS venue
 FROM events e JOIN event_source_reviews a ON a.event_id=e.id JOIN event_rsvps r ON r.event_id=e.id JOIN venues v ON v.id=e.venue_id WHERE e.id=$1`,[historicId])).rows;
 const before=await snapshot();
 assert.equal(before.length,1);
 const migration=fs.readFileSync(path.join(root,'migrations/018_official_event_occurrences.sql'),'utf8');
 const oldWriter=await pool.connect(), migrator=await pool.connect();
 try {
   await oldWriter.query('BEGIN');
   await oldWriter.query('LOCK TABLE events IN ACCESS EXCLUSIVE MODE');
   await assert.rejects(migrator.query(migration),e=>e.code==='55P03');
   await migrator.query('ROLLBACK');
   assert.equal((await migrator.query("SELECT to_regclass('public.official_event_occurrences') AS stage_table")).rows[0].stage_table,null);
 } finally {
   await oldWriter.query('ROLLBACK');oldWriter.release();
   await migrator.query('ROLLBACK');migrator.release();
 }
 await pool.query(migration);await pool.query(migration);
 assert.deepEqual(await snapshot(),before);
 assert.equal((await pool.query('SELECT count(*)::int n FROM official_event_occurrences')).rows[0].n,0);
 await pool.query('DELETE FROM events WHERE id=$1',[historicId]);
 console.log('PASS migration times out atomically under an old writer lock; rerun preserves all preexisting fixture data');
 await post({...first,source_url:'https://tickets.citywinery.com.example.com/event/qa-no-remote-1'},400);
 await post({...first,source_url:'https://tickets.citywinery.com/event/mismatched'},400);
 await post({...first,source_review_status:'reviewed'},400);
 await post({...first,date:'2026-02-30'},400);
 await post({...first,start_time:'25:00'},400);
 await post({...first,venue_id:differentVenue},409);
 const dup=crypto.randomUUID();
 await pool.query("INSERT INTO venues(id,name,slug,type,address,is_active) VALUES($1,'City Winery Boston','qa-duplicate-city-winery','restaurant','80 Beverly St.',true)",[dup]);
 await post(first,409);
 await pool.query('DELETE FROM venues WHERE id=$1',[dup]);
 console.log('PASS disabled without additive migration; verified admin only; exact trusted URL and singleton active venue; malformed or publish-like data held');
 // Force independent HTTP transactions to queue behind a separate DB session
 // and verify PostgreSQL actually observed multiple advisory waiters.
 const control=await pool.connect();
 let parallel;
 try {
   await control.query('BEGIN');
   await control.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:official-event:city-winery-boston:'+first.external_id]);
   parallel=Promise.all(Array.from({length:5},()=>post()));
   parallel.catch(()=>{});
   let waiters=0;
   for(let i=0;i<80&&waiters<2;i++){
      const r=await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND lower(wait_event)='advisory'");
      waiters=r.rows[0].n;
      if(waiters<2)await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert(waiters>=2);
 } finally {await control.query('ROLLBACK');control.release();}
 const many=await parallel, one=many[0].event;
 assert.equal(many.filter(x=>!x.replayed).length,1);
 assert.deepEqual(new Set(many.map(x=>x.event.id)),new Set([one.id]));
 assert.equal(one.source_review_status,'unreviewed');
 assert.equal((await pool.query('SELECT count(*)::int n FROM official_event_occurrences')).rows[0].n,1);
 await api('GET','/events/'+one.id,null,null,404);
 assert.equal((await api('GET','/events')).total,0);
 const secondBody=mk('qa-no-remote-2','19:30');
 const {event:two}=await post(secondBody);
 assert.notEqual(one.id,two.id);
 assert.equal((await post()).event.id,one.id);
 await post({...first,title:'Synthetic corrected title'},409);
 await post({...first,start_time:'16:00'},409);
 await post({...first,venue_id:differentVenue},409);
 console.log('PASS five concurrent HTTP retries converge on one staged ID; separate official same-day performance stays distinct; changed facts conflict');
 const reviewPath='/admin/events/'+one.id+'/source-review';
 await api('PUT',reviewPath,reviews(one),null,401);
 await api('PUT',reviewPath,reviews(one),viewer,403);
 await api('PUT',reviewPath,reviews(one),null,403,{'X-Admin-Secret':process.env.ADMIN_SECRET});
 await api('PUT',reviewPath,{...reviews(one),source:'organizer'},admin,409);
 await api('PUT',reviewPath,{...reviews(one),source_url:two.source_url},admin,409);
 await api('PUT',reviewPath,{...reviews(one),external_id:two.external_id},admin,409);
 await api('PUT',reviewPath,{...reviews(one),status:'unreviewed'},admin,409);
 await pool.query("UPDATE venues SET is_active=false WHERE id=$1",[venue]);
 await api('PUT',reviewPath,reviews(one),admin,409);
 await pool.query("UPDATE venues SET is_active=true WHERE id=$1",[venue]);
 await pool.query("UPDATE events SET title='Drifted outside this API' WHERE id=$1",[one.id]);
 await api('PUT',reviewPath,reviews(one),admin,409);
 await post(first,409);
 await pool.query('UPDATE events SET title=$2 WHERE id=$1',[one.id,first.title]);
 await api('PUT',reviewPath,reviews(one),admin);
 await api('PUT',reviewPath,reviews(one),admin);
 const publicOne=(await api('GET','/events/'+one.id)).event;
 assert.equal(publicOne.source_url,first.source_url);assert.equal(publicOne.booking.url,null);assert.equal(publicOne.booking.reservation_confirmed,false);
 assert.deepEqual((await api('GET','/events')).events.map(x=>x.id),[one.id]);
 assert.equal((await post()).event.source_review_status,'reviewed');
 assert.equal((await pool.query("SELECT count(*)::int n FROM event_source_reviews WHERE event_id=$1 AND reviewer_id=$2",[one.id,u.user.id])).rows[0].n,1);
 await api('PATCH','/admin/events/'+one.id,{title:'Manual overwrite'},admin,409);
 await api('DELETE','/admin/events/'+one.id,null,admin,409);
 await assert.rejects(pool.query('DELETE FROM events WHERE id=$1',[one.id]),e=>['23001','23503'].includes(e.code));
 console.log('PASS explicit verified identity-bound review publishes only selected occurrence; review retry has one audit; PATCH and hard delete held');
 const {rsvp:beforeBackout}=await api('PUT','/events/'+one.id+'/rsvp',{status:'going',audience:'private'},viewer);
 // A late venue writer need not use the event writer lock. Read visibility
 // must be fail-closed even if the event itself and its review remain intact.
 await pool.query("INSERT INTO venues(id,name,slug,type,address,is_active) VALUES($1,'City Winery Boston','qa-duplicate-city-winery','restaurant','80 Beverly St.',true)",[dup]);
 await api('GET','/events/'+one.id,null,null,404);
 assert.equal((await api('GET','/events')).total,0);
 assert.equal((await api('GET','/events?q=Synthetic')).total,0);
 await api('PUT','/events/'+one.id+'/rsvp',{status:'interested',audience:'private'},viewer,404);
 const {rsvps:[duringVenueHold]}=await api('GET','/events/rsvps/mine',null,viewer);
 assert.equal(duringVenueHold.event_id,one.id);assert.equal(duringVenueHold.revision,beforeBackout.revision);
 assert.equal(duringVenueHold.event_available,false);assert.equal(duringVenueHold.title,null);assert.equal(duringVenueHold.date,null);
 await pool.query('DELETE FROM venues WHERE id=$1',[dup]);
 await pool.query("UPDATE venues SET address='82 Beverly Street' WHERE id=$1",[venue]);
 await api('GET','/events/'+one.id,null,null,404);
 await pool.query("UPDATE venues SET address='80 Beverly Street' WHERE id=$1",[venue]);
 assert.equal((await api('GET','/events/'+one.id)).event.id,one.id);
 console.log('PASS post-review venue ambiguity and linked identity drift hide the pilot without changing its existing private RSVP');

 // Prove the flag can stop forward writes without stranding a published event.
 delete process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE;
 await post(first,503);
 await api('GET','/events/'+one.id);
 await api('PUT','/admin/events/'+two.id+'/source-review',reviews(two),admin,503);
 await api('PUT',reviewPath,reviews(one,'rejected'),viewer,403);
 await api('PUT',reviewPath,{...reviews(one,'rejected'),source_url:two.source_url},admin,409);
 // This is a QA-only retraction. A production mode must still refuse it.
 const previousEnv=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 try { await api('PUT',reviewPath,reviews(one,'rejected'),admin,503); }
 finally { process.env.NODE_ENV=previousEnv; }
 await api('PUT',reviewPath,reviews(one,'rejected'),admin);
 await api('PUT',reviewPath,reviews(one,'rejected'),admin);
 await api('GET','/events/'+one.id,null,null,404);
 assert.equal((await api('GET','/events?q=Synthetic')).total,0);
 const {rsvps:[mine]}=await api('GET','/events/rsvps/mine',null,viewer);
 assert.equal(mine.event_id,one.id);assert.equal(mine.revision,beforeBackout.revision);
 assert.equal(mine.event_available,false);assert.equal(mine.title,null);
 assert.deepEqual((await pool.query("SELECT status FROM event_source_reviews WHERE event_id=$1 ORDER BY created_at",[one.id])).rows,
   [{status:'reviewed'},{status:'rejected'}]);
 assert.equal((await pool.query("SELECT event_id FROM official_event_occurrences WHERE occurrence_key=$1",[one.external_id])).rows[0].event_id,one.id);
 await api('PUT',reviewPath,reviews(one),admin,503);
 process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE='local-test';
 await api('PUT',reviewPath,reviews(one),admin,409);
 const hidden=await post();
 assert.equal(hidden.event.id,one.id);assert.equal(hidden.event.source_review_status,'rejected');
 assert.deepEqual((await pool.query('SELECT event_id,revision FROM event_rsvps WHERE event_id=$1',[one.id])).rows,[{event_id:one.id,revision:beforeBackout.revision}]);
 console.log('PASS disabling forward writes leaves exact retraction available: guest list/detail/search hide, one audit, exact mapping and private RSVP survive; no replay');
 const legacy={title:'Synthetic older import',date:day,start_time:'20:00',venue_id:venue};
 const {event:old}=await post(legacy);
 const legacyStage=mk('qa-legacy-hold','20:00',legacy.title);
 assert.equal((await post(legacyStage,409)).code,'OFFICIAL_LEGACY_EVENT_HOLD');
 const onlyLink=mk('qa-legacy-link-only','18:00','Different synthetic title');
 const {event:oldLink}=await post({...legacy,title:'Alternate legacy title',event_url:onlyLink.source_url+'/?ref=legacy'});
 assert.equal((await post(onlyLink,409)).code,'OFFICIAL_LEGACY_EVENT_HOLD');
 await api('DELETE','/admin/events/'+oldLink.id,null,admin);
 const legacyReview='/admin/events/'+old.id+'/source-review';
 await api('PUT',legacyReview,{...reviews(two),source_url:legacyStage.source_url},admin,409);
 const unbound={source:'official_venue',source_url:legacyStage.source_url,external_id:legacyStage.external_id,status:'reviewed'};
 await api('PUT',legacyReview,unbound,admin,409);
 await api('PUT',legacyReview,{...unbound,external_id:null},admin,409);
 await api('PUT',legacyReview,{...unbound,external_id:null,source:'organizer'},admin,409);
 await api('PUT',legacyReview,{...unbound,external_id:null,source_url:unbound.source_url.replace('.com/','.com./')},admin,409);
 // Historic records can already exist; direct local seed simulates prior state under old routing.
 await pool.query("UPDATE events SET source='official_venue',source_url=$2,external_id=$3,source_review_status='reviewed',source_reviewed_at=now() WHERE id=$1",[old.id,legacyStage.source_url,legacyStage.external_id]);
 assert.equal((await post({...legacyStage,title:'New spelling'},409)).code,'OFFICIAL_LEGACY_EVENT_HOLD');
 await api('PATCH','/admin/events/'+old.id,{title:'Legacy revised'},admin);
 await api('DELETE','/admin/events/'+old.id,null,admin);
 console.log('PASS legacy duplicates are held instead of adopted, existing manual create/review/edit/delete still work');

 // A disabled importer still owns the identities it has already staged. Legacy
 // POST/PATCH/source review must neither duplicate them nor change private RSVPs
 // or append an audit record when a conflicting write is rejected.
 const manualBody=(candidate,extra={})=>({title:candidate.title,date:candidate.date,
   start_time:candidate.start_time,venue_id:candidate.venue_id,...extra});
 const sourceAliases=url=>[
   url.replace('https://tickets.citywinery.com','https://TICKETS.CITYWINERY.COM:443')+'/?ref=legacy#details',
   url.replace('tickets.citywinery.com/','tickets.citywinery.com./')+'/#details',
   url.replace('tickets.citywinery.com/','tickets.%63itywinery.com/')+'/?ref=encoded-letter',
   url.replace('tickets.citywinery.com/','tickets.citywinery%2ecom/')+'/#encoded-dot',
 ];
 const eventSnapshot=async id=>(await pool.query(`SELECT to_jsonb(e) AS event,
   (SELECT to_jsonb(o) FROM official_event_occurrences o WHERE o.event_id=e.id) AS mapping,
   (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb)
     FROM event_source_reviews a WHERE a.event_id=e.id) AS audit,
   (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.user_id),'[]'::jsonb)
     FROM event_rsvps r WHERE r.event_id=e.id) AS rsvps
   FROM events e WHERE e.id=$1`,[id])).rows;
 const protectedBefore=await eventSnapshot(one.id);
 delete process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE;
 for(const start_time of [first.start_time,first.start_time+':00','']){
   await post(manualBody(first,{title:'  '+first.title.toUpperCase()+'  ',start_time}),409);
 }
 for(const event_url of sourceAliases(first.source_url)){
   await post(manualBody(first,{title:'QA differently named link duplicate',venue_id:differentVenue,event_url}),409);
 }
 const {event:editable}=await post(manualBody(first,{title:'QA unrelated editable event'}));
 const editableReview='/admin/events/'+editable.id+'/source-review';
 await api('PUT',editableReview,{source:'organizer',source_url:'https://example.com/qa-unrelated-event',
   external_id:'qa-unrelated-event',status:'reviewed'},admin);
 await api('PUT','/events/'+editable.id+'/rsvp',{status:'interested',audience:'private'},viewer);
 const editableBefore=await eventSnapshot(editable.id);
 await api('PATCH','/admin/events/'+editable.id,{title:first.title},admin,409);
 await api('PATCH','/admin/events/'+editable.id,{event_url:first.source_url+'/?ref=patch'},admin,409);
 await api('PUT',editableReview,{source:'organizer',source_url:first.source_url+'/?ref=review',
   external_id:null,status:'reviewed'},admin,409);
 await api('PUT',editableReview,{source:'official_venue',source_url:'https://example.com/qa-other-url',
   external_id:first.external_id,status:'reviewed'},admin,409);
 await api('PUT',editableReview,{source:'organizer',source_url:'https://example.com/qa-other-url',
   external_id:one.external_id,status:'reviewed'},admin,409);
 // Immutable submitted facts reserve the original occurrence even if an old
 // writer has drifted the current display fields outside these HTTP routes.
 try {
   await pool.query("UPDATE events SET title='QA external title drift' WHERE id=$1",[one.id]);
   await post(manualBody(first),409);
 } finally {await pool.query('UPDATE events SET title=$2 WHERE id=$1',[one.id,first.title]);}
 assert.deepEqual(await eventSnapshot(one.id),protectedBefore);
 assert.deepEqual(await eventSnapshot(editable.id),editableBefore);
 await api('PATCH','/admin/events/'+editable.id,{description:'QA unrelated edit still allowed'},admin);
 assert.deepEqual((await eventSnapshot(editable.id))[0].rsvps,editableBefore[0].rsvps);
 await api('DELETE','/admin/events/'+editable.id,null,admin);
 process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE='local-test';
 console.log('PASS legacy POST, merged PATCH and source review hold managed identities with staging OFF; immutable facts, audit and private RSVPs survive');
 for(const aliasIndex of sourceAliases(first.source_url).keys()){
   const candidate=mk('qa-legacy-url-alias-'+aliasIndex,'21:05','QA alias occurrence '+aliasIndex);
   const {event:aliased}=await post(manualBody(candidate,{title:'QA unrelated alias title '+aliasIndex,
     venue_id:differentVenue,event_url:sourceAliases(candidate.source_url)[aliasIndex]}));
   assert.equal((await post(candidate,409)).code,'OFFICIAL_LEGACY_EVENT_HOLD');
   await api('DELETE','/admin/events/'+aliased.id,null,admin);
 }
 console.log('PASS URL-only identity holds in both directions for uppercase/default-port, trailing-dot and encoded host aliases');

 // Queue each HTTP writer behind a real PostgreSQL session. Observe the first
 // waiter before starting the second, then observe both before releasing them.
 // The two orders prove that the winner commits before the loser checks facts;
 // simply firing Promise.all would not reliably exercise the original race.
 const orderedWriterRace=async(firstWrite,secondWrite)=>{
   const blocker=await pool.connect(),pending=[];
   let gateError;
   const waitFor=async count=>{
     const deadline=Date.now()+2500;
     do {
       const {rows:[{n}]}=await pool.query(`SELECT count(*)::int n FROM pg_stat_activity
         WHERE datname=current_database() AND wait_event_type='Lock'
           AND lower(wait_event)='advisory' AND query LIKE '%pg_advisory_xact_lock%'`);
       if(n>=count)return;
       await new Promise(resolve=>setTimeout(resolve,15));
     }while(Date.now()<deadline);
     assert.fail('Expected '+count+' native PostgreSQL event-writer advisory waiters');
   };
   try {
     await blocker.query('BEGIN');
     await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:official-event:writes']);
     pending.push(firstWrite());pending[0].catch(()=>{});
     await waitFor(1);
     pending.push(secondWrite());pending[1].catch(()=>{});
     await waitFor(2);
   }catch(error){gateError=error;}
   finally {await blocker.query('ROLLBACK');blocker.release();}
   const settled=await Promise.allSettled(pending);
   if(gateError)throw gateError;
   for(const result of settled)if(result.status==='rejected')throw result.reason;
   return settled.map(result=>result.value);
 };
 const mappedCount=async candidate=>(await pool.query('SELECT count(*)::int n FROM official_event_occurrences WHERE occurrence_key=$1',
   ['city-winery-boston:'+candidate.external_id])).rows[0].n;
 const matchingFactCount=async candidate=>(await pool.query(`SELECT count(*)::int n FROM events
   WHERE venue_id=$1 AND date=$2::date AND lower(btrim(title))=lower($3)
     AND btrim(COALESCE(start_time,'')) IN ('',$4,$4||':00')`,
   [candidate.venue_id,candidate.date,candidate.title,candidate.start_time])).rows[0].n;
 for(const manualFirst of [true,false]){
   const candidate=mk('qa-create-race-'+(manualFirst?'legacy-first':'stage-first'),'21:10',
     'QA create race '+(manualFirst?'legacy first':'stage first'));
   const legacyRequest=()=>post(manualBody(candidate,{title:' '+candidate.title.toUpperCase()+' ',
     start_time:candidate.start_time+':00'}),manualFirst?200:409);
   const stageRequest=()=>post(candidate,manualFirst?409:200);
   const results=await orderedWriterRace(...(manualFirst?[legacyRequest,stageRequest]:[stageRequest,legacyRequest]));
   assert.equal(await matchingFactCount(candidate),1);
   assert.equal(await mappedCount(candidate),manualFirst?0:1);
   if(manualFirst){
     assert.equal(results[1].code,'OFFICIAL_LEGACY_EVENT_HOLD');
     await api('DELETE','/admin/events/'+results[0].event.id,null,admin);
   }else assert.equal((await post(candidate)).event.id,results[0].event.id);
 }
 console.log('PASS native queued legacy POST versus official stage in both orders commits exactly one occurrence');
 for(const manualFirst of [true,false]){
   const candidate=mk('qa-patch-race-'+(manualFirst?'legacy-first':'stage-first'),'21:20',
     'QA patch race '+(manualFirst?'legacy first':'stage first'));
   const {event:target}=await post(manualBody(candidate,{title:'QA editable '+candidate.external_id}));
   const beforePatch=await eventSnapshot(target.id);
   const legacyRequest=()=>api('PATCH','/admin/events/'+target.id,{title:candidate.title},admin,manualFirst?200:409);
   const stageRequest=()=>post(candidate,manualFirst?409:200);
   const results=await orderedWriterRace(...(manualFirst?[legacyRequest,stageRequest]:[stageRequest,legacyRequest]));
   assert.equal(await matchingFactCount(candidate),1);
   assert.equal(await mappedCount(candidate),manualFirst?0:1);
   if(manualFirst)assert.equal(results[1].code,'OFFICIAL_LEGACY_EVENT_HOLD');
   else assert.deepEqual(await eventSnapshot(target.id),beforePatch);
   await api('DELETE','/admin/events/'+target.id,null,admin);
 }
 console.log('PASS native queued legacy PATCH versus official stage in both orders holds the losing write atomically');
 for(const manualFirst of [true,false]){
   const candidate=mk('qa-review-race-'+(manualFirst?'legacy-first':'stage-first'),'21:30',
     'QA source review race '+(manualFirst?'legacy first':'stage first'));
   const {event:target}=await post(manualBody(candidate,{title:'QA source review '+candidate.external_id,venue_id:differentVenue}));
   const beforeReview=await eventSnapshot(target.id);
   const legacyRequest=()=>api('PUT','/admin/events/'+target.id+'/source-review',{
     source:'official_venue',source_url:'https://example.com/'+candidate.external_id,
     external_id:candidate.external_id,status:'reviewed'},admin,manualFirst?200:409);
   const stageRequest=()=>post(candidate,manualFirst?409:200);
   const results=await orderedWriterRace(...(manualFirst?[legacyRequest,stageRequest]:[stageRequest,legacyRequest]));
   assert.equal(await mappedCount(candidate),manualFirst?0:1);
   if(manualFirst)assert.equal(results[1].code,'OFFICIAL_LEGACY_EVENT_HOLD');
   else assert.deepEqual(await eventSnapshot(target.id),beforeReview);
   await api('DELETE','/admin/events/'+target.id,null,admin);
 }
 console.log('PASS native queued legacy source review versus official stage in both orders reserves identity without a duplicate audit');

 // Historic legacy duplicates can predate the guard. Hiding their exact stored
 // identity must stay available to a verified operator without erasing history.
 for(const stagingOn of [true,false]){
   if(stagingOn)process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE='local-test';
   else delete process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE;
   const historicalId=crypto.randomUUID();
   const historical=manualBody(first,stagingOn?{title:'QA historical source-only duplicate',venue_id:differentVenue}:{});
   const identity=stagingOn?{source:'official_venue',source_url:first.source_url.replace('tickets.citywinery.com/','tickets.%63itywinery.com/'),external_id:first.external_id}:
     {source:'organizer',source_url:'https://example.com/qa-historical-fact-duplicate',external_id:'qa-historical-fact-duplicate'};
   await pool.query(`INSERT INTO events(id,title,venue_id,date,start_time,source,source_url,external_id,
     source_review_status,source_reviewed_at,source_reviewed_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'reviewed',now(),$9)`,
     [historicalId,historical.title,historical.venue_id,historical.date,historical.start_time,
       identity.source,identity.source_url,identity.external_id,u.user.id]);
   await pool.query(`INSERT INTO event_source_reviews(event_id,reviewer_id,source,source_url,external_id,status)
     VALUES($1,$2,$3,$4,$5,'reviewed')`,[historicalId,u.user.id,identity.source,identity.source_url,identity.external_id]);
   await pool.query("INSERT INTO event_rsvps(event_id,user_id,status,audience,revision) VALUES($1,$2,'going','private',9)",[historicalId,v.user.id]);
   const beforeRetraction=(await eventSnapshot(historicalId))[0];
   const reject={...identity,status:'rejected'},historyReview='/admin/events/'+historicalId+'/source-review';
   const publicSearch='/events?q='+encodeURIComponent(historical.title);
   await api('GET','/events/'+historicalId);
   assert((await api('GET',publicSearch)).events.some(event=>event.id===historicalId));
   await api('PUT',historyReview,reject,viewer,403);
   await api('PUT',historyReview,reject,null,403,{'X-Admin-Secret':process.env.ADMIN_SECRET});
   await pool.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[u.user.id]);
   try {await api('PUT',historyReview,reject,admin,403);}
   finally {await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1',[u.user.id]);}
   for(const changed of [
     {source:identity.source==='official_venue'?'organizer':'official_venue'},
     {source_url:'https://example.com/qa-rebound-identity'},
     {external_id:'qa-rebound-identity'},
     {source_url:'https://example.com/qa-rebound-identity',external_id:'qa-rebound-identity'},
   ])await api('PUT',historyReview,{...reject,...changed},admin,409);
   assert.deepEqual((await eventSnapshot(historicalId))[0],beforeRetraction);
   await api('PUT',historyReview,reject,admin);
   const afterRetraction=(await eventSnapshot(historicalId))[0];
   assert.equal(afterRetraction.event.source_review_status,'rejected');
   const withoutReviewFields=({source_review_status,source_reviewed_at,source_reviewed_by,updated_at,...facts})=>facts;
   assert.deepEqual(withoutReviewFields(afterRetraction.event),withoutReviewFields(beforeRetraction.event));
   assert.deepEqual(afterRetraction.rsvps,beforeRetraction.rsvps);
   assert.equal(afterRetraction.audit.length,beforeRetraction.audit.length+1);
   for(const oldAudit of beforeRetraction.audit)assert.deepEqual(afterRetraction.audit.find(row=>row.id===oldAudit.id),oldAudit);
   assert.equal(afterRetraction.audit.filter(row=>row.status==='rejected').length,1);
   await api('PUT',historyReview,reject,admin);
   assert.deepEqual((await eventSnapshot(historicalId))[0],afterRetraction);
   await api('GET','/events/'+historicalId,null,null,404);
   assert(!(await api('GET',publicSearch)).events.some(event=>event.id===historicalId));
   const retained=(await api('GET','/events/rsvps/mine',null,viewer)).rsvps.find(rsvp=>rsvp.event_id===historicalId);
   assert(retained);assert.equal(retained.revision,9);assert.equal(retained.audience,'private');
   assert.equal(retained.event_available,false);assert.equal(retained.title,null);
   await api('PUT',historyReview,{...identity,status:'reviewed'},admin,409);
 }
 process.env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE='local-test';
 console.log('PASS exact verified legacy retraction with staging ON/OFF is idempotent, preserves private RSVPs/history and rejects identity changes or unauthorized bypasses');
 // ON DELETE SET NULL on the event's venue reference must not make it public.
 await api('PUT','/admin/events/'+two.id+'/source-review',reviews(two),admin);
 await pool.query('DELETE FROM venues WHERE id=$1',[venue]);
 await api('GET','/events/'+two.id,null,null,404);
 await post(secondBody,409);
 console.log('PASS loss of the linked venue hides the event and fails closed on retry');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r))};if(pool)await pool.end()});
