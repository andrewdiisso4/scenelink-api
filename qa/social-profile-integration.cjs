'use strict';
// Invoked only from the fresh localhost database guarded integration harness.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function profileIntegration({api,pool,check,crypto,req,root}){
 const suffix=crypto.randomBytes(3).toString('hex'),accounts=[];let profile,friendship,post,room;
 const vid=crypto.randomUUID(),links=[{provider:'instagram',url:'https://www.instagram.com/scene_test/'}];
 await check('profile and achievement defaults contain no manufactured engagement or provider verification',async()=>{
  for(const role of ['owner','friend','viewer']){
   const user=(await pool.query("INSERT INTO users(email,username,display_name,email_verified_at,verified_email) VALUES($1::text,$2,$3,NOW(),$1::text) RETURNING id,email,username,auth_version",[`${role}.${suffix}@example.invalid`,`social_${role}_${suffix}`,'Social '+role+' fixture'])).rows[0];accounts.push({user,token:req('./src/middleware/auth').generateToken(user)});
  }
  profile=(await api('GET','/users/me',undefined,accounts[0].token)).user;
  assert.equal(profile.profile_revision,1);assert.equal(profile.discoverable,true);assert.equal(profile.show_achievements,false);assert.equal(profile.share_read_receipts,false);assert.deepEqual(profile.social_links,[]);
  const achievements=await api('GET','/users/me/achievements',undefined,accounts[0].token);assert.deepEqual(achievements.counts,{saved_venues:0,friends:0,shared_posts:0,collaborative_plans:0});assert(achievements.badges.every(b=>!b.earned));assert.equal(achievements.points,null);
  await pool.query("INSERT INTO venues(id,name,slug,type,is_active) VALUES($1,'Fictional social milestone venue',$2,'cafe',true)",[vid,'social-fixture-'+suffix]);
 });
 const [a,b,c]=accounts;
 await check('profile edits normalize and persist across independent bearer sessions with exact replay',async()=>{
  const payload={display_name:'Edited local profile',username:'edited_'+suffix,bio:'Profile integration fixture',city:'Boston',neighborhood:'South Boston',social_links:links,revision:profile.profile_revision};
  let update=await api('PUT','/auth/profile',payload,a.token);profile=update.user;assert.equal(profile.profile_revision,2);assert.equal(update.replayed,false);assert.equal(profile.social_links[0].verified,false);assert.equal(profile.social_links[0].kind,'external_profile');assert.equal(profile.social_links[0].url,'https://instagram.com/scene_test');
  update=await api('PUT','/auth/profile',payload,a.token);assert.equal(update.replayed,true);assert.equal(update.user.profile_revision,2);
  const independent=req('./src/middleware/auth').generateToken(a.user);assert.notEqual(independent,a.token);assert.deepEqual((await api('GET','/auth/me',undefined,independent)).user.social_links,profile.social_links);
  await api('PUT','/auth/profile',{display_name:'Stale other device',revision:1},a.token,409);assert.equal((await api('GET','/users/me',undefined,a.token)).user.display_name,'Edited local profile');
 });
 await check('invalid profile and malicious social links fail atomically without privilege changes',async()=>{
  const before=(await api('GET','/users/me',undefined,a.token)).user;
  for(const body of [{display_name:'',bio:'must not persist'},{username:'a%'},{role:'admin',bio:'must not persist'},{email:'other@example.invalid'},{avatar_url:'https://example.com/unowned-avatar.png'},{display_name:'must not persist',social_links:[{provider:'instagram',url:'https://instagram.com.evil.invalid/name'}]},{social_links:[{provider:'instagram',url:'javascript:alert(1)'}]},{social_links:[{provider:'instagram',url:'https://instagram.com/name',verified:true}]},{social_links:[links[0],links[0]]},{revision:'2',bio:'must not persist'}])await api('PUT','/auth/profile',body,a.token,400);
  await api('PUT','/auth/profile',{username:b.user.username},a.token,409);
  assert.deepEqual((await api('GET','/users/me',undefined,a.token)).user,before);
  await api('PATCH','/users/me/settings',{discoverable:'false'},a.token,400);await api('PATCH','/users/me/settings',{allow_messages:'friends',role:'admin'},a.token,400);
 });
 await check('avatar changes require owner-scoped media assets and link removal is durable',async()=>{
  const foreign='https://res.cloudinary.com/local-fixture/image/upload/foreign-'+suffix+'.webp',own='https://res.cloudinary.com/local-fixture/image/upload/owner-'+suffix+'.webp';
  await pool.query("INSERT INTO media_assets(owner_id,url,kind) VALUES($1,$2,'avatar'),($3,$4,'avatar')",[b.user.id,foreign,a.user.id,own]);
  await api('PUT','/auth/profile',{avatar_url:foreign},a.token,400);
  let me=(await api('GET','/users/me',undefined,a.token)).user;
  const changed=await api('PUT','/auth/profile',{avatar_url:own,revision:me.profile_revision},a.token);assert.equal(changed.user.avatar_url,own);assert.equal(changed.user.profile_revision,me.profile_revision+1);
  await api('PUT','/auth/profile',{avatar_url:null,social_links:[]},a.token);me=(await api('GET','/users/me',undefined,a.token)).user;assert.equal(me.avatar_url,null);assert.deepEqual(me.social_links,[]);
  await api('PUT','/auth/profile',{social_links:links},a.token);
 });
 await check('profile concurrent revisions serialize without silent overwrite and privacy patches preserve unrelated controls',async()=>{
  const revision=(await api('GET','/users/me',undefined,a.token)).user.profile_revision;
  const outcomes=await Promise.all(['Choice one','Choice two'].map(display_name=>api('PUT','/auth/profile',{display_name,revision},a.token).then(()=>200).catch(e=>{if(e.message.includes('returned 409'))return 409;throw e;})));
  assert.deepEqual(outcomes.sort(),[200,409]);
  const saved=(await api('GET','/users/me',undefined,a.token)).user;assert.equal(saved.profile_revision,revision+1);assert.equal(saved.social_links.length,1);
  const updated=await api('PATCH','/users/me/settings',{show_achievements:true,revision:saved.profile_revision},a.token);assert.equal(updated.settings.allow_messages,saved.allow_messages);assert.equal(updated.settings.discoverable,true);assert.equal(updated.user.profile_revision,revision+2);
  await api('PATCH','/users/me/settings',{discoverable:false,revision:saved.profile_revision},a.token,409);
  await api('PATCH','/users/me/settings',{show_achievements:false},a.token);
 });
 await check('people search is authenticated, minimal, literal and respects private exact-handle discovery',async()=>{
  await api('PUT','/auth/profile',{social_links:links,bio:'Private biography',city:'Private city'},b.token);
  await api('PATCH','/users/me/settings',{is_private:true,discoverable:true},b.token);
  await api('GET','/users/search?q='+b.user.username,undefined,null,401);
  assert.deepEqual((await api('GET','/search/universal?q='+b.user.username)).users,[]);
  assert.equal((await api('GET','/users/search?q=Social',undefined,a.token)).results.some(u=>u.id===b.user.id),false);
  let search=await api('GET','/users/search?q=%40'+b.user.username,undefined,a.token);assert.equal(search.results[0].id,b.user.id);assert.equal(search.results[0].email,undefined);assert.equal(search.results[0].bio,undefined);assert.equal(search.results[0].city,undefined);
  let publicProfile=await api('GET','/users/'+b.user.id,undefined,a.token);assert.equal(publicProfile.can_view,false);assert.deepEqual(publicProfile.user.social_links,[]);assert.equal(publicProfile.achievements,null);
  assert.equal((await api('GET','/users/suggestions',undefined,a.token)).suggestions.some(u=>u.id===b.user.id),false);
  assert.deepEqual((await api('GET','/users/search?q=%25%25',undefined,a.token)).results,[]);
  await api('PATCH','/users/me/settings',{discoverable:false},b.token);
  assert.equal((await api('GET','/users/search?q='+b.user.username,undefined,a.token)).results.length,0);
  assert.equal((await api('GET','/search/universal?q='+b.user.username,undefined,a.token)).users.length,0);
 });
 await check('pending requests do not earn friendship achievements; accepted friends retain relationship-aware search',async()=>{
  friendship=await api('POST','/friends/request',{user_id:b.user.id},a.token);
  assert.equal((await api('GET','/users/me/achievements',undefined,a.token)).counts.friends,0);
  await api('POST','/friends/accept',{friendship_id:friendship.friendship_id},b.token);
  const result=await api('GET','/users/search?q=social_friend',undefined,a.token);assert.equal(result.results[0].id,b.user.id);assert.equal(result.results[0].friendship_status.status,'accepted');
  assert.equal((await api('GET','/users/'+b.user.id,undefined,a.token)).user.social_links.length,1);
  assert.equal((await api('GET','/users/search?q='+b.user.username,undefined,c.token)).results.length,0);
  assert.equal((await api('GET','/users/me/achievements',undefined,a.token)).counts.friends,1);
 });
 await check('earned milestones use persisted distinct activities and accepted membership, not retries or pending invites',async()=>{
  await api('POST','/favorites/'+vid,{},a.token);await api('POST','/favorites/'+vid,{},a.token);
  const payload={body:'Milestone fixture shared with friends',client_id:crypto.randomUUID(),audience:'friends'};
  post=(await api('POST','/posts',payload,a.token,201)).post;await api('POST','/posts',payload,a.token);
  room=(await api('POST','/rooms',{client_id:crypto.randomUUID(),name:'Milestone private plan'},a.token,201)).room;
  await api('POST','/rooms/'+room.id+'/invitations',{user_id:b.user.id},a.token);
  let earned=await api('GET','/users/me/achievements',undefined,a.token);assert.deepEqual(earned.counts,{saved_venues:1,friends:1,shared_posts:1,collaborative_plans:0});assert.equal(earned.badges.find(b=>b.id==='five_saves').earned,false);
  await api('PUT','/rooms/'+room.id+'/invitation',{response:'accepted'},b.token);
  earned=await api('GET','/users/me/achievements',undefined,a.token);assert.equal(earned.counts.collaborative_plans,1);assert(earned.badges.find(b=>b.id==='first_collaborative_plan').earned);
  const ignoredImpersonation=await api('GET','/users/me/achievements?user_id='+a.user.id,undefined,c.token);assert.equal(ignoredImpersonation.counts.saved_venues,0);assert.equal(ignoredImpersonation.counts.friends,0);
 });
 await check('public achievements require explicit opt-in and never expose private counts or locked profile links',async()=>{
  assert.equal((await api('GET','/users/'+a.user.id,undefined,c.token)).achievements,null);
  await api('PATCH','/users/me/settings',{show_achievements:true},a.token);
  let result=await api('GET','/users/'+a.user.id,undefined,c.token);assert(result.achievements.badges.every(b=>b.earned));assert.equal(result.achievements.counts,undefined);assert(result.achievements.badges.every(b=>b.progress===undefined));
  await api('PATCH','/users/me/settings',{is_private:true},a.token);
  result=await api('GET','/users/'+a.user.id,undefined,c.token);assert.equal(result.achievements,null);assert.deepEqual(result.user.social_links,[]);
  assert((await api('GET','/users/'+a.user.id,undefined,b.token)).achievements.badges.length>0);
  await api('PATCH','/users/me/settings',{is_private:false,show_achievements:false},a.token);
 });
 await check('removal, venue closure, suspension and blocks retract current-state milestone eligibility',async()=>{
  await pool.query("UPDATE venues SET business_status='CLOSED_PERMANENTLY' WHERE id=$1",[vid]);assert.equal((await api('GET','/users/me/achievements',undefined,a.token)).counts.saved_venues,0);
  await api('DELETE','/posts/'+post.id,undefined,a.token);assert.equal((await api('GET','/users/me/achievements',undefined,a.token)).counts.shared_posts,0);
  await pool.query('UPDATE users SET is_suspended=true WHERE id=$1',[b.user.id]);assert.equal((await api('GET','/users/me/achievements',undefined,a.token)).counts.friends,0);assert.equal((await api('GET','/users/search?q='+b.user.username,undefined,a.token)).results.length,0);
  await pool.query('UPDATE users SET is_suspended=false WHERE id=$1',[b.user.id]);
  await api('POST','/users/'+b.user.id+'/block',{},a.token,201);
  const counts=(await api('GET','/users/me/achievements',undefined,a.token)).counts;assert.equal(counts.friends,0);assert.equal(counts.collaborative_plans,0);
  await api('GET','/users/'+b.user.id,undefined,a.token,404);assert.equal((await api('GET','/users/search?q='+b.user.username,undefined,a.token)).results.length,0);assert.equal((await api('GET','/users/search?q=edited_'+suffix,undefined,b.token)).results.length,0);
  await api('DELETE','/users/'+b.user.id+'/block',undefined,a.token);
 });
 await check('unverified privacy controls stay available and migration013 preserves populated profiles and message tombstones',async()=>{
  await pool.query('UPDATE users SET email_verified_at=NULL,verified_email=NULL WHERE id=$1',[a.user.id]);
  await api('PUT','/auth/profile',{bio:'Cannot participate'},a.token,403);await api('PATCH','/users/me/settings',{discoverable:false,share_read_receipts:false},a.token);
  const snapshot=async()=>({users:(await pool.query('SELECT id,social_links,profile_revision,discoverable,show_achievements,share_read_receipts,is_private,allow_messages FROM users ORDER BY id')).rows,messages:(await pool.query('SELECT id,body,send_body_hash,revision,change_seq,edited_at,deleted_at FROM messages ORDER BY id')).rows,conversations:(await pool.query('SELECT id,message_version FROM conversations ORDER BY id')).rows});
  const before=await snapshot();await pool.query(fs.readFileSync(path.join(root,'migrations/013_social_profile_messaging.sql'),'utf8'));assert.deepEqual(await snapshot(),before);
  await api('GET','/users/'+a.user.id+'/achievements',undefined,c.token,404);await api('GET','/search/unknown-legacy-path',undefined,c.token,404);
 });
};
