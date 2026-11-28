'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{JSDOM}=require('jsdom'),root=path.resolve(__dirname,'../frontend');
const ID='00000000-0000-4000-8000-000000000001',PEER='00000000-0000-4000-8000-000000000002';
const baseUser={id:ID,username:'test_member',display_name:'TEST member',bio:'',profile_revision:1,avatar_url:null,social_links:[],is_private:true,allow_messages:'friends',discoverable:true,show_achievements:false,share_read_receipts:false};
const achievement={source:'persisted_scenelink_activity',counts:{saved_venues:1,friends:0,shared_posts:0,collaborative_plans:0},badges:[{id:'first_save',title:'First find',description:'Save one venue',metric:'saved_venues',threshold:1,progress:1,earned:true},{id:'first_friend',title:'First friend',description:'Accepted friendship',metric:'friends',threshold:1,progress:0,earned:false}],points:null,real_world_attendance_verified:false};
const tick=()=>new Promise(r=>setTimeout(r,15));
async function make(t,{url='https://scenelink.test/profile',token='test-session',user=baseUser,handle}={}){
 let current=structuredClone(user);const calls=[],d=new JSDOM('<!doctype html><html><head></head><body data-sl-social-profile><main id="slSocialProfile"></main></body></html>',{url,runScripts:'outside-only'}),w=d.window;t.after(()=>w.close());
 w.AbortController=AbortController;w.confirm=()=>true;if(token)w.localStorage.setItem('sl_jwt_token',token);
 w.fetch=async(input,options={})=>{const request={url:String(input),method:options.method||'GET',body:options.body?JSON.parse(options.body):undefined};calls.push(request);const reply=handle&&await handle(request,{get user(){return current;},setUser:u=>current=u});let status=200,body;
  if(reply){status=reply.status||200;body=reply.body;}else if(request.url==='/api/users/me')body={user:current};else if(request.url==='/api/users/me/achievements')body=achievement;else if(request.url==='/api/media/capability')body={enabled:false,contract:'server-upload-v1'};else if(request.url.startsWith('/api/friends?'))body={friends:[]};else if(request.url==='/api/friends/pending')body={incoming:[],outgoing:[]};else if(request.url==='/api/users/blocked')body={blocked:[]};else if(request.url.startsWith('/api/users/search'))body={results:[]};else{status=404;body={error:'No test fixture for '+request.url};}
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 };
 w.eval(fs.readFileSync(path.join(root,'js/sl-connected-api.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'js/sl-social-profile.js'),'utf8'));await tick();
 return{w,d,calls,$:id=>w.document.getElementById(id),click:selector=>w.document.querySelector(selector).click(),submit:id=>w.document.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))};
}
test('own profile shows only persisted earned state, no invented points, safe external links labeled unverified',async t=>{
 const m=await make(t,{user:{...baseUser,social_links:[{provider:'instagram',url:'https://instagram.com/testmember',verified:false},{provider:'facebook',url:'javascript:alert(1)'}]}});
 assert.equal(m.w.document.querySelectorAll('.slsp-badge[data-earned=true]').length,1);assert.equal(m.w.document.querySelectorAll('.slsp-badge[data-earned=false]').length,1);
 assert.match(m.$('slspAchievements').textContent,/0.*Accepted friends/s);assert.match(m.$('slSocialProfile').textContent,/Not connected accounts or verified ownership/);assert(!m.w.document.querySelector('a[href^="javascript:"]'));
 assert(!/Level 1|VIP|followers|points/.test(m.$('slSocialProfile').textContent));
 m.click('[data-action=edit]');await tick();assert.match(m.$('slspAvatarCapability').textContent,/Photo uploads are not connected/);assert(!m.w.document.querySelector('[name=avatar_url]'));
});
test('profile saves changed values, removes links and avatar, suppresses repeated submit and confirms server readback',async t=>{
 let resolveWrite,posted;const m=await make(t,{user:{...baseUser,avatar_url:'https://assets.example.test/old.webp',social_links:[{provider:'instagram',url:'https://instagram.com/testmember'}]},handle:async(r,ctx)=>{
  if(r.method==='PUT'){posted=r.body;await new Promise(resolve=>resolveWrite=resolve);ctx.setUser({...ctx.user,...r.body,profile_revision:2});return{body:{user:{...ctx.user,...r.body,profile_revision:2}}};}
 }});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm');form.elements.display_name.value='Changed test name';form.elements.social_instagram.value='';form.elements.remove_avatar.checked=true;
 m.submit('slspEditForm');m.submit('slspEditForm');await tick();assert.equal(m.calls.filter(c=>c.method==='PUT').length,1);assert.equal(posted.revision,1);assert.deepEqual(posted.social_links,[]);assert.equal(posted.avatar_url,null);assert.match(m.$('slspEditStatus').textContent,/Saving/);
 resolveWrite();await tick();assert.match(m.$('slspActionStatus').textContent,/saved and read back/);assert.match(m.w.document.querySelector('h1').textContent,/Changed test name/);assert.equal(m.calls.filter(c=>c.url==='/api/users/me').length,2);
});
test('stale profile rejection preserves draft and never claims saved',async t=>{
 const m=await make(t,{handle:r=>r.method==='PUT'?{status:409,body:{error:'Your profile changed elsewhere',code:'STALE_PROFILE'}}:null});m.click('[data-action=edit]');await tick();m.$('slspEditForm').elements.bio.value='Unsent draft';m.submit('slspEditForm');await tick();
 assert.equal(m.$('slspEditForm').elements.bio.value,'Unsent draft');assert.match(m.$('slspEditStatus').textContent,/changed in another session/);assert(!m.$('slspActionStatus').textContent.includes('saved'));assert(!m.$('slspEditForm').querySelector('button').disabled);
 m.w.confirm=()=>false;m.click('[data-action=reload-edit]');await tick();assert.equal(m.$('slspEditForm').elements.bio.value,'Unsent draft');
 m.$('slspEditForm').dispatchEvent(new m.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(m.$('slspEdit').hidden);m.click('[data-action=edit]');assert.equal(m.$('slspEditForm').elements.bio.value,'Unsent draft');
});
for(const scenario of ['unconfirmed write','unchanged write revision','changed name','changed username','changed bio','changed city','changed links','photo not removed','stale readback','missing revision','missing links'])test('profile '+scenario+' retains the submitted draft without a success claim',async t=>{
 let saved;
 const m=await make(t,{user:{...baseUser,avatar_url:'https://assets.example.test/old.webp'},handle:(r,ctx)=>{
  if(r.method==='PUT'){
   saved={...ctx.user,...r.body,profile_revision:2};
   return{body:{user:scenario==='unconfirmed write'?{...ctx.user,profile_revision:2}:scenario==='unchanged write revision'?{...saved,profile_revision:1}:saved}};
  }
  if(r.url==='/api/users/me'&&saved){
   const user={...saved,profile_revision:3};
   if(scenario==='changed name')user.display_name='Old name';
   if(scenario==='changed username')user.username='old_username';
   if(scenario==='changed bio')user.bio='Another session edited this';
   if(scenario==='changed city')user.city='Another city';
   if(scenario==='changed links')user.social_links=[];
   if(scenario==='photo not removed')user.avatar_url='https://assets.example.test/old.webp';
   if(scenario==='stale readback')user.profile_revision=1;
   if(scenario==='missing revision')delete user.profile_revision;
   if(scenario==='missing links')delete user.social_links;
   return{body:{user}};
  }
 }});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm');
 form.elements.display_name.value='My new name';form.elements.username.value='new_username';form.elements.bio.value='Keep my text';form.elements.city.value='Boston';form.elements.social_x.value='https://x.com/scenelink';form.elements.remove_avatar.checked=true;
 m.submit('slspEditForm');await tick();
 assert.equal(m.$('slspEditForm'),form);assert.equal(form.dataset.revision,'1');assert.equal(form.elements.display_name.value,'My new name');assert.equal(form.elements.bio.value,'Keep my text');assert.equal(form.elements.social_x.value,'https://x.com/scenelink');assert.equal(form.elements.remove_avatar.checked,true);assert.equal(form.elements.bio.disabled,false);
 assert.match(m.$('slspEditStatus').textContent,/readback failed.*draft is still here/);assert.equal(m.$('slspActionStatus').textContent,'');
});
test('profile confirmation accepts the canonical social URLs persisted by the server',async t=>{
 const {socialLinks}=require('../../src/launch/profile');
 const m=await make(t,{handle:(r,ctx)=>{if(r.method==='PUT'){ctx.setUser({...ctx.user,...r.body,social_links:socialLinks(r.body.social_links),profile_revision:2});return{body:{user:ctx.user}};}}});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm');
 for(const [provider,url]of Object.entries({instagram:'https://www.instagram.com/scenelink/',facebook:'https://www.facebook.com/scenelink/',tiktok:'https://tiktok.com/@scenelink/',x:'https://twitter.com/scenelink/',youtube:'https://youtube.com/@scenelink/',linkedin:'https://linkedin.com/in/scenelink/',snapchat:'https://snapchat.com/add/scenelink/'}))form.elements['social_'+provider].value=url;
 m.submit('slspEditForm');await tick();
 assert.match(m.$('slspActionStatus').textContent,/Profile saved and read back/);assert.equal(m.$('slspEditForm').elements.social_x.value,'https://x.com/scenelink');assert.equal(m.$('slspEditForm').elements.social_instagram.value,'https://instagram.com/scenelink');assert.equal(m.w.document.activeElement.dataset.action,'edit');
});
test('unchanged profile can confirm an idempotent save at the same revision',async t=>{
 const m=await make(t,{handle:(r,ctx)=>r.method==='PUT'?{body:{user:ctx.user,replayed:true}}:null});
 m.click('[data-action=edit]');await tick();m.submit('slspEditForm');await tick();
 assert.match(m.$('slspActionStatus').textContent,/Profile saved and read back/);assert.equal(m.$('slspEditForm').dataset.revision,'1');
});
test('reloading a saved profile reopens the editor and focuses the reloaded values',async t=>{
 const m=await make(t);m.click('[data-action=edit]');await tick();const old=m.$('slspEditForm');old.elements.bio.value='Draft to discard';
 m.click('[data-action=reload-edit]');await tick();
 assert.notEqual(m.$('slspEditForm'),old);assert.equal(m.$('slspEdit').hidden,false);assert.equal(m.$('slspEditForm').elements.bio.value,'');assert.equal(m.w.document.activeElement,m.$('slspEditForm').elements.display_name);
});
test('privacy edits include real booleans, opt-in read receipts and revision',async t=>{
 let body;const m=await make(t,{handle:(r,ctx)=>{if(r.method==='PATCH'){body=r.body;ctx.setUser({...ctx.user,...r.body,profile_revision:2});return{body:{user:{...ctx.user,...r.body,profile_revision:2}}};}}});m.click('[data-tab=settings]');await tick();const form=m.$('slspSettingsForm');form.elements.discoverable.checked=false;form.elements.share_read_receipts.checked=true;form.elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();
 assert.equal(body.discoverable,false);assert.equal(body.share_read_receipts,true);assert.equal(body.allow_messages,'none');assert.equal(body.revision,1);assert.match(m.$('slspActionStatus').textContent,/Privacy settings saved and read back/);
});
for (const scenario of ['unconfirmed write','changed readback','stale readback','missing readback field']) test('privacy '+scenario+' retains draft without a success claim',async t=>{
 let saved;
 const m=await make(t,{handle:(r,ctx)=>{
   if(r.method==='PATCH'){
     saved={...ctx.user,...r.body,profile_revision:2};
     return{body:{user:scenario==='unconfirmed write'?{...saved,allow_messages:'everyone'}:saved}};
   }
   if(r.url==='/api/users/me'&&saved){
     const user={...saved,profile_revision:3};
     if(scenario==='changed readback')user.discoverable=true;
     if(scenario==='stale readback')user.profile_revision=1;
     if(scenario==='missing readback field')delete user.share_read_receipts;
     return{body:{user}};
   }
 }});
 m.click('[data-tab=settings]');const form=m.$('slspSettingsForm');
 form.elements.allow_messages.value='none';form.elements.discoverable.checked=false;
 m.submit('slspSettingsForm');await tick();
 assert.equal(m.$('slspSettingsForm'),form);assert.equal(form.dataset.revision,'1');
 assert.equal(form.elements.allow_messages.value,'none');assert.equal(form.elements.discoverable.checked,false);
 assert.equal(form.elements.allow_messages.disabled,false);
 assert.match(m.$('slspSettingsStatus').textContent,/failed to confirm your choices/);
 assert.equal(m.$('slspActionStatus').textContent,'');
});
test('unchanged privacy settings can confirm an idempotent save at the same revision',async t=>{
 const m=await make(t,{handle:(r,ctx)=>r.method==='PATCH'?{body:{user:ctx.user,replayed:true}}:null});
 m.click('[data-tab=settings]');m.submit('slspSettingsForm');await tick();
 assert.match(m.$('slspActionStatus').textContent,/Privacy settings saved and read back/);
 assert.equal(m.$('slspSettingsForm').dataset.revision,'1');
});
test('a later unconfirmed privacy save clears the prior success message',async t=>{
 let writes=0;
 const m=await make(t,{handle:(r,ctx)=>{
   if(r.method!=='PATCH')return;
   if(++writes===1)ctx.setUser({...ctx.user,...r.body,profile_revision:2});
   return{body:{user:ctx.user}};
 }});
 m.click('[data-tab=settings]');m.$('slspSettingsForm').elements.discoverable.checked=false;
 m.submit('slspSettingsForm');await tick();
 assert.match(m.$('slspActionStatus').textContent,/Privacy settings saved/);
 m.$('slspSettingsForm').elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();
 assert.equal(m.$('slspActionStatus').textContent,'');
 assert.match(m.$('slspSettingsStatus').textContent,/failed to confirm/);
 assert.equal(m.$('slspSettingsForm').elements.allow_messages.value,'none');
});
test('private public profile fails closed for links, bio and earned data even if response includes them',async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile?u=peer',handle:r=>r.url==='/api/users/peer'?{body:{user:{id:PEER,username:'peer',display_name:'TEST peer',bio:'PRIVATE SECRET',social_links:[{provider:'instagram',url:'https://instagram.com/secret'}]},can_view:false,can_message:false,is_me:false,friendship_status:null,achievements:achievement}}:null});
 assert.match(m.$('slSocialProfile').textContent,/This profile is private/);assert(!m.$('slSocialProfile').textContent.includes('PRIVATE SECRET'));assert(!m.$('slspPublicAchievements'));assert(!m.w.document.querySelector('a[href*="instagram.com"]'));assert(!m.w.document.querySelector('a[href*="/messages?"]'));
});
test('people search suppresses older and input-changed responses; requests use server relationships',async t=>{
 let releaseOld,requested=false;const m=await make(t,{handle:async r=>{
  if(r.url.includes('/users/search?q=old')){await new Promise(resolve=>releaseOld=resolve);return{body:{results:[{id:PEER,username:'old',display_name:'OLD RESPONSE'}]}};}
  if(r.url.includes('/users/search?q=new'))return{body:{results:[{id:PEER,username:'new',display_name:'NEW RESPONSE',friendship_status:requested?{id:'request-id',status:'pending',direction:'outgoing'}:null}]}};
  if(r.url==='/api/friends/request'){requested=true;return{body:{friendship_id:'request-id',status:'pending',direction:'outgoing'}};}
 }});m.click('[data-tab=friends]');await tick();m.$('slspSearchInput').value='old';m.submit('slspSearchForm');await tick();m.$('slspSearchInput').value='new';m.$('slspSearchInput').dispatchEvent(new m.w.Event('input',{bubbles:true}));m.submit('slspSearchForm');await tick();releaseOld();await tick();assert.match(m.$('slspSearchResults').textContent,/NEW RESPONSE/);assert(!m.$('slspSearchResults').textContent.includes('OLD RESPONSE'));
 m.click('#slspSearchResults [data-action=request]');await tick();assert.match(m.$('slspSearchResults').textContent,/Request pending/);assert.match(m.$('slspActionStatus').textContent,/pending until/);assert.equal(m.calls.find(c=>c.url==='/api/friends/request').body.user_id,PEER);
});
test('refreshing friends replaces a pending request notice and search controls after recipient acceptance',async t=>{
 let relationship=null;
 const peer=()=>({id:PEER,username:'friend',display_name:'Fictional friend',can_message:relationship==='accepted',friendship_status:relationship?{id:'request-id',status:relationship,direction:'outgoing'}:null});
 const m=await make(t,{handle:r=>{
  if(r.url.startsWith('/api/users/search'))return{body:{results:[peer()]}};
  if(r.url.startsWith('/api/friends?'))return{body:{friends:relationship==='accepted'?[peer()]:[]}};
  if(r.url==='/api/friends/request'){relationship='pending';return{body:{friendship_id:'request-id',status:'pending',direction:'outgoing'}};}
 }});
 m.click('[data-tab=friends]');await tick();m.$('slspSearchInput').value='friend';m.submit('slspSearchForm');await tick();
 m.click('#slspSearchResults [data-action=request]');await tick();assert.match(m.$('slspActionStatus').textContent,/pending until/);
 relationship='accepted';m.click('[data-action=friends]');await tick();await tick();
 assert.equal(m.$('slspActionStatus').textContent,'');
 assert.equal(m.$('slspSearchResults').querySelector('[data-action=remove]').textContent,'Remove friend');
 assert(m.$('slspSearchResults').querySelector('a[href^="/messages"]'));
 assert.match(m.$('slspFriends').textContent,/Fictional friend/);
});
test('session change clears private profile and ignores stale response',async t=>{
 let release;const m=await make(t,{handle:async r=>{if(r.url.includes('/users/search')){await new Promise(resolve=>release=resolve);return{body:{results:[{id:PEER,display_name:'OLD PRIVATE RESULT'}]}};}}});m.click('[data-tab=friends]');await tick();m.$('slspSearchInput').value='test';m.submit('slspSearchForm');await tick();m.w.localStorage.removeItem('sl_jwt_token');m.w.dispatchEvent(new m.w.Event('sl-auth-change'));release();await tick();assert.match(m.$('slSocialProfile').textContent,/Sign in to edit/);assert(!m.$('slSocialProfile').textContent.includes('OLD PRIVATE RESULT'));assert(!m.$('slspSettingsForm'));
});
test('guest own profile offers dismissible auth entry and exploration, not private controls',async t=>{
 const m=await make(t,{token:null});assert(m.w.document.querySelector('.sl-auth-trigger'));assert(m.w.document.querySelector('a[href="/"]'));assert(!m.$('slspEditForm'));assert.equal(m.calls.length,0);
});
test('friend and search pagination only exposes load more when server confirms and deduplicates pages',async t=>{
 const m=await make(t,{handle:r=>{
  if(r.url.startsWith('/api/friends?')){const offset=new URL(r.url,'https://x.test').searchParams.get('offset');return{body:offset==='0'?{friends:[{id:PEER,username:'first',display_name:'FIRST FRIEND'}],has_more:true}:{friends:[{id:PEER,username:'first',display_name:'FIRST FRIEND'},{id:'third',username:'third',display_name:'THIRD FRIEND'}],has_more:false}};}
  if(r.url.startsWith('/api/users/search')){const offset=new URL(r.url,'https://x.test').searchParams.get('offset');return{body:offset==='0'?{results:[{id:PEER,username:'first',display_name:'FIRST PERSON'}],has_more:true}:{results:[{id:'third',username:'third',display_name:'THIRD PERSON'}],has_more:false}};}
 }});m.click('[data-tab=friends]');await tick();assert(m.w.document.querySelector('[data-action=friends-more]'));m.click('[data-action=friends-more]');await tick();assert.equal(m.$('slspFriends').querySelectorAll('li').length,2);assert(!m.w.document.querySelector('[data-action=friends-more]'));
 m.$('slspSearchInput').value='find';m.submit('slspSearchForm');await tick();m.click('[data-action=search-more]');await tick();assert.equal(m.$('slspSearchResults').querySelectorAll('li').length,2);assert(!m.w.document.querySelector('[data-action=search-more]'));
});
test('privacy hash alias selects settings and keyboard tabs work with Back history',{timeout:5000},async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#privacy'});assert(!m.$('slspPanelSettings').hidden);const tab=m.$('slspTabSettings');tab.dispatchEvent(new m.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert(!m.$('slspPanelFriends').hidden);assert.equal(m.w.document.activeElement.id,'slspTabFriends');const navigation=new Promise(resolve=>m.w.addEventListener('popstate',resolve,{once:true}));m.w.history.back();await navigation;assert.equal(m.w.location.hash,'#privacy');assert(!m.$('slspPanelSettings').hidden);
});
test('enabled server-upload capability attaches only a confirmed avatar and preserves unrelated draft revision safely',async t=>{
 let upload;const m=await make(t,{handle:(r,ctx)=>{
  if(r.url==='/api/media/capability')return{body:{enabled:true,contract:'server-upload-v1',max_bytes:4194304}};
  if(r.url==='/api/media/upload'){upload=r.body;ctx.setUser({...ctx.user,avatar_url:'https://assets.example.test/owned.webp',profile_revision:2});return{body:{asset:{url:'https://assets.example.test/owned.webp',kind:'avatar'}}};}
 }});m.click('[data-action=edit]');await tick();const f=m.$('slspEditForm');f.elements.bio.value='Unsaved draft';Object.defineProperty(m.$('slspAvatarFile'),'files',{value:[new m.w.File([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4])],'test.png',{type:'image/png'})]});m.click('[data-action=upload-avatar]');await tick();await tick();assert.equal(upload.kind,'avatar');assert.match(upload.data,/^data:image\/png;base64,/);assert.match(m.$('slspAvatarStatus').textContent,/Photo saved and read back/);assert.equal(f.elements.bio.value,'Unsaved draft');assert.equal(f.dataset.revision,'2');assert.match(m.w.document.querySelector('.slsp-hero img').src,/owned.webp/);
});
test('provider moderation response never claims avatar attached or updates profile revision',async t=>{
 const m=await make(t,{handle:r=>r.url==='/api/media/capability'?{body:{enabled:true,contract:'server-upload-v1',max_bytes:4194304}}:r.url==='/api/media/upload'?{status:202,body:{pending_review:true}}:null});m.click('[data-action=edit]');await tick();Object.defineProperty(m.$('slspAvatarFile'),'files',{value:[new m.w.File(['image'],'test.png',{type:'image/png'})]});m.click('[data-action=upload-avatar]');await tick();await tick();assert.match(m.$('slspAvatarStatus').textContent,/has not been attached/);assert.equal(m.$('slspEditForm').dataset.revision,'1');assert(!m.w.document.querySelector('.slsp-hero img'));
});
test('username uniqueness conflict keeps actual service error rather than pretending stale revision',async t=>{
 const m=await make(t,{handle:r=>r.method==='PUT'?{status:409,body:{error:'Username is already taken'}}:null});m.click('[data-action=edit]');await tick();m.submit('slspEditForm');await tick();assert.match(m.$('slspEditStatus').textContent,/Username is already taken/);assert(!m.$('slspEditStatus').textContent.includes('changed in another session'));
});

test('saving privacy preserves a profile draft, its open state and a safe current revision',async t=>{
 const m=await make(t,{handle:(r,ctx)=>{if(r.method==='PATCH'){ctx.setUser({...ctx.user,...r.body,profile_revision:2});return{body:{user:ctx.user}};}}});
 m.click('[data-action=edit]');await tick();const original=m.$('slspEditForm');original.elements.bio.value='Unsaved profile draft';original.elements.social_instagram.value='https://instagram.com/draft_member';
 m.click('[data-tab=settings]');m.$('slspSettingsForm').elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();
 assert.equal(m.$('slspEditForm'),original,'retain actual form so selected upload files are not lost');assert.equal(original.elements.bio.value,'Unsaved profile draft');assert.equal(original.elements.social_instagram.value,'https://instagram.com/draft_member');assert.equal(original.dataset.revision,'2');assert.equal(m.$('slspEdit').hidden,false);assert.match(m.$('slspEditStatus').textContent,/draft.*unsaved/i);assert.match(m.$('slspActionStatus').textContent,/Privacy settings saved/);
});
test('saving profile preserves unsaved privacy choices without pretending they were saved',async t=>{
 const m=await make(t,{handle:(r,ctx)=>{if(r.method==='PUT'){ctx.setUser({...ctx.user,...r.body,profile_revision:2});return{body:{user:ctx.user}};}}});
 m.click('[data-tab=settings]');const original=m.$('slspSettingsForm');original.elements.allow_messages.value='none';original.elements.discoverable.checked=false;
 m.click('[data-action=edit]');await tick();m.$('slspEditForm').elements.bio.value='Saved profile';m.submit('slspEditForm');await tick();
 assert.equal(m.$('slspSettingsForm'),original);assert.equal(original.elements.allow_messages.value,'none');assert.equal(original.elements.discoverable.checked,false);assert.equal(original.dataset.revision,'2');assert.match(m.$('slspSettingsStatus').textContent,/draft.*unsaved/i);assert.equal(m.calls.filter(c=>c.method==='PATCH').length,0);
});
test('preserved profile draft keeps stale revision when remote profile fields changed',async t=>{
 const m=await make(t,{handle:(r,ctx)=>{if(r.method==='PATCH'){const written={...ctx.user,...r.body,profile_revision:2};ctx.setUser({...written,bio:'Remote change',profile_revision:3});return{body:{user:written}};}}});
 m.click('[data-action=edit]');await tick();m.$('slspEditForm').elements.bio.value='My local draft';m.click('[data-tab=settings]');m.$('slspSettingsForm').elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();
 assert.equal(m.$('slspEditForm').elements.bio.value,'My local draft');assert.equal(m.$('slspEditForm').dataset.revision,'1');assert.match(m.$('slspEditStatus').textContent,/reload.*before/i);assert.match(m.w.document.querySelector('.slsp-hero').textContent,/Remote change/);
});
test('failed save readback retains both drafts and account change never restores old draft',async t=>{
 let failRead=false,resolveWrite;const m=await make(t,{handle:async(r,ctx)=>{if(r.method==='PATCH'){await new Promise(resolve=>resolveWrite=resolve);ctx.setUser({...ctx.user,...r.body,profile_revision:2});failRead=true;return{body:{user:ctx.user}};}if(r.url==='/api/users/me'&&failRead)return{status:503,body:{error:'Read unavailable'}};}});
 m.click('[data-action=edit]');await tick();m.$('slspEditForm').elements.bio.value='Private old account draft';m.click('[data-tab=settings]');m.$('slspSettingsForm').elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();resolveWrite();await tick();
 assert.equal(m.$('slspEditForm').elements.bio.value,'Private old account draft');assert.equal(m.$('slspSettingsForm').elements.allow_messages.value,'none');assert.match(m.$('slspSettingsStatus').textContent,/readback failed/);
 m.w.localStorage.removeItem('sl_jwt_token');m.w.dispatchEvent(new m.w.Event('sl-auth-change'));await tick();assert(!m.$('slspEditForm'));assert(!m.$('slSocialProfile').textContent.includes('Private old account draft'));
});
test('selected but unuploaded photo remains selected when privacy settings save',async t=>{
 const m=await make(t,{handle:(r,ctx)=>{if(r.url==='/api/media/capability')return{body:{enabled:true,contract:'server-upload-v1'}};if(r.method==='PATCH'){ctx.setUser({...ctx.user,...r.body,profile_revision:2});return{body:{user:ctx.user}};}}});
 m.click('[data-action=edit]');await tick();const input=m.$('slspAvatarFile'),file=new m.w.File(['fake test bytes'],'local-photo.png',{type:'image/png'});Object.defineProperty(input,'files',{value:[file]});
 m.click('[data-tab=settings]');m.$('slspSettingsForm').elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();assert.equal(m.$('slspAvatarFile'),input);assert.equal(input.files[0],file);assert.equal(m.calls.filter(c=>c.url==='/api/media/upload').length,0);
});
test('pending save cannot restore prior profile draft after account switches',async t=>{
 let release;const m=await make(t,{handle:r=>r.method==='PATCH'?new Promise(resolve=>release=()=>resolve({body:{user:{...baseUser,profile_revision:2}}})):null});m.click('[data-action=edit]');await tick();m.$('slspEditForm').elements.bio.value='OLD PRIVATE DRAFT';m.submit('slspSettingsForm');await tick();
 m.w.localStorage.setItem('sl_jwt_token','different-session');m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));await tick();release();await tick();assert(!m.$('slspEditForm').elements.bio.value.includes('OLD PRIVATE DRAFT'));assert(!m.$('slspActionStatus').textContent.includes('saved'));
});
test('failed privacy save keeps both forms without altering profile draft revision',async t=>{
 const m=await make(t,{handle:r=>r.method==='PATCH'?{status:409,body:{error:'Changed elsewhere',code:'STALE_PROFILE'}}:null});m.click('[data-action=edit]');await tick();m.$('slspEditForm').elements.bio.value='PROFILE DRAFT';m.$('slspSettingsForm').elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();assert.equal(m.$('slspEditForm').elements.bio.value,'PROFILE DRAFT');assert.equal(m.$('slspEditForm').dataset.revision,'1');assert.equal(m.$('slspSettingsForm').elements.allow_messages.value,'none');assert.match(m.$('slspSettingsStatus').textContent,/changed in another session/);
});

const FRIENDSHIP='00000000-0000-4000-8000-000000000003';
async function relationshipFixture(t,{kind='request',reply,delay}={}){
 const initial=kind==='remove'?{id:FRIENDSHIP,status:'accepted'}:['accept','decline'].includes(kind)?{id:FRIENDSHIP,status:'pending',direction:'incoming'}:null;
 return make(t,{url:'https://scenelink.test/profile?u='+PEER,handle:async r=>{
  if(r.method!=='GET'){if(delay)await delay();return{body:reply};}
  if(r.url==='/api/users/'+PEER)return{body:{user:{id:PEER,username:'private_peer',display_name:'Private peer',bio:'HIDDEN BIO'},is_me:false,can_view:false,can_message:false,friendship_status:initial}};
 }});
}
for(const [label,reply,expected] of [
 ['outgoing',{friendship_id:FRIENDSHIP,status:'pending',direction:'outgoing'},/Friend request saved/],
 ['incoming',{friendship_id:FRIENDSHIP,status:'pending',direction:'incoming'},/already sent you a request.*Accept it/s],
 ['already accepted',{friendship_id:FRIENDSHIP,status:'accepted',direction:'outgoing'},/already friends/]
])test('request confirmation respects persisted '+label+' state',async t=>{
 const m=await relationshipFixture(t,{reply});m.click('[data-action=request]');await tick();await tick();
 assert.match(m.$('slspActionStatus').textContent,expected);
 assert(!m.$('slSocialProfile').textContent.includes('HIDDEN BIO'));assert(!m.w.document.querySelector('a[href^="/messages?to="]'));
 assert.equal(m.calls.filter(c=>c.method==='POST').length,1);
});
for(const [kind,reply,expected] of [
 ['accept',{friendship_id:FRIENDSHIP,status:'accepted'},/request accepted/],
 ['decline',{friendship_id:FRIENDSHIP,status:'declined'},/Request declined/],
 ['remove',{removed:true,user_id:PEER},/request removed/],
 ['block',{success:true,blocked_id:PEER},/Member blocked/]
])test(kind+' confirms exact operation and target',async t=>{
 const m=await relationshipFixture(t,{kind,reply});m.click('[data-action='+kind+']');await tick();await tick();
 assert.match(m.$('slSocialProfile').textContent,expected);assert(!m.$('slSocialProfile').textContent.includes('HIDDEN BIO'));
});
for(const [kind,reply] of [
 ['request',{success:true}],
 ['request',{friendship_id:FRIENDSHIP,status:'pending',direction:'unknown'}],
 ['accept',{friendship_id:PEER,status:'accepted'}],
 ['decline',{friendship_id:FRIENDSHIP,status:'accepted'}],
 ['remove',{removed:true,user_id:ID}],
 ['block',{success:true,blocked_id:ID}]
])test(kind+' rejects incomplete or mismatched confirmation '+JSON.stringify(reply),async t=>{
 const m=await relationshipFixture(t,{kind,reply});m.click('[data-action='+kind+']');await tick();
 assert.match(m.$('slspActionStatus').textContent,/did not confirm/);assert.equal(m.$('slspActionStatus').dataset.kind,'error');
 assert(!m.$('slSocialProfile').textContent.includes('HIDDEN BIO'));
});
test('pending friend action suppresses duplicate clicks and old-session confirmation',async t=>{
 let release;const m=await relationshipFixture(t,{reply:{friendship_id:FRIENDSHIP,status:'pending',direction:'outgoing'},delay:()=>new Promise(r=>release=r)});
 m.click('[data-action=request]');m.click('[data-action=request]');await tick();assert.equal(m.calls.filter(c=>c.method==='POST').length,1);
 m.w.localStorage.removeItem('sl_jwt_token');m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));await tick();release();await tick();
 assert(!m.$('slSocialProfile').textContent.includes('Friend request saved'));assert(!m.$('slSocialProfile').textContent.includes('HIDDEN BIO'));
});
for(const reply of [{success:true,unblocked_id:PEER},{success:true,unblocked_id:ID}])test('unblock checks identity and never restores friendship '+reply.unblocked_id,async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#settings',handle:r=>{
  if(r.url==='/api/users/blocked')return{body:{blocked:[{id:PEER,display_name:'Blocked peer'}]}};
  if(r.method==='DELETE')return{body:reply};
 }});
 m.click('[data-action=unblock]');await tick();await tick();
 assert.match(m.$('slspActionStatus').textContent,reply.unblocked_id===PEER?/No friendship was restored/:/did not confirm/);
 assert.equal(m.calls.filter(c=>c.url==='/api/friends/request').length,0);
});

for(const body of [{ok:true},{blocked:{}},{blocked:[null]},{blocked:[{display_name:'Unverified identity'}]}])
test('blocked roster rejects malformed success '+JSON.stringify(body),async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#settings',handle:r=>r.url==='/api/users/blocked'?{body}:null});
 assert.match(m.$('slspBlocked').textContent,/could not be verified/);
 assert(!m.$('slspBlocked').textContent.includes('No blocked people'));assert(!m.$('slspBlocked').querySelector('[data-action=unblock]'));
 assert(m.$('slspBlocked').querySelector('[data-action=blocked]'));
});
test('blocked roster retries in place and displays empty only after valid response',async t=>{
 let attempt=0;const m=await make(t,{url:'https://scenelink.test/profile#settings',handle:r=>r.url==='/api/users/blocked'?(++attempt===1?{status:503,body:{error:'Unavailable'}}:{body:{blocked:[]}}):null});
 m.$('slspSettingsForm').elements.discoverable.checked=false;
 m.click('[data-action=blocked]');await tick();
 assert.match(m.$('slspBlocked').textContent,/No blocked people/);assert.equal(attempt,2);assert.equal(m.$('slspSettingsForm').elements.discoverable.checked,false);
});
test('blocked roster clears failed retry UI and ignores late old-session identity',async t=>{
 let release,attempt=0;const m=await make(t,{url:'https://scenelink.test/profile#settings',handle:async r=>{
  if(r.url==='/api/users/blocked'){if(++attempt===1)return{status:503,body:{error:'Unavailable'}};await new Promise(resolve=>release=resolve);return{body:{blocked:[{id:PEER,display_name:'OLD BLOCKED IDENTITY'}]}};}
 }});
 m.click('[data-action=blocked]');await tick();assert.match(m.$('slspBlocked').textContent,/Loading blocked people/);
 m.w.localStorage.removeItem('sl_jwt_token');m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));release();await tick();
 assert(!m.$('slSocialProfile').textContent.includes('OLD BLOCKED IDENTITY'));
});
for(const [route,body,container,forbidden] of [
 ['/api/friends?',{ok:true},'slspFriends','No accepted friends'],
 ['/api/friends?',{friends:[{display_name:'No identity'}]},'slspFriends','No identity'],
 ['/api/friends/pending',{incoming:[]},'slspRequests','No incoming requests'],
 ['/api/friends/pending',{incoming:[{other_user_id:PEER}],outgoing:[]},'slspRequests','Accept request']
])test('friend roster rejects incomplete response '+route+JSON.stringify(body),async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#friends',handle:r=>r.url.startsWith(route)?{body}:null});
 assert.match(m.$(container).textContent,/could not be verified/);assert(!m.$(container).textContent.includes(forbidden));
});
for(const body of [{ok:true},{results:[null]},{results:[{display_name:'No identity'}]}])
test('member search does not turn malformed results into no matches '+JSON.stringify(body),async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#friends',handle:r=>r.url.startsWith('/api/users/search')?{body}:null});
 m.$('slspSearchInput').value='peer';m.submit('slspSearchForm');await tick();
 assert.match(m.$('slspSearchResults').textContent,/could not be verified/);assert(!m.$('slspSearchResults').textContent.includes('No visible matches'));assert(!m.$('slspSearchResults').querySelector('[data-action=request]'));
});

function choosePhoto(m){
 const input=m.$('slspAvatarFile'),file=new m.w.File(['fixture image'],'draft.png',{type:'image/png'});
 Object.defineProperty(input,'files',{value:[file]});return{input,file};
}
test('closing and reopening profile edit preserves chosen photo and text draft',async t=>{
 const m=await make(t,{handle:r=>r.url==='/api/media/capability'?{body:{enabled:true,contract:'server-upload-v1',max_bytes:4194304}}:null});
 m.click('[data-action=edit]');await tick();const {input,file}=choosePhoto(m);m.$('slspEditForm').elements.bio.value='Keep this draft';
 m.click('[data-action=cancel-edit]');m.click('[data-action=edit]');await tick();
 assert.equal(m.$('slspAvatarFile'),input);assert.equal(input.files[0],file);assert.equal(m.$('slspEditForm').elements.bio.value,'Keep this draft');
 assert.equal(m.calls.filter(r=>r.url==='/api/media/capability').length,1);
});
test('reopening edit during capability lookup does not launch a replacement lookup',async t=>{
 let release;const m=await make(t,{handle:async r=>{if(r.url==='/api/media/capability'){await new Promise(resolve=>release=resolve);return{body:{enabled:true,contract:'server-upload-v1'}};}}});
 m.click('[data-action=edit]');await tick();m.click('[data-action=cancel-edit]');m.click('[data-action=edit]');await tick();
 assert.equal(m.calls.filter(r=>r.url==='/api/media/capability').length,1);release();await tick();assert(m.$('slspAvatarFile'));
});
test('failed photo capability lookup can be retried by reopening edit',async t=>{
 let count=0;const m=await make(t,{handle:r=>r.url==='/api/media/capability'?(++count===1?{status:503,body:{error:'Unavailable'}}:{body:{enabled:true,contract:'server-upload-v1'}}):null});
 m.click('[data-action=edit]');await tick();assert(!m.$('slspAvatarFile'));m.click('[data-action=cancel-edit]');m.click('[data-action=edit]');await tick();assert(m.$('slspAvatarFile'));
});
test('photo availability has an inline retry that preserves the current draft',async t=>{
 let count=0;const m=await make(t,{handle:r=>r.url==='/api/media/capability'?(++count===1?{status:503,body:{error:'Unavailable'}}:{body:{enabled:true,contract:'server-upload-v1'}}):null});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm');form.elements.bio.value='Still editing';
 const retry=form.querySelector('[data-action=retry-avatar]');assert(retry);retry.focus();retry.click();await tick();
 assert.equal(count,2);assert.equal(m.$('slspEditForm'),form);assert.equal(form.elements.bio.value,'Still editing');assert(m.$('slspAvatarFile'));assert.equal(m.$('slspAvatarCapability').hasAttribute('aria-busy'),false);assert.equal(m.w.document.activeElement,m.$('slspAvatarFile'));
});
test('a first confirmed photo can be removed immediately without losing unsaved text',async t=>{
 let uploaded;
 const m=await make(t,{handle:(r,ctx)=>{
  if(r.url==='/api/media/capability')return{body:{enabled:true,contract:'server-upload-v1'}};
  if(r.url==='/api/media/upload'){uploaded=r.body;ctx.setUser({...ctx.user,avatar_url:'https://assets.example.test/first.webp',profile_revision:2});return{body:{asset:{kind:'avatar',url:ctx.user.avatar_url}}};}
  if(r.method==='PUT'){ctx.setUser({...ctx.user,...r.body,profile_revision:3});return{body:{user:ctx.user}};}
 }});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm');form.elements.bio.value='My pending bio';assert.equal(m.$('slspRemoveAvatar').hidden,true);
 choosePhoto(m);m.click('[data-action=upload-avatar]');await tick();await tick();
 assert.equal(uploaded.revision,1);assert.equal(m.$('slspEditForm'),form);assert.equal(form.elements.bio.value,'My pending bio');assert.equal(m.$('slspRemoveAvatar').hidden,false);assert.match(m.$('slspAvatarPreview').querySelector('img').src,/first.webp/);
 form.elements.remove_avatar.checked=true;m.submit('slspEditForm');await tick();
 const write=m.calls.find(r=>r.method==='PUT');assert.equal(write.body.revision,2);assert.equal(write.body.avatar_url,null);assert.equal(write.body.bio,'My pending bio');assert.match(m.$('slspActionStatus').textContent,/Profile saved and read back/);assert.equal(m.$('slspRemoveAvatar').hidden,true);assert(!m.w.document.querySelector('.slsp-hero img'));
});
test('broken photo falls back to escaped initials in the hero and editor',async t=>{
 const m=await make(t,{user:{...baseUser,display_name:'<member>',avatar_url:'https://assets.example.test/missing.webp'}});
 for(const image of [...m.w.document.querySelectorAll('img.slsp-avatar')])image.dispatchEvent(new m.w.Event('error'));
 assert.equal(m.w.document.querySelectorAll('img.slsp-avatar').length,0);assert.equal(m.w.document.querySelector('.slsp-hero .slsp-avatar').textContent,'<');assert.equal(m.$('slspAvatarPreview').querySelector('.slsp-avatar').textContent,'<');assert(!m.w.document.querySelector('member'));
});
test('empty images never start a provider upload',async t=>{
 const m=await make(t,{handle:r=>r.url==='/api/media/capability'?{body:{enabled:true,contract:'server-upload-v1'}}:null});m.click('[data-action=edit]');await tick();
 Object.defineProperty(m.$('slspAvatarFile'),'files',{value:[new m.w.File([],'empty.png',{type:'image/png'})]});m.click('[data-action=upload-avatar]');await tick();
 assert.equal(m.calls.filter(r=>r.url==='/api/media/upload').length,0);assert.equal(m.$('slspAvatarStatus').dataset.kind,'error');
});
test('an avatar revision conflict keeps the selected photo and text draft for review',async t=>{
 const m=await make(t,{handle:r=>r.url==='/api/media/capability'?{body:{enabled:true,contract:'server-upload-v1'}}:r.url==='/api/media/upload'?{status:409,body:{error:'Profile changed while uploading',code:'STALE_PROFILE'}}:null});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm'),{input,file}=choosePhoto(m);form.elements.bio.value='Keep this text';m.click('[data-action=upload-avatar]');await tick();await tick();
 assert.equal(form.dataset.revision,'1');assert.equal(form.elements.bio.value,'Keep this text');assert.equal(input.files[0],file);assert.equal(input.disabled,false);assert.equal(m.$('slspRemoveAvatar').hidden,true);assert.match(m.$('slspAvatarStatus').textContent,/changed in another session/);
});
for(const [label,asset,readUser] of [
 ['wrong kind',{kind:'post',url:'https://assets.example.test/new.webp'},{avatar_url:'https://assets.example.test/new.webp',profile_revision:2}],
 ['unsafe URL',{kind:'avatar',url:'javascript:alert(1)'},{avatar_url:'javascript:alert(1)',profile_revision:2}],
 ['different saved photo',{kind:'avatar',url:'https://assets.example.test/new.webp'},{avatar_url:'https://assets.example.test/old.webp',profile_revision:2}],
 ['unchanged revision',{kind:'avatar',url:'https://assets.example.test/new.webp'},{avatar_url:'https://assets.example.test/new.webp',profile_revision:1}]
])test('avatar confirmation rejects '+label+' without rebasing or discarding draft',async t=>{
 const m=await make(t,{handle:(r,ctx)=>{
  if(r.url==='/api/media/capability')return{body:{enabled:true,contract:'server-upload-v1'}};
  if(r.url==='/api/media/upload'){ctx.setUser({...ctx.user,...readUser});return{body:{asset}};}
 }});
 m.click('[data-action=edit]');await tick();const {input,file}=choosePhoto(m);m.$('slspEditForm').elements.bio.value='Unsaved text';
 m.click('[data-action=upload-avatar]');await tick();await tick();
 assert.equal(m.$('slspAvatarStatus').dataset.kind,'error');assert(!m.$('slspAvatarStatus').textContent.includes('Photo saved'));
 assert.equal(m.$('slspEditForm').dataset.revision,'1');assert.equal(m.$('slspEditForm').elements.bio.value,'Unsaved text');assert.equal(input.files[0],file);assert.equal(input.disabled,false);
 assert(!m.w.document.querySelector('.slsp-hero img'));
});
test('photo upload disables file replacement while pending then reenables after confirmation',async t=>{
 let release;const m=await make(t,{handle:async(r,ctx)=>{
  if(r.url==='/api/media/capability')return{body:{enabled:true,contract:'server-upload-v1'}};
  if(r.url==='/api/media/upload'){await new Promise(resolve=>release=resolve);ctx.setUser({...ctx.user,avatar_url:'https://assets.example.test/new.webp',profile_revision:2});return{body:{asset:{kind:'avatar',url:'https://assets.example.test/new.webp'}}};}
 }});
 m.click('[data-action=edit]');await tick();const {input}=choosePhoto(m);m.click('[data-action=upload-avatar]');await tick();assert.equal(input.disabled,true);
 m.click('[data-action=cancel-edit]');m.click('[data-action=edit]');assert.equal(m.$('slspAvatarFile'),input);release();await tick();await tick();
 assert.equal(input.disabled,false);assert.match(m.$('slspAvatarStatus').textContent,/Photo saved and read back/);
});

test('profile save locks submitted fields through readback without locking the privacy draft',async t=>{
 let releaseWrite,releaseRead,written=false;
 const m=await make(t,{handle:async(r,ctx)=>{
  if(r.method==='PUT'){await new Promise(resolve=>releaseWrite=resolve);ctx.setUser({...ctx.user,...r.body,profile_revision:2});written=true;return{body:{user:ctx.user}};}
  if(r.url==='/api/users/me'&&written){await new Promise(resolve=>releaseRead=resolve);return{body:{user:ctx.user}};}
 }});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm'),privacy=m.$('slspSettingsForm');form.elements.bio.value='Submitted draft';
 m.submit('slspEditForm');await tick();assert.equal(form.getAttribute('aria-busy'),'true');
 for(const name of ['display_name','username','bio','city','social_instagram'])assert.equal(form.elements[name].disabled,true,name);
 assert.equal(privacy.elements.allow_messages.disabled,false);privacy.elements.allow_messages.value='none';
 releaseWrite();await tick();assert.equal(form.elements.bio.disabled,true,'remain locked until saved state is read back');
 releaseRead();await tick();assert.match(m.$('slspActionStatus').textContent,/Profile saved/);assert.equal(m.$('slspEditForm').elements.bio.disabled,false);
 assert.equal(m.$('slspSettingsForm').elements.allow_messages.value,'none');assert.match(m.$('slspSettingsStatus').textContent,/draft.*unsaved/i);
});
for(const phase of ['write','readback'])test('privacy save '+phase+' failure restores original disabled states and draft',async t=>{
 let release,written=false;const m=await make(t,{handle:async(r,ctx)=>{
  if(r.method==='PATCH'){if(phase==='write'){await new Promise(resolve=>release=resolve);return{status:503,body:{error:'Unavailable'}};}written=true;ctx.setUser({...ctx.user,...r.body,profile_revision:2});return{body:{user:ctx.user}};}
  if(r.url==='/api/users/me'&&written){await new Promise(resolve=>release=resolve);return{status:503,body:{error:'Unavailable'}};}
 }});
 m.click('[data-tab=settings]');const form=m.$('slspSettingsForm');form.elements.discoverable.checked=false;
 const reload=form.querySelector('[data-action=reload-settings]');reload.disabled=true;
 m.submit('slspSettingsForm');await tick();assert.equal(form.elements.discoverable.disabled,true);assert.equal(form.elements.allow_messages.disabled,true);
 release();await tick();assert.equal(form.elements.discoverable.disabled,false);assert.equal(form.elements.discoverable.checked,false);assert.equal(reload.disabled,true);
 assert.equal(form.hasAttribute('aria-busy'),false);assert.equal(form.dataset.revision,'1');
});
test('old save completion cannot unlock or alter a new account form',async t=>{
 let release;const m=await make(t,{handle:async(r,ctx)=>{
  if(r.method==='PUT'){await new Promise(resolve=>release=resolve);return{body:{user:{...ctx.user,...r.body,profile_revision:2}}};}
 }});
 m.click('[data-action=edit]');await tick();m.$('slspEditForm').elements.bio.value='Old account draft';m.submit('slspEditForm');await tick();
 m.w.localStorage.setItem('sl_jwt_token','new-session');m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));await tick();
 const newForm=m.$('slspEditForm');newForm.elements.bio.value='New account draft';newForm.elements.bio.disabled=true;
 release();await tick();assert.equal(newForm.elements.bio.value,'New account draft');assert.equal(newForm.elements.bio.disabled,true);assert(!m.$('slspActionStatus').textContent.includes('Profile saved'));
});

for(const outcome of ['success','readback failure'])test('late photo capability stays locked through profile save '+outcome,async t=>{
 let releaseCapability,releaseWrite,releaseRead,written=false;
 const m=await make(t,{handle:async(r,ctx)=>{
  if(r.url==='/api/media/capability'){await new Promise(resolve=>releaseCapability=resolve);return{body:{enabled:true,contract:'server-upload-v1'}};}
  if(r.method==='PUT'){await new Promise(resolve=>releaseWrite=resolve);ctx.setUser({...ctx.user,...r.body,profile_revision:2});written=true;return{body:{user:ctx.user}};}
  if(r.url==='/api/users/me'&&written){await new Promise(resolve=>releaseRead=resolve);return outcome==='success'?{body:{user:ctx.user}}:{status:503,body:{error:'Readback unavailable'}};}
 }});
 m.click('[data-action=edit]');await tick();const form=m.$('slspEditForm');form.elements.bio.value='Keep draft on failure';m.submit('slspEditForm');await tick();
 releaseCapability();await tick();const input=m.$('slspAvatarFile'),upload=form.querySelector('[data-action=upload-avatar]');
 assert(input);assert.equal(input.disabled,true);assert.equal(upload.disabled,true);assert.equal(form.getAttribute('aria-busy'),'true');
 m.click('[data-action=upload-avatar]');assert.equal(m.calls.filter(r=>r.url==='/api/media/upload').length,0);
 releaseWrite();await tick();assert.equal(input.disabled,true);releaseRead();await tick();
 if(outcome==='success'){assert.match(m.$('slspActionStatus').textContent,/Profile saved/);assert(!input.isConnected);}
 else{assert.equal(input.isConnected,true);assert.equal(input.disabled,false);assert.equal(upload.disabled,false);assert.equal(form.elements.bio.value,'Keep draft on failure');assert.equal(form.hasAttribute('aria-busy'),false);assert.match(m.$('slspEditStatus').textContent,/readback failed/);}
});
test('old-session late photo capability cannot mount controls on replacement profile',async t=>{
 let releaseCapability,releaseWrite;
 const m=await make(t,{handle:async(r,ctx)=>{
  if(r.url==='/api/media/capability'){await new Promise(resolve=>releaseCapability=resolve);return{body:{enabled:true,contract:'server-upload-v1'}};}
  if(r.method==='PUT'){await new Promise(resolve=>releaseWrite=resolve);return{body:{user:{...ctx.user,profile_revision:2}}};}
 }});
 m.click('[data-action=edit]');await tick();m.submit('slspEditForm');await tick();m.w.localStorage.setItem('sl_jwt_token','replacement-session');m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));await tick();
 const replacement=m.$('slspEditForm');replacement.elements.bio.disabled=true;
 releaseCapability();releaseWrite();await tick();assert(!m.$('slspAvatarFile'));assert.equal(replacement.elements.bio.disabled,true);assert.equal(replacement.hasAttribute('aria-busy'),false);assert(!m.$('slspActionStatus').textContent.includes('Profile saved'));
});

test('Friends can copy a stable own-profile invitation without creating or sending anything',async t=>{
 const m=await make(t,{url:'https://isolated.example.test/profile#friends'});const copies=[];
 Object.defineProperty(m.w.navigator,'clipboard',{value:{writeText:async text=>{copies.push(text);}}});
 const field=m.$('slspInviteLink');
 assert.equal(field.readOnly,true);
 assert.equal(field.value,'https://isolated.example.test/profile?u='+ID);
 m.click('[data-action=copy-invite]');await tick();
 assert.deepEqual(copies,[field.value]);
 assert.match(m.$('slspInviteStatus').textContent,/Nothing was sent/);
 assert(m.calls.every(c=>c.method==='GET'));
});
test('copy failure focuses the existing link for manual sharing without reporting success',async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#friends'});
 Object.defineProperty(m.w.navigator,'clipboard',{value:{writeText:async()=>{throw Error('Clipboard not permitted');}}});
 m.click('[data-action=copy-invite]');await tick();
 assert.equal(m.w.document.activeElement,m.$('slspInviteLink'));
 assert.match(m.$('slspInviteStatus').textContent,/Copy the selected link/);
 assert.doesNotMatch(m.$('slspInviteStatus').textContent,/copied/);
 assert(m.calls.every(c=>c.method==='GET'));
});
test('public profile views never offer to invite as that member',async t=>{
 const handle=(r)=>r.url==='/api/users/'+ID?{body:{user:baseUser,can_view:false,can_message:false,is_me:false}}:undefined;
 const guest=await make(t,{url:'https://scenelink.test/profile?u='+ID,token:null,handle});
 assert.equal(guest.$('slspInviteLink'),null);
 assert.match(guest.$('slSocialProfile').textContent,/Sign in to connect/);
 const other=await make(t,{url:'https://scenelink.test/profile?u='+ID,handle});
 assert.equal(other.$('slspInviteLink'),null);
 assert.match(other.$('slSocialProfile').textContent,/Add friend/);
});
test('an unresolved clipboard operation cannot repaint the next account',async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#friends'});let finish;
 Object.defineProperty(m.w.navigator,'clipboard',{value:{writeText:()=>new Promise(r=>{finish=r;})}});
 m.click('[data-action=copy-invite]');
 m.w.localStorage.removeItem('sl_jwt_token');
 m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));
 finish();await tick();
 assert.equal(m.$('slspInviteLink'),null);
 assert.doesNotMatch(m.$('slSocialProfile').textContent,/Invite link copied/);
});

test('invitation destination stays unavailable when existing server privacy denies the relationship',async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile?u='+ID,handle:r=>r.url==='/api/users/'+ID?{status:404,body:{error:'User unavailable'}}:undefined});
 assert.match(m.$('slSocialProfile').textContent,/Profile unavailable/);
 assert.equal(m.$('slspInviteLink'),null);
 assert.equal(m.w.document.querySelector('[data-action=request]'),null);
});

test('recipient keeps the invited profile after sign-in and explicitly requests friendship',async t=>{
 let pending=false;
 const m=await make(t,{url:'https://scenelink.test/profile?u='+PEER,token:null,handle:r=>{
  if(r.url==='/api/users/'+PEER)return{body:{user:{...baseUser,id:PEER},is_me:false,can_view:false,can_message:false,friendship_status:pending?{status:'pending',direction:'outgoing',id:'f1'}:null}};
  if(r.url==='/api/friends/request'){
   assert.equal(r.method,'POST');assert.deepEqual(r.body,{user_id:PEER});
   pending=true;return{body:{friendship_id:'f1',status:'pending',direction:'outgoing'}};
  }
 }});
 assert.match(m.$('slSocialProfile').textContent,/Sign in to connect/);
 assert.equal(m.w.document.querySelector('[data-action=request]'),null);
 m.w.localStorage.setItem('sl_jwt_token','recipient-session');
 m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));await tick();
 assert.equal(m.w.location.search,'?u='+PEER);
 assert(m.calls.every(c=>c.method==='GET'));
 m.click('[data-action=request]');await tick();
 assert.equal(m.calls.filter(c=>c.method==='POST').length,1);
 assert.match(m.$('slspActionStatus').textContent,/pending until the other person accepts/);
 assert(m.w.document.querySelector('[data-action=remove]'));
});
