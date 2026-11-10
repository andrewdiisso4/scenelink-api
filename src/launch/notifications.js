'use strict';
const Lists=require('../services/list-membership');
const H=require('./shared'),M=require('./messages'),P=require('./posts');
const ROOM_NOTICE=`(n.ref_type IS DISTINCT FROM 'room' OR EXISTS(SELECT 1 FROM launch_rooms rr WHERE rr.id=n.ref_id
  AND (rr.owner_id=$1 OR EXISTS(SELECT 1 FROM launch_room_members rm WHERE rm.room_id=rr.id AND rm.user_id=$1 AND (rm.status='accepted' OR rm.status='pending' AND rm.created_at>NOW()-INTERVAL '7 days')))
  AND EXISTS(SELECT 1 FROM users owner WHERE owner.id=rr.owner_id AND ${H.actorSQL('owner')})))`;
const VISIBLE=`(n.actor_id IS NULL OR EXISTS(SELECT 1 FROM users u WHERE u.id=n.actor_id AND ${H.actorSQL()})) AND ${ROOM_NOTICE} AND ${Lists.NOTICE}`;
async function summary(pool,me){
  const r=await pool.query(`SELECT
    (SELECT count(*)::int FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a_id=$1 THEN f.user_b_id ELSE f.user_a_id END WHERE (f.user_a_id=$1 OR f.user_b_id=$1) AND f.status='accepted' AND ${H.actorSQL()}) AS friends,
    (SELECT count(*)::int FROM friendships f JOIN users u ON u.id=f.requester_id WHERE (f.user_a_id=$1 OR f.user_b_id=$1) AND f.requester_id<>$1 AND f.status='pending' AND ${H.actorSQL()}) AS pending_friend_requests,
    (SELECT count(*)::int FROM notifications n WHERE n.user_id=$1 AND n.read_at IS NULL AND ${VISIBLE}) AS unread_notifications,
    (SELECT count(*)::int FROM conversation_participants cp JOIN conversations c ON c.id=cp.conversation_id JOIN messages m ON m.conversation_id=c.id WHERE cp.user_id=$1 AND ${M.UNREAD} AND ${M.VISIBLE_CONVERSATION}) AS unread_messages,
    (SELECT count(*)::int FROM posts WHERE user_id=$1) AS posts,
    (SELECT count(*)::int FROM lists WHERE user_id=$1) AS lists,
    (SELECT count(*)::int FROM favorites WHERE user_id=$1) AS saved_venues,
    (SELECT count(*)::int FROM plans WHERE user_id=$1) AS plans`,[me]);return r.rows[0];
}
function install({router,pool,auth,write}) {
  const secured=[auth.requireAuth,H.noStore];
  router.get('/social/summary',...secured,H.wrap(async(req,res)=>res.json(await summary(pool,req.user.id))));
  router.get('/notifications',...secured,H.wrap(async(req,res)=>{
    const limit=H.integer(req.query.limit,30,1,100),offset=H.integer(req.query.offset,0,0,10000,'offset');
    const r=await pool.query(`SELECT n.*,u.username AS actor_username,u.display_name AS actor_display_name,u.avatar_url AS actor_avatar_url
      FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=$1 AND ${VISIBLE} ORDER BY n.created_at DESC,n.id DESC LIMIT $2 OFFSET $3`,[req.user.id,limit+1,offset]);
    res.json({notifications:r.rows.slice(0,limit).map(n=>({...n,...(n.ref_type==='list'?{destination:{kind:'list',href:'/my-lists?list='+n.ref_id}}:{})})),has_more:r.rows.length>limit,offset});
  }));
  router.get('/notifications/unread-count',...secured,H.wrap(async(req,res)=>{
    const r=await pool.query(`SELECT count(*)::int AS unread FROM notifications n WHERE n.user_id=$1 AND n.read_at IS NULL AND ${VISIBLE}`,[req.user.id]);res.json(r.rows[0]);
  }));
  router.post('/notifications/read-all',...secured,H.wrap(async(req,res)=>{await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL',[req.user.id]);res.json({ok:true});}));
  router.post('/notifications/:identifier/read',...secured,H.wrap(async(req,res)=>{
    const nid=H.id(req.params.identifier,'notification'),r=await pool.query('UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id',[nid,req.user.id]);if(!r.rows.length)throw new H.HttpError(404,'Notification unavailable');res.json({ok:true,id:nid});
  }));
  router.post('/reports',...secured,write,H.wrap(async(req,res)=>{
    const b=req.body||{},me=req.user.id,target=H.id(b.target_id,'reported item'),type=b.target_type,reason=b.reason,details=H.text(b.details,'details',1000);
    if(!['user','post','comment','message','review'].includes(type)||!['spam','harassment','hate_speech','violence','sexual_content','misinformation','illegal','impersonation','self_harm','other'].includes(reason))throw new H.HttpError(400,'Choose a valid report type and reason');
    if(type==='user'){if(target===me)throw new H.HttpError(400,'You cannot report yourself');const r=await pool.query('SELECT id FROM users WHERE id=$1 AND is_active',[target]);if(!r.rows.length)throw new H.HttpError(404,'User unavailable');}
    if(type==='post')await P.visiblePost(pool,me,target);
    if(type==='comment'){const r=await pool.query('SELECT post_id FROM post_comments WHERE id=$1',[target]);if(!r.rows.length)throw new H.HttpError(404,'Comment unavailable');await P.visiblePost(pool,me,r.rows[0].post_id);}
    if(type==='message'){const r=await pool.query('SELECT conversation_id FROM messages WHERE id=$1',[target]);if(!r.rows.length)throw new H.HttpError(404,'Message unavailable');await M.access(pool,me,r.rows[0].conversation_id);}
    if(type==='review'){const r=await pool.query(`SELECT r.id FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.id=$2 AND ${H.profileSQL()}`,[me,target]);if(!r.rows.length)throw new H.HttpError(404,'Review unavailable');}
    const r=await pool.query(`INSERT INTO content_reports(reporter_id,target_type,target_id,reason,details) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING RETURNING id,created_at,status`,[me,type,target,reason,details||null]);res.status(r.rows.length?201:200).json(r.rows.length?{report:r.rows[0]}:{already_reported:true});
  }));
  // Reject old query-token SSE. The new client uses authenticated, visibility-aware polling.
  // This avoids token-bearing stream URLs and long-lived sessions bypassing revocation.
  router.get('/events/stream',...secured,(req,res)=>res.status(409).json({error:'Use authenticated summary polling',polling:true}));
  router.get('/activity',auth.optionalAuth,H.noStore,H.wrap(async(req,res)=>{
    const limit=H.integer(req.query.limit,20,1,50),r=await pool.query(P.feedSQL(),[req.user?.id||null,null,false,false,null,null,null,limit]);
    res.json({activities:r.rows.map(x=>({...x,type:x.kind,content:x.body,user_name:x.username,user_display_name:x.display_name,user_avatar:x.avatar_url})),total:r.rows.length,source:'permission-filtered'});
  }));
  router.get('/reviews',auth.optionalAuth,H.noStore,H.wrap(async(req,res)=>{
    const vid=H.id(req.query.venue_id,'venue'),r=await pool.query(`SELECT r.id,r.user_id,r.rating,r.content,r.created_at,u.username,u.display_name,u.avatar_url
      FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.venue_id=$2 AND ${H.profileSQL()} AND COALESCE(to_jsonb(r)->>'is_hidden','false') <> 'true' AND u.email NOT LIKE 'seed_reviewer_%@scenelink.app' ORDER BY r.created_at DESC,r.id DESC LIMIT 50`,[req.user?.id||null,vid]);res.json({reviews:r.rows});
  }));
}
module.exports={install,summary,ROOM_NOTICE};
