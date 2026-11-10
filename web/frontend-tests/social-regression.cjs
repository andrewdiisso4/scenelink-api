'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=require('path').join(__dirname,'../frontend/');
function client(file){const calls=[],storage=new Map([['sl_jwt_token','fictional-test-token']]); const c={console:{log(){}},AbortController,URLSearchParams,Promise,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{hidden:false,addEventListener(){}},CustomEvent:function(){},fetch:async(url,opts)=>{calls.push({url,...opts});return{ok:true,status:200,text:async()=>JSON.stringify({ok:true,user:{id:'fictional'},token:'fictional'}),json:async()=>({user:{id:'fictional'},token:'fictional'})}}}; c.window=c;c.addEventListener=()=>{};c.dispatchEvent=()=>{};vm.runInNewContext(fs.readFileSync(root+file,'utf8'),c);return{c,calls,storage};}
(async()=>{
 const results=[];const check=(name,fn)=>{try{fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',reason:e.message});}};
 const a=client('js/sl-api.js');await a.c.SLApi.markConversationRead('conversation','message');check('SLApi read sends canonical through_id',()=>assert.equal(JSON.parse(a.calls.at(-1).body||'{}').through_id,'message'));
 await a.c.SLApi.messages('conversation',{cursor:'cursor'});check('SLApi history sends canonical cursor',()=>assert.match(a.calls.at(-1).url,/cursor=cursor/));
 const s=client('js/sl-social-core.js');await s.c.SL.social.markConversationRead('conversation','message');check('Social read sends canonical through_id',()=>assert.equal(JSON.parse(s.calls.at(-1).body||'{}').through_id,'message'));
 await s.c.SL.social.getMessages('conversation','cursor');check('Social history sends canonical cursor',()=>assert.match(s.calls.at(-1).url,/cursor=cursor/));
 await s.c.SL.social.sendFriendRequest('friend');check('Friend request canonical user_id',()=>assert.equal(JSON.parse(s.calls.at(-1).body).user_id,'friend'));
 await s.c.SL.social.commentPost('post','hello');check('Comment canonical body',()=>assert.equal(JSON.parse(s.calls.at(-1).body).body,'hello'));
 await s.c.SL.social.createPost({body:'hello'});check('Bearer authorization attached',()=>assert.equal(s.calls.at(-1).headers.Authorization,'Bearer fictional-test-token'));
 const auth=client('js/sl-auth-core.js');await auth.c.SLAuth.signup({username:'fictional',email:'fictional@example.invalid',password:'fake-password'});check('Signup canonical path',()=>assert.equal(auth.calls.at(-1).url,'/api/auth/signup'));auth.calls.length=0;await auth.c.SLAuth.logout({reload:false});check('SLAuth logout revokes server session',()=>assert(auth.calls.some(x=>x.url==='/api/auth/logout')));
 const offline=client('js/sl-auth-core.js');offline.c.fetch=async()=>{throw new Error('offline')};const signout=await offline.c.SLAuth.logout({reload:false});check('Offline logout clears local token',()=>assert.equal(offline.storage.has('sl_jwt_token'),false));check('Offline logout does not claim revocation',()=>assert.equal(signout.revoked,false));
 for(const entry of [['js/sl-auth-core.js','SLAuth'],['js/sl-api.js','SLApi']]){
  const pending=client(entry[0]);let finish;pending.c.fetch=()=>new Promise(resolve=>finish=resolve);
  const promise=pending.c[entry[1]].logout({reload:false});
  check(entry[1]+' pending logout immediately clears token',()=>assert.equal(pending.storage.has('sl_jwt_token'),false));
  finish({ok:true,status:200,json:async()=>({revoked:true}),text:async()=>JSON.stringify({revoked:true})});const result=await promise;
  check(entry[1]+' successful logout confirms revocation',()=>assert.equal(result.revoked,true));
  const failed=client(entry[0]);failed.c.fetch=async()=>{throw Error('offline')};const failure=await failed.c[entry[1]].logout({reload:false});
  check(entry[1]+' failed logout never claims revocation',()=>assert.equal(failure.revoked,false));
  const hung=client(entry[0]);let expire;hung.c.setTimeout=fn=>{expire=fn;return 1};hung.c.fetch=()=>new Promise(()=>{});const bounded=hung.c[entry[1]].logout({reload:false});expire();const timed=await bounded;
  check(entry[1]+' hung revocation resolves honestly on timeout',()=>assert.equal(timed.revoked,false));
 }
 const staleAuth=client('js/sl-auth-core.js');let finishRefresh;
 staleAuth.c.fetch=url=>url.endsWith('/auth/me')?new Promise(resolve=>finishRefresh=resolve):Promise.resolve({ok:true,json:async()=>({revoked:true})});
 const refreshPending=staleAuth.c.SLAuth.refresh();await staleAuth.c.SLAuth.logout({reload:false});finishRefresh({ok:true,json:async()=>({user:{id:'old-account'}})});await refreshPending;
 check('Stale refresh cannot rehydrate signed-out account',()=>assert.equal(staleAuth.c.SLAuth.user(),null));
 const b=fs.readFileSync(root+'js/sl-bundle-7d.js','utf8');check('Active bundle API logout revokes server session',()=>assert(!b.includes('logout: function(){ clearToken(); return Promise.resolve(); }')));
 const html=fs.readFileSync(root+'messages.html','utf8');check('Message UI reads canonical participants',()=>assert(!html.includes('var ou = c.other_user || {};')));check('Password reset landing exists',()=>assert(fs.existsSync(root+'reset-password.html')));
 // The legacy inline message UI was retired. Interrupted/repeated flows execute in social-messages.test.cjs.
 const messages=fs.readFileSync(root+'js/sl-social-messages.js','utf8');
 check('Active message route loads consolidated module',()=>assert(html.includes('/js/sl-social-messages.js')));
 check('Retired inline message UI is absent',()=>assert(!html.includes('var CURRENT_CONV = null;')));
 const socialSource=fs.readFileSync(root+'js/sl-social-core.js','utf8');
 check('No query-token EventSource connection',()=>assert(!socialSource.includes('new EventSource(')));
 check('Message reader sends displayed watermark',()=>assert(messages.includes('body:{through_id:last.id}')));
 check('Message retry retains client id',()=>assert(messages.includes('client_id:o.id')));
 check('Message poll observes server revisions and deletion',()=>assert(messages.includes('/changes?after_seq=')));
 check('Message updates check current account generation',()=>assert(messages.includes('if(!current(gen))return;')));
 const profile=fs.readFileSync(root+'js/sl-social-profile.js','utf8'),feed=fs.readFileSync(root+'js/sl-social-feed-9a.js','utf8');
 check('Active profile settings use canonical PATCH',()=>assert(profile.includes("method:settings ? 'PATCH' : 'PUT'")));
 check('Active profile errors have visible status',()=>assert(profile.includes('slspSettingsStatus')));
 check('Active public profile respects can_message',()=>assert(profile.includes('p.can_message === true')));
 check('Active profile readback requires saved user',()=>assert(profile.includes('if (!read.user || read.user.id !== state.user.id)')));
 check('Post payload includes selected audience',()=>assert(feed.includes("audience: $('sfAudience') ? $('sfAudience').value : 'friends'")));
 const account=fs.readFileSync(root+'js/sl-account-settings.js','utf8');
 check('OAuth deletion cannot bypass password confirmation',()=>assert(!account.includes('var pwOk = isOAuth ||')));
 check('Account deletion offers password recovery without automatic email',()=>assert(account.includes("window.SLAuthUI.open('forgot')")));
 check('Account deletion requires explicit confirmed response',()=>assert(account.includes('result.deleted !== true')));
 check('Account deletion blocks duplicate requests',()=>assert(account.includes('if(deleting || confirmBtn.disabled) return;')));
 check('Account deletion supports Escape cancellation',()=>assert.match(account, /if\(e.key === 'Escape'\) \{ e.preventDefault\(\); close\(\); return; \}/));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
 console.log(JSON.stringify({date:new Date().toISOString(),scope:'VM mocked fetch only; no HTTP/server/database/account writes',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
