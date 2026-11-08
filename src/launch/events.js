'use strict';
// SceneLink attendance intent only. No payment, ticket inventory, capacity promise,
// provider request, or provider confirmation is created by these endpoints.
const H=require('./shared');
const {safePublicHttps,availableVenueSQL}=require('../services/venue-helpers');
const SOURCES=new Set(['official_venue','organizer','ticketmaster','eventbrite']);
const STATUSES=new Set(['going','interested','not_going']);
function PUBLIC_EVENT(e='e',v='v') {
  return `${e}.is_active IS TRUE AND ${e}.source_review_status='reviewed' AND ${e}.source_reviewed_at IS NOT NULL
    AND ${e}.source IN ('official_venue','organizer','ticketmaster','eventbrite')
    AND ${e}.source_url ~ '^https://[^[:space:]]+$' AND ${e}.date IS NOT NULL
    AND (${e}.venue_id IS NULL OR (${availableVenueSQL(v)}))`;
}
// Counts deliberately exclude private RSVPs, private accounts, suspended/deleted users,
// seeded attendance metrics and individual identities. This is not venue attendance.
const EVENT_COLUMNS=`e.id,e.title,e.description,e.category,e.venue_id,
  CASE WHEN e.venue_id IS NOT NULL THEN v.name ELSE e.venue_name END AS venue_name,
  CASE WHEN e.venue_id IS NOT NULL THEN v.slug ELSE e.venue_slug END AS venue_slug,
  CASE WHEN e.venue_id IS NOT NULL THEN v.neighborhood ELSE e.venue_neighborhood END AS venue_neighborhood,
  e.image_url,to_char(e.date,'YYYY-MM-DD') AS date,e.start_time,e.end_time,e.price,
  e.is_featured,false AS is_live,NULL::numeric AS rating,e.created_at,e.updated_at,e.event_url,
  e.source,e.external_id,e.source_url,e.source_review_status,e.source_reviewed_at,
  v.lat AS venue_lat,v.lng AS venue_lng,
  (SELECT count(*)::int FROM event_rsvps er JOIN users attendee ON attendee.id=er.user_id
    WHERE er.event_id=e.id AND er.status='going' AND er.audience='public'
      AND attendee.is_active IS TRUE AND COALESCE(attendee.is_suspended,false)=false
      AND COALESCE(attendee.is_private,false)=false) AS attending_count`;
function safeURL(value) {
  return safePublicHttps(value);
}
function publicEvent(row) {
  const event={...row,image_url:safeURL(row.image_url),event_url:safeURL(row.event_url),source_url:safeURL(row.source_url),
    my_rsvp:row.my_rsvp??null,my_rsvp_audience:row.my_rsvp_audience??null,my_rsvp_revision:row.my_rsvp_revision??null,
    attending_count_source:'public_scenelink_rsvps',rsvp_is_reservation:false,booking_status:'not_booked',
    booking:{status:safeURL(row.event_url)?'external_link':'not_available',url:safeURL(row.event_url),reservation_confirmed:false,requires_external_confirmation:true}};
  return event;
}
function calendarDate(value,name='date') {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new H.HttpError(400,'Invalid '+name);
  const d=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new H.HttpError(400,'Invalid '+name);
  return value;
}
async function serialize(db,eventId,userId) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:event-rsvp:'+eventId+':'+userId]);
}
async function event(db,eventId,{lock=false,upcoming=false}={}) {
  const r=await db.query(`SELECT e.id,e.date FROM events e LEFT JOIN venues v ON v.id=e.venue_id
    WHERE e.id=$1 AND ${PUBLIC_EVENT()} ${upcoming?'AND e.date>=CURRENT_DATE':''} ${lock?'FOR UPDATE OF e':''}`,[eventId]);
  if(!r.rows.length)throw new H.HttpError(404,'Event unavailable');
  return r.rows[0];
}
function install({router,pool,auth,write}) {
  const secured=[auth.requireAuth,H.noStore];
  const personal=`mine.status AS my_rsvp,mine.audience AS my_rsvp_audience,mine.revision AS my_rsvp_revision`;
  router.get('/events',auth.optionalAuth,H.noStore,H.wrap(async(req,res)=>{
    const values=[req.user?.id||null],conditions=[PUBLIC_EVENT()];
    const add=x=>{values.push(x);return '$'+values.length;};
    if(req.query.include_past!=='true')conditions.push('e.date>=CURRENT_DATE');
    if(req.query.date)conditions.push('e.date='+add(calendarDate(req.query.date))+'::date');
    if(req.query.venue_id)conditions.push('e.venue_id='+add(H.id(req.query.venue_id,'venue'))+'::uuid');
    if(req.query.category&&req.query.category!=='all')conditions.push('e.category ILIKE '+add('%'+H.like(H.text(req.query.category,'category',100))+'%'));
    if(req.query.is_featured==='true')conditions.push('e.is_featured IS TRUE');
    if(req.query.q)conditions.push(`concat_ws(' ',e.title,e.description,CASE WHEN e.venue_id IS NOT NULL THEN v.name ELSE e.venue_name END) ILIKE ${add('%'+H.like(H.text(req.query.q,'search',160))+'%')}`);
    const limit=H.integer(req.query.limit,24,1,100),offset=H.integer(req.query.offset,0,0,100000,'offset');
    const join='FROM events e LEFT JOIN venues v ON v.id=e.venue_id LEFT JOIN event_rsvps mine ON mine.event_id=e.id AND mine.user_id=$1';
    const count=await pool.query(`SELECT count(*)::int total ${join} WHERE ${conditions.join(' AND ')}`,values);
    const r=await pool.query(`SELECT ${EVENT_COLUMNS},${personal} ${join} WHERE ${conditions.join(' AND ')}
      ORDER BY e.date,e.start_time NULLS LAST,e.id LIMIT ${add(limit)} OFFSET ${add(offset)}`,values);
    res.json({events:r.rows.map(publicEvent),total:count.rows[0].total,limit,offset,has_more:offset+r.rows.length<count.rows[0].total});
  }));
  router.get('/events/rsvps/mine',...secured,H.wrap(async(req,res)=>{
    const limit=H.integer(req.query.limit,30,1,100),offset=H.integer(req.query.offset,0,0,100000,'offset');
    // A revoked/unreviewed event remains removable from one's own RSVP list without
    // disclosing the event's now-unpublished descriptive content.
    const r=await pool.query(`SELECT er.event_id,er.status,er.audience,er.revision,er.created_at,er.updated_at,
      COALESCE((${PUBLIC_EVENT()}),false) AS event_available,
      CASE WHEN ${PUBLIC_EVENT()} THEN e.title ELSE NULL END AS title,
      CASE WHEN ${PUBLIC_EVENT()} THEN to_char(e.date,'YYYY-MM-DD') ELSE NULL END AS date
      FROM event_rsvps er JOIN events e ON e.id=er.event_id LEFT JOIN venues v ON v.id=e.venue_id
      WHERE er.user_id=$1 ORDER BY er.updated_at DESC,er.event_id LIMIT $2 OFFSET $3`,[req.user.id,limit+1,offset]);
    res.json({rsvps:r.rows.slice(0,limit).map(row=>({...row,rsvp_is_reservation:false,booking_status:'not_booked'})),has_more:r.rows.length>limit,offset});
  }));
  router.get('/events/:eventId',auth.optionalAuth,H.noStore,H.wrap(async(req,res)=>{
    const eventId=H.id(req.params.eventId,'event');
    const r=await pool.query(`SELECT ${EVENT_COLUMNS},${personal} FROM events e LEFT JOIN venues v ON v.id=e.venue_id
      LEFT JOIN event_rsvps mine ON mine.event_id=e.id AND mine.user_id=$1 WHERE e.id=$2 AND ${PUBLIC_EVENT()}`,[req.user?.id||null,eventId]);
    if(!r.rows.length)throw new H.HttpError(404,'Event unavailable');
    res.json({event:publicEvent(r.rows[0])});
  }));
  router.put('/events/:eventId/rsvp',...secured,write,H.wrap(async(req,res)=>{
    const eventId=H.id(req.params.eventId,'event'),me=req.user.id,b=req.body||{};
    if(!STATUSES.has(b.status))throw new H.HttpError(400,'Choose going, interested, or not_going');
    if(b.audience!==undefined&&!['private','public'].includes(b.audience))throw new H.HttpError(400,'RSVP audience must be private or public');
    const expectedRevision=b.revision===undefined?undefined:H.integer(b.revision,undefined,0,2147483647,'revision');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,eventId,me);await event(db,eventId,{lock:true,upcoming:true});
      const old=(await db.query('SELECT * FROM event_rsvps WHERE event_id=$1 AND user_id=$2 FOR UPDATE',[eventId,me])).rows[0];
      const audience=b.audience??old?.audience??'private';
      // Identical retries do not advance revisions or inflate counts.
      if(old?.status===b.status&&old.audience===audience)return {rsvp:old,replayed:true};
      if(expectedRevision!==undefined&&expectedRevision!==(old?.revision??0))throw new H.HttpError(409,'Your RSVP changed. Refresh before trying again.','STALE_RSVP');
      const r=await db.query(`INSERT INTO event_rsvps(event_id,user_id,status,audience) VALUES($1,$2,$3,$4)
        ON CONFLICT(event_id,user_id) DO UPDATE SET status=EXCLUDED.status,audience=EXCLUDED.audience,revision=event_rsvps.revision+1,updated_at=clock_timestamp()
        RETURNING event_id,status,audience,revision,created_at,updated_at`,[eventId,me,b.status,audience]);
      return {rsvp:r.rows[0],replayed:false};
    });
    delete result.rsvp.user_id;
    res.json({...result,my_rsvp:result.rsvp.status,my_rsvp_audience:result.rsvp.audience,my_rsvp_revision:result.rsvp.revision,rsvp_is_reservation:false,booking_status:'not_booked'});
  }));
  router.delete('/events/:eventId/rsvp',...secured,write,H.wrap(async(req,res)=>{
    const eventId=H.id(req.params.eventId,'event');
    const removed=await H.transaction(pool,async db=>{
      await serialize(db,eventId,req.user.id);
      const r=await db.query('DELETE FROM event_rsvps WHERE event_id=$1 AND user_id=$2 RETURNING event_id',[eventId,req.user.id]);return r.rows.length>0;
    });
    res.json({removed,my_rsvp:null,my_rsvp_audience:null,my_rsvp_revision:null,rsvp_is_reservation:false,booking_status:'not_booked'});
  }));
  // Source review is an explicit operator action, never inferred from a link or seed.
  // Store an append-only review trail and leave all legacy events unreviewed by default.
  router.put('/admin/events/:eventId/source-review',auth.requireAdmin,H.noStore,H.wrap(async(req,res)=>{
    const eventId=H.id(req.params.eventId,'event'),b=req.body||{};
    if(!SOURCES.has(b.source)||!['reviewed','rejected','unreviewed'].includes(b.status))throw new H.HttpError(400,'Choose a supported source and review status');
    const url=safeURL(b.source_url);if(!url)throw new H.HttpError(400,'Provide the official source URL');
    const externalId=H.text(b.external_id,'source identifier',300)||null;
    await H.transaction(pool,async db=>{
      const old=await db.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[eventId]);if(!old.rows.length)throw new H.HttpError(404,'Event unavailable');
      await db.query(`INSERT INTO event_source_reviews(event_id,reviewer_id,source,source_url,external_id,status) VALUES($1,$2,$3,$4,$5,$6)`,[eventId,req.user?.id||null,b.source,url,externalId,b.status]);
      await db.query(`UPDATE events SET source=$2,source_url=$3,external_id=$4,source_review_status=$5,source_reviewed_at=clock_timestamp(),source_reviewed_by=$6,updated_at=clock_timestamp() WHERE id=$1`,[eventId,b.source,url,externalId,b.status,req.user?.id||null]);
    });
    res.json({ok:true,event_id:eventId,source_review_status:b.status,provider_verified:false,reservation_confirmed:false});
  }));
}
module.exports={install,PUBLIC_EVENT,EVENT_COLUMNS,publicEvent,safeURL,calendarDate,SOURCES,STATUSES};
