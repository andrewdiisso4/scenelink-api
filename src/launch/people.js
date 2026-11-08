'use strict';
const H=require('./shared'),Profile=require('./profile'),Achievements=require('./achievements');
const FIELDS='u.id,u.username,u.display_name,u.avatar_url,u.neighborhood,u.city,u.bio,u.created_at,u.is_private,u.allow_messages,u.social_links,u.show_achievements';
function install({router,pool,auth,write}) {
  const secured=[auth.requireAuth,H.noStore];
  const profileRoute=H.wrap(async(req,res)=>{
    const value=H.text(req.params.identifier,'user',80,{required:true}),me=req.user?.id||null;
    const r=await pool.query(`SELECT ${FIELDS},${H.profileSQL('u','$1')} AS can_view FROM users u
      WHERE ${H.UUID.test(value)?'u.id=$2':'lower(u.username)=lower($2)'} AND ${H.actorSQL('u','$1')} LIMIT 1`,[me,value]);
    if(!r.rows.length) throw new H.HttpError(404,'User unavailable');
    const user=r.rows[0],isMe=me===user.id;let relationship=null;
    if(me&&!isMe){const f=await pool.query('SELECT id,status,requester_id FROM friendships WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid)',[me,user.id]);if(f.rows.length){const x=f.rows[0];relationship={id:x.id,status:x.status,direction:x.status==='pending'?(x.requester_id===me?'outgoing':'incoming'):null};}}
    if(!user.can_view){user.bio=null;user.neighborhood=null;user.city=null;user.post_count=null;user.friend_count=null;user.social_links=[];}
    else {const c=await pool.query(`SELECT (SELECT count(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE p.user_id=$2 AND ${H.postSQL('p','u','$1')}) AS post_count,
      (SELECT count(*)::int FROM friendships f JOIN users friend ON friend.id=CASE WHEN f.user_a_id=$2 THEN f.user_b_id ELSE f.user_a_id END WHERE f.status='accepted' AND (f.user_a_id=$2 OR f.user_b_id=$2) AND ${H.actorSQL('friend','$1')}) AS friend_count`,[me,user.id]);Object.assign(user,c.rows[0]);}
    const canMessage=!!me&&!isMe&&(user.allow_messages==='everyone'||user.allow_messages==='friends'&&relationship?.status==='accepted');
    const achievements=user.can_view&&(isMe||user.show_achievements)?Achievements.publicView(await Achievements.summary(pool,user.id)):null;
    delete user.allow_messages;delete user.show_achievements;
    res.json({user,is_me:isMe,can_view:user.can_view,can_message:canMessage,friendship_status:relationship,achievements});
  });
  router.get('/users/me',...secured,H.wrap(async(req,res)=>{
    const r=await pool.query('SELECT '+require('./identity').SELF+' FROM users WHERE id=$1',[req.user.id]);
    if(!r.rows.length)throw new H.HttpError(401,'Account unavailable');res.json({user:r.rows[0]});
  }));
  router.get('/users/me/achievements',...secured,H.wrap(async(req,res)=>res.json(await Achievements.summary(pool,req.user.id))));
  router.get('/users/search',...secured,H.wrap(async(req,res)=>{
    const q=H.text(req.query.q,'search',80).replace(/^@/,''),limit=H.integer(req.query.limit,20,1,50),offset=H.integer(req.query.offset,0,0,10000,'offset');
    if(q.length<2)return res.json({results:[],has_more:false,offset});
    const rows=await searchPeople(pool,req.user.id,q,limit+1,offset);
    res.json({results:rows.slice(0,limit),has_more:rows.length>limit,offset});
  }));
  router.get('/users/suggestions',...secured,H.wrap(async(req,res)=>{
    const me=req.user.id,limit=H.integer(req.query.limit,8,1,30);
    const r=await pool.query(`SELECT u.id,u.username,u.display_name,u.avatar_url FROM users u
      WHERE u.id<>$1 AND u.discoverable IS TRUE AND u.is_private IS FALSE AND ${H.actorSQL()} AND NOT EXISTS(SELECT 1 FROM friendships f
      WHERE f.user_a_id=LEAST(u.id,$1::uuid) AND f.user_b_id=GREATEST(u.id,$1::uuid) AND f.status IN ('pending','accepted','declined','blocked'))
      AND u.email NOT LIKE 'seed_reviewer_%@scenelink.app' ORDER BY u.created_at DESC,u.id DESC LIMIT $2`,[me,limit]);
    res.json({suggestions:r.rows});
  }));
  router.get('/users/blocked',...secured,H.wrap(async(req,res)=>{
    const r=await pool.query(`SELECT u.id,u.username,u.display_name,u.avatar_url,b.created_at AS blocked_at
      FROM user_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC,u.id LIMIT 200`,[req.user.id]);res.json({blocked:r.rows});
  }));
  router.put('/auth/profile',...secured,write,H.wrap(async(req,res)=>res.json(await Profile.update(pool,req.user.id,req.body))));
  router.patch('/users/me/settings',...secured,write,H.wrap(async(req,res)=>{
    const result=await Profile.update(pool,req.user.id,req.body,true);
    res.json({...result,settings:Object.fromEntries(['id','profile_revision',...Profile.SETTINGS].map(k=>[k,result.user[k]]))});
  }));
  router.post('/users/:identifier/block',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,target=H.id(req.params.identifier,'user');if(me===target)throw new H.HttpError(400,'You cannot block yourself');const reason=H.text(req.body?.reason,'reason',500);
    const result=await H.transaction(pool,async db=>{
      await H.lockPair(db,me,target);
      const exists=await db.query('SELECT id FROM users WHERE id=$1',[target]);if(!exists.rows.length)throw new H.HttpError(404,'User unavailable');
      const r=await db.query('INSERT INTO user_blocks(blocker_id,blocked_id,reason) VALUES($1,$2,$3) ON CONFLICT(blocker_id,blocked_id) DO NOTHING RETURNING id',[me,target,reason||null]);
      await db.query("UPDATE friendships SET status='declined',updated_at=NOW() WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid)",[me,target]);
      await db.query('DELETE FROM notifications WHERE (user_id=$1 AND actor_id=$2) OR (user_id=$2 AND actor_id=$1)',[me,target]);
      return{success:true,blocked_id:target,already_blocked:!r.rows.length};
    });res.status(201).json(result);
  }));
  router.delete('/users/:identifier/block',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,target=H.id(req.params.identifier,'user');
    await H.transaction(pool,async db=>{await H.lockPair(db,me,target);await db.query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[me,target]);});res.json({success:true,unblocked_id:target});
  }));
  router.get('/users/:identifier',auth.optionalAuth,H.noStore,profileRoute);
  router.get('/friends',...secured,H.wrap(async(req,res)=>{
    const limit=H.integer(req.query.limit,50,1,100),offset=H.integer(req.query.offset,0,0,10000,'offset');
    const r=await pool.query(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.neighborhood,f.id AS friendship_id,f.status FROM friendships f
      JOIN users u ON u.id=CASE WHEN f.user_a_id=$1 THEN f.user_b_id ELSE f.user_a_id END
      WHERE f.status='accepted' AND (f.user_a_id=$1 OR f.user_b_id=$1) AND ${H.actorSQL()}
      ORDER BY lower(u.display_name),u.id LIMIT $2 OFFSET $3`,[req.user.id,limit+1,offset]);res.json({friends:r.rows.slice(0,limit),has_more:r.rows.length>limit,offset});
  }));
  router.get('/friends/pending',...secured,H.wrap(async(req,res)=>{
    const r=await pool.query(`SELECT f.id AS friendship_id,f.status,f.requester_id,f.created_at,u.id AS other_user_id,u.username,u.display_name,u.avatar_url,
      CASE WHEN f.requester_id=$1 THEN 'outgoing' ELSE 'incoming' END AS direction FROM friendships f
      JOIN users u ON u.id=CASE WHEN f.user_a_id=$1 THEN f.user_b_id ELSE f.user_a_id END
      WHERE f.status='pending' AND (f.user_a_id=$1 OR f.user_b_id=$1) AND ${H.actorSQL()}
      ORDER BY f.created_at DESC,f.id DESC LIMIT 500`,[req.user.id]);res.json({incoming:r.rows.filter(r=>r.direction==='incoming'),outgoing:r.rows.filter(r=>r.direction==='outgoing')});
  }));
  router.post('/friends/request',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,b=req.body||{};let target=b.user_id;
    if(!target&&b.username){const r=await pool.query('SELECT id FROM users WHERE lower(username)=lower($1)',[H.text(b.username,'username',24,{required:true})]);target=r.rows[0]?.id;}
    target=H.id(target,'user');if(me===target)throw new H.HttpError(400,'You cannot friend yourself');
    const result=await H.transaction(pool,async db=>{
      await H.relation(db,me,target,{lock:true});
      const r=await db.query('SELECT id,status,requester_id,updated_at FROM friendships WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid) FOR UPDATE',[me,target]);
      const old=r.rows[0];if(old&&['accepted','pending'].includes(old.status))return{friendship_id:old.id,status:old.status,direction:old.requester_id===me?'outgoing':'incoming',already_requested:true};
      if(old?.status==='blocked')throw new H.HttpError(404,'User unavailable');
      if(old?.status==='declined'&&Date.now()-new Date(old.updated_at).getTime()<86400000)throw new H.HttpError(429,'Please wait before sending another request');
      const added=await db.query(`INSERT INTO friendships(user_a_id,user_b_id,requester_id,status) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$1,'pending')
        ON CONFLICT(user_a_id,user_b_id) DO UPDATE SET requester_id=$1,status='pending',updated_at=NOW() RETURNING id,status`,[me,target]);
      await H.notify(db,target,me,'friend_request','friendship',added.rows[0].id);return{friendship_id:added.rows[0].id,status:'pending',direction:'outgoing'};
    });res.json(result);
  }));
  for(const action of ['accept','decline'])router.post('/friends/'+action,...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,fid=H.id(req.body?.friendship_id,'friendship');
    const outcome=await H.transaction(pool,async db=>{
      const initial=await db.query('SELECT user_a_id,user_b_id FROM friendships WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)',[fid,me]);if(!initial.rows.length)throw new H.HttpError(404,'Request unavailable');
      const target=initial.rows[0].user_a_id===me?initial.rows[0].user_b_id:initial.rows[0].user_a_id;
      await H.relation(db,me,target,{lock:true});
      const r=await db.query('SELECT id,status,requester_id FROM friendships WHERE id=$1 FOR UPDATE',[fid]);const f=r.rows[0];
      if(!f||f.requester_id===me)throw new H.HttpError(403,'Only the recipient can respond');
      const desired=action==='accept'?'accepted':'declined';
      if(f.status===desired)return{friendship_id:fid,status:desired};
      if(f.status!=='pending')throw new H.HttpError(409,'This request is no longer pending');
      await db.query('UPDATE friendships SET status=$2,updated_at=NOW() WHERE id=$1',[fid,desired]);
      if(action==='accept')await H.notify(db,target,me,'friend_accepted','friendship',fid);return{friendship_id:fid,status:desired};
    });res.json(outcome);
  }));
  router.delete('/friends/:identifier',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,target=H.id(req.params.identifier,'user');
    await H.transaction(pool,async db=>{await H.lockPair(db,me,target);
      const r=await db.query(`DELETE FROM friendships WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid)
        AND (status='accepted' OR (status='pending' AND requester_id=$1)) RETURNING id`,[me,target]);
      if(!r.rows.length)throw new H.HttpError(404,'Friend or outgoing request unavailable');
    });res.json({removed:true,user_id:target});
  }));
}
async function searchPeople(pool,me,q,limit,offset=0){
  if(!me)return[];
  q=String(q).replace(/^@/,'');if(q.length<2)return[];
  const r=await pool.query(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.is_private,
    CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('id',f.id,'status',f.status,'direction',CASE WHEN f.status='pending' THEN CASE WHEN f.requester_id=$1 THEN 'outgoing' ELSE 'incoming' END ELSE NULL END) END AS friendship_status
    FROM users u LEFT JOIN friendships f ON f.user_a_id=LEAST(u.id,$1::uuid) AND f.user_b_id=GREATEST(u.id,$1::uuid) AND f.status IN ('pending','accepted')
    WHERE ${H.actorSQL()} AND u.id<>$1 AND (u.discoverable IS TRUE OR f.status='accepted')
    AND (u.is_private IS FALSE OR lower(u.username)=lower($3) OR f.status='accepted')
    AND (u.username ILIKE $2 OR u.display_name ILIKE $2)
    ORDER BY CASE WHEN lower(u.username)=lower($3) THEN 0 WHEN u.username ILIKE $4 THEN 1 ELSE 2 END,lower(u.username),u.id LIMIT $5 OFFSET $6`,
    [me,'%'+H.like(q)+'%',q,H.like(q)+'%',limit,offset]);
  return r.rows;
}
module.exports={install,searchPeople};
