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
 await pool.query(fs.readFileSync(path.join(root,'migrations/018_official_event_occurrences.sql'),'utf8'));
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
 // ON DELETE SET NULL on the event's venue reference must not make it public.
 await api('PUT','/admin/events/'+two.id+'/source-review',reviews(two),admin);
 await pool.query('DELETE FROM venues WHERE id=$1',[venue]);
 await api('GET','/events/'+two.id,null,null,404);
 await post(secondBody,409);
 console.log('PASS loss of the linked venue hides the event and fails closed on retry');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r))};if(pool)await pool.end()});
