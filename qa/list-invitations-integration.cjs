'use strict';
// Real HTTP/SQL acceptance. Loaded only by the guarded disposable localhost harness.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({api,pool,check,crypto,req,root}){
 const suffix=crypto.randomBytes(4).toString('hex'),accounts=[];
 const make=async(role)=>{const user=(await pool.query("INSERT INTO users(email,username,display_name,email_verified_at,verified_email) VALUES($1::text,$2,$3,NOW(),$1::text) RETURNING id,auth_version",[role+'.'+suffix+'@example.invalid','list_'+role+'_'+suffix,'List '+role+' fixture'])).rows[0];return{user,token:req('./src/middleware/auth').generateToken(user)};};
 for(const role of ['owner','friend','peer','stranger'])accounts.push(await make(role));
 const[a,b,c,d]=accounts;
 async function friends(x,y){await pool.query("INSERT INTO friendships(user_a_id,user_b_id,requester_id,status) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$1,'accepted') ON CONFLICT(user_a_id,user_b_id) DO UPDATE SET status='accepted'",[x.user.id,y.user.id]);}
 await friends(a,b);await friends(a,c);
 const vid=crypto.randomUUID(),vid2=crypto.randomUUID();
 await pool.query("INSERT INTO venues(id,name,slug,type,is_active) VALUES($1,'List fictional cafe',$2,'cafe',true),($3,'List fictional second cafe',$4,'cafe',true)",[vid,'list-'+suffix,vid2,'list-2-'+suffix]);
 let list,invitation,oldToken,deleted,createPayload;
 const detail=async(id=list.id,user=a)=>(await api('GET','/lists/'+id,undefined,user.token)).list;
 const invite=async(user=b,id=list.id)=>api('POST','/lists/'+id+'/invitations',{user_id:user.user.id},a.token);
 const answer=async(user=b,token=invitation.invitation_id,response='accepted',id=list.id,status=200)=>api('PUT','/lists/'+id+'/invitation',{response,invitation_id:token},user.token,status);
 const revision=async(id=list.id,user=a)=>(await detail(id,user)).revision;
 const remove=async(user=b,id=list.id,actor=a)=>api('DELETE','/lists/'+id+'/members/'+user.user.id,{revision:await revision(id,actor)},actor.token);
 await check('private list creation is validated, durable, replay-safe and not a public-share operation',async()=>{
  createPayload={client_id:crypto.randomUUID(),name:'Private shared '+suffix,description:'Private contents stay behind consent'};
  const made=await api('POST','/lists',createPayload,a.token,201);list=made.list;assert.equal(list.is_public,false);assert.equal(list.revision,1);assert.equal(list.is_owner,true);assert.equal(list.can_edit,true);assert.equal(list.can_manage,true);
  const replay=await api('POST','/lists',createPayload,a.token);assert.equal(replay.list.id,list.id);assert.equal(replay.replayed,true);
  await api('POST','/lists',{...createPayload,name:'Different request'},a.token,409);
  await api('POST','/lists',{name:createPayload.name},a.token,409);
  await api('POST','/lists',{name:'bad',is_public:'false'},a.token,400);await api('POST','/lists',{name:'bad',user_id:b.user.id},a.token,400);
  await api('POST','/lists',{name:'x'.repeat(81)},a.token,400);await api('POST','/lists',{name:'bad',description:'x'.repeat(501)},a.token,400);
  await api('POST','/lists/'+list.id+'/venues',{venue_id:vid},a.token);
  await api('GET','/lists/'+list.id,undefined,b.token,404);await api('GET','/lists/'+list.id,undefined,null,404);
  assert.equal((await pool.query("SELECT count(*)::int n FROM posts WHERE ref_type='list_share' AND ref_id=$1",[list.id])).rows[0].n,0);
 });
 await check('only owners invite accepted friends and pending recipients see headers without contents or membership',async()=>{
  await api('POST','/lists/'+list.id+'/invitations',{user_id:c.user.id},b.token,404);
  await api('POST','/lists/'+list.id+'/invitations',{user_id:d.user.id},a.token,403);
  await api('POST','/lists/'+list.id+'/invitations',{user_id:a.user.id},a.token,400);
  invitation=await invite();assert.equal((await invite()).already_invited,true);
  assert.equal((await pool.query('SELECT count(*)::int n FROM list_members WHERE list_id=$1',[list.id])).rows[0].n,1);
  let pending=(await api('GET','/lists/invitations',undefined,b.token)).invitations.find(x=>x.id===list.id);
  assert.equal(pending.invitation_id,invitation.invitation_id);for(const k of ['venues','members','description'])assert.equal(pending[k],undefined);
  assert.equal((await api('GET','/lists',undefined,b.token)).lists.some(x=>x.id===list.id),false);
  await api('GET','/lists/'+list.id,undefined,b.token,404);await api('POST','/lists/'+list.id+'/venues',{venue_id:vid2},b.token,404);
  const notices=(await api('GET','/notifications',undefined,b.token)).notifications.filter(n=>n.ref_type==='list'&&n.ref_id===list.id);assert.equal(notices.length,1);assert.deepEqual(notices[0].destination,{kind:'list',href:'/my-lists?list='+list.id});
  await api('PUT','/lists/'+list.id+'/invitation',{response:'accepted'},b.token,400);
  await answer(d,invitation.invitation_id,'accepted',list.id,404);
 });
 await check('acceptance grants collaborative venue edits but never owner controls or private favorites',async()=>{
  await answer();assert.equal((await answer()).replayed,true);
  const shared=await detail(list.id,b);assert.equal(shared.can_edit,true);assert.equal(shared.can_manage,false);assert.equal(shared.is_owner,false);assert.equal(shared.venues.length,1);assert.equal(shared.members[0].id,b.user.id);
  assert((await api('GET','/lists',undefined,b.token)).lists.some(x=>x.id===list.id));
  assert.equal((await api('GET','/lists/invitations',undefined,b.token)).invitations.some(x=>x.id===list.id),false);
  assert.equal((await api('GET','/notifications',undefined,b.token)).notifications.some(n=>n.ref_type==='list'&&n.ref_id===list.id),false);
  await api('PATCH','/lists/'+list.id,{name:'Not theirs',revision:shared.revision},b.token,404);
  await api('DELETE','/lists/'+list.id,{revision:shared.revision},b.token,404);
  await api('POST','/lists/'+list.id+'/share',{revision:shared.revision},b.token,404);
  await api('POST','/lists/'+list.id+'/venues',{venue_id:vid2},b.token);
  const current=await detail(list.id,b);assert.equal(current.venues.length,2);
  assert.equal((await api('POST','/lists/'+list.id+'/venues',{venue_id:vid2},b.token)).revision,current.revision);
  assert.equal((await pool.query('SELECT count(*)::int n FROM favorites WHERE user_id=$1',[b.user.id])).rows[0].n,0);
  await api('DELETE','/lists/'+list.id+'/venues/'+vid,{revision:current.revision},b.token);
  assert.deepEqual((await detail()).venues.map(v=>v.id),[vid2]);
 });
 await check('list revisions reject stale metadata, destruction and concurrent contradictory writes',async()=>{
  const before=await detail();await api('PATCH','/lists/'+list.id,{name:'Renamed '+suffix},a.token,428);
  await api('DELETE','/lists/'+list.id+'/venues/'+vid2,{},a.token,428);
  await api('DELETE','/lists/'+list.id,{},a.token,428);
  const outcomes=await Promise.all(['One '+suffix,'Two '+suffix].map(name=>api('PATCH','/lists/'+list.id,{name,revision:before.revision},a.token).then(()=>200).catch(e=>{if(e.message.includes('returned 409'))return 409;throw e;})));
  assert.deepEqual(outcomes.sort(),[200,409]);
  await api('DELETE','/lists/'+list.id,{revision:before.revision},a.token,409);
  await api('DELETE','/lists/'+list.id+'/venues/'+vid2,{revision:before.revision},b.token,409);
  const after=await detail();assert.equal(after.revision,before.revision+1);assert.equal(after.venues.length,1);
  await api('PATCH','/lists/'+list.id,{is_public:'true',revision:after.revision},a.token,400);assert.equal((await detail()).is_public,false);
 });
 await check('revocation, leave and invite generations prevent stale acceptance and notification resurrection',async()=>{
  await remove();await api('GET','/lists/'+list.id,undefined,b.token,404);
  await answer(b,invitation.invitation_id,'accepted',list.id,409);oldToken=invitation.invitation_id;
  invitation=await invite();assert.notEqual(invitation.invitation_id,oldToken);
  await answer(b,oldToken,'accepted',list.id,404);await answer();
  await remove(b,list.id,b);await api('GET','/lists/'+list.id,undefined,b.token,404);
  await answer(b,invitation.invitation_id,'accepted',list.id,409);
  invitation=await invite();await answer(b,invitation.invitation_id,'declined');assert.equal((await answer(b,invitation.invitation_id,'declined')).replayed,true);
  assert.equal((await api('GET','/notifications',undefined,b.token)).notifications.some(n=>n.ref_type==='list'&&n.ref_id===list.id),false);
  invitation=await invite();await pool.query("UPDATE list_members SET created_at=NOW()-INTERVAL '8 days' WHERE list_id=$1 AND user_id=$2",[list.id,b.user.id]);
  assert.equal((await api('GET','/lists/invitations',undefined,b.token)).invitations.some(x=>x.id===list.id),false);
  await answer(b,invitation.invitation_id,'accepted',list.id,410);await answer(b,invitation.invitation_id,'declined');
 });
 await check('block and unfriend durably revoke access, even after unblock and renewed friendship',async()=>{
  invitation=await invite();await answer();await api('POST','/users/'+b.user.id+'/block',{},a.token,201);
  assert.equal((await pool.query('SELECT status FROM list_members WHERE list_id=$1 AND user_id=$2',[list.id,b.user.id])).rows[0].status,'removed');
  await api('GET','/lists/'+list.id,undefined,b.token,404);await api('DELETE','/users/'+b.user.id+'/block',undefined,a.token);
  await friends(a,b);await api('GET','/lists/'+list.id,undefined,b.token,404);
  invitation=await invite();await answer();await api('DELETE','/friends/'+b.user.id,undefined,a.token);
  await friends(a,b);await api('GET','/lists/'+list.id,undefined,b.token,404);
  await answer(b,invitation.invitation_id,'accepted',list.id,409);
 });
 await check('blocked peers cannot expose roster or collaborate and owner retains recovery controls',async()=>{
  invitation=await invite();await answer();const peerInvite=await invite(c);await answer(c,peerInvite.invitation_id);
  await api('POST','/users/'+c.user.id+'/block',{},b.token,201);
  await api('GET','/lists/'+list.id,undefined,b.token,404);await api('GET','/lists/'+list.id,undefined,c.token,404);
  const restricted=(await api('GET','/lists',undefined,b.token)).lists.find(x=>x.id===list.id);assert.equal(restricted.access_restricted,true);assert.equal(restricted.can_leave,true);assert.equal(restricted.owner_id,undefined);assert.equal(restricted.revision,undefined);assert.deepEqual(restricted.venues,[]);assert.deepEqual(restricted.members,[]);
  const owner=await detail();assert.equal(owner.can_manage,true);
  await api('PATCH','/lists/'+list.id,{is_public:true,revision:owner.revision},a.token);
  const publicRestricted=await detail(list.id,b);assert.equal(publicRestricted.can_edit,false);assert.equal(publicRestricted.can_leave,true);assert.deepEqual(publicRestricted.members,[]);
  await api('POST','/lists/'+list.id+'/venues',{venue_id:vid},b.token,404);
  await api('PATCH','/lists/'+list.id,{is_public:false,revision:await revision()},a.token);await remove(c);assert.equal((await detail(list.id,b)).can_edit,true);
  await api('DELETE','/users/'+c.user.id+'/block',undefined,b.token);
  const reinvite=await invite(c);await answer(c,reinvite.invitation_id);await api('POST','/users/'+c.user.id+'/block',{},b.token,201);
  await api('DELETE','/lists/'+list.id+'/members/'+c.user.id,{},c.token);await api('DELETE','/users/'+c.user.id+'/block',undefined,b.token);
  await pool.query('UPDATE users SET is_suspended=true WHERE id=$1',[a.user.id]);await api('GET','/lists/'+list.id,undefined,b.token,404);
  await pool.query('UPDATE users SET is_suspended=false WHERE id=$1',[a.user.id]);
 });
 await check('unverified users may leave or decline without gaining participation rights',async()=>{
  await pool.query('UPDATE users SET email_verified_at=NULL,verified_email=NULL WHERE id=$1',[b.user.id]);
  await api('POST','/lists/'+list.id+'/venues',{venue_id:vid},b.token,403);
  await remove(b,list.id,b);invitation=await invite();await answer(b,invitation.invitation_id,'accepted',list.id,403);await answer(b,invitation.invitation_id,'declined');
  await pool.query('UPDATE users SET email_verified_at=NOW(),verified_email=lower(email) WHERE id=$1',[b.user.id]);
  const fresh=await invite();await answer(b,fresh.invitation_id);await pool.query('UPDATE users SET email_verified_at=NULL,verified_email=NULL WHERE id=$1',[a.user.id]);
  await remove();await pool.query('UPDATE users SET email_verified_at=NOW(),verified_email=lower(email) WHERE id=$1',[a.user.id]);
 });
 await check('public list readers never receive the private roster and public privacy can be revoked',async()=>{
  invitation=await invite();await answer();const rev=await revision();await api('PATCH','/lists/'+list.id,{is_public:true,revision:rev},a.token);
  const pub=(await api('GET','/lists/'+list.id)).list;assert.equal(pub.can_edit,false);assert.deepEqual(pub.members,[]);
  await pool.query('UPDATE users SET is_private=true WHERE id=$1',[a.user.id]);await api('GET','/lists/'+list.id,undefined,d.token,404);assert.equal((await detail(list.id,b)).can_edit,true);
  await pool.query('UPDATE users SET is_private=false WHERE id=$1',[a.user.id]);
  await api('PATCH','/lists/'+list.id,{is_public:false,revision:await revision()},a.token);await api('GET','/lists/'+list.id,undefined,d.token,404);
 });
 await check('list deletion cascades invitations and venues, suppresses notices and cannot be replay-created',async()=>{
  const payload={client_id:crypto.randomUUID(),name:'Delete '+suffix};deleted=(await api('POST','/lists',payload,a.token,201)).list;
  const inv=await invite(c,deleted.id);await api('POST','/lists/'+deleted.id+'/venues',{venue_id:vid},a.token);
  await api('DELETE','/lists/'+deleted.id,{revision:await revision(deleted.id)},a.token);
  await api('POST','/lists',payload,a.token,410);await answer(c,inv.invitation_id,'accepted',deleted.id,404);
  await api('POST','/lists',{client_id:deleted.id,name:'Do not hijack deleted links'},d.token,409);await api('GET','/lists/'+deleted.id,undefined,d.token,404);
  const legacy=crypto.randomUUID();await pool.query("INSERT INTO lists(id,user_id,name,description,is_public) VALUES($1,$2,'Legacy deleted list','',false)",[legacy,a.user.id]);
  await api('DELETE','/lists/'+legacy,{revision:1},a.token);
  await api('POST','/lists',{client_id:legacy,name:'Legacy deleted list'},a.token,410);
  await api('POST','/lists',{client_id:legacy,name:'Never replace a legacy public reference'},d.token,409);
  assert.equal((await pool.query('SELECT count(*)::int n FROM list_members WHERE list_id=$1',[deleted.id])).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM list_venues WHERE list_id=$1',[deleted.id])).rows[0].n,0);
  assert.equal((await api('GET','/notifications',undefined,c.token)).notifications.some(n=>n.ref_type==='list'&&n.ref_id===deleted.id),false);
 });
 await check('closed venues remain removable and legacy saves do not become active bookings',async()=>{
  await pool.query("UPDATE venues SET business_status='CLOSED_PERMANENTLY' WHERE id=$1",[vid2]);const saved=await detail();assert.equal(saved.venues[0].venue_available,false);assert.equal(saved.venues[0].reservation_is_confirmed,false);
  await api('POST','/lists/'+list.id+'/venues',{venue_id:vid2},a.token,404);await api('DELETE','/lists/'+list.id+'/venues/'+vid2,{revision:saved.revision},b.token);
 });
 await check('concurrent invitations do not duplicate memberships or notices; block wins durable privacy',async()=>{
  const id=(await api('POST','/lists',{name:'Races '+suffix},a.token,201)).list.id;
  await Promise.all([invite(c,id),invite(c,id)]);
  assert.equal((await pool.query('SELECT count(*)::int n FROM list_members WHERE list_id=$1',[id])).rows[0].n,1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM notifications WHERE ref_type='list' AND ref_id=$1",[id])).rows[0].n,1);
  await remove(c,id);
  const result=await Promise.all([invite(c,id).then(()=>200).catch(e=>{if(e.message.includes('returned 404'))return 404;throw e;}),api('POST','/users/'+c.user.id+'/block',{},a.token,201)]);
  assert([200,404].includes(result[0]));await api('GET','/lists/'+id,undefined,c.token,404);
  assert.equal((await pool.query("SELECT count(*)::int n FROM list_members WHERE list_id=$1 AND status IN ('pending','accepted')",[id])).rows[0].n,0);
  await api('DELETE','/users/'+c.user.id+'/block',undefined,a.token);await friends(a,c);
 });
 await check('membership capacity counts live invitations, expired invitations do not occupy seats',async()=>{
  const owner=await make('capacity'),target=await make('cap_target');await friends(owner,target);
  const id=(await api('POST','/lists',{name:'Capacity '+suffix},owner.token,201)).list.id;
  const peers=[];for(let i=0;i<19;i++){const u=await make('cap_'+i);peers.push(u);await pool.query("INSERT INTO list_members(list_id,user_id,invited_by) VALUES($1,$2,$3)",[id,u.user.id,owner.user.id]);}
  await api('POST','/lists/'+id+'/invitations',{user_id:target.user.id},owner.token,409);
  await pool.query("UPDATE list_members SET created_at=NOW()-INTERVAL '8 days' WHERE list_id=$1 AND user_id=$2",[id,peers[0].user.id]);
  await api('POST','/lists/'+id+'/invitations',{user_id:target.user.id},owner.token);
  assert.equal((await pool.query("SELECT count(*)::int n FROM list_members WHERE list_id=$1 AND created_at>NOW()-INTERVAL '7 days'",[id])).rows[0].n,19);
 });
 await check('acceptance races serialize against revocation and deleted lists cannot acquire orphan venues',async()=>{
  const owner=await make('race_owner'),friend=await make('race_friend');await friends(owner,friend);
  const id=(await api('POST','/lists',{name:'Delete race '+suffix},owner.token,201)).list.id;
  const inv=await api('POST','/lists/'+id+'/invitations',{user_id:friend.user.id},owner.token);
  const accept=()=>api('PUT','/lists/'+id+'/invitation',{response:'accepted',invitation_id:inv.invitation_id},friend.token).then(()=>200).catch(e=>{if(e.message.includes('returned 409'))return 409;throw e;});
  const revoke=()=>api('DELETE','/lists/'+id+'/members/'+friend.user.id,{revision:inv.revision},owner.token).then(()=>200).catch(e=>{if(e.message.includes('returned 409'))return 409;throw e;});
  const statuses=await Promise.all([accept(),revoke()]);assert.deepEqual(statuses.slice().sort(),[200,409]);
  if(statuses[1]===409)await api('DELETE','/lists/'+id+'/members/'+friend.user.id,{revision:await revision(id,owner)},owner.token);
  await api('GET','/lists/'+id,undefined,friend.token,404);
  const rev=await revision(id,owner);
  const outcomes=await Promise.all([api('POST','/lists/'+id+'/venues',{venue_id:vid},owner.token).then(()=>200).catch(e=>{if(e.message.includes('returned 404'))return 404;throw e;}),api('DELETE','/lists/'+id,{revision:rev},owner.token).then(()=>200).catch(e=>{if(e.message.includes('returned 409'))return 409;throw e;})]);
  if(outcomes[1]===409)await api('DELETE','/lists/'+id,{revision:await revision(id,owner)},owner.token);
  assert.equal((await pool.query('SELECT count(*)::int n FROM list_venues WHERE list_id=$1',[id])).rows[0].n,0);
  await api('GET','/lists/'+id,undefined,owner.token,404);
 });
 await check('failed notification transaction does not persist phantom invitations',async()=>{
  const id=(await api('POST','/lists',{name:'Rollback '+suffix},a.token,201)).list.id;
  await pool.query("CREATE FUNCTION list_test_fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='list_invitation' THEN RAISE EXCEPTION 'synthetic-notice-failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER list_test_notice_failure BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION list_test_fail_notice()");
  try{await api('POST','/lists/'+id+'/invitations',{user_id:c.user.id},a.token,500);}finally{await pool.query('DROP TRIGGER list_test_notice_failure ON notifications; DROP FUNCTION list_test_fail_notice()');}
  assert.equal((await pool.query('SELECT count(*)::int n FROM list_members WHERE list_id=$1',[id])).rows[0].n,0);assert.equal(await revision(id),1);
 });
 await check('pending invitations paginate deterministically without dropping older invitations',async()=>{
  const owner=await make('page_owner'),friend=await make('page_friend');await friends(owner,friend);
  const ids=[];for(let i=0;i<3;i++){const id=(await api('POST','/lists',{name:'Page '+i+' '+suffix},owner.token,201)).list.id;ids.push(id);await api('POST','/lists/'+id+'/invitations',{user_id:friend.user.id},owner.token);}
  const first=await api('GET','/lists/invitations?limit=2',undefined,friend.token),second=await api('GET','/lists/invitations?limit=2&offset=2',undefined,friend.token);
  assert.equal(first.has_more,true);assert.equal(second.has_more,false);assert.equal(second.offset,2);
  assert.deepEqual([...first.invitations,...second.invitations].map(x=>x.id).sort(),ids.sort());
  await api('GET','/lists/invitations?limit=101',undefined,friend.token,400);await api('GET','/lists?offset=-1',undefined,friend.token,400);
 });
 await check('account deletion cascades membership and repeat migration preserves populated data and privacy',async()=>{
  const owner=await make('delete'),friend=await make('survivor');await friends(owner,friend);
  const id=(await api('POST','/lists',{name:'Deleted account '+suffix},owner.token,201)).list.id;
  await api('POST','/lists/'+id+'/invitations',{user_id:friend.user.id},owner.token);
  await pool.query('DELETE FROM users WHERE id=$1',[owner.user.id]);assert.equal((await pool.query('SELECT count(*)::int n FROM list_members WHERE list_id=$1',[id])).rows[0].n,0);
  await api('GET','/lists/'+id,undefined,friend.token,404);
  assert.equal((await pool.query('SELECT count(*)::int n FROM list_id_reservations WHERE id=$1',[id])).rows[0].n,1);
  await api('POST','/lists',{client_id:id,name:'Never reuse a deleted account list'},friend.token,409);
  const legacyOwner=await make('legacy_delete'),legacyId=crypto.randomUUID();await pool.query("INSERT INTO lists(id,user_id,name,is_public) VALUES($1,$2,'Pre-feature account list',false)",[legacyId,legacyOwner.user.id]);
  // The additive rollout reserves every pre-feature ID before serving new traffic.
  await pool.query(fs.readFileSync(path.join(root,'migrations/016_private_list_invitations.sql'),'utf8'));
  await pool.query('DELETE FROM users WHERE id=$1',[legacyOwner.user.id]);
  await api('POST','/lists',{client_id:legacyId,name:'Never reuse a legacy account list'},friend.token,409);
  const snapshot=async()=>({lists:(await pool.query('SELECT * FROM lists ORDER BY id')).rows,members:(await pool.query('SELECT * FROM list_members ORDER BY list_id,user_id')).rows,requests:(await pool.query('SELECT * FROM list_create_requests ORDER BY user_id,client_id')).rows,reservations:(await pool.query('SELECT * FROM list_id_reservations ORDER BY id')).rows});
  const before=await snapshot();await pool.query(fs.readFileSync(path.join(root,'migrations/016_private_list_invitations.sql'),'utf8'));assert.deepEqual(await snapshot(),before);
  assert.equal((await api('GET','/launch/capabilities')).features.private_list_invitations,true);
 });
};
