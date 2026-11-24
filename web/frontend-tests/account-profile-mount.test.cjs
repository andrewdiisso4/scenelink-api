'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(path.join(__dirname,'../frontend/js',name+'.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
const userA={id:'10000000-0000-4000-8000-000000000001',email:'a@example.invalid',username:'fixture_a',display_name:'Fixture A',bio:'',city:'',neighborhood:'',avatar_url:null,social_links:[],profile_revision:1,is_private:true,discoverable:true,allow_messages:'friends',show_achievements:false,share_read_receipts:false};
const userB={...userA,id:'10000000-0000-4000-8000-000000000002',email:'b@example.invalid',username:'fixture_b',display_name:'Fixture B'};
async function fixture(t,{accountFirst=true,url='https://scenelink.test/profile'}={}){
 const dom=new JSDOM('<!doctype html><html><head></head><body><main id="slSocialProfile"></main></body></html>',{url,runScripts:'outside-only'}),w=dom.window,d=w.document;
 t.after(()=>w.close());w.AbortController=AbortController;w.confirm=()=>true;w.console.log=()=>{};
 const calls=[],waiting=new Map(),users=new Map([['session-A',structuredClone(userA)],['session-B',structuredClone(userB)]]);
 let deletionCalls=0;
 w.SLApi={accountDeletionRequirements:async()=>({confirmation:{method:'password',provider:null,recent_sign_in_required:false,recent_sign_in_window_seconds:300,can_delete:true}}),deleteAccount(){deletionCalls++;throw Error('No deletion is allowed in this mount fixture');}};
 w.fetch=async(input,options={})=>{
  const url=String(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):null,token=(options.headers?.Authorization||'').replace(/^Bearer /,'');
  calls.push({url,method,body,token});let data,status=200;
  if(url==='/api/auth/signup'){status=201;data={token:'session-A',user:users.get('session-A')};}
  else if(url==='/api/auth/login')data={token:'session-B',user:users.get('session-B')};
  else if(url==='/api/auth/logout')data={revoked:true};
  else if(url==='/api/users/me'){
   const pending=waiting.get(token);if(pending){waiting.delete(token);data={user:await pending.promise};}else data={user:users.get(token)};
  }else if(url==='/api/auth/profile'||url==='/api/users/me/settings'){
   const user={...users.get(token),...body,profile_revision:users.get(token).profile_revision+1};users.set(token,user);data={user};
  }else if(url==='/api/users/me/achievements')data={source:'persisted_scenelink_activity',counts:{},badges:[]};
  else if(url==='/api/media/capability')data={enabled:false,contract:'server-upload-v1'};
  else if(url==='/api/users/blocked')data={blocked:[]};
  else if(url.startsWith('/api/users/'))data={user:userB,is_me:false,can_view:false};
  else throw Error('Unexpected fixture request '+method+' '+url);
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 };
 const load=name=>w.eval(source(name));
 load('sl-auth-core');load('sl-connected-api');
 if(accountFirst)load('sl-account-settings');load('sl-social-profile');if(!accountFirst)load('sl-account-settings');
 await tick();
 const $=id=>d.getElementById(id);
 return{w,d,$,calls,users,get deletionCalls(){return deletionCalls;},
  delayMe(token){const pending=deferred();waiting.set(token,pending);return pending;},
  async signup(){await w.SLAuth.signup({email:userA.email,password:'Fictional password',username:userA.username,display_name:userA.display_name});await tick();},
  async openDeletion(){ $('slspTabSettings').click();$('slAcctDeleteBtn').focus();$('slAcctDeleteBtn').click();await tick();assert.equal($('slAcctPw').disabled,false,'Confirmation requirements are ready');},
  submit(id){$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
 };
}
function assertMounted(f){
 assert.equal(f.d.querySelectorAll('#slAcctSettings').length,1);
 assert.equal(f.$('slAcctSettings').parentElement,f.$('slspPanelSettings'));
 assert(f.$('slAcctDeleteBtn'));assert(f.$('slAcctLogout'));
}

for(const accountFirst of [true,false])test('delayed signup profile mounts account controls once in settings, account script first='+accountFirst,async t=>{
 const f=await fixture(t,{accountFirst}),pending=f.delayMe('session-A');
 await f.signup();assert.equal(f.$('slAcctSettings'),null,'The canonical profile must finish before showing owner controls');
 pending.resolve(f.users.get('session-A'));await tick();assertMounted(f);
 assert.equal(f.$('slspPanelSettings').hidden,true);f.$('slspTabSettings').click();assert.equal(f.$('slspPanelSettings').hidden,false);
 await f.openDeletion();const modal=f.$('slAcctDelOverlay');assert(modal);
 f.w.dispatchEvent(new f.w.Event('sl-auth-ready'));f.w.dispatchEvent(new f.w.Event('sl-auth-changed'));
 assert.equal(f.$('slAcctDelOverlay'),modal,'Same-session readiness does not dismiss confirmation');assertMounted(f);
 assert.equal(f.deletionCalls,0);
});

for(const settings of [false,true])test((settings?'privacy':'profile')+' save and readback remount controls while preserving an active confirmation',async t=>{
 const f=await fixture(t);await f.signup();
 // Reproduce the existing independently mounted state before a second profile render.
 f.w.dispatchEvent(new f.w.Event('sl-auth-ready'));assert(f.$('slAcctDeleteBtn'));
 const pending=f.delayMe('session-A');
 if(settings){f.$('slspTabSettings').click();f.$('slspSettingsForm').elements.discoverable.checked=false;}
 else{f.d.querySelector('[data-action=edit]').click();f.$('slspEditForm').elements.display_name.value='Saved fixture name';}
 f.submit(settings?'slspSettingsForm':'slspEditForm');await tick();
 await f.openDeletion();const modal=f.$('slAcctDelOverlay'),password=f.$('slAcctPw');password.value='Unsaved confirmation password';
 pending.resolve(f.users.get('session-A'));await tick();
 assert.match(f.$('slspActionStatus').textContent,/saved and read back/);assertMounted(f);
 assert.equal(f.$('slAcctDelOverlay'),modal);assert.equal(password.value,'Unsaved confirmation password');
  assert(modal.contains(f.d.activeElement),'Save completion must not move focus out of the active confirmation');
 f.$('slAcctCancel').click();assert.equal(password.value,'');assert.equal(f.$('slAcctDelOverlay'),null);
 assert.equal(f.d.activeElement,f.$('slAcctDeleteBtn'),'Closing after a rerender returns focus to the replacement control');
 assert.equal(f.deletionCalls,0);
});

test('account switch clears confirmation and stale profile response cannot recreate old controls',async t=>{
 const f=await fixture(t);await f.signup();f.w.dispatchEvent(new f.w.Event('sl-auth-ready'));
 const old=f.delayMe('session-A');f.d.querySelector('[data-action=reload-settings]').click();await tick();
 // The reload is pending; finish it only after the next account has begun loading.
 const next=f.delayMe('session-B');await f.w.SLAuth.login(userB.email,'Fictional password');await tick();
 assert.equal(f.$('slAcctSettings'),null);old.resolve(userA);await tick();assert.equal(f.$('slAcctSettings'),null);
 next.resolve(userB);await tick();assertMounted(f);assert.equal(f.d.querySelector('h1').textContent,userB.display_name);
 await f.openDeletion();const password=f.$('slAcctPw');password.value='Must be cleared';
 await f.w.SLAuth.logout({reload:false});await tick();
 assert.equal(password.value,'');assert.equal(f.$('slAcctDelOverlay'),null);assert.equal(f.$('slAcctSettings'),null);assert.match(f.$('slSocialProfile').textContent,/Sign in/);
});

test('switching accounts closes the previous dialog before the next profile is available',async t=>{
 const f=await fixture(t);await f.signup();f.w.dispatchEvent(new f.w.Event('sl-auth-ready'));await f.openDeletion();
 const password=f.$('slAcctPw');password.value='Old account confirmation';const pending=f.delayMe('session-B');
 await f.w.SLAuth.login(userB.email,'Fictional password');await tick();
 assert.equal(password.value,'');assert.equal(f.$('slAcctDelOverlay'),null);assert.equal(f.$('slAcctSettings'),null);
 await f.w.SLAuth.logout({reload:false});pending.resolve(userB);await tick();
 assert.equal(f.$('slAcctSettings'),null);assert.match(f.$('slSocialProfile').textContent,/Sign in/);
});

test('another member profile never receives current-account controls from auth readiness',async t=>{
 const f=await fixture(t,{url:'https://scenelink.test/profile?u=fixture_b'});await f.signup();
 f.w.dispatchEvent(new f.w.Event('sl-auth-ready'));
 assert.equal(f.$('slspPanelSettings'),null);assert.equal(f.$('slAcctSettings'),null);assert.equal(f.$('slAcctDelOverlay'),null);
 assert.equal(f.d.querySelector('h1').textContent,userB.display_name);
});
