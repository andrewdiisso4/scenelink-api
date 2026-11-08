'use strict';
// Called only by the guarded real HTTP/SQL localhost integration harness.
const assert=require('node:assert/strict');
module.exports=async function messagingIntegration({api,pool,check,crypto}){
  const suffix=crypto.randomBytes(4).toString('hex'),accounts=[];
  await check('messaging fixture uses independent verified fictional local accounts',async()=>{
    for(const role of ['sender','receiver','outsider']){
      const user=await api('POST','/auth/signup',{email:`${role}.${suffix}@example.invalid`,username:`msg_${role}_${suffix}`,display_name:'Local message '+role,password:'Isolated message QA password 123'},null,201);accounts.push(user);
      await pool.query('UPDATE users SET email_verified_at=NOW(),verified_email=lower(email) WHERE id=$1',[user.user.id]);
    }
  });
  const [a,b,c]=accounts;let cid,original,edited,second,last,baseline;
  const path=()=>'/conversations/'+cid;
  await check('direct conversation reuse, unsupported group creation and membership boundaries',async()=>{
    cid=(await api('POST','/conversations',{user_id:b.user.id},a.token,201)).conversation.id;
    const replay=await api('POST','/conversations',{user_id:a.user.id},b.token);assert.equal(replay.conversation.id,cid);assert.equal(replay.existing,true);
    await api('POST','/conversations',{user_id:b.user.id,is_group:true},a.token,400);
    await api('GET',path()+'/messages',undefined,c.token,404);await api('GET',path()+'/changes?after_seq=0',undefined,c.token,404);
    await api('POST',path()+'/messages',{body:'Intrusion',client_id:crypto.randomUUID()},c.token,404);
  });
  await check('stable message id prevents duplicate delivery and content reuse',async()=>{
    original={body:'Original integration-only message',client_id:crypto.randomUUID()};
    for(const body of ['',null,'x'.repeat(5001)])await api('POST',path()+'/messages',{body,client_id:crypto.randomUUID()},a.token,400);
    const first=await api('POST',path()+'/messages',original,a.token,201);assert.equal(first.message.revision,1);assert.equal(first.message.change_seq,'1');assert.equal(first.message.send_body_hash,undefined);assert.match(first.message.created_at,/\.\d{6}Z$/);assert.equal(first.message.cursor_at,first.message.created_at);
    const replay=await api('POST',path()+'/messages',original,a.token);assert.equal(replay.replayed,true);
    await api('POST',path()+'/messages',{...original,body:'Reused id different content'},a.token,409);
    await api('POST',path()+'/messages',original,b.token,409);
    const notes=await pool.query("SELECT count(*)::int n FROM notifications WHERE ref_type='conversation' AND ref_id=$1 AND data->>'message_id'=$2",[cid,original.client_id]);assert.equal(notes.rows[0].n,1);
    baseline=(await api('GET',path()+'/messages',undefined,b.token)).sync_seq;
  });
  await check('sender-only optimistic edits preserve original retry identity',async()=>{
    await api('PATCH',path()+'/messages/'+original.client_id,{body:'Not allowed',revision:1},b.token,404);
    await api('PATCH',path()+'/messages/'+original.client_id,{body:'Not allowed',revision:1},c.token,404);
    await api('PATCH',path()+'/messages/'+original.client_id,{body:'Missing revision'},a.token,400);
    edited=(await api('PATCH',path()+'/messages/'+original.client_id,{body:'Edited local message',revision:1},a.token)).message;assert.equal(edited.revision,2);assert(edited.edited_at);
    assert.equal((await api('PATCH',path()+'/messages/'+original.client_id,{body:edited.body,revision:1},a.token)).replayed,true);
    await api('PATCH',path()+'/messages/'+original.client_id,{body:'Stale competing edit',revision:1},a.token,409);
    const replay=await api('POST',path()+'/messages',original,a.token);assert.equal(replay.message.body,edited.body);assert.equal(replay.message.revision,2);
    const changes=await api('GET',path()+'/changes?after_seq='+baseline,undefined,b.token);assert.equal(changes.messages.length,1);assert.equal(changes.messages[0].revision,2);assert.equal(changes.next_seq,'2');
  });
  await check('keyset history and paginated changes neither duplicate nor skip message identities',async()=>{
    second=(await api('POST',path()+'/messages',{body:'Second local message',client_id:crypto.randomUUID()},a.token,201)).message;
    last=(await api('POST',path()+'/messages',{body:'Final local message',client_id:crypto.randomUUID()},a.token,201)).message;
    // Deliberate same-millisecond fixtures prove ordering survives the JSON transport.
    await pool.query("UPDATE messages SET created_at=CASE id WHEN $1::uuid THEN '2026-01-02T01:01:01.000001Z'::timestamptz WHEN $2::uuid THEN '2026-01-02T01:01:01.000002Z'::timestamptz ELSE '2026-01-02T01:01:01.000003Z'::timestamptz END WHERE conversation_id=$4 AND id IN ($1,$2,$3)",[original.client_id,second.id,last.id,cid]);
    const first=await api('GET',path()+'/messages?limit=2',undefined,b.token);assert.deepEqual(first.messages.map(m=>m.id),[second.id,last.id]);assert.equal(first.has_more,true);assert.equal(first.messages[0].cursor_at,'2026-01-02T01:01:01.000002Z');assert.equal(first.messages[1].created_at,'2026-01-02T01:01:01.000003Z');
    const older=await api('GET',path()+'/messages?limit=2&cursor='+encodeURIComponent(first.next_cursor),undefined,b.token);assert.deepEqual(older.messages.map(m=>m.id),[original.client_id]);assert.equal(older.has_more,false);
    const delta1=await api('GET',path()+'/changes?after_seq=0&limit=1',undefined,b.token);assert.equal(delta1.has_more,true);assert.equal(delta1.messages[0].id,original.client_id);
    const delta2=await api('GET',path()+'/changes?after_seq='+delta1.next_seq+'&limit=1',undefined,b.token);assert.equal(delta2.messages[0].id,second.id);
    const delta3=await api('GET',path()+'/changes?after_seq='+delta2.next_seq+'&limit=1',undefined,b.token);assert.equal(delta3.messages[0].id,last.id);assert.equal(delta3.has_more,false);
    assert.equal((await api('GET',path()+'/changes?after_seq='+delta3.next_seq,undefined,b.token)).messages.length,0);
    for(const value of ['-1','no','9223372036854775808','99999'])await api('GET',path()+'/changes?after_seq='+value,undefined,a.token,400);
    await api('GET',path()+'/messages?cursor=invalid',undefined,a.token,400);
  });
  await check('read receipts are opt-in and watermarks never move backwards or clear undisplayed notices',async()=>{
    assert.equal((await api('GET',path()+'/messages',undefined,a.token)).read_receipts.some(r=>r.user_id===b.user.id),false);
    await api('POST',path()+'/read',{through_id:second.id},b.token);
    let notes=(await pool.query("SELECT data->>'message_id' mid,read_at FROM notifications WHERE user_id=$1 AND ref_type='conversation' AND ref_id=$2 ORDER BY created_at",[b.user.id,cid])).rows;
    assert(notes.filter(n=>n.mid!==last.id).every(n=>n.read_at));assert.equal(notes.find(n=>n.mid===last.id).read_at,null);
    const earlier=await api('POST',path()+'/read',{through_id:original.client_id},b.token);assert.equal(earlier.through_id,second.id);
    await api('PATCH','/users/me/settings',{share_read_receipts:true},b.token);
    let receipt=(await api('GET',path()+'/changes?after_seq=4',undefined,a.token)).read_receipts.find(r=>r.user_id===b.user.id);assert.equal(receipt.last_read_message_id,second.id);
    await api('POST',path()+'/read',{through_id:last.id},b.token);
    receipt=(await api('GET',path()+'/changes?after_seq=4',undefined,a.token)).read_receipts.find(r=>r.user_id===b.user.id);assert.equal(receipt.last_read_message_id,last.id);
    notes=(await pool.query("SELECT read_at FROM notifications WHERE user_id=$1 AND ref_type='conversation' AND ref_id=$2",[b.user.id,cid])).rows;assert(notes.every(n=>n.read_at));
    await api('PATCH','/users/me/settings',{share_read_receipts:false},b.token);
    assert.equal((await api('GET',path()+'/changes?after_seq=4',undefined,a.token)).read_receipts.some(r=>r.user_id===b.user.id),false);
    await api('POST',path()+'/read',{through_id:last.id},c.token,404);
    await api('POST',path()+'/read',{through_id:crypto.randomUUID()},b.token,404);
  });
  await check('message deletion is sender-only, revision-safe, body-redacted and replay-safe',async()=>{
    await api('DELETE',path()+'/messages/'+original.client_id,{revision:2},b.token,404);
    await api('DELETE',path()+'/messages/'+original.client_id,{revision:1},a.token,409);
    const deleted=await api('DELETE',path()+'/messages/'+original.client_id,{revision:2},a.token);assert.equal(deleted.message.body,null);assert.equal(deleted.message.revision,3);assert(deleted.message.deleted_at);
    assert.equal((await api('DELETE',path()+'/messages/'+original.client_id,{revision:2},a.token)).replayed,true);
    await api('PATCH',path()+'/messages/'+original.client_id,{body:'Must not resurrect',revision:3},a.token,409);
    const replay=await api('POST',path()+'/messages',original,a.token);assert.equal(replay.message.body,null);assert(replay.message.deleted_at);
    const stored=(await pool.query('SELECT body,send_body_hash FROM messages WHERE id=$1',[original.client_id])).rows[0];assert.equal(stored.body,'');assert.equal(stored.send_body_hash,crypto.createHash('sha256').update(original.body).digest('hex'));
    const notes=(await pool.query("SELECT count(*)::int n FROM notifications WHERE ref_type='conversation' AND ref_id=$1 AND data->>'message_id'=$2",[cid,original.client_id])).rows[0].n;assert.equal(notes,0);
    const changes=await api('GET',path()+'/changes?after_seq=4',undefined,b.token);assert.equal(changes.messages[0].id,original.client_id);assert.equal(changes.messages[0].body,null);
  });
  await check('message permissions and blocking stop interaction while preserving owner cleanup',async()=>{
    await api('PATCH','/users/me/settings',{allow_messages:'none'},b.token);
    assert.equal((await api('GET',path()+'/messages',undefined,a.token)).can_send,false);assert.equal((await api('GET',path()+'/changes?after_seq=0',undefined,a.token)).can_send,false);
    assert.equal((await api('POST',path()+'/messages',original,a.token)).message.body,null);
    await api('POST',path()+'/messages',{body:'New send forbidden',client_id:crypto.randomUUID()},a.token,403);
    await api('PATCH',path()+'/messages/'+second.id,{body:'Correction of existing message',revision:1},a.token);
    await api('POST','/users/'+a.user.id+'/block',{},b.token,201);
    await api('GET',path()+'/messages',undefined,a.token,404);await api('GET',path()+'/changes?after_seq=0',undefined,a.token,404);
    await api('PATCH',path()+'/messages/'+second.id,{body:'Blocked edit',revision:2},a.token,404);
    const deleted=await api('DELETE',path()+'/messages/'+second.id,{revision:2},a.token);assert.equal(deleted.message.body,null);assert.equal(deleted.participants,undefined);assert.equal(deleted.read_receipts,undefined);
    await api('DELETE',path()+'/messages/'+last.id,{revision:1},b.token,404);
    await api('DELETE','/users/'+a.user.id+'/block',undefined,b.token);
    await api('PATCH','/users/me/settings',{allow_messages:'everyone'},b.token);
  });
  await check('unverified owners can remove messages and deleted last-message previews never expose text',async()=>{
    await pool.query('UPDATE users SET email_verified_at=NULL,verified_email=NULL WHERE id=$1',[a.user.id]);
    await api('PATCH',path()+'/messages/'+last.id,{body:'Unverified edit',revision:1},a.token,403);
    await api('DELETE',path()+'/messages/'+last.id,{revision:1},a.token);
    const conv=(await api('GET','/conversations',undefined,b.token)).conversations.find(x=>x.id===cid);assert.equal(conv.last_message,null);assert.equal(conv.last_message_deleted,true);assert.equal(conv.unread_count,0);
    const thread=(await api('GET',path()+'/messages',undefined,b.token)).messages;assert.equal(thread.length,3);assert(thread.every(m=>m.body===null&&m.deleted_at));
    assert.equal((await api('GET','/conversations/unread-count',undefined,b.token)).unread,0);
  });
};
