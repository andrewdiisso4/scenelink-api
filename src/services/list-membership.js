'use strict';
const H=require('../launch/shared');
const MEMBER=`EXISTS(SELECT 1 FROM list_members mine WHERE mine.list_id=l.id AND mine.user_id=$1 AND mine.status='accepted')`;
const PEERS_VISIBLE=`NOT EXISTS(SELECT 1 FROM list_members peer JOIN users other ON other.id=peer.user_id WHERE peer.list_id=l.id AND peer.status='accepted' AND other.id<>$1 AND NOT ${H.actorSQL('other')})`;
const SHARED=`(${MEMBER} AND ${H.friendSQL('l.user_id')} AND ${H.actorSQL('u')} AND ${PEERS_VISIBLE})`;
const READABLE=`(l.user_id=$1 OR ${SHARED} OR (l.is_public IS TRUE AND ${H.profileSQL('u')}))`;
// Notices are checked again when read. A response/revoke/expiry never leaves a usable invitation.
const NOTICE=`(n.ref_type IS DISTINCT FROM 'list' OR EXISTS(SELECT 1 FROM lists l JOIN users u ON u.id=l.user_id WHERE l.id=n.ref_id
 AND ${H.actorSQL('u')} AND (l.user_id=$1 OR (${H.friendSQL('l.user_id')} AND EXISTS(SELECT 1 FROM list_members lm
 WHERE lm.list_id=l.id AND lm.user_id=$1 AND (lm.status='accepted' OR lm.status='pending' AND lm.created_at>NOW()-INTERVAL '7 days')
 AND (n.type<>'list_invitation' OR lm.status='pending' AND lm.invitation_id::text=n.data->>'invitation_id'))))))`;
async function serialize(db,id){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:list:'+id]);}
async function lockPairs(db,id,actor,extra=[]){
 const r=await db.query("SELECT user_id FROM lists WHERE id=$1 UNION SELECT user_id FROM list_members WHERE list_id=$1 AND status='accepted'",[id]);
 const targets=[...new Set([...r.rows.map(x=>x.user_id),...extra].filter(x=>x!==actor))];
 targets.sort((a,b)=>[actor,a].sort().join(':').localeCompare([actor,b].sort().join(':')));
 for(const target of targets)await H.lockPair(db,actor,target);
}
async function head(db,me,id,{ownerOnly=false,write=false}={}){
 const r=await db.query(`SELECT l.*,u.username AS owner_username,u.display_name AS owner_name,u.avatar_url AS owner_avatar_url,
 l.user_id=$1 AS is_owner,${MEMBER} AS can_leave,(l.user_id=$1 OR ${SHARED}) AS can_edit FROM lists l JOIN users u ON u.id=l.user_id
 WHERE l.id=$2 AND ${ownerOnly?'l.user_id=$1':write?`(l.user_id=$1 OR ${SHARED})`:READABLE}`,[me||null,id]);
 if(!r.rows.length)throw new H.HttpError(404,'List unavailable');
 const x=r.rows[0];return{...x,is_owner:!!x.is_owner,can_edit:!!x.can_edit,owner_id:x.user_id,can_manage:!!x.is_owner,can_add_venues:!!x.can_edit,can_remove_venues:!!x.can_edit};
}
function revision(list,value){
 if(value===undefined)throw new H.HttpError(428,'Refresh this list before changing it','REVISION_REQUIRED');
 if(!Number.isSafeInteger(value)||value<1)throw new H.HttpError(400,'Invalid revision');
 if(value!==list.revision)throw new H.HttpError(409,'This list changed. Refresh before trying again.','STALE_LIST');
}
async function touch(db,id){return(await db.query('UPDATE lists SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING revision',[id])).rows[0].revision;}
// Called while the canonical friendship pair lock is held. No list lock is taken,
// preventing inversion against mutations (list -> pair -> row). Do not touch lists here.
async function revokePair(db,a,b){
 const r=await db.query(`UPDATE list_members m SET status='removed',responded_at=clock_timestamp() FROM lists l WHERE l.id=m.list_id
 AND m.status IN ('pending','accepted') AND ((l.user_id=$1 AND m.user_id=$2) OR (l.user_id=$2 AND m.user_id=$1)) RETURNING m.list_id`,[a,b]);
 await db.query("DELETE FROM notifications WHERE ref_type='list' AND ((user_id=$1 AND actor_id=$2) OR (user_id=$2 AND actor_id=$1))",[a,b]);
 return r.rowCount;
}
module.exports={MEMBER,SHARED,READABLE,NOTICE,serialize,lockPairs,head,revision,touch,revokePair};
