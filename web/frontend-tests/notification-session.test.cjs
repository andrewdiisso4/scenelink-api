'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'../frontend/js');
const uid='10000000-0000-4000-8000-000000000001',rid='a0000000-abcd-4000-8000-000000000001';
const tick=()=>new Promise(r=>setTimeout(r,15)),defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const ok=data=>({ok:true,data}),notice=(type,extra={})=>({id:uid,type,ref_id:rid,ref_type:'room',actor_id:uid,actor_username:'fictional_host',actor_display_name:'Fictional Host',created_at:'2026-11-08T00:00:00Z',...extra});
async function harness(t,options={}){
 const d=new JSDOM('<!doctype html><html><head></head><body><header><div class="nav-right"><button class="sl-auth-trigger">Sign in</button></div></header></body></html>',{url:'https://scenelink.test/',runScripts:'outside-only'}),w=d.window;t.after(()=>w.close());
 w.localStorage.setItem('sl_jwt_token','FICTIONAL_A');const listeners=new Set();
 w.SL={social:{isLoggedIn:()=>!!w.localStorage.getItem('sl_jwt_token'),getMe:options.getMe||(()=>Promise.resolve(ok({user:{id:uid,display_name:'Fictional Owner'}}))),getNotifications:options.getNotifications||(()=>Promise.resolve(ok({notifications:options.items||[]}))),markNotificationRead:()=>Promise.resolve(ok({ok:true})),markAllNotificationsRead:options.markAll||(()=>Promise.resolve(ok({ok:true}))),realtime:{on(fn){listeners.add(fn);return()=>listeners.delete(fn);},start(){},stop(){},current(){return{}}}}};
 w.eval(fs.readFileSync(path.join(root,'sl-social-integration-9a.js'),'utf8'));await tick();
 const open=async()=>{w.document.querySelector('#slHdrSocial button[aria-label="Notifications"]').click();await tick();};
 const change=(value,type='sl-auth-changed',target=w)=>{if(value)w.localStorage.setItem('sl_jwt_token',value);else w.localStorage.removeItem('sl_jwt_token');target.dispatchEvent(new w.CustomEvent(type));};
 return{w,d,open,change,listeners};
}
test('canonical notifications use specific text and private room, profile and conversation routes',async t=>{
 const h=await harness(t,{items:[notice('room_invitation'),notice('room_accepted'),notice('room_declined'),notice('room_confirmed'),notice('friend_accepted',{ref_type:'friendship'}),notice('friend_request',{ref_type:'friendship'}),notice('message',{ref_type:'conversation'})]});await h.open();const rows=[...h.w.document.querySelectorAll('#slNotifList a')];
 for(const row of rows.slice(0,4))assert.equal(row.getAttribute('href'),'/plan-with-friends?room_id='+rid);
 assert.match(rows[0].textContent,/invited you to a private plan/);assert.match(rows[1].textContent,/joined your plan/);assert.match(rows[2].textContent,/declined your plan invitation/);assert.match(rows[3].textContent,/not a reservation/);
 assert.equal(rows[4].getAttribute('href'),'/profile?u=fictional_host');assert.equal(rows[5].getAttribute('href'),'/profile?u=fictional_host');assert.equal(rows[6].getAttribute('href'),'/messages?conversation='+rid);
});
for(const event of ['sl-auth-changed','sl-auth-change'])test(event+' removes old-account drawer and rejects delayed notifications',async t=>{
 const pending=defer(),h=await harness(t,{getNotifications:()=>pending.promise});await h.open();h.change(null,event,event==='sl-auth-change'?h.w.document:h.w);
 assert(!h.w.document.querySelector('#slHdrSocial'));assert(!h.w.document.querySelector('.sl-notif-drawer'));assert(!h.w.document.querySelector('.sl-notif-backdrop'));assert.equal(h.listeners.size,0);
 pending.resolve(ok({notifications:[notice('room_invitation',{actor_display_name:'FICTIONAL_PRIVATE_ACTOR'})]}));await tick();assert(!h.w.document.body.textContent.includes('FICTIONAL_PRIVATE_ACTOR'));
});
test('account switch cannot let delayed avatar/list/read-all responses modify the new account',async t=>{
 const avatar=defer(),list=defer(),read=defer();let first=true;
 const h=await harness(t,{getMe:()=>first?avatar.promise:Promise.resolve(ok({user:{display_name:'B Owner'}})),getNotifications:()=>first?list.promise:Promise.resolve(ok({notifications:[notice('friend_accepted',{actor_display_name:'B_ACTOR'})]})),markAll:()=>read.promise});
 await h.open();h.w.document.getElementById('slNotifReadAll').click();first=false;h.change('FICTIONAL_B');await tick();await h.open();
 avatar.resolve(ok({user:{avatar_url:'https://example.invalid/old-user.png',display_name:'A_PRIVATE'}}));list.resolve(ok({notifications:[notice('room_invitation',{actor_display_name:'A_PRIVATE'})]}));read.resolve(ok({ok:true}));await tick();
 assert(!h.w.document.body.textContent.includes('A_PRIVATE'));assert(!h.w.document.querySelector('img[src*="old-user"]'));assert.match(h.w.document.getElementById('slNotifList').textContent,/B_ACTOR/);assert.equal(h.listeners.size,1);assert.equal(h.w.document.getElementById('slNotifStatus').textContent,'');
});
test('notification failures and failed mark-all are honest and retryable',async t=>{
 let fail=true;const h=await harness(t,{getNotifications:async()=>fail?{ok:false,status:503}:ok({notifications:[notice('room_invitation')]}),markAll:async()=>({ok:false,status:503})});await h.open();
 assert.match(h.w.document.getElementById('slNotifList').textContent,/could not be loaded/);assert(!h.w.document.getElementById('slNotifList').textContent.includes('No notifications yet'));
 fail=false;h.w.document.getElementById('slNotifRetry').click();await tick();assert.equal(h.w.document.querySelectorAll('#slNotifList a').length,1);
 h.w.document.getElementById('slNotifReadAll').click();await tick();assert.match(h.w.document.getElementById('slNotifStatus').textContent,/could not be saved/);assert(h.w.document.querySelector('#slNotifList a.unread'));
});
test('older notification responses do not overwrite a newer drawer load and Escape restores focus',async t=>{
 const a=defer(),b=defer();let count=0;const h=await harness(t,{getNotifications:()=>++count===1?a.promise:b.promise});const bell=h.w.document.querySelector('#slHdrSocial button');bell.focus();await h.open();
 h.w.document.getElementById('slNotifClose').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.w.document.activeElement,bell);await h.open();b.resolve(ok({notifications:[notice('friend_accepted',{actor_display_name:'NEW_ACTOR'})]}));await tick();a.resolve(ok({notifications:[notice('friend_accepted',{actor_display_name:'OLD_ACTOR'})]}));await tick();assert.match(h.w.document.getElementById('slNotifList').textContent,/NEW_ACTOR/);assert(!h.w.document.body.textContent.includes('OLD_ACTOR'));
});
test('notification content cannot inject markup or navigation schemes',async t=>{
 const h=await harness(t,{items:[notice('room_invitation',{ref_id:'javascript:alert(1)',actor_display_name:'<img src=x onerror=alert(1)>'}),notice('friend_accepted',{actor_username:'" onclick="alert(1)'})]});await h.open();
 const list=h.w.document.getElementById('slNotifList');assert(!list.querySelector('img'));assert.match(list.textContent,/<img src=x/);assert.equal(list.querySelector('a').getAttribute('href'),'/plan-with-friends');for(const a of list.querySelectorAll('a')){assert(a.getAttribute('href').startsWith('/'));assert(!a.hasAttribute('onclick'));}
});
for(const file of ['sl-notifications-bell.js','sl-bundle-7d.js'])test(file+' legacy bell yields to the canonical notification owner',()=>{
 const source=fs.readFileSync(path.join(root,file),'utf8'),part=file==='sl-bundle-7d.js'?source.split('/* === js/sl-notifications-bell.js === */')[1].split('/* === js/')[0]:source;
 const d=new JSDOM('<!doctype html><script src="/js/sl-social-integration-9a.js?v=fixture"></script><div class="nav-right"><button>Account</button></div>',{url:'https://scenelink.test/',runScripts:'outside-only'});try{d.window.SLApi={isLoggedIn:()=>true};d.window.eval(part);assert(!d.window.document.querySelector('.sl-bell-wrap'));assert(!d.window.document.getElementById('sl-bell-style'));}finally{d.window.close();}
});
test('social core discards old-session API payloads rather than returning private data',async t=>{
 const d=new JSDOM('',{url:'https://scenelink.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;t.after(()=>w.close());const pending=defer();w.localStorage.setItem('sl_jwt_token','FICTIONAL_A');w.AbortController=AbortController;w.fetch=()=>pending.promise;w.eval(fs.readFileSync(path.join(root,'sl-social-core.js'),'utf8'));
 const request=w.SL.social.getNotifications();w.localStorage.setItem('sl_jwt_token','FICTIONAL_B');pending.resolve(new Response(JSON.stringify({notifications:[notice('room_invitation',{actor_display_name:'A_PRIVATE'})]}),{status:200}));const result=await request;assert.equal(result.ok,false);assert.equal(result.sessionChanged,true);assert.equal(result.data,null);
});
test('social core realtime resets cached badges and rejects old-account polling completions',async t=>{
 const d=new JSDOM('',{url:'https://scenelink.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;t.after(()=>w.close());w.localStorage.setItem('sl_jwt_token','FICTIONAL_A');w.AbortController=AbortController;const calls=[];w.fetch=()=>{const p=defer();calls.push(p);return p.promise;};w.eval(fs.readFileSync(path.join(root,'sl-social-core.js'),'utf8'));const s=w.SL.social,seen=[];s.realtime.on(x=>seen.push({...x}));s.realtime.start();
 assert.equal(calls.length,2);w.localStorage.setItem('sl_jwt_token','FICTIONAL_B');s.realtime.stop();s.realtime.start();assert.equal(calls.length,4);
 for(const p of calls.slice(0,2))p.resolve(new Response('{"unread":99}',{status:200}));for(const p of calls.slice(2))p.resolve(new Response('{"unread":2}',{status:200}));await tick();assert(!seen.some(x=>x.notifications===99||x.messages===99));assert.equal(s.realtime.current().notifications,2);
});
async function planHarness(t,{query='',invite=false,guest=false,denied=false}={}){
 const d=new JSDOM('<!doctype html><main id="slConnectedPlans"></main>',{url:'https://scenelink.test/plan-with-friends'+query,runScripts:'outside-only'}),w=d.window;t.after(()=>w.close());let authed=!guest;const calls=[];
 w.SLConnected={token:()=>authed?'FICTIONAL_A':'',esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),once:(k,fn)=>fn(),request:async(p,opts={})=>{calls.push({path:p,method:opts.method||'GET'});if(p.startsWith('/rooms?'))return{rooms:invite?[]:[{id:rid,name:'Fictional plan',state:'planning'}],has_more:false};if(p==='/rooms/invitations')return{invitations:invite?[{id:rid,name:'Private invitation',owner_name:'Fictional host'}]:[]};if(p.startsWith('/friends?'))return{friends:[]};if(p==='/friends/pending')return{incoming:[],outgoing:[]};if(p==='/rooms/'+rid){if(denied)throw new Error('Plan unavailable');return{room:{id:rid,name:'Fictional detail',is_owner:true,state:'planning',members:[],options:[]}};}if(p.endsWith('/invitation')){invite=false;return{ok:true};}throw new Error('Unexpected path '+p);}};
 w.eval(fs.readFileSync(path.join(root,'sl-connected-plans.js'),'utf8'));await tick();return{w,calls,login:async()=>{authed=true;w.dispatchEvent(new w.CustomEvent('sl-auth-changed'));await tick();}};
}
test('accepted private room deep links open exact server-authorized detail',async t=>{const h=await planHarness(t,{query:'?room_id='+rid});assert(h.calls.some(x=>x.path==='/rooms/'+rid));assert.match(h.w.document.getElementById('slRoomDetail').textContent,/Fictional detail/);});
test('pending room deep link previews only invitation and joins only on explicit accept',async t=>{const h=await planHarness(t,{query:'?room_id='+rid,invite:true});assert(!h.calls.some(x=>x.path==='/rooms/'+rid));assert(!h.calls.some(x=>x.method!=='GET'));assert.match(h.w.document.getElementById('slRoomDetail').textContent,/Opening this link does not join/);h.w.document.querySelector('#slRoomDetail [data-act=accept-invite]').click();await tick();assert.equal(h.calls.filter(x=>x.method==='PUT').length,1);assert(h.calls.some(x=>x.path==='/rooms/'+rid));});
test('guest room target survives sign-in without granting membership',async t=>{const h=await planHarness(t,{query:'?room_id='+rid,guest:true});assert.equal(h.calls.length,0);await h.login();assert(h.calls.some(x=>x.path==='/rooms/'+rid));assert(!h.calls.some(x=>x.method!=='GET'));});
test('malformed and unauthorized private room links never invent plan content',async t=>{const a=await planHarness(t,{query:'?room_id=javascript%3Aalert(1)'});assert(!a.calls.some(x=>x.path==='/rooms/javascript:alert(1)'));const b=await planHarness(t,{query:'?room_id='+rid,denied:true});assert.match(b.w.document.getElementById('slRoomDetail').textContent,/Plan unavailable/);assert(!b.w.document.getElementById('slRoomDetail').textContent.includes('Fictional detail'));});

test('uppercase room UUID links normalize before matching pending invitations',async t=>{const h=await planHarness(t,{query:'?room_id='+rid.toUpperCase(),invite:true});assert(!h.calls.some(x=>x.path.startsWith('/rooms/')&&x.path!=='/rooms/invitations'));assert.match(h.w.document.getElementById('slRoomDetail').textContent,/Opening this link does not join/);});
