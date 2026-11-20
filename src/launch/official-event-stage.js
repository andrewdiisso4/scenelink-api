'use strict';
// Deliberate first-party pilot only. The publisher's per-performance ticket
// page is the stable identity, not organizer name, date or event title.
const H = require('./shared');
const {verified} = require('./verification');
const {availableVenueSQL, safePublicHttps} = require('../services/venue-helpers');
const PREFIX = 'city-winery-boston:';
const ORIGIN = 'https://tickets.citywinery.com';
const reserved = value => typeof value === 'string' && value.startsWith(PREFIX);
const reservedSQL = "COALESCE(external_id,'') NOT LIKE 'city-winery-boston:%'";
const conflict = (message, code='OFFICIAL_OCCURRENCE_CONFLICT') => new H.HttpError(409,message,code);
const inputKeys = new Set(['source','source_url','external_id','title','date','start_time','venue_id','category','event_url']);

function wantsStage(body) {
  return body?.source === 'official_venue' || Object.hasOwn(body || {},'external_id')
    || Object.hasOwn(body || {},'source_url');
}
function isolatedTestTarget(env) {
  if (env.NODE_ENV!=='test') return false;
  try {
    const url=new URL(env.DATABASE_URL);
    return url.protocol==='postgresql:' && url.hostname==='127.0.0.1' && !!url.port &&
      url.pathname==='/scenelink_test_official_occurrences' && !url.search && !url.hash &&
      !/[?#]/.test(env.DATABASE_URL);
  } catch (_) { return false; }
}
function enabled(env = process.env) {
  return isolatedTestTarget(env) && env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE==='local-test';
}
// Every mounted event identity writer must take this gate before event, user or
// venue row locks. It remains in force when staging is OFF: a retained/rejected
// occurrence must not be recreated through the older manual routes.
async function serializeWrites(db) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:official-event:writes']);
}
function canonicalEventURL(value) {
  const safe=safePublicHttps(value);
  if(!safe)return null;
  const url=new URL(safe);
  url.hostname=url.hostname.replace(/\.$/,'');
  url.search='';url.hash='';url.pathname=url.pathname.replace(/\/+$/,'');
  return url.href.replace(/\/$/,'');
}
const folded=value=>String(value??'').trim().toLowerCase();
const eventTime=value=>String(value??'').trim().replace(/^(\d{2}:\d{2}):00$/,'$1');
function overlaps(event,facts) {
  const sourceUrl=canonicalEventURL(facts.sourceUrl);
  if(sourceUrl&&[event.source_url,event.event_url].some(value=>canonicalEventURL(value)===sourceUrl))return true;
  if(event.external_id===facts.key || (event.source==='official_venue'&&PREFIX+event.external_id===facts.key))return true;
  // Different explicitly identified performances may share a title/day. A
  // legacy row has no such identity; a missing time is ambiguous, never proof
  // that it is a different performance.
  const a=eventTime(event.start_time),b=eventTime(facts.startTime);
  return !reserved(event.external_id)&&!!event.venue_id&&!!facts.venueId&&
    folded(event.venue_id)===folded(facts.venueId)&&event.date===facts.date&&
    folded(event.title)===folded(facts.title)&&(!a||!b||a===b);
}
async function checkLegacyWrite(db,eventId,changes={}) {
  const {rows:[stored]}=await db.query(`SELECT source,source_url,event_url,external_id,venue_id,title,
    to_char(date,'YYYY-MM-DD') AS date,start_time FROM events WHERE id=$1`,[eventId]);
  const candidate={...stored,...changes};
  // The optional mapping is never a prerequisite for unrelated manual writes.
  // Protect both current reserved facts and immutable original facts when it
  // exists, even if a display field was changed outside the supported routes.
  const {rows:[schema]}=await db.query("SELECT to_regclass('public.official_event_occurrences') AS mapping");
  const facts=await db.query(`SELECT external_id AS key,source_url AS "sourceUrl",venue_id::text AS "venueId",
    to_char(date,'YYYY-MM-DD') AS date,title,start_time AS "startTime" FROM events
    WHERE id<>$1 AND NOT (${reservedSQL})`,[eventId]);
  if(schema.mapping){
    const originals=await db.query('SELECT original_facts FROM official_event_occurrences WHERE event_id<>$1',[eventId]);
    facts.rows.push(...originals.rows.map(row=>row.original_facts));
  }
  if(facts.rows.some(fact=>overlaps(candidate,fact)))throw conflict(
    'A managed official occurrence may represent this event. Reconcile it before changing a legacy event.','OFFICIAL_LEGACY_EVENT_HOLD');
}
function requireReviewer(req) {
  if (!req.user?.id || req.user.role !== 'admin' || !verified(req.user)) {
    throw new H.HttpError(403,'A verified administrator session is required','VERIFIED_ADMIN_REQUIRED');
  }
}
function normalize(body, calendarDate) {
  if (body.source !== 'official_venue' || Object.keys(body).some(k => !inputKeys.has(k))) throw new H.HttpError(400,'Provide only official occurrence and factual event fields');
  const slug = body.external_id;
  if (typeof slug !== 'string' || slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new H.HttpError(400,'Specify the official per-performance occurrence slug');
  const sourceUrl = ORIGIN+'/event/'+slug;
  if (body.source_url !== sourceUrl || safePublicHttps(body.source_url) !== sourceUrl) throw new H.HttpError(400,'The occurrence slug must match its exact official City Winery ticket page');
  if (body.event_url != null && body.event_url !== sourceUrl) throw new H.HttpError(400,'An optional external link must be the same official event page');
  if (typeof body.start_time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.start_time)) throw new H.HttpError(400,'Specify a Boston-local start time in HH:MM');
  return { key:PREFIX+slug, sourceUrl, venueId:H.id(body.venue_id,'venue'),
    title:H.text(body.title,'title',200,{required:true}), date:calendarDate(body.date),
    startTime:body.start_time, category:H.text(body.category,'category',80)||null, eventUrl:body.event_url==null?null:sourceUrl };
}
// Use the same eligibility on review and public reads; an added matching
// record can make a previously reviewed venue ambiguous without editing it.
// Conservatively hold even an annotated sibling while it is visibly operational.
function pilotVenueIdentitySQL(alias) {
  return `${availableVenueSQL(alias)}
      AND lower(btrim(${alias}.city))='boston' AND lower(btrim(${alias}.state))='ma'
      AND lower(regexp_replace(btrim(${alias}.name),'[[:space:]]+',' ','g'))='city winery boston'
      AND lower(regexp_replace(btrim(${alias}.address),'[[:space:]]+',' ','g')) IN ('80 beverly street','80 beverly st','80 beverly st.')`;
}
function pilotVenuePublicSQL(alias) {
  const sibling='official_sibling';
  return `(${pilotVenueIdentitySQL(alias)} AND COALESCE(to_jsonb(${alias})->>'duplicate_of','')=''
    AND NOT EXISTS (SELECT 1 FROM venues ${sibling}
      WHERE ${sibling}.id<>${alias}.id AND ${pilotVenueIdentitySQL(sibling)}))`;
}
async function requirePilotVenue(db, venueId) {
  const {rows}=await db.query(`SELECT name,slug,neighborhood,id FROM venues v
    WHERE ${pilotVenuePublicSQL('v')} ORDER BY id LIMIT 2 FOR SHARE`);
  if (rows.length!==1 || rows[0].id!==venueId) throw conflict('The exact active City Winery Boston venue match needs review','OFFICIAL_VENUE_UNRESOLVED');
  return rows[0];
}
async function currentReviewer(db,req) {
  const r = await db.query(`SELECT u.email,u.email_verified_at,u.verified_email
    FROM users u WHERE u.id=$1 AND u.auth_version=$2 AND u.role='admin'
    AND u.is_active IS TRUE AND NOT COALESCE(u.is_suspended,false)
    AND NOT EXISTS (SELECT 1 FROM auth_revocations r WHERE r.token_hash=$3 AND r.expires_at>now())
    FOR SHARE OF u`,[req.user.id,req.user.auth_version,req.authTokenHash]);
  if(!r.rows.length || !verified(r.rows[0])) throw new H.HttpError(403,'A verified administrator session is required','VERIFIED_ADMIN_REQUIRED');
}
function sameStageEvent(event,facts) {
  return event.is_active===true && event.source==='official_venue' && event.external_id===facts.key
    && event.source_url===facts.sourceUrl && event.venue_id===facts.venueId && event.title===facts.title
    && event.stage_date===facts.date && event.start_time===facts.startTime
    && event.category===facts.category && event.event_url===facts.eventUrl;
}
async function stage(pool, body, req, calendarDate) {
  requireReviewer(req);
  if (!enabled()) throw new H.HttpError(503,'Official event staging is disabled','OFFICIAL_EVENT_STAGING_OFF');
  const candidate=normalize(body,calendarDate);
  const facts=JSON.stringify(candidate);
  try {
    return await H.transaction(pool,async db=>{
      await serializeWrites(db);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:official-event:'+candidate.key]);
      await currentReviewer(db,req);
      const current=await db.query(`SELECT e.*,to_char(e.date,'YYYY-MM-DD') AS stage_date,o.original_facts=$2::jsonb AS same_original_facts
        FROM official_event_occurrences o JOIN events e ON e.id=o.event_id WHERE o.occurrence_key=$1 FOR UPDATE OF e`,[candidate.key,facts]);
      if(current.rows.length) {
        const {same_original_facts,stage_date,...event}=current.rows[0];
        if(!same_original_facts) throw conflict('That official occurrence is already staged with different facts. Review the existing event rather than creating another.');
        if(!sameStageEvent({...event,stage_date},candidate)) {
          throw conflict('The existing official occurrence needs manual reconciliation');
        }
        return {ok:true,event,replayed:true};
      }
      const venue=await requirePilotVenue(db,candidate.venueId);
      const prior=await db.query(`SELECT source,source_url,event_url,external_id,venue_id,title,
        to_char(date,'YYYY-MM-DD') AS date,start_time FROM events
        WHERE NULLIF(btrim(source_url),'') IS NOT NULL OR NULLIF(btrim(event_url),'') IS NOT NULL
          OR external_id IN ($1,$2) OR (venue_id=$3 AND date=$4::date)`,
        [candidate.key,body.external_id,candidate.venueId,candidate.date]);
      if(prior.rows.some(event=>overlaps(event,candidate))) throw conflict('A legacy event may represent this occurrence. Reconcile it before staging.','OFFICIAL_LEGACY_EVENT_HOLD');
      const {rows:[event]}=await db.query(`INSERT INTO events
        (title,category,venue_id,venue_name,venue_slug,venue_neighborhood,date,start_time,event_url,source,source_url,external_id,source_review_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'official_venue',$10,$11,'unreviewed') RETURNING *`,
      [candidate.title,candidate.category,candidate.venueId,venue.name,venue.slug,venue.neighborhood,candidate.date,candidate.startTime,candidate.eventUrl,candidate.sourceUrl,candidate.key]);
      await db.query('INSERT INTO official_event_occurrences(occurrence_key,event_id,original_facts,staged_by) VALUES($1,$2,$3,$4)',
        [candidate.key,event.id,facts,req.user.id]);
      return {ok:true,event,replayed:false};
    });
  } catch(err) {
    if(err.code==='42P01') throw new H.HttpError(503,'The official-event staging migration has not been applied');
    throw err;
  }
}
function isExactRetraction(event,body,url,externalId) {
  return body.status==='rejected'&&body.source===event.source&&body.source_url===event.source_url&&
    url===safePublicHttps(event.source_url)&&(body.external_id??null)===event.external_id&&
    externalId===(typeof event.external_id==='string'?event.external_id.trim()||null:null);
}
async function checkReview(db, req, event, body, url, externalId) {
  if(!reserved(event.external_id)) {
    // Historical duplicates may already be public. A verified operator must
    // still be able to hide the exact existing identity, without rebinding it,
    // hard-deleting history, or losing private RSVPs.
    if(isExactRetraction(event,body,url,externalId)) {
      requireReviewer(req);await currentReviewer(db,req);
      return event.source_review_status==='rejected';
    }
    const isPilotEventSource=new URL(url).hostname.replace(/\.$/,'')==='tickets.citywinery.com';
    if(reserved(externalId)||(enabled()&&isPilotEventSource)) throw conflict('A City Winery occurrence must use its dedicated official staging before source review');
    return false;
  }
  requireReviewer(req);
  // OFF stops all forward progress, not the emergency ability to retract
  // an exact existing mapping inside this same isolated test target.
  if (!isolatedTestTarget(process.env) || (body.status !== 'rejected' && !enabled())) {
    throw new H.HttpError(503,'Official event source review is disabled','OFFICIAL_EVENT_STAGING_OFF');
  }
  await currentReviewer(db,req);
  let bound;
  try {
    bound=await db.query('SELECT original_facts FROM official_event_occurrences WHERE event_id=$1 AND occurrence_key=$2',[event.id,event.external_id]);
  } catch(err) {
    if(err.code==='42P01') throw new H.HttpError(503,'The official-event staging migration has not been applied');
    throw err;
  }
  if(!bound.rows.length || body.source!=='official_venue'||body.source_url!==url||body.external_id!==externalId||
     url!==event.source_url||externalId!==event.external_id||bound.rows[0].original_facts?.sourceUrl!==url||
     !['reviewed','rejected'].includes(body.status)) throw conflict('Use the staged source, URL and occurrence identity for explicit review');
  if(event.source_review_status===body.status) return true;
  if(body.status==='reviewed'){
    if(event.source_review_status!=='unreviewed') throw conflict('A rejected occurrence needs separate reconciliation before publication');
    if(!sameStageEvent(event,bound.rows[0].original_facts)) throw conflict('The staged official occurrence changed. Reconcile it before review');
    await requirePilotVenue(db,event.venue_id);
  }
  return false;
}
module.exports={enabled,wantsStage,stage,checkReview,reserved,reservedSQL,pilotVenuePublicSQL,serializeWrites,checkLegacyWrite,isExactRetraction};
