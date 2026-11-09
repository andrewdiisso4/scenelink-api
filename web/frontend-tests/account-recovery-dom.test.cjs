const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(path.join(__dirname,'../frontend/js/',name),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function fixture(){
 const dom=new JSDOM('<!doctype html><body><main><button id="before">Before</button></main></body>',{url:'https://fictional.invalid/profile.html',runScripts:'outside-only'});
 const w=dom.window,d=w.document; w.console.log=()=>{}; w.confirm=()=>true;
 w.fetch=()=>{throw Error('No live network permitted');};
 const calls={logout:[],delete:[],forgot:[]}; let del=deferred(),forgot=deferred();
 w.localStorage.setItem('sl_jwt_token','fictional-session-A');
 w.SLAuth={logout(opts){calls.logout.push(opts);w.localStorage.removeItem('sl_jwt_token');w.dispatchEvent(new w.Event('sl-auth-changed'));return Promise.resolve({ok:true});},forgotPassword(email){calls.forgot.push(email);return forgot.promise;}};
 w.SLApi={deleteAccount(...args){calls.delete.push(args);return del.promise;},getCurrentUser(){return {email:'<img src=x onerror=alert(1)>@example.invalid'};}};
 const load=name=>w.eval(source(name));
 const $=id=>d.getElementById(id);
 function change(token,event='sl-auth-changed'){if(token)w.localStorage.setItem('sl_jwt_token',token);else w.localStorage.removeItem('sl_jwt_token');w.dispatchEvent(event==='storage'?new w.StorageEvent('storage',{key:'sl_jwt_token'}):new w.Event(event));}
 function input(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
 function open(){ $('slAcctDeleteBtn').focus();$('slAcctDeleteBtn').click(); }
 function submitDelete(){input('slAcctConfirm','DELETE');input('slAcctPw','fictional-password');$('slAcctConfirmBtn').click();}
 function recovery(){w.SLAuthUI.open('forgot');const f=d.querySelector('[data-form="forgot"]'); f.elements.namedItem('email').value='fictional@example.invalid';return f;}
 function submit(f){f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
 return {dom,w,d,$,calls,load,change,input,open,submitDelete,recovery,submit,get del(){return del;},get forgot(){return forgot;},newForgot(){forgot=deferred();},newDelete(){del=deferred();}};
}
for(const status of [503,429,0]) test('Recovery honest retryable failure '+status,async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());f.load('sl-auth-ui.js');let form=f.recovery();f.submit(form);f.submit(form);await tick();assert.equal(f.calls.forgot.length,1);
 f.forgot.reject(Object.assign(Error('secret provider error for email'),{status}));await tick();assert.match(f.d.querySelector('[data-sl-error]').textContent,status===429?/wait a few minutes/:/could not confirm/);assert.equal(f.d.querySelector('[data-sl-success]').classList.contains('show'),false);assert.equal(form.querySelector('button').disabled,false);
 f.newForgot();f.submit(form);await tick();f.forgot.resolve({ok:true});await tick();assert.equal(f.calls.forgot.length,2);assert.match(f.d.querySelector('[data-sl-success]').textContent,/If an account exists/);
});
for(const mode of ['close','tab'])test('Recovery stale '+mode+' completion cannot reset newer request',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());f.load('sl-auth-ui.js');const form=f.recovery();f.submit(form);await tick();const old=f.forgot;
 if(mode==='close')f.w.SLAuthUI.close();else f.w.SLAuthUI.open('login');
 f.newForgot();f.recovery();f.submit(form);await tick();old.resolve({ok:true});await tick();assert.equal(form.querySelector('button').disabled,true);assert.equal(f.d.querySelector('[data-sl-success]').classList.contains('show'),false);
 f.forgot.reject(Error('offline'));await tick();assert.equal(form.querySelector('button').disabled,false);
});
test('Recovery invalid email stays local and status is accessible',t=>{const f=fixture();t.after(()=>f.dom.window.close());f.load('sl-auth-ui.js');const form=f.recovery();form.elements.namedItem('email').value='bad';f.submit(form);assert.equal(f.calls.forgot.length,0);assert.equal(f.d.querySelector('[data-sl-error]').getAttribute('role'),'alert');});
async function account(f){f.load('sl-account-settings.js');await tick();}
test('Delete trap, labels, Escape, focus and original scroll restoration',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.d.body.style.overflow='clip';f.open();assert.equal(f.d.activeElement,f.$('slAcctConfirm'));assert.equal(f.$('slAcctPw').labels.length,1);assert.equal(f.$('slAcctReason').labels.length,1);
 f.$('slAcctCancel').focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,f.$('slAcctConfirm'));
 f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,f.$('slAcctCancel'));
 f.input('slAcctPw','secret');const old=f.$('slAcctPw');f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(old.value,'');assert.equal(f.$('slAcctDelOverlay'),null);assert.equal(f.d.body.style.overflow,'clip');assert.equal(f.d.activeElement,f.$('slAcctDeleteBtn'));assert.match(f.$('sl-account-settings-style').textContent,/max-height:calc\(100dvh - 40px\)/);
 const ev=new f.w.KeyboardEvent('keydown',{key:'Tab',cancelable:true});f.d.dispatchEvent(ev);assert.equal(ev.defaultPrevented,false);
});
test('Delete pending duplicate and dismiss/reopen guard; rejection requires fresh password',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.open();assert.equal(f.$('slAcctConfirmBtn').disabled,true);f.submitDelete();f.input('slAcctPw','second');f.$('slAcctConfirmBtn').click();assert.equal(f.calls.delete.length,1);f.$('slAcctCancel').click();f.open();assert.equal(f.$('slAcctDelOverlay'),null);assert.equal(f.$('slAcctDeleteBtn').disabled,true);f.del.reject(Error('Wrong password'));await tick();assert.equal(f.$('slAcctDeleteBtn').disabled,false);
 f.newDelete();f.open();f.submitDelete();f.del.reject(Error('Wrong password'));await tick();assert.match(f.$('slAcctErr').textContent,/Wrong password/);assert.equal(f.$('slAcctConfirmBtn').disabled,true);assert.equal(f.$('slAcctPw').value,'');f.input('slAcctPw','new-password');assert.equal(f.$('slAcctConfirmBtn').disabled,false);
});
for(const result of ['success','failure'])test('Session switch owns delete '+result,async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.open();f.submitDelete();const pw=f.$('slAcctPw');f.change('fictional-session-B');assert.equal(pw.value,'');assert.equal(f.$('slAcctDelOverlay'),null);f.open();const modal=f.$('slAcctDelOverlay');if(result==='success')f.del.resolve({deleted:true});else f.del.reject(Error('Old session error'));await tick();assert.equal(f.$('slAcctDelOverlay'),modal);assert.equal(f.calls.logout.length,0);assert.equal(f.w.localStorage.getItem('sl_jwt_token'),'fictional-session-B');assert.doesNotMatch(f.d.body.textContent,/Account deleted|Old session error/);
});
test('Storage change closes and clears account UI; sign-in recreates it once',async t=>{const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.open();f.change(null,'storage');assert.equal(f.$('slAcctSettings'),null);assert.equal(f.$('slAcctDelOverlay'),null);f.change('fictional-session-B');f.w.dispatchEvent(new f.w.Event('sl-auth-ready'));assert.equal(f.d.querySelectorAll('#slAcctSettings').length,1);});
test('Fallback escapes email and closes with listener/scroll cleanup',async t=>{const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.d.body.style.overflow='auto';f.open();f.submitDelete();f.del.reject(Object.assign(Error('Unavailable'),{status:501}));await tick();assert.equal(f.d.querySelector('.sl-acct-m img'),null);assert.match(f.d.querySelector('.sl-acct-m').textContent,/<img/);assert.equal(f.d.activeElement,f.$('slAcctFallbackClose'));f.$('slAcctFallbackClose').click();assert.equal(f.$('slAcctDelOverlay'),null);assert.equal(f.d.body.style.overflow,'auto');});
test('Confirmed deletion invokes canonical logout, unconfirmed result does not',async t=>{const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.open();f.submitDelete();f.del.resolve({deleted:false});await tick();assert.equal(f.calls.logout.length,0);assert.match(f.$('slAcctErr').textContent,/not confirmed/);f.newDelete();f.input('slAcctPw','retry');f.$('slAcctConfirmBtn').click();f.del.resolve({deleted:true});await tick();assert.equal(f.calls.logout.length,1);assert.equal(f.calls.logout[0].reload,false);assert.match(f.d.body.textContent,/Account deleted/);assert.equal(f.w.localStorage.getItem('sl_jwt_token'),null);});
test('Account signout uses real canonical revoke and broadcast; delayed response cannot redirect new account',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());f.w.localStorage.removeItem('sl_jwt_token');const requests=[];const logout=deferred();f.w.fetch=(url,opts)=>{requests.push({url,opts});return logout.promise;};f.load('sl-auth-core.js');await tick();f.change('fictional-session-A');await account(f);let changes=0;f.w.addEventListener('sl-auth-changed',()=>changes++);f.$('slAcctLogout').click();assert.equal(requests.length,1);assert.match(requests[0].url,/\/auth\/logout$/);assert.equal(requests[0].opts.headers.Authorization,'Bearer fictional-session-A');assert.equal(changes,1);assert.equal(f.$('slAcctSettings'),null);f.change('fictional-session-B');logout.resolve({ok:true,json:async()=>({revoked:true})});await tick();assert.equal(f.w.localStorage.getItem('sl_jwt_token'),'fictional-session-B');assert.equal(f.w.location.pathname,'/profile.html');
});
for(const deleted of [true,false])test('Real API delete contract does not clear a newer token, deleted='+deleted,async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());f.w.localStorage.removeItem('sl_jwt_token');const response=deferred();let request;f.w.fetch=(url,opts)=>{request={url,opts};return response.promise;};f.load('sl-api.js');f.change('fictional-session-A');const promise=f.w.SLApi.deleteAccount('fictional-password','');f.change('fictional-session-B');response.resolve({ok:true,text:async()=>JSON.stringify({deleted})});if(deleted)assert.equal((await promise).deleted,true);else await assert.rejects(promise,/not confirmed/);assert.equal(request.opts.headers.Authorization,'Bearer fictional-session-A');assert.equal(f.w.localStorage.getItem('sl_jwt_token'),'fictional-session-B');assert.equal((source('sl-api.js').match(/deleteAccount: function/g)||[]).length,1);
});
test('Dismissed same-owner deletion success clears canonical session and cache and reports success',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());f.w.localStorage.removeItem('sl_jwt_token');f.w.fetch=async()=>({ok:true,json:async()=>({revoked:true})});f.load('sl-auth-core.js');await tick();f.change('fictional-session-A');f.w.localStorage.setItem('sl_user_cache',JSON.stringify({user:{id:'fictional-A'}}));await account(f);f.open();f.submitDelete();f.$('slAcctCancel').click();f.open();assert.equal(f.$('slAcctDelOverlay'),null);assert.equal(f.calls.delete.length,1);f.del.resolve({deleted:true});await tick();assert.equal(f.w.localStorage.getItem('sl_jwt_token'),null);assert.equal(f.w.localStorage.getItem('sl_user_cache'),null);assert.match(f.d.body.textContent,/Account deleted/);assert.equal(f.$('slAcctSettings'),null);
});
test('Dismissed same-owner rejection keeps session, reports failure without reopening, and allows retry',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.open();f.submitDelete();f.$('slAcctCancel').click();f.open();assert.equal(f.calls.delete.length,1);assert.equal(f.$('slAcctDelOverlay'),null);f.del.reject(Error('Wrong password'));await tick();assert.equal(f.w.localStorage.getItem('sl_jwt_token'),'fictional-session-A');assert.equal(f.calls.logout.length,0);assert.match(f.$('slAcctStatus').textContent,/not confirmed/);assert.equal(f.$('slAcctDeleteBtn').disabled,false);f.open();assert.equal(f.$('slAcctStatus').textContent,'');assert.equal(f.$('slAcctPw').value,'');
});
test('Dismissed old-owner success cannot clear a newer session or overwrite its UI',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.open();f.submitDelete();f.$('slAcctCancel').click();f.change('fictional-session-B');f.open();const modal=f.$('slAcctDelOverlay');f.del.resolve({deleted:true});await tick();assert.equal(f.w.localStorage.getItem('sl_jwt_token'),'fictional-session-B');assert.equal(f.calls.logout.length,0);assert.equal(f.$('slAcctDelOverlay'),modal);assert.doesNotMatch(f.d.body.textContent,/Account deleted/);
});
test('Observed session switch away and back invalidates a dismissed old request',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());await account(f);f.open();f.submitDelete();f.$('slAcctCancel').click();f.change('fictional-session-B');f.change('fictional-session-A');f.del.resolve({deleted:true});await tick();assert.equal(f.w.localStorage.getItem('sl_jwt_token'),'fictional-session-A');assert.equal(f.calls.logout.length,0);assert.doesNotMatch(f.d.body.textContent,/Account deleted/);
});
for(const status of [401,403])test('Old refresh '+status+' cannot clear a newer login',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());f.w.localStorage.removeItem('sl_jwt_token');const old=deferred();f.w.fetch=(url)=>url.endsWith('/auth/me')?old.promise:Promise.resolve({ok:true,json:async()=>({token:'fictional-session-B',user:{id:'fictional-B'}})});f.load('sl-auth-core.js');f.change('fictional-session-A');const refreshing=f.w.SLAuth.refresh();await f.w.SLAuth.login('b@example.invalid','fictional-password');let events=0;f.w.addEventListener('sl-auth-changed',()=>events++);old.resolve({ok:false,status,json:async()=>({error:'Expired A'})});await refreshing;assert.equal(f.w.localStorage.getItem('sl_jwt_token'),'fictional-session-B');assert.equal(JSON.parse(f.w.localStorage.getItem('sl_user_cache')).user.id,'fictional-B');assert.equal(f.w.SLAuth.user().id,'fictional-B');assert.equal(events,0);
});
for(const status of [401,403])test('Current refresh '+status+' still clears invalid session',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());f.w.localStorage.removeItem('sl_jwt_token');f.w.fetch=async()=>({ok:false,status,json:async()=>({error:'Expired'})});f.load('sl-auth-core.js');f.change('fictional-session-A');f.w.localStorage.setItem('sl_user_cache',JSON.stringify({user:{id:'fictional-A'}}));let events=0;f.w.addEventListener('sl-auth-changed',()=>events++);await f.w.SLAuth.refresh();assert.equal(f.w.localStorage.getItem('sl_jwt_token'),null);assert.equal(f.w.localStorage.getItem('sl_user_cache'),null);assert.equal(f.w.SLAuth.user(),null);assert.equal(events,1);
});
