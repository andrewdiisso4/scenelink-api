'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');const root=path.resolve(__dirname,'../frontend');const read=f=>fs.readFileSync(path.join(root,f),'utf8');const tick=ms=>new Promise(r=>setTimeout(r,ms));
function setup(t,page='index.html',query=''){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read(page),{virtualConsole:vc,url:'https://scenelink.test/'+page+query,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,calls=[],observers=[];const Observer=w.MutationObserver;w.MutationObserver=class extends Observer {constructor(fn){super(fn);observers.push(this);}};
 t.after(()=>{observers.forEach(o=>o.disconnect());assert.deepEqual(errors,[]);w.close();});
 w.fetch=async(url,opts={})=>{assert(String(url).startsWith('/api/'));calls.push({url,opts});return new Response(JSON.stringify(url.endsWith('/suggestions')?{suggestions:[]}:{ok:true,response:'Fixture response',venues:[],events:[]}));};
 return {w,d:w.document,calls};
}
for(const page of ['index.html','explore.html','nightlife.html','tonight.html','events.html','social-feed.html','my-lists.html','plan-with-friends.html','profile.html','messages.html'])test(page+' deep-link draft loads once without posting',async t=>{
 const {w,d,calls}=setup(t,page,'?keep=yes&ask='+encodeURIComponent('<img id="injected">')+'#section');
 w.eval(read('js/sl-perf-loader.js'));w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);
 const scripts=d.querySelectorAll('script[src*="ai-concierge-v5.js"]');assert.equal(scripts.length,1);
 w.eval(read('js/ai-concierge-v5.js'));scripts[0].dispatchEvent(new w.Event('load'));await tick(20);
 assert(d.querySelector('.sl-concierge-panel').classList.contains('slc-panel-visible'));
 assert.equal(d.querySelector('.slc-input').value,'<img id="injected">');assert.equal(d.querySelector('#injected'),null);
 assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);assert.equal(w.location.search,'?keep=yes');assert.equal(w.location.hash,'#section');
 assert.equal(d.querySelector('.sl-concierge-panel[role="dialog"]').getAttribute('aria-label'),'SceneLink Concierge');
});
test('repeated loading clicks coalesce; loaded click sends once and close cancels delayed focus',async t=>{
 const {w,d,calls}=setup(t);w.eval(read('js/sl-perf-loader.js'));w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);
 const trigger=d.querySelector('[data-sl-concierge]');trigger.focus();trigger.click();trigger.click();
 assert.equal(d.querySelectorAll('script[src*="ai-concierge-v5.js"]').length,1);
 w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(330);
 assert.equal(calls.filter(c=>c.opts.method==='POST').length,1);
 trigger.click();await tick(330);assert.equal(calls.filter(c=>c.opts.method==='POST').length,2);
 w.SLConcierge.close();trigger.focus();w.SLConcierge.open();w.SLConcierge.close();await tick(330);assert.equal(d.activeElement,trigger);
 w.SLConcierge.ask('cancel this pending prompt');w.SLConcierge.close();await tick(330);assert.equal(calls.filter(c=>c.opts.method==='POST').length,2);
});
test('script failure exposes retry and retry loads one new script',async t=>{
 const {w,d}=setup(t);w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);const trigger=d.querySelector('[data-sl-concierge]');trigger.click();
 d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('error'));await tick(0);
 assert.match(d.querySelector('#slConciergeLoadStatus').textContent,/try again/);trigger.click();assert.equal(d.querySelectorAll('script[src*="ai-concierge-v5.js"]').length,1);
 assert.equal(d.querySelector('#slConciergeLoadStatus'),null);
});
test('service-worker-style reload restores unsent draft without URL or POST; Close clears recovery',async t=>{
 const first=setup(t,'index.html','?ask=Draft%20through%20reload');first.w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);first.w.eval(read('js/ai-concierge-v5.js'));first.d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new first.w.Event('load'));await tick(0);
 const stored=first.w.sessionStorage.getItem('sl_concierge_pending_draft');assert(stored);assert.equal(first.w.location.search,'');
 const second=setup(t);second.w.sessionStorage.setItem('sl_concierge_pending_draft',stored);second.w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);assert(second.d.querySelector('script[src*="ai-concierge-v5.js"]'));
 second.w.eval(read('js/ai-concierge-v5.js'));second.d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new second.w.Event('load'));await tick(0);
 assert.equal(second.d.querySelector('.slc-input').value,'Draft through reload');assert.equal(second.calls.filter(c=>c.opts.method==='POST').length,0);second.w.SLConcierge.close();assert.equal(second.w.sessionStorage.getItem('sl_concierge_pending_draft'),null);
});
for(const change of ['expired','other-page','auth'])test('draft recovery clears '+change,async t=>{
 const {w}=setup(t);w.sessionStorage.setItem('sl_concierge_pending_draft',JSON.stringify({owner:'guest',path:change==='other-page'?'/profile.html':'/index.html',text:'private draft',at:Date.now()-(change==='expired'?300001:0)}));w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);if(change==='auth'){w.localStorage.setItem('sl_jwt_token','test-only');w.localStorage.setItem('sl_user_cache',JSON.stringify({id:'other-user'}));w.dispatchEvent(new w.Event('sl-auth-changed'));}assert.equal(w.sessionStorage.getItem('sl_concierge_pending_draft'),null);
});
test('canonical auth refresh preserves same owner draft; identity transition clears visible draft and queued send',async t=>{
 const {w,d,calls}=setup(t,'index.html','?ask=private%20draft');w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(0);
 w.dispatchEvent(new w.Event('sl-auth-changed'));assert.equal(d.querySelector('.slc-input').value,'private draft');assert(w.sessionStorage.getItem('sl_concierge_pending_draft'));
 w.SLConcierge.ask('must not send');w.localStorage.setItem('sl_jwt_token','test-only');w.localStorage.setItem('sl_user_cache',JSON.stringify({user:{id:'other-user'}}));w.dispatchEvent(new w.Event('sl-auth-changed'));await tick(330);
 assert.equal(d.querySelector('.slc-input').value,'');assert.equal(d.querySelector('#slcMessages').textContent,'');assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);assert.equal(w.sessionStorage.getItem('sl_concierge_pending_draft'),null);
});
test('identity transition while script loads discards pending prompt',async t=>{
 const {w,d,calls}=setup(t);w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);d.querySelector('[data-sl-concierge]').click();w.localStorage.setItem('sl_jwt_token','test-only');w.localStorage.setItem('sl_user_cache',JSON.stringify({id:'other-user'}));w.dispatchEvent(new w.Event('sl-auth-changed'));w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(330);assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
});

test('identity change while URL draft loads invalidates original URL before widget reads it',async t=>{
 const {w,d,calls}=setup(t,'index.html','?keep=yes&ask=old%20owner#section');w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);w.localStorage.setItem('sl_jwt_token','test-only');w.localStorage.setItem('sl_user_cache',JSON.stringify({id:'other-user'}));w.dispatchEvent(new w.Event('sl-auth-changed'));assert.equal(w.location.search,'?keep=yes');assert.equal(w.location.hash,'#section');w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(330);assert.equal(d.querySelector('.slc-input').value,'');assert.equal(w.sessionStorage.getItem('sl_concierge_pending_draft'),null);assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
});
