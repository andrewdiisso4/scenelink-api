'use strict';

// Permissioned, explicitly local QA preview and review. Provider integration only
// stages source data; this workflow is never invoked by a worker or fetcher.
const H = require('./shared');
const { verified } = require('./verification');
const { availableVenueSQL, safePublicHttps } = require('../services/venue-helpers');
const { calendarDate } = require('./events');
const { EVENT_TODAY_SQL } = require('../services/event-calendar');
const PREFIX = '/admin/event-ingestion/ticketmaster/:externalId';
const conflict = (message, code) => new H.HttpError(409, message, code);
const hold = () => conflict('This occurrence needs source reconciliation.', 'EVENT_SOURCE_HOLD');

function enabled(env) {
  if (env.NODE_ENV !== 'test' || env.SCENELINK_EVENT_SOURCE_REVIEW_MODE !== 'local-test') return false;
  try {
    const url = new URL(env.DATABASE_URL);
    return url.protocol === 'postgresql:' && url.hostname === '127.0.0.1'
      && !!url.port && url.pathname === '/scenelink_test_event_review'
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}
function identity(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(value)) throw new H.HttpError(400, 'Invalid event occurrence ID');
  return value;
}
function reviewInput(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).some(key => !['decision','revision','venue_id'].includes(key))
      || !/^[a-f0-9]{64}$/.test(body.revision || '')
      || typeof body.revision !== 'string' || !['publish','cancel'].includes(body.decision)) {
    throw new H.HttpError(400, 'Choose a decision and provide the exact staged revision');
  }
  if (body.decision === 'cancel' && Object.hasOwn(body, 'venue_id')) throw new H.HttpError(400, 'Cancellation cannot change venue');
  return { decision:body.decision, revision:body.revision,
    venueId:body.decision === 'publish' ? H.id(body.venue_id, 'reviewed venue') : null };
}
function stageDecision(s) {
  if (!s.payload || typeof s.payload !== 'object' || s.payload.source !== 'ticketmaster' || s.payload.external_id !== s.external_id
      || s.payload.cancelled !== s.cancelled || s.payload.provider_status !== s.provider_status
      || s.payload.requires_review !== true || s.payload.is_active !== false) return null;
  if (s.cancelled && s.provider_status === 'cancelled') return 'cancel';
  if (!s.cancelled && ['onsale','offsale'].includes(s.provider_status)) return 'publish';
  return null;
}
function publicSource(value) {
  const safe = safePublicHttps(value);
  if (!safe) throw hold();
  const url = new URL(safe);
  if (!['www.ticketmaster.com','ticketmaster.com'].includes(url.hostname)
      || url.port || !url.pathname.startsWith('/event/') || url.pathname === '/event/') throw hold();
  url.search = '';
  url.hash = '';
  return url.href;
}
function sourceVenue(s) {
  const candidates = s.payload.raw?._embedded?.venues;
  if (!Array.isArray(candidates) || candidates.length !== 1) throw hold();
  const v = candidates[0];
  const name = v?.name, street = v?.address?.line1, postal = v?.postalCode;
  if (v?.city?.name !== 'Boston' || v?.state?.stateCode !== 'MA' || v?.country?.countryCode !== 'US'
      || typeof name !== 'string' || !name.trim() || name.length > 255
      || typeof street !== 'string' || !street.trim() || street.length > 300
      || typeof postal !== 'string' || !/^\d{5}$/.test(postal)) throw hold();
  return { name:name.trim(), street:street.trim(), postal };
}
const venueNorm = value => `lower(btrim(regexp_replace(${value},'[[:space:]]+',' ','g')))`;
const canonicalVenue = "to_jsonb(v)->>'duplicate_of' IS NULL";
function scheduledPayload(s) {
  let date;
  try { date = calendarDate(s.payload.local_date, 'source date'); } catch { throw hold(); }
  const {local_time:time, start_at:utc, timezone, title:rawTitle} = s.payload;
  if (timezone !== 'America/New_York' || typeof time !== 'string'
      || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)
      || typeof utc !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(utc)
      || !Number.isFinite(Date.parse(utc)) || utc.slice(0,10) !== new Date(utc).toISOString().slice(0,10)
      || typeof rawTitle !== 'string' || !rawTitle.trim() || rawTitle.trim().length > 500
      || /[\u0000-\u001f\u007f]/.test(rawTitle)) throw hold();
  return {date,time,utc,title:rawTitle.trim()};
}
const fingerprint = sql => `encode(sha256(convert_to((${sql})::text,'UTF8')),'hex')`;
const eventFingerprint = fingerprint('to_jsonb(e)');
const stageFingerprint = fingerprint("jsonb_build_array(s.source,s.external_id,extract(epoch from s.last_seen_at),s.provider_status,s.cancelled,s.payload)");
async function stage(db, externalId, lock) {
  const r = await db.query(`SELECT s.*, ${stageFingerprint} AS revision
    FROM event_ingestion_records s WHERE s.source='ticketmaster' AND s.external_id=$1
      AND s.requires_review AND NOT s.is_active ${lock ? 'FOR UPDATE OF s' : ''}`, [externalId]);
  if (!r.rowCount) throw new H.HttpError(404, 'Staged occurrence unavailable');
  return r.rows[0];
}
async function assertReviewer(db, actor, tokenHash) {
  const r = await db.query(`SELECT u.id,u.email,u.email_verified_at,u.verified_email
    FROM users u WHERE id=$1 AND u.auth_version=$2 AND u.role='admin'
    AND u.is_active AND NOT COALESCE(u.is_suspended,false)
    AND NOT EXISTS (SELECT 1 FROM auth_revocations r WHERE r.token_hash=$3 AND r.expires_at>now())
    FOR SHARE OF u`, [actor.id, actor.auth_version, tokenHash]);
  if (!r.rowCount || !verified(r.rows[0])) throw new H.HttpError(403, 'Verified admin session required');
}
async function getEvent(db, eventId) {
  const r = await db.query(`SELECT e.event_url, e.venue_id, ${eventFingerprint} AS fingerprint FROM events e WHERE e.id=$1 FOR UPDATE OF e`, [eventId]);
  return r.rows[0];
}
async function applyDecision(db, externalId, input, actor, tokenHash) {
  await assertReviewer(db, actor, tokenHash);
  // Lock the real staged record first. A newer source observation and concurrent
  // approvals use the same row lock, so the revision checked is the revision applied.
  const s = await stage(db, externalId, true);
  if (s.revision !== input.revision) throw conflict('Source changed. Refresh the review before retrying.', 'STALE_EVENT_SOURCE');
  if (input.decision !== stageDecision(s)) throw hold();
  const pub = (await db.query("SELECT * FROM event_ingestion_publications WHERE source='ticketmaster' AND external_id=$1", [externalId])).rows[0];
  const old = pub ? await getEvent(db, pub.event_id) : null;
  if (pub && (!old || old.fingerprint !== pub.event_fingerprint)) {
    throw conflict('A manual event change needs reconciliation.', 'EVENT_MANUAL_OVERRIDE');
  }
  if (pub?.revision === s.revision) {
    if (pub.decision === input.decision && (input.decision === 'cancel' || old.venue_id === input.venueId)) {
      return {event_id:pub.event_id,decision:pub.decision,replayed:true};
    }
    throw conflict('This revision already has a different review.', 'EVENT_REVIEW_CONFLICT');
  }
  if ((input.decision === 'cancel' && !pub) || (input.decision === 'publish' && pub?.decision === 'cancel')) {
    throw conflict('A cancelled occurrence needs manual reconciliation.', 'EVENT_CANCELLATION_HOLD');
  }
  const url = publicSource(s.payload?.source_url);
  let eventId = pub?.event_id;
  if (input.decision === 'publish') {
    const p = scheduledPayload(s);
    const valid = (await db.query(`SELECT $1::date >= ${EVENT_TODAY_SQL} AS current,
      to_char($3::timestamptz AT TIME ZONE 'America/New_York','YYYY-MM-DD HH24:MI:SS') = (to_char($1::date,'YYYY-MM-DD') || ' ' || $2::text) AS aligned,
      ($3::timestamptz AT TIME ZONE 'America/New_York') NOT IN
      (($3::timestamptz - interval '1 hour') AT TIME ZONE 'America/New_York',
       ($3::timestamptz + interval '1 hour') AT TIME ZONE 'America/New_York') AS unambiguous`,
    [p.date,p.time,p.utc])).rows[0];
    if (!valid.current || !valid.aligned || !valid.unambiguous) throw hold();
    const venue = sourceVenue(s);
    const v = await db.query(`SELECT id FROM venues v WHERE id=$1 AND ${canonicalVenue} AND ${availableVenueSQL('v')} FOR SHARE OF v`, [input.venueId]);
    if (!v.rowCount) throw conflict('Choose a reviewed, currently available venue.', 'EVENT_VENUE_UNAVAILABLE');
    const matches = await db.query(`SELECT v.id FROM venues v WHERE ${canonicalVenue} AND ${availableVenueSQL('v')}
      AND ${venueNorm('v.name')} = ${venueNorm('$1::text')} AND ${venueNorm('v.address')} = ${venueNorm('$2::text')}
      AND ${venueNorm('v.city')} = 'boston' AND ${venueNorm('v.state')} = 'ma' AND v.zip_code = $3
      ORDER BY v.id LIMIT 2 FOR SHARE OF v`, [venue.name,venue.street,venue.postal]);
    if (matches.rowCount > 1) throw conflict('More than one available venue matches this source.', 'EVENT_VENUE_AMBIGUOUS');
    if (matches.rows[0]?.id !== input.venueId) throw conflict('Source venue does not exactly match the selected catalog record.', 'EVENT_VENUE_MISMATCH');
    if (!pub) {
      // Identity is the provider occurrence, never a title/time heuristic. An
      // existing manually reviewed identity is held, not overwritten or adopted.
      const r = await db.query(`INSERT INTO events(venue_id,title,date,start_time,source,external_id,source_url,
        is_active,source_review_status,source_reviewed_at,source_reviewed_by)
        VALUES($1,$2,$3,$4,'ticketmaster',$5,$6,true,'reviewed',clock_timestamp(),$7)
        ON CONFLICT (source,external_id) WHERE source='ticketmaster' AND external_id IS NOT NULL DO NOTHING RETURNING id`,
      [input.venueId,p.title,p.date,p.time,externalId,url,actor.id]);
      if (!r.rowCount) throw conflict('An existing event already uses this occurrence identity.', 'EVENT_IDENTITY_EXISTS');
      eventId = r.rows[0].id;
    } else {
      await db.query(`UPDATE events SET venue_id=$2,title=$3,date=$4,start_time=$5,source_url=$6,
        source_reviewed_at=clock_timestamp(),source_reviewed_by=$7,updated_at=clock_timestamp() WHERE id=$1`,
      [eventId,input.venueId,p.title,p.date,p.time,url,actor.id]);
    }
  } else {
    await db.query(`UPDATE events SET is_active=false,source_review_status='rejected',source_url=$2,
      source_reviewed_at=clock_timestamp(),source_reviewed_by=$3,updated_at=clock_timestamp() WHERE id=$1`, [eventId,url,actor.id]);
  }
  const next = await getEvent(db, eventId);
  const status = input.decision === 'publish' ? 'reviewed' : 'rejected';
  await db.query(`INSERT INTO event_ingestion_publications(source,external_id,event_id,revision,event_fingerprint,decision)
    VALUES('ticketmaster',$1,$2,$3,$4,$5) ON CONFLICT(source,external_id) DO UPDATE SET
    revision=EXCLUDED.revision,event_fingerprint=EXCLUDED.event_fingerprint,decision=EXCLUDED.decision`, [externalId,eventId,s.revision,next.fingerprint,input.decision]);
  await db.query(`INSERT INTO event_ingestion_publication_reviews(source,external_id,revision,event_id,decision,reviewer_id)
    VALUES('ticketmaster',$1,$2,$3,$4,$5)`, [externalId,s.revision,eventId,input.decision,actor.id]);
  await db.query(`INSERT INTO event_source_reviews(event_id,reviewer_id,source,source_url,external_id,status)
    VALUES($1,$2,'ticketmaster',$3,$4,$5)`, [eventId,actor.id,url,externalId,status]);
  return {event_id:eventId,decision:input.decision,replayed:false};
}
function install({router,pool,auth,write,env=process.env}) {
  const gate=(req,res,next)=>enabled(env) ? next() : res.status(404).json({error:'Endpoint not found'});
  const reviewer=(req,res,next)=>req.user.role === 'admin' && verified(req.user)
    ? next() : res.status(403).json({error:'Verified admin session required'});
  const secured=[H.noStore,gate,auth.requireAuth,reviewer,write];
  router.get(PREFIX,...secured,H.wrap(async (req,res) => {
    const s = await stage(pool, identity(req.params.externalId), false);
    const decision = stageDecision(s);
    let source, schedule, venue;
    try {
      source = publicSource(s.payload?.source_url);
      if (decision === 'publish') { venue = sourceVenue(s); schedule = scheduledPayload(s); }
    } catch (err) { if (err.code !== 'EVENT_SOURCE_HOLD') throw err; }
    res.json({source:'ticketmaster',external_id:s.external_id,revision:s.revision,
      proposed_decision:source && (decision === 'cancel' || schedule) ? decision : null,
      source_url:source || null,schedule:schedule || null,source_venue:venue || null,observed_at:s.last_seen_at,
      provider_status:s.provider_status,requires_review:true});
  }));
  router.put(PREFIX+'/review',...secured,H.wrap(async (req,res) => {
    const externalId=identity(req.params.externalId), input=reviewInput(req.body);
    const result=await H.transaction(pool, async db => {
      await db.query("SET LOCAL TIME ZONE 'UTC'");
      return applyDecision(db,externalId,input,req.user,req.authTokenHash);
    });
    res.json({...result,reservation_confirmed:false});
  }));
}
module.exports={install,enabled};
