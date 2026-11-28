'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../frontend/js');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
const owner={id:'00000000-0000-4000-8000-000000000001',username:'local_member',display_name:'Old member',bio:'',city:'',neighborhood:'',profile_revision:1,avatar_url:'https://assets.example.invalid/old.webp',social_links:[],is_private:false,allow_messages:'friends',discoverable:true,show_achievements:false,share_read_receipts:false};
const nextOwner={...owner,id:'00000000-0000-4000-8000-000000000002',username:'next_member',display_name:'Next account',avatar_url:null};
const achievements=friends=>({source:'persisted_scenelink_activity',counts:{saved_venues:0,friends,shared_posts:0,collaborative_plans:0},badges:[],points:null});
async function fixture(t,options={}){
  const dom=new JSDOM('<!doctype html><html><head></head><body data-sl-social-profile><header><div class="nav-right"><button class="sl-auth-trigger">Sign in</button></div></header><main id="slSocialProfile"></main></body></html>',{url:options.url||'https://scenelink.test/profile',runScripts:'outside-only'}),w=dom.window;
  t.after(()=>w.close());w.AbortController=AbortController;w.confirm=()=>true;w.localStorage.setItem('sl_jwt_token','local-session-A');
  let user=structuredClone(owner);const calls=[],identities=[];
  const context={get user(){return user;},setUser(value){user=value;}};
  w.fetch=async(url,opts={})=>{
    const request={url:String(url),method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):undefined};calls.push(request);
    const reply=options.handle&&await options.handle(request,context);let body,status=200;
    if(reply){body=reply.body;status=reply.status||200;}
    else if(url==='/api/users/me')body={user:structuredClone(user)};
    else if(url==='/api/users/me/achievements')body=achievements(0);
    else if(url==='/api/media/capability')body={enabled:true,contract:'server-upload-v1',max_bytes:4194304};
    else if(url==='/api/users/blocked')body={blocked:[]};
    else if(url==='/api/auth/profile'||url==='/api/users/me/settings'){user={...user,...request.body,profile_revision:user.profile_revision+1};body={user:structuredClone(user)};}
    else throw Error('Unexpected isolated fixture request '+url);
    return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  };
  // Exercise the actual header script with the social client's normalized API
  // contract; no provider, backend or production credentials are involved.
  w.SL={social:{isLoggedIn:()=>!!w.localStorage.getItem('sl_jwt_token'),getMe:()=>options.headerRead?options.headerRead(context):Promise.resolve({ok:true,data:{user:structuredClone(user)}}),realtime:{start(){},stop(){},on(){return()=>{};}}}};
  w.document.addEventListener('sl:profile-rendered',event=>{if(event.detail?.identity)identities.push(event.detail.identity);});
  for(const name of ['sl-connected-api','sl-social-profile','sl-social-integration-9a'])w.eval(fs.readFileSync(path.join(root,name+'.js'),'utf8'));
  await tick();
  const $=id=>w.document.getElementById(id);
  return{w,$,calls,identities,context,click:selector=>w.document.querySelector(selector).click(),submit:id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),count:()=>w.document.querySelectorAll('.slsp-count strong')[1]?.textContent};
}

for(const outcome of ['stale success','stale failure'])test('newer achievement counts survive an older '+outcome,async t=>{
  const old=deferred();let reads=0;
  const f=await fixture(t,{handle:r=>{if(r.url==='/api/users/me/achievements')return ++reads===1?old.promise:{body:achievements(1)};}});
  f.click('[data-action=achievements]');await tick();assert.equal(f.count(),'1');
  old.resolve(outcome==='stale success'?{body:achievements(0)}:{status:503,body:{error:'Older request failed'}});await tick();
  assert.equal(reads,2);assert.equal(f.count(),'1');assert(!f.$('slspAchievements').textContent.includes('Older request failed'));
});

test('an old achievement response cannot replace another account activity',async t=>{
  const old=deferred();let reads=0;
  const f=await fixture(t,{handle:r=>{if(r.url==='/api/users/me/achievements')return ++reads===1?old.promise:{body:achievements(2)};}});
  f.context.setUser(nextOwner);f.w.localStorage.setItem('sl_jwt_token','local-session-B');f.w.dispatchEvent(new f.w.Event('sl-auth-change'));await tick();
  old.resolve({body:achievements(17)});await tick();assert.equal(f.count(),'2');assert.equal(f.w.document.querySelector('h1').textContent,'Next account');
});

for(const removePhoto of [false,true])test('confirmed profile name save synchronizes header identity, remove photo='+removePhoto,async t=>{
  const f=await fixture(t);f.click('[data-action=edit]');await tick();const form=f.$('slspEditForm');
  form.elements.display_name.value='New saved member';form.elements.remove_avatar.checked=removePhoto;f.submit(form.id);await tick();
  assert.match(f.$('slspActionStatus').textContent,/Profile saved and read back/);
  const avatar=f.$('slHdrAvatar');
  if(removePhoto){assert.equal(avatar.tagName,'SPAN');assert.equal(avatar.textContent,'N');}
  else{assert.equal(avatar.getAttribute('src'),owner.avatar_url);assert.equal(avatar.getAttribute('alt'),'New saved member');}
  assert.equal(f.identities.length,1);assert.deepEqual(Object.keys(f.identities[0]).sort(),['avatar_url','display_name','id','username']);
});

test('confirmed photo upload refreshes header and preserves the unsaved text draft',async t=>{
  const photo='https://assets.example.invalid/new.webp';
  const f=await fixture(t,{handle:(r,ctx)=>{if(r.url==='/api/media/upload'){ctx.setUser({...ctx.user,avatar_url:photo,profile_revision:2});return{body:{asset:{kind:'avatar',url:photo}}};}}});
  f.click('[data-action=edit]');await tick();const form=f.$('slspEditForm');form.elements.bio.value='Still an unsaved draft';
  Object.defineProperty(f.$('slspAvatarFile'),'files',{configurable:true,value:[new f.w.File(['isolated image bytes'],'photo.png',{type:'image/png'})]});
  f.click('[data-action=upload-avatar]');await tick();await tick();
  assert.match(f.$('slspAvatarStatus').textContent,/Photo saved and read back/);assert.equal(f.$('slHdrAvatar').getAttribute('src'),photo);
  assert.equal(form.elements.bio.value,'Still an unsaved draft');assert.equal(f.identities.length,1);
});

test('a late initial header read cannot restore identity from before the confirmed save',async t=>{
  const old=deferred(),f=await fixture(t,{headerRead:()=>old.promise});
  f.click('[data-action=edit]');await tick();f.$('slspEditForm').elements.display_name.value='New saved member';f.$('slspEditForm').elements.remove_avatar.checked=true;
  f.submit('slspEditForm');await tick();assert.equal(f.$('slHdrAvatar').textContent,'N');
  old.resolve({ok:true,data:{user:owner}});await tick();assert.equal(f.$('slHdrAvatar').tagName,'SPAN');assert.equal(f.$('slHdrAvatar').textContent,'N');
});

test('failed profile readback does not publish an identity change to the header',async t=>{
  let wrote=false;
  const f=await fixture(t,{handle:(r,ctx)=>{
    if(r.url==='/api/auth/profile'){wrote=true;return{body:{user:{...ctx.user,...r.body,profile_revision:2}}};}
    if(r.url==='/api/users/me'&&wrote)return{status:503,body:{error:'Readback unavailable'}};
  }});
  f.click('[data-action=edit]');await tick();f.$('slspEditForm').elements.display_name.value='Unconfirmed name';f.submit('slspEditForm');await tick();
  assert.match(f.$('slspEditStatus').textContent,/readback failed/);assert.equal(f.$('slHdrAvatar').getAttribute('alt'),owner.display_name);assert.equal(f.identities.length,0);
});

test('old-session profile completion cannot change the new account header',async t=>{
  const old=deferred();const f=await fixture(t,{handle:r=>r.url==='/api/auth/profile'?old.promise:null});
  f.click('[data-action=edit]');await tick();f.$('slspEditForm').elements.display_name.value='Old account pending name';f.submit('slspEditForm');await tick();
  f.context.setUser(nextOwner);f.w.localStorage.setItem('sl_jwt_token','local-session-B');f.w.dispatchEvent(new f.w.Event('sl-auth-change'));await tick();
  old.resolve({body:{user:{...owner,display_name:'Old account pending name',profile_revision:2}}});await tick();
  assert.equal(f.$('slHdrAvatar').tagName,'SPAN');assert.equal(f.$('slHdrAvatar').textContent,'N');assert.equal(f.identities.length,0);assert.equal(f.w.document.querySelector('h1').textContent,'Next account');
});

test('privacy saves and another member profile do not publish owner identity updates',async t=>{
  const own=await fixture(t);own.click('[data-tab=settings]');own.$('slspSettingsForm').elements.discoverable.checked=false;own.submit('slspSettingsForm');await tick();
  assert.match(own.$('slspActionStatus').textContent,/Privacy settings saved/);assert.equal(own.identities.length,0);
  const other=await fixture(t,{url:'https://scenelink.test/profile?u=peer',handle:r=>r.url==='/api/users/peer'?{body:{user:nextOwner,is_me:false,can_view:true,can_message:false}}:null});
  assert.equal(other.w.document.querySelector('h1').textContent,'Next account');assert.equal(other.$('slHdrAvatar').getAttribute('alt'),owner.display_name);assert.equal(other.identities.length,0);
});
