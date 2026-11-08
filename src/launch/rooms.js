'use strict';
/** Private decision rooms: invitations -> real venues -> votes -> owner's decision.
 * All mutations serialize with a room advisory lock, then canonical pair locks,
 * then a room row lock. These locks are transaction-scoped.
 * No public link grants membership; old itinerary/plan records are left untouched.
 */
const H = require('./shared');
const {availableVenueSQL}=require('../services/venue-helpers');
const MAX_MEMBERS = 20, MAX_OPTIONS = 30;
const AVAILABLE_VENUE=availableVenueSQL('');
const ROOM_MEMBER = `(r.owner_id=$1 OR EXISTS(SELECT 1 FROM launch_room_members mine
  WHERE mine.room_id=r.id AND mine.user_id=$1 AND mine.status='accepted'))`;
// A room cannot reveal a blocked user's identity via its roster or votes.
const ROOM_VISIBLE = `(EXISTS(SELECT 1 FROM users owner WHERE owner.id=r.owner_id AND ${H.actorSQL('owner')})
  AND NOT EXISTS(SELECT 1 FROM launch_room_members member JOIN users other ON other.id=member.user_id
    WHERE member.room_id=r.id AND member.status='accepted' AND other.id<>$1
      AND NOT ${H.actorSQL('other')}))`;
function date(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new H.HttpError(400,'Choose a valid date');
  const d = new Date(value+'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==value || Number(value.slice(0,4))<2020 || Number(value.slice(0,4))>2100) throw new H.HttpError(400,'Choose a valid date');
  return value;
}
function revision(value) { return H.integer(value,undefined,1,2147483647,'revision'); }
function requireRevision(room, value) {
  const n=revision(value);
  if(n===undefined)throw new H.HttpError(428,'Refresh the room before making this change','REVISION_REQUIRED');
  if(room.revision!==n)throw new H.HttpError(409,'This plan changed. Refresh before trying again.','STALE_ROOM');
}
function writable(room) { if(room.state!=='planning')throw new H.HttpError(409,'Reopen the plan before changing its options or votes','ROOM_CLOSED'); }
async function room(db, me, rid, {lock=false, ownerOnly=false, management=false}={}) {
  const r=await db.query(`SELECT r.*,r.owner_id=$1 AS is_owner,(SELECT display_name FROM users WHERE id=r.owner_id) AS owner_name FROM launch_rooms r WHERE r.id=$2
    AND ${ownerOnly?'r.owner_id=$1':ROOM_MEMBER} ${management?'':`AND ${ROOM_VISIBLE}`}${lock?' FOR UPDATE OF r':''}`,[me,rid]);
  if(!r.rows.length)throw new H.HttpError(404,'Plan unavailable');
  return r.rows[0];
}
async function serialize(db,rid) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:room:'+rid]);
}
async function touch(db,rid) { const r=await db.query('UPDATE launch_rooms SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING revision',[rid]);return r.rows[0].revision; }
async function members(db,rid) { return (await db.query('SELECT user_id FROM launch_room_members WHERE room_id=$1 AND status=\'accepted\' ORDER BY user_id',[rid])).rows.map(r=>r.user_id); }
async function lockRoomPairs(db,rid,actor) {
  const r=await db.query(`SELECT owner_id AS user_id FROM launch_rooms WHERE id=$1 UNION SELECT user_id FROM launch_room_members WHERE room_id=$1 AND status='accepted'`,[rid]);
  const ids=[...new Set(r.rows.map(x=>x.user_id).filter(x=>x!==actor))].sort((a,b)=>
    [actor,a].sort().join(':').localeCompare([actor,b].sort().join(':')));
  for(const target of ids)await H.lockPair(db,actor,target);
}
async function full(db,me,rid) {
  const head=await room(db,me,rid);
  const roster=await db.query(`SELECT m.user_id AS id,m.status,u.username,u.display_name,u.avatar_url
    FROM launch_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=$2
    AND (m.status='accepted' OR $1=$3) AND ${H.actorSQL('u')} ORDER BY m.created_at,m.user_id`,[me,rid,head.owner_id]);
  const options=await db.query(`SELECT o.venue_id,v.name,v.slug,v.neighborhood,v.type,v.price_label,(${availableVenueSQL('v')}) AS is_active,
    count(*) FILTER(WHERE vote.choice='yes')::int AS yes_count,
    count(*) FILTER(WHERE vote.choice='maybe')::int AS maybe_count,
    count(*) FILTER(WHERE vote.choice='no')::int AS no_count,
    max(vote.choice) FILTER(WHERE vote.user_id=$1) AS my_vote
    FROM launch_room_options o JOIN venues v ON v.id=o.venue_id
    LEFT JOIN launch_room_votes vote ON vote.room_id=o.room_id AND vote.venue_id=o.venue_id
      AND (vote.user_id=$3 OR EXISTS(SELECT 1 FROM launch_room_members m WHERE m.room_id=o.room_id AND m.user_id=vote.user_id AND m.status='accepted'))
      AND EXISTS(SELECT 1 FROM users actor WHERE actor.id=vote.user_id AND ${H.actorSQL('actor')})
    WHERE o.room_id=$2 GROUP BY o.venue_id,v.id,v.name,v.slug,v.neighborhood,v.type,v.price_label,v.is_active
    ORDER BY yes_count DESC,maybe_count DESC,lower(v.name),v.id`,[me,rid,head.owner_id]);
  return {...head,members:roster.rows,options:options.rows,confirmed_is_reservation:false};
}
function install({router,pool,auth,write}) {
  const secured=[auth.requireAuth,H.noStore];
  router.get('/rooms',...secured,H.wrap(async(req,res)=>{
    const limit=H.integer(req.query.limit,30,1,100),offset=H.integer(req.query.offset,0,0,10000,'offset');
    const r=await pool.query(`SELECT r.id,r.owner_id,r.name,r.event_date,r.state,r.selected_venue_id,r.revision,r.updated_at,
      r.owner_id=$1 AS is_owner,NOT ${ROOM_VISIBLE} AS access_restricted FROM launch_rooms r WHERE r.owner_id=$1 OR (${ROOM_MEMBER} AND ${ROOM_VISIBLE})
      ORDER BY r.updated_at DESC,r.id DESC LIMIT $2 OFFSET $3`,[req.user.id,limit+1,offset]);
    res.json({rooms:r.rows.slice(0,limit),has_more:r.rows.length>limit,offset});
  }));
  router.get('/rooms/invitations',...secured,H.wrap(async(req,res)=>{
    const r=await pool.query(`SELECT r.id,r.name,r.event_date,r.owner_id,u.username AS owner_username,u.display_name AS owner_name,m.created_at+INTERVAL '7 days' AS expires_at
      FROM launch_room_members m JOIN launch_rooms r ON r.id=m.room_id JOIN users u ON u.id=r.owner_id
      WHERE m.user_id=$1 AND m.status='pending' AND m.created_at>NOW()-INTERVAL '7 days' AND r.state<>'cancelled' AND ${H.actorSQL('u')}
      ORDER BY m.created_at DESC,r.id DESC LIMIT 100`,[req.user.id]);
    res.json({invitations:r.rows});
  }));
  router.post('/rooms',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,b=req.body||{},rid=H.newId(b.client_id),name=H.text(b.name,'plan name',100,{required:true}),description=H.text(b.description,'description',1000),eventDate=date(b.event_date);
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      const ins=await db.query(`INSERT INTO launch_rooms(id,owner_id,name,description,event_date) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING id`,[rid,me,name,description,eventDate]);
      const r=await db.query(`SELECT *,to_char(event_date,'YYYY-MM-DD') AS original_date FROM launch_rooms WHERE id=$1`,[rid]);const x=r.rows[0];
      if(!x||x.owner_id!==me||x.name!==name||x.description!==description||x.original_date!==eventDate)throw new H.HttpError(409,'Conflicting plan submission');
      return {room:await full(db,me,rid),replayed:!ins.rows.length};
    });res.status(result.replayed?200:201).json(result);
  }));
  router.put('/rooms/:roomId/details',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),b=req.body||{};
    const name=H.text(b.name,'plan name',100,{required:true}),description=H.text(b.description,'description',1000),eventDate=date(b.event_date);
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      const head=await room(db,me,rid,{lock:true,ownerOnly:true});writable(head);requireRevision(head,b.revision);
      await db.query('UPDATE launch_rooms SET name=$2,description=$3,event_date=$4 WHERE id=$1',[rid,name,description,eventDate]);
      return {ok:true,revision:await touch(db,rid)};
    });res.json(result);
  }));
  router.get('/rooms/:roomId',...secured,H.wrap(async(req,res)=>res.json({room:await full(pool,req.user.id,H.id(req.params.roomId,'plan'))})));
  router.get('/rooms/:roomId/manage-members',...secured,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan');
    const head=await room(pool,me,rid,{ownerOnly:true,management:true});
    const r=await pool.query(`SELECT m.user_id AS id,m.status,NOT ${H.actorSQL('u')} AS restricted,
      CASE WHEN ${H.actorSQL('u')} THEN u.display_name ELSE 'Unavailable member' END AS display_name
      FROM launch_room_members m JOIN users u ON u.id=m.user_id
      WHERE m.room_id=$2 AND m.status IN ('pending','accepted') ORDER BY m.created_at,m.user_id`,[me,rid]);
    res.json({members:r.rows,revision:head.revision});
  }));
  router.post('/rooms/:roomId/invitations',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),target=H.id(req.body?.user_id,'friend');
    if(target===me)throw new H.HttpError(400,'You already own this plan');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      await H.lockPair(db,me,target);
      const head=await room(db,me,rid,{lock:true,ownerOnly:true});writable(head);
      const rel=await H.relation(db,me,target);if(!rel.is_friend)throw new H.HttpError(403,'Invite an accepted friend');
      const old=(await db.query("SELECT status,(created_at>NOW()-INTERVAL '7 days') AS unexpired FROM launch_room_members WHERE room_id=$1 AND user_id=$2",[rid,target])).rows[0];
      if(old&&(old.status==='accepted'||old.status==='pending'&&old.unexpired))return {ok:true,already_invited:true,revision:head.revision};
      const count=await db.query(`SELECT count(*)::int AS n FROM launch_room_members WHERE room_id=$1 AND (status='accepted' OR status='pending' AND created_at>NOW()-INTERVAL '7 days')`,[rid]);
      if(count.rows[0].n>=MAX_MEMBERS-1)throw new H.HttpError(409,'This plan has reached its 20-person limit');
      await db.query(`INSERT INTO launch_room_members(room_id,user_id,status,invited_by) VALUES($1,$2,'pending',$3)
        ON CONFLICT(room_id,user_id) DO UPDATE SET status='pending',invited_by=EXCLUDED.invited_by,created_at=clock_timestamp(),responded_at=NULL`,[rid,target,me]);
      // Reissue must not resurrect an older notification merely because the same
      // membership row is pending again. Replace only this room/recipient notice.
      await db.query("DELETE FROM notifications WHERE user_id=$1 AND actor_id=$2 AND type='room_invitation' AND ref_type='room' AND ref_id=$3",[target,me,rid]);
      const rev=await touch(db,rid);await H.notify(db,target,me,'room_invitation','room',rid,{message:'You have a private plan invitation.'});
      return {ok:true,revision:rev};
    });res.json(result);
  }));
  router.put('/rooms/:roomId/invitation',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),answer=req.body?.response;
    if(!['accepted','declined'].includes(answer))throw new H.HttpError(400,'Accept or decline the invitation');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      await lockRoomPairs(db,rid,me);
      const r=await db.query('SELECT * FROM launch_rooms WHERE id=$1 FOR UPDATE',[rid]);const head=r.rows[0];
      if(!head||head.state==='cancelled')throw new H.HttpError(404,'Invitation unavailable');
      const rel=await H.relation(db,me,head.owner_id);if(!rel.is_friend)throw new H.HttpError(404,'Invitation unavailable');
      if(answer==='accepted')for(const member of await members(db,rid))if(member!==me)await H.relation(db,me,member);
      const old=(await db.query("SELECT status,(created_at>NOW()-INTERVAL '7 days') AS unexpired FROM launch_room_members WHERE room_id=$1 AND user_id=$2",[rid,me])).rows[0];
      if(!old||old.status==='pending'&&!old.unexpired&&answer==='accepted')throw new H.HttpError(404,'Invitation unavailable or expired');
      if(old.status===answer)return {ok:true,replayed:true};
      if(old.status!=='pending')throw new H.HttpError(409,'This invitation has already been answered');
      await db.query('UPDATE launch_room_members SET status=$3,responded_at=clock_timestamp() WHERE room_id=$1 AND user_id=$2',[rid,me,answer]);
      await db.query("UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1 AND type='room_invitation' AND ref_type='room' AND ref_id=$2",[me,rid]);
      await touch(db,rid);await H.notify(db,head.owner_id,me,'room_'+answer,'room',rid);
      return {ok:true};
    });res.json(result);
  }));
  router.put('/rooms/:roomId/options/:venueId',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),vid=H.id(req.params.venueId,'venue');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      await lockRoomPairs(db,rid,me);const head=await room(db,me,rid,{lock:true});writable(head);
      const venue=await db.query(`SELECT id FROM venues WHERE id=$1 AND ${AVAILABLE_VENUE}`,[vid]);if(!venue.rows.length)throw new H.HttpError(404,'Venue unavailable');
      const exists=await db.query('SELECT venue_id FROM launch_room_options WHERE room_id=$1 AND venue_id=$2',[rid,vid]);if(exists.rows.length)return {ok:true,replayed:true,revision:head.revision};
      const count=await db.query('SELECT count(*)::int AS n FROM launch_room_options WHERE room_id=$1',[rid]);if(count.rows[0].n>=MAX_OPTIONS)throw new H.HttpError(409,'Choose from up to 30 venues per plan');
      await db.query('INSERT INTO launch_room_options(room_id,venue_id,proposed_by) VALUES($1,$2,$3)',[rid,vid,me]);return {ok:true,revision:await touch(db,rid)};
    });res.json(result);
  }));
  router.delete('/rooms/:roomId/options/:venueId',...secured,write,H.wrap(async(req,res)=>{
    const rid=H.id(req.params.roomId,'plan'),vid=H.id(req.params.venueId,'venue');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      const head=await room(db,req.user.id,rid,{lock:true,ownerOnly:true});writable(head);requireRevision(head,req.body?.revision);
      const r=await db.query('DELETE FROM launch_room_options WHERE room_id=$1 AND venue_id=$2 RETURNING venue_id',[rid,vid]);if(!r.rows.length)throw new H.HttpError(404,'Option unavailable');return {ok:true,revision:await touch(db,rid)};
    });res.json(result);
  }));
  router.put('/rooms/:roomId/options/:venueId/vote',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),vid=H.id(req.params.venueId,'venue'),choice=req.body?.choice;
    if(!['yes','maybe','no',null].includes(choice)||choice===undefined)throw new H.HttpError(400,'Choose yes, maybe, no, or clear your vote');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      await lockRoomPairs(db,rid,me);const head=await room(db,me,rid,{lock:true});writable(head);
      const option=await db.query(`SELECT v.id FROM launch_room_options o JOIN venues v ON v.id=o.venue_id WHERE o.room_id=$1 AND o.venue_id=$2 AND ${AVAILABLE_VENUE}`,[rid,vid]);if(!option.rows.length)throw new H.HttpError(404,'Option unavailable');
      if(choice===null)await db.query('DELETE FROM launch_room_votes WHERE room_id=$1 AND venue_id=$2 AND user_id=$3',[rid,vid,me]);
      else await db.query(`INSERT INTO launch_room_votes(room_id,venue_id,user_id,choice) VALUES($1,$2,$3,$4)
        ON CONFLICT(room_id,venue_id,user_id) DO UPDATE SET choice=EXCLUDED.choice,updated_at=clock_timestamp()`,[rid,vid,me,choice]);
      return {ok:true,choice,revision:await touch(db,rid)};
    });res.json(result);
  }));
  router.put('/rooms/:roomId/decision',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),vid=H.id(req.body?.venue_id,'venue');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      await lockRoomPairs(db,rid,me);const head=await room(db,me,rid,{lock:true,ownerOnly:true});writable(head);requireRevision(head,req.body?.revision);
      const v=await db.query(`SELECT v.id FROM launch_room_options o JOIN venues v ON v.id=o.venue_id WHERE o.room_id=$1 AND o.venue_id=$2 AND ${AVAILABLE_VENUE}`,[rid,vid]);if(!v.rows.length)throw new H.HttpError(404,'Choose an active shortlisted venue');
      await db.query("UPDATE launch_rooms SET state='confirmed',selected_venue_id=$2 WHERE id=$1",[rid,vid]);const rev=await touch(db,rid);
      for(const user of await members(db,rid))await H.notify(db,user,me,'room_confirmed','room',rid,{message:'Your group has selected a venue. This is not a reservation.'});
      return {ok:true,revision:rev,confirmed_is_reservation:false};
    });res.json(result);
  }));
  router.put('/rooms/:roomId/state',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),state=req.body?.state;if(!['planning','cancelled'].includes(state))throw new H.HttpError(400,'Reopen or cancel the plan');
    const result=await H.transaction(pool,async db=>{
      await serialize(db,rid);
      const head=await room(db,me,rid,{lock:true,ownerOnly:true,management:true});requireRevision(head,req.body?.revision);
      if(head.state===state)return {ok:true,revision:head.revision};
      await db.query('UPDATE launch_rooms SET state=$2,selected_venue_id=NULL WHERE id=$1',[rid,state]);return {ok:true,revision:await touch(db,rid)};
    });res.json(result);
  }));
  // Removal/leave work even if a newly blocked member makes ordinary room reads inaccessible.
  router.delete('/rooms/:roomId/members/:userId',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,rid=H.id(req.params.roomId,'plan'),target=H.id(req.params.userId,'member');
    await H.transaction(pool,async db=>{
      await serialize(db,rid);
      const r=await db.query('SELECT * FROM launch_rooms WHERE id=$1 FOR UPDATE',[rid]),head=r.rows[0];
      if(!head||(head.owner_id!==me&&target!==me))throw new H.HttpError(404,'Plan unavailable');
      if(target===head.owner_id)throw new H.HttpError(400,'The owner must cancel or delete the plan instead');
      const changed=await db.query("UPDATE launch_room_members SET status=$3,responded_at=clock_timestamp() WHERE room_id=$1 AND user_id=$2 AND status IN ('pending','accepted') RETURNING user_id",[rid,target,me===target?'left':'removed']);
      if(!changed.rows.length)throw new H.HttpError(404,'Membership unavailable');
      await db.query('DELETE FROM launch_room_votes WHERE room_id=$1 AND user_id=$2',[rid,target]);await touch(db,rid);
    });res.json({ok:true});
  }));
  router.delete('/rooms/:roomId',...secured,write,H.wrap(async(req,res)=>{
    const rid=H.id(req.params.roomId,'plan');await H.transaction(pool,async db=>{
      await serialize(db,rid);
      const head=await room(db,req.user.id,rid,{lock:true,ownerOnly:true,management:true});requireRevision(head,req.body?.revision);
      await db.query('DELETE FROM launch_rooms WHERE id=$1',[rid]);
    });res.json({ok:true});
  }));
}
module.exports={install,room,full,date,revision,requireRevision,writable,ROOM_MEMBER,ROOM_VISIBLE,MAX_MEMBERS,MAX_OPTIONS};
