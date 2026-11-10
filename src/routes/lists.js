'use strict';
const express=require('express'),crypto=require('node:crypto'),rateLimit=require('express-rate-limit');
const pool=require('../config/database'),H=require('../launch/shared'),L=require('../services/list-membership');
const {savedVenue,availableVenueSQL}=require('../services/venue-helpers');
const {requireAuth,optionalAuth}=require('../middleware/auth');
const router=express.Router();
const write=rateLimit({windowMs:60000,max:90,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Too many actions. Wait a minute and try again.'}});
router.use(H.noStore);
for(const name of ['listId','venueId','userId'])router.param(name,(req,res,next,value)=>{try{req.params[name]=H.id(value,name);next();}catch(e){res.status(e.status).json({error:e.message});}});
const VENUES=`SELECT v.id,v.slug,v.name,v.type,v.image_url,NULL::numeric AS rating,v.neighborhood,v.price_label,
 v.source,v.reservation_url,v.opentable_url,v.resy_url,v.website,(${availableVenueSQL('v')}) AS venue_available
 FROM list_venues lv JOIN venues v ON v.id=lv.venue_id WHERE lv.list_id=$1 ORDER BY lv.added_at DESC,v.id`;
async function full(db,me,id){
 const head=await L.head(db,me,id);
 const venues=(await db.query(VENUES,[id])).rows.map(savedVenue);
 let members=[];
 // Public access never exposes the private collaboration roster.
 if(head.can_edit){members=(await db.query(`SELECT m.user_id AS id,m.status,m.invitation_id,m.created_at+INTERVAL '7 days' AS expires_at,
 NOT ${H.actorSQL('u')} AS restricted,CASE WHEN ${H.actorSQL('u')} THEN u.username ELSE NULL END AS username,
 CASE WHEN ${H.actorSQL('u')} THEN u.display_name ELSE 'Unavailable member' END AS display_name,
 CASE WHEN ${H.actorSQL('u')} THEN u.avatar_url ELSE NULL END AS avatar_url
 FROM list_members m JOIN users u ON u.id=m.user_id WHERE m.list_id=$2 AND (m.status='accepted' OR $3 AND m.status='pending')
 ORDER BY m.created_at,m.user_id`,[me,id,head.is_owner])).rows;}
 return{...head,venues,venue_count:venues.length,members};
}
async function locked(me,id,fn,{extra=[]}={}){return H.transaction(pool,async db=>{await L.serialize(db,id);if(me)await L.lockPairs(db,id,me,extra);return fn(db);});}
function body(req){const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b))throw new H.HttpError(400,'Expected an object');return b;}
function keys(b,allowed){if(Object.keys(b).some(k=>!allowed.includes(k)))throw new H.HttpError(400,'Unsupported list field');}
router.get('/',requireAuth,H.wrap(async(req,res)=>{
 const limit=H.integer(req.query.limit,100,1,100),offset=H.integer(req.query.offset,0,0,10000,'offset');
 const r=await pool.query(`SELECT l.id FROM lists l JOIN users u ON u.id=l.user_id WHERE l.user_id=$1 OR ${L.MEMBER}
 ORDER BY l.updated_at DESC,l.id DESC LIMIT $2 OFFSET $3`,[req.user.id,limit+1,offset]);
 const lists=[];for(const x of r.rows.slice(0,limit)){
  const entry=await locked(req.user.id,x.id,async db=>{
   try{return await full(db,req.user.id,x.id);}catch(e){
    if(e.status!==404)throw e;
    const mine=await db.query("SELECT list_id FROM list_members WHERE list_id=$1 AND user_id=$2 AND status='accepted'",[x.id,req.user.id]);
    if(!mine.rows.length)return null;
    // Own membership is not a grant to inspect a now-hidden owner's identity or activity.
    return{id:x.id,name:'Unavailable shared list',access_restricted:true,can_leave:true,is_owner:false,can_manage:false,can_edit:false,can_add_venues:false,can_remove_venues:false,venues:[],venue_count:0,members:[]};
   }
  });if(entry)lists.push(entry);
 }
 res.json({lists,has_more:r.rows.length>limit,offset});
}));
router.get('/invitations',requireAuth,H.wrap(async(req,res)=>{
 const limit=H.integer(req.query.limit,100,1,100),offset=H.integer(req.query.offset,0,0,10000,'offset');
 const r=await pool.query(`SELECT l.id,l.name,l.user_id AS owner_id,u.username AS owner_username,u.display_name AS owner_name,
 m.invitation_id,m.created_at+INTERVAL '7 days' AS expires_at FROM list_members m JOIN lists l ON l.id=m.list_id JOIN users u ON u.id=l.user_id
 WHERE m.user_id=$1 AND m.status='pending' AND m.created_at>NOW()-INTERVAL '7 days' AND ${H.actorSQL('u')} AND ${H.friendSQL('l.user_id')}
 ORDER BY m.created_at DESC,l.id DESC LIMIT $2 OFFSET $3`,[req.user.id,limit+1,offset]);res.json({invitations:r.rows.slice(0,limit),has_more:r.rows.length>limit,offset});
}));
router.post('/',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['client_id','name','description','is_public']);const me=req.user.id,id=H.newId(b.client_id),name=H.text(b.name,'list name',80,{required:true}),description=H.text(b.description,'description',500);
 const isPublic=b.is_public===undefined?false:b.is_public;if(typeof isPublic!=='boolean')throw new H.HttpError(400,'is_public must be a boolean');
 const hash=crypto.createHash('sha256').update(JSON.stringify([name,description,isPublic])).digest('hex');
 const result=await H.transaction(pool,async db=>{
  // Serializes names and retry receipts per owner without modifying legacy duplicate names.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:list-create:'+me]);
  const old=(await db.query('SELECT body_hash,list_id FROM list_create_requests WHERE user_id=$1 AND client_id=$2',[me,id])).rows[0];
  if(old){if(old.body_hash!==hash)throw new H.HttpError(409,'Conflicting list submission');if(!old.list_id)throw new H.HttpError(410,'This list was deleted');return{list:await full(db,me,old.list_id),replayed:true};}
  const duplicate=await db.query('SELECT id FROM lists WHERE user_id=$1 AND lower(name)=lower($2)',[me,name]);if(duplicate.rows.length)throw new H.HttpError(409,'You already have a list with that name');
  const reserved=await db.query('INSERT INTO list_id_reservations(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[id]);
  if(!reserved.rows.length)throw new H.HttpError(409,'This list identifier has already been used');
  await db.query('INSERT INTO lists(id,user_id,name,description,is_public) VALUES($1,$2,$3,$4,$5)',[id,me,name,description,isPublic]);
  await db.query('INSERT INTO list_create_requests(user_id,client_id,body_hash,list_id) VALUES($1,$2,$3,$2)',[me,id,hash]);
  return{list:await full(db,me,id),replayed:false};
 });res.status(result.replayed?200:201).json(result);
}));
router.post('/:listId/venues',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['venue_id']);const id=req.params.listId,me=req.user.id,vid=H.id(b.venue_id,'venue_id');
 const result=await locked(me,id,async db=>{
  const head=await L.head(db,me,id,{write:true});
  const venue=await db.query(`SELECT id FROM venues WHERE id=$1 AND ${availableVenueSQL('')} FOR SHARE`,[vid]);if(!venue.rows.length)throw new H.HttpError(404,'Venue unavailable');
  const added=await db.query('INSERT INTO list_venues(list_id,venue_id) VALUES($1,$2) ON CONFLICT(list_id,venue_id) DO NOTHING RETURNING id',[id,vid]);
  return{success:true,list_id:id,venue_id:vid,replayed:!added.rows.length,revision:added.rows.length?await L.touch(db,id):head.revision};
 });res.json(result);
}));
router.delete('/:listId/venues/:venueId',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['revision']);const id=req.params.listId,me=req.user.id;
 const result=await locked(me,id,async db=>{const head=await L.head(db,me,id,{write:true});L.revision(head,b.revision);
  const del=await db.query('DELETE FROM list_venues WHERE list_id=$1 AND venue_id=$2 RETURNING id',[id,req.params.venueId]);
  return{success:true,list_id:id,venue_id:req.params.venueId,revision:del.rows.length?await L.touch(db,id):head.revision};
 });res.json(result);
}));
router.patch('/:listId',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['name','description','is_public','revision']);const id=req.params.listId,me=req.user.id;
 if(!['name','description','is_public'].some(k=>b[k]!==undefined))throw new H.HttpError(400,'Provide a list change');
 const name=b.name===undefined?undefined:H.text(b.name,'list name',80,{required:true}),description=b.description===undefined?undefined:H.text(b.description,'description',500);
 if(b.is_public!==undefined&&typeof b.is_public!=='boolean')throw new H.HttpError(400,'is_public must be a boolean');
 const result=await locked(me,id,async db=>{const head=await L.head(db,me,id,{ownerOnly:true});L.revision(head,b.revision);
  // The same owner-name lock serializes create and rename checks.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:list-create:'+me]);
  if(name!==undefined){const dup=await db.query('SELECT id FROM lists WHERE user_id=$1 AND lower(name)=lower($2) AND id<>$3',[me,name,id]);if(dup.rows.length)throw new H.HttpError(409,'You already have a list with that name');}
  await db.query('UPDATE lists SET name=$2,description=$3,is_public=$4 WHERE id=$1',[id,name??head.name,description??head.description,b.is_public??head.is_public]);await L.touch(db,id);return{list:await full(db,me,id)};
 });res.json(result);
}));
router.delete('/:listId',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['revision']);const id=req.params.listId,me=req.user.id;
 await locked(me,id,async db=>{const head=await L.head(db,me,id,{ownerOnly:true});L.revision(head,b.revision);const hash=crypto.createHash('sha256').update(JSON.stringify([head.name,head.description||'',head.is_public===true])).digest('hex');
  // Pre-feature lists also reserve their IDs when deleted, preventing old links from being reused.
  await db.query('INSERT INTO list_id_reservations(id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
  await db.query('INSERT INTO list_create_requests(user_id,client_id,body_hash,list_id) VALUES($1,$2,$3,$2) ON CONFLICT(user_id,client_id) DO NOTHING',[me,id,hash]);
  await db.query("DELETE FROM notifications WHERE ref_type='list' AND ref_id=$1",[id]);await db.query('DELETE FROM lists WHERE id=$1',[id]);});res.json({success:true});
}));
router.post('/:listId/invitations',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['user_id']);const id=req.params.listId,me=req.user.id,target=H.id(b.user_id,'friend');if(target===me)throw new H.HttpError(400,'You already own this list');
 const result=await locked(me,id,async db=>{
  const head=await L.head(db,me,id,{ownerOnly:true});const rel=await H.relation(db,me,target);if(!rel.is_friend)throw new H.HttpError(403,'Invite an accepted friend');
  const old=(await db.query("SELECT status,invitation_id,created_at>NOW()-INTERVAL '7 days' AS unexpired FROM list_members WHERE list_id=$1 AND user_id=$2",[id,target])).rows[0];
  if(old&&(old.status==='accepted'||old.status==='pending'&&old.unexpired))return{ok:true,already_invited:true,revision:head.revision,invitation_id:old.invitation_id};
  const count=(await db.query("SELECT count(*)::int AS n FROM list_members WHERE list_id=$1 AND (status='accepted' OR status='pending' AND created_at>NOW()-INTERVAL '7 days')",[id])).rows[0].n;
  if(count>=19)throw new H.HttpError(409,'A list can include up to 20 people');
  const token=crypto.randomUUID();await db.query(`INSERT INTO list_members(list_id,user_id,invited_by,invitation_id) VALUES($1,$2,$3,$4)
  ON CONFLICT(list_id,user_id) DO UPDATE SET status='pending',invited_by=EXCLUDED.invited_by,invitation_id=EXCLUDED.invitation_id,created_at=clock_timestamp(),responded_at=NULL`,[id,target,me,token]);
  await db.query("DELETE FROM notifications WHERE user_id=$1 AND type='list_invitation' AND ref_type='list' AND ref_id=$2",[target,id]);
  await H.notify(db,target,me,'list_invitation','list',id,{message:'You have a private list invitation.',invitation_id:token});return{ok:true,invitation_id:token,revision:await L.touch(db,id)};
 },{extra:[target]});res.json(result);
}));
router.put('/:listId/invitation',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['response','invitation_id']);const id=req.params.listId,me=req.user.id,answer=b.response;if(!['accepted','declined'].includes(answer))throw new H.HttpError(400,'Accept or decline the invitation');
 const token=H.id(b.invitation_id,'invitation_id');
 const result=await locked(me,id,async db=>{
  const head=(await db.query('SELECT * FROM lists WHERE id=$1',[id])).rows[0];if(!head)throw new H.HttpError(404,'Invitation unavailable');
  const old=(await db.query("SELECT *,created_at>NOW()-INTERVAL '7 days' AS unexpired FROM list_members WHERE list_id=$1 AND user_id=$2",[id,me])).rows[0];
  if(!old||token&&token!==old.invitation_id)throw new H.HttpError(404,'Invitation unavailable');
  if(answer==='accepted'){const rel=await H.relation(db,me,head.user_id);if(!rel.is_friend)throw new H.HttpError(404,'Invitation unavailable');
   const peers=(await db.query("SELECT user_id FROM list_members WHERE list_id=$1 AND status='accepted' AND user_id<>$2",[id,me])).rows;
   for(const peer of peers)await H.relation(db,me,peer.user_id);
  }
  if(old.status===answer)return{ok:true,replayed:true,revision:head.revision};
  if(old.status!=='pending')throw new H.HttpError(409,'This invitation is no longer pending');
  if(answer==='accepted'&&!old.unexpired)throw new H.HttpError(410,'This invitation has expired');
  await db.query('UPDATE list_members SET status=$3,responded_at=clock_timestamp() WHERE list_id=$1 AND user_id=$2',[id,me,answer]);
  await db.query("DELETE FROM notifications WHERE user_id=$1 AND type='list_invitation' AND ref_type='list' AND ref_id=$2",[me,id]);return{ok:true,revision:await L.touch(db,id)};
 });res.json(result);
}));
router.delete('/:listId/members/:userId',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['revision']);const id=req.params.listId,me=req.user.id,target=req.params.userId;
 const result=await locked(me,id,async db=>{
  const head=(await db.query('SELECT * FROM lists WHERE id=$1',[id])).rows[0];if(!head||head.user_id!==me&&target!==me)throw new H.HttpError(404,'List unavailable');
  if(target!==me)L.revision(head,b.revision);
  if(target===head.user_id)throw new H.HttpError(400,'The owner cannot leave their list');
  const previous=(await db.query('SELECT status FROM list_members WHERE list_id=$1 AND user_id=$2',[id,target])).rows[0];if(!previous)throw new H.HttpError(404,'Member unavailable');
  const changed=await db.query("UPDATE list_members SET status=$3,responded_at=clock_timestamp() WHERE list_id=$1 AND user_id=$2 AND status IN ('pending','accepted') RETURNING user_id",[id,target,target===me?'left':'removed']);
  await db.query("DELETE FROM notifications WHERE user_id=$1 AND ref_type='list' AND ref_id=$2",[target,id]);return{ok:true,revision:changed.rows.length?await L.touch(db,id):head.revision};
 },{extra:[target]});res.json(result);
}));
// Legacy explicit public-share action is separate from private invitations.
router.post('/:listId/share',requireAuth,write,H.wrap(async(req,res)=>{
 const b=body(req);keys(b,['revision']);const id=req.params.listId,me=req.user.id;
 const result=await locked(me,id,async db=>{const head=await L.head(db,me,id,{ownerOnly:true});L.revision(head,b.revision);
  await db.query('UPDATE lists SET is_public=true WHERE id=$1',[id]);await L.touch(db,id);
  const post=(await db.query("INSERT INTO posts(user_id,body,ref_type,ref_id) VALUES($1,$2,'list_share',$3) RETURNING id,user_id,body,ref_type,ref_id,created_at",[me,'Check out my list: '+head.name,id])).rows[0];return{post};
 });res.status(201).json(result);
}));
router.get('/:listId',optionalAuth,H.wrap(async(req,res)=>res.json({list:await locked(req.user?.id,req.params.listId,db=>full(db,req.user?.id,req.params.listId))})));
module.exports=router;
