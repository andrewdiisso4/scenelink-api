'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {once}=require('node:events');
const express=require('express'),jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');
const {PGlite}=require('@electric-sql/pglite');
const {uuid_ossp}=require('@electric-sql/pglite/contrib/uuid_ossp');
const {pg_trgm}=require('@electric-sql/pglite/contrib/pg_trgm');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const identity=require('../src/launch/identity'),messages=require('../src/launch/messages');
const {makeAuth}=require('../src/launch/session');

test('account deletion revokes orphan direct threads and refreshes surviving group membership',async t=>{
  // Real migrations, account deletion, JWT authentication and messaging handlers.
  // PGlite is a single backend; this is not a native concurrency proof.
  const db=await PGlite.create({extensions:{uuid_ossp,pg_trgm,pgcrypto}});let server;
  t.after(async()=>{if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});await db.close();});
  const root=path.resolve(__dirname,'..');
  await db.exec(fs.readFileSync(path.join(root,'src/config/schema.sql'),'utf8'));
  const migrations=['migrations','src/migrations'].flatMap(dir=>fs.readdirSync(path.join(root,dir))
    .filter(file=>/^(002_|003_|004_|005_|006_|007_|008_|009_|010_|011_|012_|013_|014_|016_|018_).*\.sql$/.test(file))
    .map(file=>path.join(root,dir,file))).sort((a,b)=>path.basename(a).localeCompare(path.basename(b))||a.localeCompare(b));
  for(const file of migrations)await db.exec(fs.readFileSync(file,'utf8'));
  const query=(sql,values)=>db.query(sql,values),pool={query,connect:async()=>({query,release(){}})};
  const auth=makeAuth({jwt,pool,secret:randomBytes(48).toString('hex')});
  const next=(_req,_res,pass)=>pass(),router=express.Router();
  identity.install({router,pool,auth,write:next,authLimit:next,resetLimit:next,bcrypt,mailer:{isReady:()=>false}});
  messages.install({router,pool,auth,write:next});
  const app=express();app.use(express.json());app.use('/api',router);
  server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port+'/api';
  const password='Fictional deletion message test password',hash=await bcrypt.hash(password,4);
  async function account(){
    const id=randomUUID(),email=id+'@example.invalid';
    const user=(await query(`INSERT INTO users(id,email,username,password_hash,allow_messages,email_verified_at,verified_email)
      VALUES($1,$2::text,$3,$4,'everyone',NOW(),$2::text) RETURNING *`,[id,email,'fixture_'+id.slice(0,8),hash])).rows[0];
    return{...user,token:auth.generateToken(user)};
  }
  async function api(actor,method,route,body,expected=200){
    const response=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor.token},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,expected,method+' '+route+': '+JSON.stringify(data));
    assert.match(response.headers.get('cache-control'),/no-store/);return data;
  }
  const send=(actor,cid,body)=>api(actor,'POST','/conversations/'+cid+'/messages',{body},201);
  const remove=actor=>api(actor,'DELETE','/auth/account',{password});
  const list=actor=>api(actor,'GET','/conversations');

  for(const deletingCreator of [true,false])await t.test('deleting the '+(deletingCreator?'creator':'other member')+' makes a direct thread unavailable without deleting survivor messages',async()=>{
    const creator=await account(),recipient=await account(),deleted=deletingCreator?creator:recipient,survivor=deletingCreator?recipient:creator;
    const cid=(await api(creator,'POST','/conversations',{user_id:recipient.id},201)).conversation.id;
    const own=(await send(survivor,cid,'The survivor keeps this stored message')).message;
    const peer=(await send(deleted,cid,'Deleted author content')).message;
    const snapshot=await api(survivor,'GET','/conversations/'+cid+'/messages');
    assert.equal(snapshot.can_send,true);assert.equal(snapshot.messages.length,2);
    assert((await list(survivor)).conversations.some(c=>c.id===cid));
    assert.equal((await remove(deleted)).deleted,true);
    assert.equal((await query('SELECT body FROM messages WHERE id=$1',[own.id])).rows[0].body,own.body);
    assert.equal((await query('SELECT id FROM messages WHERE id=$1',[peer.id])).rows.length,0);
    assert.equal((await query('SELECT id FROM conversations WHERE id=$1',[cid])).rows.length,1);
    assert.equal((await query('SELECT user_id FROM conversation_participants WHERE conversation_id=$1',[cid])).rows[0].user_id,survivor.id);
    const routes=[['GET','/changes?after_seq='+snapshot.sync_seq],['GET','/messages'],
      ['POST','/messages',{body:'Must not send into an orphan thread'}],['POST','/read',{through_id:own.id}],
      ['PATCH','/messages/'+own.id,{body:'Must not edit an unavailable thread',revision:own.revision}]];
    for(const [method,suffix,body]of routes){
      const unavailable=await api(survivor,method,'/conversations/'+cid+suffix,body,404);
      assert.equal(unavailable.code,'CONVERSATION_UNAVAILABLE');
    }
    assert(!(await list(survivor)).conversations.some(c=>c.id===cid),'An orphan direct thread must not remain as a nameless inbox preview');
    assert.equal((await api(survivor,'GET','/conversations/unread-count')).unread,0);
    const remaining=(await query('SELECT id,body FROM messages WHERE conversation_id=$1',[cid])).rows;
    assert.deepEqual(remaining,[{id:own.id,body:own.body}]);
  });

  await t.test('deletion removes only the departed group member and publishes membership even when the change sequence did not advance',async()=>{
    const a=await account(),b=await account(),departed=await account(),cid=randomUUID();
    // Canonical creation currently supports direct threads only; seed an existing group.
    await query('INSERT INTO conversations(id,created_by,is_group,title) VALUES($1,$2,true,$3)',[cid,departed.id,'Fictional existing group']);
    await query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3),($1,$4)',[cid,a.id,b.id,departed.id]);
    const own=(await send(a,cid,'Survivor group message')).message;
    const departedMessage=(await send(departed,cid,'Departed group author content')).message;
    const before=await api(a,'GET','/conversations/'+cid+'/messages');
    await remove(departed);
    // A read acknowledgement can race the deletion of its displayed target.
    // This message-level failure must not imply that surviving group access ended.
    for(const [method,suffix,body]of [['POST','/read',{through_id:departedMessage.id}],
      ['PATCH','/messages/'+departedMessage.id,{body:'Cannot edit a missing message',revision:1}],
      ['DELETE','/messages/'+departedMessage.id,{revision:1}]]){
      const missing=await api(a,method,'/conversations/'+cid+suffix,body,404);
      assert.equal(missing.code,'MESSAGE_UNAVAILABLE');
    }
    const changes=await api(a,'GET','/conversations/'+cid+'/changes?after_seq='+before.sync_seq);
    assert.equal(changes.next_seq,before.sync_seq);assert.deepEqual(changes.messages,[]);assert.equal(changes.can_send,true);
    assert.deepEqual(changes.participants.map(p=>p.id).sort(),[a.id,b.id].sort(),'The poll must tell an already-open group which cached authors no longer exist');
    const group=(await list(a)).conversations.find(c=>c.id===cid);assert(group);assert.deepEqual(group.participants.map(p=>p.id),[b.id]);
    const history=await api(a,'GET','/conversations/'+cid+'/messages');assert.deepEqual(history.messages.map(m=>m.id),[own.id]);
    await send(a,cid,'The surviving group stays usable');
    await remove(b);
    assert((await list(a)).conversations.some(c=>c.id===cid),'An existing group is not automatically closed when only one member remains');
    const lastMember=await api(a,'GET','/conversations/'+cid+'/messages');assert.equal(lastMember.conversation.is_group,true);assert.equal(lastMember.participants.length,1);
  });

  await t.test('a blocked participant is an unavailable conversation rather than a missing message target',async()=>{
    const a=await account(),b=await account();
    const cid=(await api(a,'POST','/conversations',{user_id:b.id},201)).conversation.id;
    const message=(await send(b,cid,'A message before blocking')).message;
    await query('INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2)',[b.id,a.id]);
    const read=await api(a,'POST','/conversations/'+cid+'/read',{through_id:message.id},404);
    assert.equal(read.code,'CONVERSATION_UNAVAILABLE');
  });
});
