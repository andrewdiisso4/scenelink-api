'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,20)),code=fs.readFileSync(path.resolve(__dirname,'../frontend/js/sl-social-feed-9a.js'),'utf8');
async function make(t,{send,comments}={}){
 const d=new JSDOM('<main id="socialLanding"></main><main id="socialFeed"><div class="sf-create"><input id="sfCreateInput"><button id="sfPostBtn">Post</button></div><div id="sfFeedContent"></div></main>',{url:'https://scenelink.test/social-feed',runScripts:'outside-only'}),w=d.window,calls=[];t.after(()=>w.close());w.localStorage.setItem('sl_jwt_token','fixture-session');
 let reads=0;const defaults={
  isLoggedIn:()=>!!w.localStorage.getItem('sl_jwt_token'),
  getMe:async()=>({ok:true,data:{user:{id:'owner',display_name:'Owner'}}}),
  getFeed:async()=>({ok:true,data:{items:[{id:'post',kind:'post',user_id:'peer',display_name:'Peer',body:'Fixture post',created_at:'2026-11-18T00:00:00Z'}]}}),
  createPost:async payload=>({ok:true,data:{post:{id:payload.client_id}}}),
  getComments:async()=>{reads++;return comments?comments(reads):{ok:true,data:{comments:[]}};},
  commentPost:async(id,body)=>{calls.push({id,body});return send?send(calls.length):{ok:true,data:{comment:{id:'comment'}}};}
 };
 w.SL={social:new Proxy(defaults,{get:(o,k)=>k in o?o[k]:k==='realtime'?null:async()=>({ok:true,data:{}})})};w.eval(code);await tick();
 const click=s=>w.document.querySelector(s).click();click('.sf-comment-toggle');await tick();
 return{w,calls,click,reads:()=>reads,input:()=>w.document.querySelector('.sf-comment-input'),status:()=>w.document.querySelector('.sf-comment-status').textContent,enter:()=>w.document.querySelector('.sf-comment-input').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))};
}
test('closing and reopening comments retains unsent draft without another read',async t=>{
 const m=await make(t);const input=m.input();input.value='Keep my draft';m.click('.sf-comment-toggle');m.click('.sf-comment-toggle');await tick();
 assert.equal(m.input(),input);assert.equal(m.input().value,'Keep my draft');assert.equal(m.reads(),1);
});
test('repeated Enter submits once and preserves newer text across successful refresh',async t=>{
 let releaseSend,releaseRead;const m=await make(t,{send:()=>new Promise(r=>releaseSend=r),comments:n=>n===1?{ok:true,data:{comments:[]}}:new Promise(r=>releaseRead=r)});
 m.input().value='First comment';m.enter();m.enter();m.click('.sf-comment-submit');await tick();assert.equal(m.calls.length,1);
 m.input().value='Next draft';m.click('.sf-comment-toggle');m.click('.sf-comment-toggle');releaseSend({ok:true,data:{comment:{id:'saved'}}});await tick();
 assert.equal(m.input().value,'Next draft');m.enter();assert.equal(m.calls.length,1,'refresh still in progress');
 releaseRead({ok:true,data:{comments:[{id:'saved',body:'First comment',display_name:'Owner'}]}});await tick();
 assert.equal(m.input().value,'Next draft');assert.match(m.w.document.querySelector('.sf-comment-list').textContent,/First comment/);assert.equal(m.w.document.querySelector('.sf-comment-submit').disabled,false);
});
test('unchanged submitted text clears only after save confirmation',async t=>{
 let release;const m=await make(t,{send:()=>new Promise(r=>release=r)});m.input().value='Original';m.enter();await tick();assert.equal(m.input().value,'Original');release({ok:true,data:{comment:{id:'saved'}}});await tick();assert.equal(m.input().value,'');assert.equal(m.status(),'Comment saved.');
});
test('failed comment save retains draft and permits explicit retry',async t=>{
 const m=await make(t,{send:n=>n===1?{ok:false,error:'Unavailable'}:{ok:true,data:{comment:{id:'saved'}}}});
 m.input().value='Retry text';m.enter();await tick();assert.equal(m.input().value,'Retry text');assert.match(m.status(),/draft is unchanged/);assert.equal(m.w.document.querySelector('.sf-comment-submit').disabled,false);
 m.enter();await tick();assert.equal(m.calls.length,2);assert.equal(m.calls[1].body,'Retry text');assert.equal(m.input().value,'');
});
test('saved comment with failed refresh preserves new draft and does not invent an empty list',async t=>{
 let release;const m=await make(t,{send:()=>new Promise(r=>release=r),comments:n=>n===1?{ok:true,data:{comments:[{body:'Existing comment',display_name:'Peer'}]}}:{ok:false,error:'Unavailable'}});
 m.input().value='Submitted';m.enter();await tick();m.input().value='New draft';release({ok:true,data:{comment:{id:'saved'}}});await tick();
 assert.equal(m.input().value,'New draft');assert.match(m.status(),/could not be refreshed/);assert.match(m.w.document.querySelector('.sf-comment-list').textContent,/Existing comment/);
});
test('late comment completion after logout cannot restore private comments or draft',async t=>{
 let release;const m=await make(t,{send:()=>new Promise(r=>release=r)});m.input().value='Private comment';m.enter();await tick();
 m.w.localStorage.removeItem('sl_jwt_token');m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));release({ok:true,data:{comment:{id:'saved'}}});await tick();
 assert.equal(m.w.document.querySelector('#socialFeed').style.display,'none');assert(!m.w.document.body.textContent.includes('Private comment'));assert.equal(m.reads(),1);
});
test('post-level lock survives feed rerender and old completion does not erase replacement draft',async t=>{
 let release;const m=await make(t,{send:()=>new Promise(r=>release=r),comments:n=>({ok:true,data:{comments:n>=3?[{body:'Confirmed after rerender',display_name:'Owner'}]:[]}})});
 m.input().value='Pending comment';m.enter();await tick();
 m.w.document.querySelector('#sfCreateInput').value='New top-level post';m.click('#sfPostBtn');await tick();m.click('.sf-comment-toggle');await tick();
 const replacement=m.input();replacement.value='Replacement draft';assert.equal(m.w.document.querySelector('.sf-comment-submit').disabled,true);
 m.enter();await tick();assert.equal(m.calls.length,1);
 release({ok:true,data:{comment:{id:'saved'}}});await tick();
 assert.equal(m.input(),replacement);assert.equal(m.input().value,'Replacement draft');assert.equal(m.w.document.querySelector('.sf-comment-submit').disabled,false);assert.match(m.w.document.querySelector('.sf-comment-list').textContent,/Confirmed after rerender/);assert.equal(m.reads(),3);
});
test('malformed post-save comment response retains previous list and current draft',async t=>{
 let release;const m=await make(t,{send:()=>new Promise(r=>release=r),comments:n=>n===1?{ok:true,data:{comments:[{body:'Prior comment',display_name:'Peer'}]}}:{ok:true,data:{ok:true}}});
 m.input().value='Sent';m.enter();await tick();m.input().value='Preserved';release({ok:true,data:{comment:{id:'saved'}}});await tick();
 assert.equal(m.input().value,'Preserved');assert.match(m.status(),/could not be refreshed/);assert.match(m.w.document.querySelector('.sf-comment-list').textContent,/Prior comment/);
});
test('reopening while initial comments load cannot start a competing stale read',async t=>{
 let release;const m=await make(t,{comments:()=>new Promise(r=>release=r)});
 m.click('.sf-comment-toggle');m.click('.sf-comment-toggle');await tick();assert.equal(m.reads(),1);
 release({ok:true,data:{comments:[]}});await tick();m.input().value='New draft';assert.equal(m.reads(),1);
});
