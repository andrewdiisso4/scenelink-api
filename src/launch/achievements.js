'use strict';
const H=require('./shared');
// Current-state milestones only. No points, streaks, notifications, send-volume
// rewards, seeded counters, third-party followers or claims of actual attendance.
const BADGES=Object.freeze([
 {id:'first_save',title:'First find',description:'Save one available venue.',metric:'saved_venues',threshold:1},
 {id:'five_saves',title:'Shortlist maker',description:'Save five distinct available venues.',metric:'saved_venues',threshold:5},
 {id:'first_friend',title:'First connection',description:'Have one accepted SceneLink friend.',metric:'friends',threshold:1},
 {id:'five_friends',title:'Small circle',description:'Have five accepted SceneLink friends.',metric:'friends',threshold:5},
 {id:'first_shared_post',title:'Shared a moment',description:'Keep a post shared with friends or publicly.',metric:'shared_posts',threshold:1},
 {id:'first_collaborative_plan',title:'Planning together',description:'Join a plan with an accepted friend; an invitation alone does not count.',metric:'collaborative_plans',threshold:1}
]);
function fromCounts(counts){
 return{source:'persisted_scenelink_activity',counts,badges:BADGES.map(b=>({...b,progress:Math.min(b.threshold,Number(counts[b.metric]||0)),earned:Number(counts[b.metric]||0)>=b.threshold})),points:null,real_world_attendance_verified:false};
}
async function summary(pool,me){
 const r=await pool.query(`SELECT
  (SELECT count(DISTINCT f.venue_id)::int FROM favorites f JOIN venues v ON v.id=f.venue_id WHERE f.user_id=$1 AND v.is_active IS TRUE AND COALESCE(v.business_status,'') NOT ILIKE 'CLOSED%' AND lower(COALESCE(v.business_status,'')) NOT IN ('temporarily_closed','permanently_closed')) AS saved_venues,
  (SELECT count(*)::int FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a_id=$1 THEN f.user_b_id ELSE f.user_a_id END WHERE f.status='accepted' AND (f.user_a_id=$1 OR f.user_b_id=$1) AND ${H.actorSQL()}) AS friends,
  (SELECT count(*)::int FROM posts p WHERE p.user_id=$1 AND COALESCE(p.audience,CASE WHEN p.is_public THEN 'public' ELSE 'private' END) IN ('public','friends') AND p.ref_type IS NULL) AS shared_posts,
  (SELECT count(DISTINCT room.id)::int FROM launch_rooms room JOIN users owner ON owner.id=room.owner_id WHERE room.state<>'cancelled' AND ${H.actorSQL('owner')}
   AND NOT EXISTS(SELECT 1 FROM launch_room_members hidden JOIN users hidden_user ON hidden_user.id=hidden.user_id WHERE hidden.room_id=room.id AND hidden.status='accepted' AND hidden.user_id<>$1 AND NOT ${H.actorSQL('hidden_user')})
   AND (room.owner_id=$1 OR EXISTS(SELECT 1 FROM launch_room_members mine WHERE mine.room_id=room.id AND mine.user_id=$1 AND mine.status='accepted'))
   AND EXISTS(SELECT 1 FROM users u WHERE u.id<>$1 AND ${H.actorSQL()} AND ${H.friendSQL('u.id')} AND (u.id=room.owner_id OR EXISTS(SELECT 1 FROM launch_room_members other WHERE other.room_id=room.id AND other.user_id=u.id AND other.status='accepted')))) AS collaborative_plans`,[me]);
 return fromCounts(r.rows[0]);
}
function publicView(result){return{source:result.source,badges:result.badges.filter(b=>b.earned).map(({progress,...badge})=>badge),points:null,real_world_attendance_verified:false};}
module.exports={BADGES,fromCounts,summary,publicView};
