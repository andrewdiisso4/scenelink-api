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
test('repeated exterior CTA clicks coalesce into latest unsent draft; only explicit send posts',async t=>{
 const {w,d,calls}=setup(t);w.eval(read('js/sl-perf-loader.js'));w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);
 const trigger=d.querySelector('[data-sl-concierge]'),preset=d.querySelector('.sl-phase8-prompt');trigger.focus();trigger.click();trigger.click();preset.click();
 assert.equal(d.querySelectorAll('script[src*="ai-concierge-v5.js"]').length,1);
 w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(330);
 const input=d.querySelector('.slc-input');
 assert.equal(input.value,preset.getAttribute('data-sl-concierge'));assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
 trigger.click();await tick(330);assert.equal(input.value,trigger.getAttribute('data-sl-concierge'));assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
 input.value='Edited exterior CTA draft';input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick(20);
 let writes=calls.filter(c=>c.opts.method==='POST');assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0].opts.body).message,'Edited exterior CTA draft');
 w.SLConcierge.close();trigger.focus();w.SLConcierge.open();w.SLConcierge.close();await tick(330);assert.equal(d.activeElement,trigger);
 w.SLConcierge.ask('cancel this pending prompt');w.SLConcierge.close();await tick(330);assert.equal(calls.filter(c=>c.opts.method==='POST').length,1);
});
test('Tonight preset stays an unsent draft even without the recovery bridge',async t=>{
 const {w,d,calls}=setup(t,'tonight.html');w.eval(read('js/ai-concierge-v5.js'));await tick(0);
 const preset=d.querySelector('.tv2-chip[data-sl-concierge]');preset.click();await tick(330);
 assert.equal(d.querySelector('.slc-input').value,preset.getAttribute('data-sl-concierge'));
 assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
});
test('Tonight empty-plan button loads concierge from cold and closes the drawer without posting',async t=>{
 const {w,d,calls}=setup(t,'tonight.html');w.SLVenueData={list:async()=>({venues:[],total:0,hasMore:false})};
 w.eval(read('js/sl-phase8d-recovery.js'));w.eval(read('js/tonight-v2.js'));await tick(0);
 w.TV2.openPlanDrawer();const drawer=d.querySelector('#tv2-plan-drawer');assert.equal(drawer.getAttribute('aria-hidden'),'false');
 assert.equal(w.SLConcierge,undefined);
 d.querySelector('[data-tv2-ask-draft]').click();assert.equal(drawer.getAttribute('aria-hidden'),'true');
 const script=d.querySelector('script[src*="ai-concierge-v5.js"]');assert(script);
 w.eval(read('js/ai-concierge-v5.js'));script.dispatchEvent(new w.Event('load'));await tick(330);
 assert.equal(d.querySelector('.slc-input').value,'Plan my night');
 assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
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

for (const page of ['explore.html','nightlife.html']) test(page+' wand keeps query as unsent draft before and after lazy load',async t=>{
 const {w,d,calls}=setup(t,page);w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);w.eval(read('js/sl-search-ai-bridge.js'));await tick(0);
 const search=d.querySelector('#slSearchInput');search.value='cocktails in Back Bay';d.querySelector('.sl-search-ai-label').click();
 assert.equal(d.querySelectorAll('script[src*="ai-concierge-v5.js"]').length,1);
 w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(330);
 assert.match(d.querySelector('.slc-input').value,/cocktails in Back Bay/);assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
 search.value='<img id="draft-injection">';d.querySelector('.sl-search-ai-btn').click();await tick(330);
 assert.match(d.querySelector('.slc-input').value,/<img id="draft-injection">/);assert.equal(d.querySelector('#draft-injection'),null);assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
 d.querySelector('.slc-input').value='Edited draft';d.querySelector('.slc-input').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick(20);
 assert.equal(calls.filter(c=>c.opts.method==='POST').length,1);
});
test('draft loading is identity-bound and cancels a queued send',async t=>{
 const {w,d,calls}=setup(t);w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);
 w.dispatchEvent(new w.CustomEvent('sl-concierge-draft',{detail:{prompt:'Old owner'}}));w.localStorage.setItem('sl_jwt_token','fixture');w.localStorage.setItem('sl_user_cache',JSON.stringify({id:'new-owner'}));w.dispatchEvent(new w.Event('sl-auth-changed'));
 w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(330);assert.equal(d.querySelector('.slc-input').value,'');
 w.SLConcierge.ask('queued');w.SLConcierge.draft('x'.repeat(600));await tick(330);assert.equal(d.querySelector('.slc-input').value.length,500);assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
});
test('header AI opens an unsent draft and bundle uses the same draft bridge',async t=>{
 const {w,d,calls}=setup(t);w.eval(read('js/sl-phase8d-recovery.js'));await tick(0);w.eval(read('js/sl-universal-search.js'));await tick(0);
 const ai=d.querySelector('.slus-ai');assert(ai);const input=d.querySelector('.sl-universal-search input');input.value='header query';ai.click();
 w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(330);assert.equal(d.querySelector('.slc-input').value,'header query');assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
 const section=s=>s.slice(s.indexOf('    function openConciergeWith(query) {'),s.indexOf('    function injectAIChip'));
 assert.equal(section(read('js/sl-bundle-7d-ui.js')),section(read('js/sl-search-ai-bridge.js')));
});

for (const route of ['index.html','events.html','profile.html','messages.html','business.html']) test(route+' has one independent floating Concierge entry; opening is not an AI request',async t=>{
 const {w,d,calls}=setup(t,route);
 w.eval(read('js/sl-phase8d-recovery.js')); w.eval(read('js/sl-universal-search.js')); await tick(0);
 const launcher=d.querySelector('.sl-concierge-launcher');
 assert(launcher); assert.equal(d.querySelectorAll('.sl-concierge-launcher').length,1);
 assert.equal(d.querySelectorAll('script[src*="ai-concierge-v5.js"]').length,0);
 launcher.focus(); launcher.click();
 const script=d.querySelector('script[src*="ai-concierge-v5.js"]'); assert(script);
 w.eval(read('js/ai-concierge-v5.js')); script.dispatchEvent(new w.Event('load')); await tick(340);
 assert.equal(launcher.getAttribute('aria-expanded'),'true');
 assert.equal(launcher.getAttribute('aria-controls'),'slConciergePanel');
 assert.equal(d.querySelector('.slc-input').value,'');
 assert.equal(d.querySelector('#slConciergePanel').hidden,false);
 assert.equal(calls.filter(c=>c.opts.method==='POST').length,0);
 launcher.click();
 assert.equal(d.querySelector('#slConciergePanel').hidden,true);
 assert.equal(launcher.getAttribute('aria-expanded'),'false');
 assert.equal(d.activeElement,launcher);
});

test('the floating launcher mounts when the recovery bridge runs after the header defer script',async t=>{
 const {w,d}=setup(t,'index.html');
 Object.defineProperty(d,'readyState',{value:'interactive',configurable:true});
 w.eval(read('js/sl-universal-search.js'));
 assert(d.querySelector('.slus-input'));
 assert(!d.querySelector('.sl-concierge-launcher'));
 w.eval(read('js/sl-phase8d-recovery.js'));
 d.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(d.querySelectorAll('.sl-concierge-launcher').length,1);
});


test('legacy login tokens never authenticate Concierge and a rotated canonical token clears the draft',async t=>{
 const {w,d,calls}=setup(t,'index.html','?ask=Guest%20draft');
 w.localStorage.setItem('sl_auth_token','deprecated-fixture');
 w.SLAuth={token:()=>w.localStorage.getItem('sl_jwt_token')||''};
 w.eval(read('js/sl-phase8d-recovery.js'));await tick(5);
 w.eval(read('js/ai-concierge-v5.js'));d.querySelector('script[src*="ai-concierge-v5.js"]').dispatchEvent(new w.Event('load'));await tick(20);
 const input=d.querySelector('.slc-input');
 assert.equal(input.value,'Guest draft');assert.equal(w.SLConciergeDraft.read(),'Guest draft');
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick(20);
 const post=calls.find(x=>x.opts.method==='POST');assert(post);assert(!new Headers(post.opts.headers).has('Authorization'));
 w.localStorage.setItem('sl_jwt_token','first-canonical');w.localStorage.setItem('sl_user_cache',JSON.stringify({id:'same-user'}));
 w.dispatchEvent(new w.Event('sl-auth-changed'));w.SLConcierge.draft('Do not keep across session');await tick(30);
 w.localStorage.setItem('sl_jwt_token','next-canonical');w.dispatchEvent(new w.Event('sl-auth-changed'));await tick(30);
 assert.equal(input.value,'');assert.equal(w.SLConciergeDraft.read(),null);
});