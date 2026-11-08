'use strict';
const H=require('./shared');
function feedSQL() {
  const ownerFilter=a=>`($2::uuid IS NULL OR ${a}.user_id=$2) AND (NOT $3::boolean OR ${a}.user_id=$1 OR ${H.friendSQL(a+'.user_id')})`;
  return `WITH activity AS (
    SELECT p.id,p.user_id,p.body,p.venue_id,p.image_url,p.thumb_url,p.created_at,'post'::text AS kind,p.ref_type,p.ref_id,
      COALESCE(p.audience,CASE WHEN p.is_public THEN 'public' ELSE 'private' END) AS audience,
      (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id=p.id) AS like_count,
      (SELECT count(*)::int FROM post_comments pc WHERE pc.post_id=p.id) AS comment_count,
      EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id=p.id AND pl.user_id=$1) AS liked_by_me,NULL::numeric AS rating
      FROM posts p JOIN users u ON u.id=p.user_id WHERE ${H.postSQL()} AND ${ownerFilter('p')}
    UNION ALL
    SELECT c.id,c.user_id,c.note,c.venue_id,NULL::text,NULL::text,c.created_at,'checkin',NULL::text,NULL::uuid,c.audience,0,0,false,NULL::numeric
      FROM checkins c JOIN users u ON u.id=c.user_id JOIN venues v ON v.id=c.venue_id AND v.is_active
      WHERE NOT $4::boolean AND ${H.profileSQL()} AND ${H.audienceSQL('c.user_id','c.audience')} AND ${ownerFilter('c')}
    UNION ALL
    SELECT r.id,r.user_id,r.content,r.venue_id,NULL::text,NULL::text,r.created_at,'review',NULL::text,NULL::uuid,'public',0,0,false,r.rating::numeric
      FROM reviews r JOIN users u ON u.id=r.user_id JOIN venues v ON v.id=r.venue_id AND v.is_active
      WHERE NOT $4::boolean AND ${H.profileSQL()} AND ${ownerFilter('r')} AND COALESCE(to_jsonb(r)->>'is_hidden','false') <> 'true' AND u.email NOT LIKE 'seed_reviewer_%@scenelink.app'
  ) SELECT a.*,${H.timeSQL('a')},u.username,u.display_name,u.avatar_url,
    v.name AS venue_name,v.slug AS venue_slug,v.neighborhood AS venue_neighborhood
    FROM activity a JOIN users u ON u.id=a.user_id LEFT JOIN venues v ON v.id=a.venue_id
    WHERE ($5::timestamptz IS NULL OR (a.created_at,a.id,a.kind)<($5::timestamptz,$6::uuid,$7::text))
    ORDER BY a.created_at DESC,a.id DESC,a.kind DESC LIMIT $8`;
}
async function visiblePost(db,me,pid,lock=false) {
  if(lock) {const r=await db.query('SELECT user_id FROM posts WHERE id=$1',[pid]);if(!r.rows.length)throw new H.HttpError(404,'Post unavailable');await H.lockPair(db,me,r.rows[0].user_id);}
  const r=await db.query(`SELECT p.*,u.username,u.display_name,u.avatar_url,v.name AS venue_name,v.slug AS venue_slug,
    EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked_by_me
    FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN venues v ON v.id=p.venue_id
    WHERE p.id=$2 AND ${H.postSQL()} ${lock?'FOR UPDATE OF p':''}`,[me,pid]);
  if(!r.rows.length)throw new H.HttpError(404,'Post unavailable');return{...r.rows[0],kind:'post'};
}
async function imageFor(db,me,url) {
  url=H.https(url);if(!url)return{url:null,thumb:null};
  const r=await db.query("SELECT url,thumb_url FROM media_assets WHERE owner_id=$1 AND url=$2 AND kind='post' LIMIT 1",[me,url]);
  if(!r.rows.length)throw new H.HttpError(400,'Upload this image to your account first');return{url:r.rows[0].url,thumb:r.rows[0].thumb_url};
}
function install({router,pool,auth,write}) {
  const secured=[auth.requireAuth,H.noStore],publicRead=[auth.optionalAuth,H.noStore];
  async function feed(req,res,postsOnly=false) {
    const me=req.user?.id||null,limit=H.integer(req.query.limit,20,1,50),uid=req.query.user_id?H.id(req.query.user_id,'user'):null;
    const scope=req.query.scope||'all';if(!['all','friends'].includes(scope))throw new H.HttpError(400,'Unknown feed scope');if(scope==='friends'&&!me)throw new H.HttpError(401,'Sign in to view friends');
    if(postsOnly&&!uid)throw new H.HttpError(400,'user_id required');
    const key=postsOnly?'profile:'+uid:'feed:'+scope,cur=H.cursor(req.query.cursor,key);
    const r=await pool.query(feedSQL(),[me,uid,scope==='friends',postsOnly,cur?.t||null,cur?.i||null,cur?.k||null,limit+1]);const result=H.page(r.rows,limit,key);
    res.json(postsOnly?{posts:result.items,has_more:result.has_more,next_cursor:result.next_cursor}:{...result,total:result.items.length});
  }
  router.get('/posts/feed',...publicRead,H.wrap((req,res)=>feed(req,res)));
  router.get('/posts',...publicRead,H.wrap((req,res)=>feed(req,res,true)));
  router.get('/posts/:postId',...publicRead,H.wrap(async(req,res)=>res.json({post:await visiblePost(pool,req.user?.id||null,H.id(req.params.postId,'post'))})));
  router.post('/posts',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,b=req.body||{},body=H.text(b.body,'post',2000),vid=b.venue_id?H.id(b.venue_id,'venue'):null,pid=H.newId(b.client_id),aud=H.audience(b.audience);
    if(!body&&!vid&&!b.image_url)throw new H.HttpError(400,'Write a post or attach a venue or image');
    const post=await H.transaction(pool,async db=>{
      if(vid){const v=await db.query("SELECT id FROM venues WHERE id=$1 AND is_active IS TRUE AND COALESCE(business_status,'') NOT ILIKE 'CLOSED%' AND lower(COALESCE(business_status,'')) NOT IN ('temporarily_closed','permanently_closed')",[vid]);if(!v.rows.length)throw new H.HttpError(404,'Venue unavailable');}
      const image=await imageFor(db,me,b.image_url);
      const ins=await db.query(`INSERT INTO posts(id,user_id,body,venue_id,image_url,thumb_url,audience,is_public)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id`,[pid,me,body||null,vid,image.url,image.thumb,aud,aud==='public']);
      const row=await visiblePost(db,me,pid);
      if(row.user_id!==me||String(row.body||'')!==body||(row.venue_id||null)!==vid||(row.image_url||null)!==image.url||row.audience!==aud)throw new H.HttpError(409,'This submission ID belongs to another post');
      return{...row,replayed:!ins.rows.length};
    });res.status(post.replayed?200:201).json({post});
  }));
  router.delete('/posts/:postId',...secured,write,H.wrap(async(req,res)=>{
    const pid=H.id(req.params.postId,'post');const r=await pool.query('DELETE FROM posts WHERE id=$1 AND user_id=$2 RETURNING id',[pid,req.user.id]);if(!r.rows.length)throw new H.HttpError(404,'Post unavailable');res.json({removed:true,id:pid});
  }));
  async function likePost(req,res,toggle) {
    const me=req.user.id,pid=H.id(req.params.postId,'post');if(!toggle&&typeof req.body?.liked!=='boolean')throw new H.HttpError(400,'liked must be true or false');
    const outcome=await H.transaction(pool,async db=>{
      const post=await visiblePost(db,me,pid,true);const check=await db.query('SELECT id FROM post_likes WHERE post_id=$1 AND user_id=$2',[pid,me]);
      const liked=toggle?!check.rows.length:req.body.liked;
      if(liked){const r=await db.query('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT(post_id,user_id) DO NOTHING RETURNING id',[pid,me]);if(r.rows.length)await H.notify(db,post.user_id,me,'post_like','post',pid);}
      else await db.query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2',[pid,me]);
      const count=await db.query('UPDATE posts SET like_count=(SELECT count(*) FROM post_likes WHERE post_id=$1) WHERE id=$1 RETURNING like_count',[pid]);return{liked,like_count:count.rows[0].like_count};
    });res.json(outcome);
  }
  router.put('/posts/:postId/like',...secured,write,H.wrap((q,s)=>likePost(q,s,false)));
  router.post('/posts/:postId/like',...secured,write,H.wrap((q,s)=>likePost(q,s,true)));
  router.get('/posts/:postId/comments',...publicRead,H.wrap(async(req,res)=>{
    const me=req.user?.id||null,pid=H.id(req.params.postId,'post'),limit=H.integer(req.query.limit,20,1,100),scope='comments:'+pid,c=H.cursor(req.query.cursor,scope);
    await visiblePost(pool,me,pid);
    const r=await pool.query(`SELECT c.id,c.post_id,c.user_id,c.body,c.created_at,${H.timeSQL('c')},'comment' AS kind,u.username,u.display_name,u.avatar_url
      FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$2 AND ${H.actorSQL()}
      AND ($3::timestamptz IS NULL OR (c.created_at,c.id)<($3::timestamptz,$4::uuid)) ORDER BY c.created_at DESC,c.id DESC LIMIT $5`,[me,pid,c?.t||null,c?.i||null,limit+1]);
    const result=H.page(r.rows,limit,scope);res.json({comments:result.items,has_more:result.has_more,next_cursor:result.next_cursor});
  }));
  router.post('/posts/:postId/comments',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,pid=H.id(req.params.postId,'post'),cid=H.newId(req.body?.client_id),body=H.text(req.body?.body,'comment',1000,{required:true});
    const result=await H.transaction(pool,async db=>{
      const p=await visiblePost(db,me,pid,true);const ins=await db.query('INSERT INTO post_comments(id,post_id,user_id,body) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id',[cid,pid,me,body]);
      const row=await db.query('SELECT c.*,u.username,u.display_name,u.avatar_url FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.id=$1',[cid]);const c=row.rows[0];
      if(!c||c.user_id!==me||c.post_id!==pid||c.body!==body)throw new H.HttpError(409,'Conflicting comment submission');
      const counts=await db.query('UPDATE posts SET comment_count=(SELECT count(*) FROM post_comments WHERE post_id=$1) WHERE id=$1 RETURNING comment_count',[pid]);
      if(ins.rows.length)await H.notify(db,p.user_id,me,'post_comment','post',pid,{comment_id:cid});return{comment:c,comment_count:counts.rows[0].comment_count,replayed:!ins.rows.length};
    });res.status(result.replayed?200:201).json(result);
  }));
  router.delete('/posts/:postId/comments/:commentId',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,pid=H.id(req.params.postId,'post'),cid=H.id(req.params.commentId,'comment');
    const result=await H.transaction(pool,async db=>{const p=await visiblePost(db,me,pid,true);
      const del=await db.query('DELETE FROM post_comments WHERE id=$1 AND post_id=$2 AND (user_id=$3 OR $4::boolean) RETURNING id',[cid,pid,me,p.user_id===me]);if(!del.rows.length)throw new H.HttpError(404,'Comment unavailable');
      const count=await db.query('UPDATE posts SET comment_count=(SELECT count(*) FROM post_comments WHERE post_id=$1) WHERE id=$1 RETURNING comment_count',[pid]);return{removed:true,id:cid,comment_count:count.rows[0].comment_count};});res.json(result);
  }));
  router.post('/checkins',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,b=req.body||{},vid=H.id(b.venue_id,'venue'),cid=H.newId(b.client_id),note=H.text(b.note,'note',500),aud=H.audience(b.audience,'private');
    const result=await H.transaction(pool,async db=>{
      const v=await db.query("SELECT id FROM venues WHERE id=$1 AND is_active IS TRUE AND COALESCE(business_status,'') NOT ILIKE 'CLOSED%' AND lower(COALESCE(business_status,'')) NOT IN ('temporarily_closed','permanently_closed')",[vid]);if(!v.rows.length)throw new H.HttpError(404,'Venue unavailable');
      const ins=await db.query('INSERT INTO checkins(id,user_id,venue_id,note,audience) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING id',[cid,me,vid,note||null,aud]);
      const r=await db.query('SELECT * FROM checkins WHERE id=$1',[cid]);const c=r.rows[0];if(!c||c.user_id!==me||c.venue_id!==vid||String(c.note||'')!==note||c.audience!==aud)throw new H.HttpError(409,'Conflicting check-in submission');return{checkin:c,replayed:!ins.rows.length};
    });res.status(result.replayed?200:201).json(result);
  }));
  router.get('/checkins',...secured,H.wrap(async(req,res)=>{
    const r=await pool.query('SELECT c.*,v.name AS venue_name,v.slug AS venue_slug FROM checkins c JOIN venues v ON v.id=c.venue_id WHERE c.user_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT 100',[req.user.id]);res.json({checkins:r.rows});
  }));
  router.delete('/checkins/:checkinId',...secured,write,H.wrap(async(req,res)=>{
    const cid=H.id(req.params.checkinId,'check-in'),r=await pool.query('DELETE FROM checkins WHERE id=$1 AND user_id=$2 RETURNING id',[cid,req.user.id]);if(!r.rows.length)throw new H.HttpError(404,'Check-in unavailable');res.json({removed:true,id:cid});
  }));
  router.get('/venues/:identifier/activity',...publicRead,H.wrap(async(req,res)=>{
    const me=req.user?.id||null,value=H.text(req.params.identifier,'venue',180,{required:true});
    const v=await pool.query(`SELECT id FROM venues WHERE ${H.UUID.test(value)?'id':'slug'}=$1 AND is_active AND COALESCE(business_status,'') NOT ILIKE 'CLOSED%' AND lower(COALESCE(business_status,'')) NOT IN ('temporarily_closed','permanently_closed')`,[value]);if(!v.rows.length)throw new H.HttpError(404,'Venue unavailable');
    const r=await pool.query(`SELECT c.id,c.user_id,c.venue_id,c.note,c.created_at,u.username,u.display_name,u.avatar_url,${H.friendSQL('u.id')} AS is_friend
      FROM checkins c JOIN users u ON u.id=c.user_id WHERE c.venue_id=$2 AND ${H.profileSQL()} AND ${H.audienceSQL('c.user_id','c.audience')}
      ORDER BY c.created_at DESC,c.id DESC LIMIT 20`,[me,v.rows[0].id]);res.json({checkins:r.rows,activity:r.rows.map(c=>({...c,kind:'checkin'})),friends:r.rows.filter(c=>c.is_friend),venue_id:v.rows[0].id});
  }));
}
module.exports={install,feedSQL,visiblePost,imageFor};
