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
function enabled(env = process.env) {
  if (env.NODE_ENV!=='test'||env.SCENELINK_OFFICIAL_EVENT_STAGE_MODE!=='local-test') return false;
  try {
    const url=new URL(env.DATABASE_URL);
    return url.protocol==='postgresql:' && url.hostname==='127.0.0.1' && !!url.port &&
      url.pathname==='/scenelink_test_official_occurrences' && !url.search && !url.hash &&
      !/[?#]/.test(env.DATABASE_URL);
  } catch (_) { return false; }
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
async function requirePilotVenue(db, venueId) {
  const {rows}=await db.query(`SELECT name,slug,neighborhood,id FROM venues v
    WHERE ${availableVenueSQL('v')} AND COALESCE(to_jsonb(v)->>'duplicate_of','')=''
      AND lower(btrim(city))='boston' AND lower(btrim(state))='ma'
      AND lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))='city winery boston'
      AND lower(regexp_replace(btrim(address),'[[:space:]]+',' ','g')) IN ('80 beverly street','80 beverly st','80 beverly st.')
    ORDER BY id LIMIT 2 FOR SHARE`);
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
      const prior=await db.query(`SELECT 1 FROM events
        WHERE regexp_replace(regexp_replace(btrim(COALESCE(source_url,'')), '[?#].*$', ''), '/+$', '')=$2
          OR regexp_replace(regexp_replace(btrim(COALESCE(event_url,'')), '[?#].*$', ''), '/+$', '')=$2
          OR external_id=$1 OR (source='official_venue' AND external_id=$3)
          OR (COALESCE(external_id,'') NOT LIKE 'city-winery-boston:%' AND venue_id=$4 AND date=$5::date
              AND lower(btrim(title))=lower($6) AND btrim(COALESCE(start_time,'')) IN ('',$7,$7||':00'))
        LIMIT 1`,[candidate.key,candidate.sourceUrl,body.external_id,candidate.venueId,candidate.date,candidate.title,candidate.startTime]);
      if(prior.rows.length) throw conflict('A legacy event may represent this occurrence. Reconcile it before staging.','OFFICIAL_LEGACY_EVENT_HOLD');
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
async function checkReview(db, req, event, body, url, externalId) {
  if(!reserved(event.external_id)) {
    const isPilotEventSource=new URL(url).hostname.replace(/\.$/,'')==='tickets.citywinery.com';
    if(reserved(externalId)||(enabled()&&isPilotEventSource)) throw conflict('A City Winery occurrence must use its dedicated official staging before source review');
    return false;
  }
  requireReviewer(req);
  if (!enabled()) throw new H.HttpError(503,'Official event source review is disabled','OFFICIAL_EVENT_STAGING_OFF');
  await currentReviewer(db,req);
  const bound=await db.query('SELECT original_facts FROM official_event_occurrences WHERE event_id=$1 AND occurrence_key=$2',[event.id,event.external_id]);
  if(!bound.rows.length || body.source!=='official_venue'||url!==event.source_url||externalId!==event.external_id||
     !['reviewed','rejected'].includes(body.status)) throw conflict('Use the staged source, URL and occurrence identity for explicit review');
  if(event.source_review_status===body.status) return true;
  if(body.status==='reviewed'){
    if(event.source_review_status!=='unreviewed') throw conflict('A rejected occurrence needs separate reconciliation before publication');
    if(!sameStageEvent(event,bound.rows[0].original_facts)) throw conflict('The staged official occurrence changed. Reconcile it before review');
    await requirePilotVenue(db,event.venue_id);
  }
  return false;
}
module.exports={enabled,wantsStage,stage,checkReview,reserved,reservedSQL};
