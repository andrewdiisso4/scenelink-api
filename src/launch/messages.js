'use strict';
const crypto=require('node:crypto');
const H=require('./shared');
const ZERO='00000000-0000-0000-0000-000000000000';
const UNREAD=`m.deleted_at IS NULL AND m.sender_id<>$1 AND (m.created_at,m.id)>(COALESCE(cp.last_read_at,'-infinity'::timestamptz),COALESCE(cp.last_read_message_id,'${ZERO}'::uuid))`;
const MESSAGE_FIELDS=`m.id,m.conversation_id,m.sender_id,CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,${H.timeSQL('m')},m.edited_at,m.deleted_at,m.revision,m.change_seq,'message' AS kind`;
function bodyHash(body){return crypto.createHash('sha256').update(body,'utf8').digest('hex');}
function sequence(value,fallback='0'){
  if(value===undefined)return fallback;
  if(typeof value!=='string'||!/^\d{1,19}$/.test(value)||BigInt(value)>9223372036854775807n)throw new H.HttpError(400,'Invalid message sequence','INVALID_CURSOR');
  return BigInt(value).toString();
}
function revision(value){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>2147483646)throw new H.HttpError(400,'Provide the current message revision');return value;}
async function access(db,me,cid,send=false,{lock=false,cleanup=false,replayAware=false}={}) {
  const members=await db.query(`SELECT c.id,c.is_group,c.title,u.id AS user_id,u.username,u.display_name,u.avatar_url,u.allow_messages,u.is_active,u.is_suspended
    FROM conversations c JOIN conversation_participants p ON p.conversation_id=c.id JOIN users u ON u.id=p.user_id
    WHERE c.id=$1 AND EXISTS(SELECT 1 FROM conversation_participants mine WHERE mine.conversation_id=c.id AND mine.user_id=$2)
    ORDER BY u.id`,[cid,me]);
  if(!members.rows.length)throw new H.HttpError(404,'Conversation unavailable');
  const others=members.rows.filter(x=>x.user_id!==me);
  if(send||lock){const keys=others.map(x=>[me,x.user_id].sort().join(':')).sort();for(const pair of keys)await H.lockPair(db,...pair.split(':'));}
  let canSend=true;
  if(!cleanup)for(const other of others){
    if(send)await db.query('SELECT id FROM users WHERE id=$1 FOR SHARE',[other.user_id]);
    const r=await H.relation(db,me,other.user_id);
    if(r.allow_messages==='none'||r.allow_messages==='friends'&&!r.is_friend){canSend=false;if(send&&!replayAware)throw new H.HttpError(403,'A participant is not accepting messages');}
  }
  return{can_send:canSend,conversation:{id:cid,is_group:members.rows[0].is_group,title:members.rows[0].title},participants:members.rows.map(({user_id,username,display_name,avatar_url})=>({id:user_id,username,display_name,avatar_url})),others};
}
async function receipts(db,me,cid){
  const r=await db.query(`SELECT p.user_id,p.last_read_message_id,to_char(p.last_read_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_read_at FROM conversation_participants p JOIN users u ON u.id=p.user_id
    WHERE p.conversation_id=$1 AND (p.user_id=$2 OR u.share_read_receipts IS TRUE) ORDER BY p.user_id`,[cid,me]);return r.rows;
}
async function lockConversation(db,cid){
  // All canonical send/edit/delete writes serialize here. A per-conversation sequence has no
  // out-of-order transaction-commit gaps (unlike a global PostgreSQL sequence).
  await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[cid]);
}
async function nextVersion(db,cid){const r=await db.query('UPDATE conversations SET message_version=message_version+1 WHERE id=$1 RETURNING message_version',[cid]);return r.rows[0].message_version;}
async function getMessage(db,cid,mid){const r=await db.query(`SELECT ${MESSAGE_FIELDS} FROM messages m WHERE m.conversation_id=$1 AND m.id=$2`,[cid,mid]);return r.rows[0];}
const VISIBLE_CONVERSATION=`NOT EXISTS(SELECT 1 FROM conversation_participants hidden JOIN users hu ON hu.id=hidden.user_id
  WHERE hidden.conversation_id=c.id AND hidden.user_id<>$1 AND NOT ${H.actorSQL('hu')})`;
function install({router,pool,auth,write}) {
  const secured=[auth.requireAuth,H.noStore];
  router.get('/conversations/unread-count',...secured,H.wrap(async(req,res)=>{
    const r=await pool.query(`SELECT count(*)::int AS unread FROM conversation_participants cp JOIN conversations c ON c.id=cp.conversation_id
      JOIN messages m ON m.conversation_id=c.id WHERE cp.user_id=$1 AND ${UNREAD} AND ${VISIBLE_CONVERSATION}`,[req.user.id]);res.json(r.rows[0]);
  }));
  router.get('/conversations',...secured,H.wrap(async(req,res)=>{
    const limit=H.integer(req.query.limit,30,1,100),offset=H.integer(req.query.offset,0,0,10000,'offset');
    const r=await pool.query(`SELECT c.id,c.is_group,c.title,c.last_message_at,c.message_version,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url) ORDER BY u.id)
        FROM conversation_participants p JOIN users u ON u.id=p.user_id WHERE p.conversation_id=c.id AND u.id<>$1),'[]'::jsonb) AS participants,
      (SELECT CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS last_message,
      (SELECT m.deleted_at IS NOT NULL FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS last_message_deleted,
      (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND ${UNREAD}) AS unread_count
      FROM conversations c JOIN conversation_participants cp ON cp.conversation_id=c.id AND cp.user_id=$1
      WHERE ${VISIBLE_CONVERSATION} ORDER BY c.last_message_at DESC NULLS LAST,c.id DESC LIMIT $2 OFFSET $3`,[req.user.id,limit+1,offset]);
    res.json({conversations:r.rows.slice(0,limit),has_more:r.rows.length>limit,offset});
  }));
  router.post('/conversations',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,target=H.id(req.body?.user_id,'user');if(me===target)throw new H.HttpError(400,'Choose another user');
    if(req.body?.is_group||req.body?.user_ids)throw new H.HttpError(400,'Group creation is not enabled by this endpoint');
    const result=await H.transaction(pool,async db=>{
      await H.lockPair(db,me,target);
      await db.query('SELECT id FROM users WHERE id=$1 FOR SHARE',[target]);
      const u=await H.relation(db,me,target);
      if(u.allow_messages==='none'||u.allow_messages==='friends'&&!u.is_friend)throw new H.HttpError(403,'This user is not accepting messages');
      const found=await db.query(`SELECT c.id,c.is_group,c.title FROM conversations c WHERE c.is_group IS FALSE
        AND EXISTS(SELECT 1 FROM conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=$1)
        AND EXISTS(SELECT 1 FROM conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=$2)
        AND (SELECT count(*) FROM conversation_participants p WHERE p.conversation_id=c.id)=2 ORDER BY c.created_at,c.id LIMIT 1`,[me,target]);
      if(found.rows.length)return{conversation:found.rows[0],existing:true};
      const c=await db.query('INSERT INTO conversations(created_by,is_group) VALUES($1,false) RETURNING id,is_group,title',[me]);
      await db.query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)',[c.rows[0].id,me,target]);return{conversation:c.rows[0],existing:false};
    });res.status(result.existing?200:201).json(result);
  }));
  router.get('/conversations/:conversationId/changes',...secured,H.wrap(async(req,res)=>{
    const me=req.user.id,cid=H.id(req.params.conversationId,'conversation'),after=sequence(req.query.after_seq),limit=H.integer(req.query.limit,40,1,100);
    const permission=await access(pool,me,cid);
    const version=await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid]),high=String(version.rows[0].message_version);
    if(BigInt(after)>BigInt(high))throw new H.HttpError(400,'Message sequence is ahead of this conversation','INVALID_CURSOR');
    const r=await pool.query(`SELECT ${MESSAGE_FIELDS},u.username,u.display_name,u.avatar_url FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE m.conversation_id=$1 AND m.change_seq>$2::bigint AND m.change_seq<=$3::bigint ORDER BY m.change_seq ASC,m.id ASC LIMIT $4`,[cid,after,high,limit+1]);
    const messages=r.rows.slice(0,limit),has_more=r.rows.length>limit;
    res.json({messages,has_more,can_send:permission.can_send,next_seq:has_more?String(messages.at(-1).change_seq):high,read_receipts:await receipts(pool,me,cid)});
  }));
  router.get('/conversations/:conversationId/messages',...secured,H.wrap(async(req,res)=>{
    const me=req.user.id,cid=H.id(req.params.conversationId,'conversation'),limit=H.integer(req.query.limit,40,1,100),scope='messages:'+cid,c=H.cursor(req.query.cursor,scope);
    const permission=await access(pool,me,cid);
    // Capture before the page query. A concurrent later mutation is returned again by /changes;
    // clients must merge by id/revision, not append duplicated message records.
    const version=await pool.query('SELECT message_version FROM conversations WHERE id=$1',[cid]);
    const extra={...permission,others:undefined,sync_seq:String(version.rows[0].message_version),read_receipts:await receipts(pool,me,cid)};
    if(req.query.after_id){
      if(req.query.cursor)throw new H.HttpError(400,'Use either cursor or after_id');
      const after=H.id(req.query.after_id,'last received message');
      const exists=await pool.query('SELECT id FROM messages WHERE id=$1 AND conversation_id=$2',[after,cid]);
      if(!exists.rows.length)throw new H.HttpError(400,'Last received message unavailable');
      const newer=await pool.query(`SELECT ${MESSAGE_FIELDS},u.username,u.display_name,u.avatar_url
        FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1
        AND (m.created_at,m.id)>(SELECT a.created_at,a.id FROM messages a WHERE a.id=$2 AND a.conversation_id=$1)
        ORDER BY m.created_at ASC,m.id ASC LIMIT $3`,[cid,after,limit+1]);
      const items=newer.rows.slice(0,limit);
      return res.json({messages:items,has_more:newer.rows.length>limit,next_after_id:items.at(-1)?.id||after,...extra});
    }
    const r=await pool.query(`SELECT ${MESSAGE_FIELDS},u.username,u.display_name,u.avatar_url FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE m.conversation_id=$1 AND ($2::timestamptz IS NULL OR (m.created_at,m.id)<($2::timestamptz,$3::uuid))
      ORDER BY m.created_at DESC,m.id DESC LIMIT $4`,[cid,c?.t||null,c?.i||null,limit+1]);
    const p=H.page(r.rows,limit,scope);res.json({messages:p.items.reverse().map(m=>({...m,cursor_at:m.created_at})),has_more:p.has_more,next_cursor:p.next_cursor,...extra});
  }));
  router.post('/conversations/:conversationId/messages',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,cid=H.id(req.params.conversationId,'conversation'),mid=H.newId(req.body?.client_id),body=H.text(req.body?.body,'message',5000,{required:true});
    const result=await H.transaction(pool,async db=>{
      const permission=await access(db,me,cid,true,{replayAware:true});await lockConversation(db,cid);
      const previous=await db.query('SELECT sender_id,conversation_id,send_body_hash FROM messages WHERE id=$1',[mid]);
      if(previous.rows.length){const old=previous.rows[0];if(old.sender_id!==me||old.conversation_id!==cid||old.send_body_hash!==bodyHash(body))throw new H.HttpError(409,'Conflicting message submission','MESSAGE_ID_CONFLICT');return{message:await getMessage(db,cid,mid),replayed:true};}
      if(!permission.can_send)throw new H.HttpError(403,'A participant is not accepting messages');
      const seq=await nextVersion(db,cid);
      const insert=await db.query(`INSERT INTO messages(id,conversation_id,sender_id,body,send_body_hash,change_seq,created_at)
        VALUES($1,$2,$3,$4,$5,$6,GREATEST(clock_timestamp(),(SELECT MAX(created_at)+INTERVAL '1 microsecond' FROM messages WHERE conversation_id=$2)))
        ON CONFLICT(id) DO NOTHING RETURNING id`,[mid,cid,me,body,bodyHash(body),seq]);
      // A UUID could concurrently be reused across conversations. Roll back this sequence advance.
      if(!insert.rows.length)throw new H.HttpError(409,'Conflicting message submission','MESSAGE_ID_CONFLICT');
      const m=await getMessage(db,cid,mid);
      await db.query('UPDATE conversations SET last_message_at=GREATEST(last_message_at,$2::timestamptz) WHERE id=$1',[cid,m.created_at]);
      for(const user of permission.others)await H.notify(db,user.user_id,me,'message','conversation',cid,{message_id:mid});
      return{message:m,replayed:false};
    });res.status(result.replayed?200:201).json(result);
  }));
  router.patch('/conversations/:conversationId/messages/:messageId',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,cid=H.id(req.params.conversationId,'conversation'),mid=H.id(req.params.messageId,'message'),body=H.text(req.body?.body,'message',5000,{required:true}),expected=revision(req.body?.revision);
    const result=await H.transaction(pool,async db=>{
      await access(db,me,cid,false,{lock:true});await lockConversation(db,cid);
      const old=await getMessage(db,cid,mid);if(!old||old.sender_id!==me)throw new H.HttpError(404,'Message unavailable');
      if(old.deleted_at)throw new H.HttpError(409,'Deleted messages cannot be edited','MESSAGE_DELETED');
      if(old.body===body)return{message:old,replayed:true};
      if(old.revision!==expected)throw new H.HttpError(409,'Message changed. Refresh before editing.','STALE_MESSAGE');
      const seq=await nextVersion(db,cid);
      await db.query('UPDATE messages SET body=$3,revision=revision+1,edited_at=clock_timestamp(),change_seq=$4 WHERE id=$1 AND conversation_id=$2',[mid,cid,body,seq]);
      return{message:await getMessage(db,cid,mid),replayed:false};
    });res.json(result);
  }));
  router.delete('/conversations/:conversationId/messages/:messageId',...secured,write,H.wrap(async(req,res)=>{
    const me=req.user.id,cid=H.id(req.params.conversationId,'conversation'),mid=H.id(req.params.messageId,'message'),expected=revision(req.body?.revision);
    const result=await H.transaction(pool,async db=>{
      // Sender cleanup remains possible after a block. No other participant data is returned.
      await access(db,me,cid,false,{lock:true,cleanup:true});await lockConversation(db,cid);
      const old=await getMessage(db,cid,mid);if(!old||old.sender_id!==me)throw new H.HttpError(404,'Message unavailable');
      if(old.deleted_at)return{message:old,replayed:true};
      if(old.revision!==expected)throw new H.HttpError(409,'Message changed. Refresh before deleting.','STALE_MESSAGE');
      const seq=await nextVersion(db,cid);
      await db.query("UPDATE messages SET body='',revision=revision+1,deleted_at=clock_timestamp(),change_seq=$3 WHERE id=$1 AND conversation_id=$2",[mid,cid,seq]);
      await db.query(`DELETE FROM notifications WHERE (ref_type='conversation' AND ref_id=$1 AND data->>'message_id'=$2) OR (ref_type='message' AND ref_id=$2::uuid)`,[cid,mid]);
      return{message:await getMessage(db,cid,mid),replayed:false};
    });res.json(result);
  }));
  router.post('/conversations/:conversationId/read',...secured,H.wrap(async(req,res)=>{
    const me=req.user.id,cid=H.id(req.params.conversationId,'conversation'),mid=H.id(req.body?.through_id,'last displayed message');
    const read=await H.transaction(pool,async db=>{
      await access(db,me,cid,false,{lock:true});
      const r=await db.query('SELECT id FROM messages WHERE id=$1 AND conversation_id=$2',[mid,cid]);if(!r.rows.length)throw new H.HttpError(404,'Message unavailable');
      await db.query(`UPDATE conversation_participants cp SET last_read_at=m.created_at,last_read_message_id=m.id FROM messages m
        WHERE cp.user_id=$1 AND cp.conversation_id=$2 AND m.id=$3 AND m.conversation_id=cp.conversation_id
        AND (m.created_at,m.id)>(COALESCE(cp.last_read_at,'-infinity'::timestamptz),COALESCE(cp.last_read_message_id,'${ZERO}'::uuid))`,[me,cid,mid]);
      // Notifications are created after messages, so compare the referenced message position,
      // not notification timestamps (which could leave the final notice incorrectly unread).
      await db.query(`UPDATE notifications n SET read_at=NOW() WHERE n.user_id=$1 AND n.read_at IS NULL AND
        ((n.ref_type='conversation' AND n.ref_id=$2 AND EXISTS(SELECT 1 FROM messages notified,messages through_message
          WHERE notified.id::text=n.data->>'message_id' AND notified.conversation_id=$2 AND through_message.id=$3
          AND (notified.created_at,notified.id)<=(through_message.created_at,through_message.id)))
        OR (n.ref_type='message' AND EXISTS(SELECT 1 FROM messages notified,messages through_message
          WHERE notified.id=n.ref_id AND notified.conversation_id=$2 AND through_message.id=$3
          AND (notified.created_at,notified.id)<=(through_message.created_at,through_message.id))))`,[me,cid,mid]);
      const current=await db.query(`SELECT last_read_message_id,to_char(last_read_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_read_at FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2`,[cid,me]);return current.rows[0];
    });res.json({ok:true,through_id:read.last_read_message_id,last_read_at:read.last_read_at});
  }));
}
module.exports={install,access,UNREAD,VISIBLE_CONVERSATION,MESSAGE_FIELDS,bodyHash,sequence,revision};
