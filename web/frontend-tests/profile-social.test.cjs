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
 w.fetch=async(input,options={})=>{const request={url:String(input),method:options.method||'GET',body:options.body?JSON.parse(options.body):undefined};calls.push(request);const reply=handle&&await handle(request,{user:current,setUser:u=>current=u});let status=200,body;
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
test('privacy edits include real booleans, opt-in read receipts and revision',async t=>{
 let body;const m=await make(t,{handle:(r,ctx)=>{if(r.method==='PATCH'){body=r.body;ctx.setUser({...ctx.user,...r.body,profile_revision:2});return{body:{user:{...ctx.user,...r.body,profile_revision:2}}};}}});m.click('[data-tab=settings]');await tick();const form=m.$('slspSettingsForm');form.elements.discoverable.checked=false;form.elements.share_read_receipts.checked=true;form.elements.allow_messages.value='none';m.submit('slspSettingsForm');await tick();
 assert.equal(body.discoverable,false);assert.equal(body.share_read_receipts,true);assert.equal(body.allow_messages,'none');assert.equal(body.revision,1);assert.match(m.$('slspActionStatus').textContent,/Privacy settings saved and read back/);
});
test('private public profile fails closed for links, bio and earned data even if response includes them',async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile?u=peer',handle:r=>r.url==='/api/users/peer'?{body:{user:{id:PEER,username:'peer',display_name:'TEST peer',bio:'PRIVATE SECRET',social_links:[{provider:'instagram',url:'https://instagram.com/secret'}]},can_view:false,can_message:false,is_me:false,friendship_status:null,achievements:achievement}}:null});
 assert.match(m.$('slSocialProfile').textContent,/This profile is private/);assert(!m.$('slSocialProfile').textContent.includes('PRIVATE SECRET'));assert(!m.$('slspPublicAchievements'));assert(!m.w.document.querySelector('a[href*="instagram.com"]'));assert(!m.w.document.querySelector('a[href*="/messages?"]'));
});
test('people search suppresses older and input-changed responses; requests use server relationships',async t=>{
 let releaseOld,requested=false;const m=await make(t,{handle:async r=>{
  if(r.url.includes('/users/search?q=old')){await new Promise(resolve=>releaseOld=resolve);return{body:{results:[{id:PEER,username:'old',display_name:'OLD RESPONSE'}]}};}
  if(r.url.includes('/users/search?q=new'))return{body:{results:[{id:PEER,username:'new',display_name:'NEW RESPONSE',friendship_status:requested?{id:'request-id',status:'pending',direction:'outgoing'}:null}]}};
  if(r.url==='/api/friends/request'){requested=true;return{body:{friendship_id:'request-id',status:'pending'}};}
 }});m.click('[data-tab=friends]');await tick();m.$('slspSearchInput').value='old';m.submit('slspSearchForm');await tick();m.$('slspSearchInput').value='new';m.$('slspSearchInput').dispatchEvent(new m.w.Event('input',{bubbles:true}));m.submit('slspSearchForm');await tick();releaseOld();await tick();assert.match(m.$('slspSearchResults').textContent,/NEW RESPONSE/);assert(!m.$('slspSearchResults').textContent.includes('OLD RESPONSE'));
 m.click('#slspSearchResults [data-action=request]');await tick();assert.match(m.$('slspSearchResults').textContent,/Request pending/);assert.match(m.$('slspActionStatus').textContent,/pending until/);assert.equal(m.calls.find(c=>c.url==='/api/friends/request').body.user_id,PEER);
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
test('privacy hash alias selects settings and keyboard tabs work with Back history',async t=>{
 const m=await make(t,{url:'https://scenelink.test/profile#privacy'});assert(!m.$('slspPanelSettings').hidden);const tab=m.$('slspTabSettings');tab.dispatchEvent(new m.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert(!m.$('slspPanelFriends').hidden);assert.equal(m.w.document.activeElement.id,'slspTabFriends');m.w.history.back();await tick();assert(!m.$('slspPanelSettings').hidden);
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
