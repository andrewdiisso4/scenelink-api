'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'../frontend');
const source=name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,150));
function setup(){
 const d=new JSDOM('<!doctype html><html><head></head><body><button id="origin">Open</button></body></html>',{url:'https://scenelink.test/explore.html?venue=fictional-qa-cafe',runScripts:'outside-only'}),w=d.window;
 w.fetch=async url=>({ok:true,status:200,json:async()=>url.includes('reviews')?{reviews:[]}:{id:'fictional-qa-cafe',name:'QA Cafe',booking:{status:'not_available'}}});
 for(const name of ['sl-connected-api','sl-auth-ui','sl-onboarding','sl-venue-detail'])w.eval(source(name));
 return d;
}
test('all brand image references resolve with exact filesystem case',()=>{
 let checked=0;
 function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else if(/\.(html|css|js)$/.test(p)){for(const m of fs.readFileSync(p,'utf8').matchAll(/(?:images\/)((?:brand\/)?scenelink[\w-]+\.(?:png|jpg|webp))/gi)){checked++;assert(fs.existsSync(path.join(root,'images',m[1])),p+': '+m[1]);}}}}
 walk(root);assert(checked>25);
});
test('first-visit deep link suppresses onboarding and guest save returns focus to selected venue',async()=>{
 const d=setup(),w=d.window;
 try{await tick();const save=w.document.querySelector('[data-save-venue]');assert(save);save.focus();save.click();await tick();assert(w.document.querySelector('.sl-auth-overlay.open'));w.SLOnboarding.start();assert.equal(w.document.getElementById('sl-ob-overlay'),null);
 w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();assert(!w.document.querySelector('.sl-auth-overlay.open'));assert.equal(w.document.activeElement,save);assert(w.document.querySelector('.sl-vd-overlay.sl-open'));assert.equal(w.location.search,'?venue=fictional-qa-cafe');assert.equal(w.document.body.style.overflow,'hidden');assert.equal(w.localStorage.getItem('sl_onboarded'),null);
 }finally{w.close();}
});
test('explicit auth removes already mounted onboarding and delayed focus cannot steal focus after close',async()=>{
 const d=new JSDOM('<html><head></head><body><button id="origin">Login</button></body></html>',{url:'https://scenelink.test/',runScripts:'outside-only'}),w=d.window;
 try{w.eval(source('sl-auth-ui'));w.eval(source('sl-onboarding'));w.SLOnboarding.start();assert(w.document.getElementById('sl-ob-overlay'));const origin=w.document.getElementById('origin');origin.focus();w.SLAuthUI.open('login');assert.equal(w.document.getElementById('sl-ob-overlay'),null);w.SLAuthUI.close();await tick();assert.equal(w.document.activeElement,origin);w.SLOnboarding.start();assert.equal(w.document.getElementById('sl-ob-overlay'),null);assert.equal(w.document.body.style.overflow,'');}finally{w.close();}
});

test('profile edit interaction suppresses automatic welcome without changing onboarding preferences',async()=>{
 const d=new JSDOM('<html><head></head><body><button id="edit">Edit profile</button><input id="bio"></body></html>',{url:'https://scenelink.test/profile',runScripts:'outside-only'}),w=d.window;
 try{w.eval(source('sl-onboarding'));w.document.getElementById('edit').onclick=()=>w.document.getElementById('bio').focus();w.document.getElementById('edit').click();w.SLOnboarding.start();assert.equal(w.document.getElementById('sl-ob-overlay'),null);assert.equal(w.document.activeElement.id,'bio');assert.equal(w.localStorage.getItem('sl_onboarded'),null);}finally{w.close();}
});
test('shared desktop header separates links from search/account and preserves narrow-screen drawer',()=>{
 const css=fs.readFileSync(path.join(root,'css/sl-phase8f-polish.css'),'utf8');
 const block=css.slice(css.indexOf('/* Keep authenticated controls reachable'));
 assert(block.includes('@media (min-width: 901px)'));
 assert(block.includes('grid-template-areas: "brand search account" "links links links"'));
 assert(block.includes('grid-template-columns: auto minmax(0, 1fr) auto'));
 assert(block.includes('height: auto !important'));
 assert(block.includes('flex-wrap: wrap !important'));
 for(const file of ['profile.html','messages.html','social-feed.html','my-lists.html'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('css/sl-phase8f-polish.css'));
});
test('UI hotfix uses a new asset/cache version and its build helper cannot restore the stale version',()=>{
 const tag='connected-20261110-2';
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert(sw.includes("const VERSION = 'sl-"+tag+"'"));
 assert(sw.includes('c.match(req)')); // Query-string version remains part of the cache key.
 assert(!sw.includes('ignoreSearch: true'));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).sw_version,'sl-'+tag);
 assert(fs.readFileSync(path.join(root,'js/sl-version-marker.js'),'utf8').includes("deploy: '"+tag+"'"));
 assert(fs.readFileSync(path.resolve(root,'../frontend-tools/finalize.py'),'utf8').includes("tag='"+tag+"'"));
 for(const file of ['profile.html','plan-with-friends.html','messages.html','events.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert(html.includes('css/sl-phase8f-polish.css?v='+tag));
  assert(!html.includes('connected-20261108-1'));
 }
});
test('mobile shared header reserves search row and retains account/notification access',()=>{
 const css=fs.readFileSync(path.join(root,'css/sl-phase8f-polish.css'),'utf8');
 const d=new JSDOM('<style>'+css+'</style>');
 try{const rules=d.window.document.styleSheets[0].cssRules,mobile=[...rules].find(r=>r.conditionText==='(max-width: 900px)' && [...r.cssRules].some(c=>c.selectorText==='body:has(.header-enhanced)'));assert.equal(mobile.conditionText,'(max-width: 900px)');const rule=sel=>[...mobile.cssRules].find(r=>r.selectorText===sel).style;
 assert.equal(rule('.header-enhanced .nav-enhanced').getPropertyValue('grid-template-areas'),'"brand account menu" "search search search"');
 assert.equal(rule('.header-enhanced').position,'relative');
 assert.equal(rule('.header-enhanced .nav-enhanced').height,'auto');
 assert.equal(rule('.header-enhanced .nav-enhanced > .sl-universal-search').getPropertyValue('grid-area'),'search');
 assert.equal(rule('.header-enhanced .nav-right:has(#sl-user-dropdown) #slHdrSocial > a').display,'none');
 assert.equal(rule('.header-enhanced #slHdrSocial > button').width,'44px');
 }finally{d.window.close();}
});
test('mobile drawer clears fixed-header offset and stacks above page backdrop',()=>{
 const css=fs.readFileSync(path.join(root,'css/sl-phase8f-polish.css'),'utf8'),d=new JSDOM('<style>'+css+'</style>');
 try{const rules=d.window.document.styleSheets[0].cssRules,mobile=[...rules].find(r=>r.conditionText==='(max-width: 900px)' && [...r.cssRules].some(c=>c.selectorText==='body:has(.header-enhanced)')),rule=sel=>[...mobile.cssRules].find(r=>r.selectorText===sel).style;
 assert.equal(rule('body:has(.header-enhanced)').getPropertyValue('padding-top'),'0');
 assert.equal(rule('.header-enhanced').getPropertyValue('backdrop-filter'),'none');
 assert.equal(rule('body.menu-open .header-enhanced').getPropertyValue('z-index'),'9050');
 assert.equal(rule('body.menu-open .header-enhanced .nav-center').visibility,'visible');
 assert.equal(rule('.header-enhanced .nav-center').visibility,'hidden');
 }finally{d.window.close();}
});
test('mobile menu moves focus into navigation and Escape restores hamburger',async()=>{
 const d=new JSDOM('<header id="mainHeader" class="header-enhanced"><nav><ul class="nav-center"><li><a href="/explore">Explore</a></li></ul><button id="mobileMenuBtn" class="mobile-menu-btn">Menu</button></nav></header>',{url:'https://scenelink.test/',runScripts:'outside-only'}),w=d.window;
 try{w.eval(source('sl-nav-controller'));await tick();const button=w.document.getElementById('mobileMenuBtn');button.click();assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(w.document.activeElement.textContent,'Explore');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(w.document.activeElement,button);}finally{w.close();}
});
test('discovery filters cover mobile tabs and submitting cuisine preserves route',async()=>{
 const html=fs.readFileSync(path.join(root,'explore.html'),'utf8'),css=fs.readFileSync(path.join(root,'css/sl-recovery-layout.css'),'utf8');
 assert(html.includes('sl-recovery-layout.css'));
 assert(css.includes('z-index: 100100'));
 assert(css.includes('max-height: calc(100dvh - 24px)'));
 assert(css.includes('body:has(#slFilterOverlay.active) #slBottomTabs'));
 const d=new JSDOM(html,{url:'https://scenelink.test/explore?view=list',runScripts:'outside-only'}),w=d.window;let applied;
 try{w.eval(source('sl-discovery-filters'));w.SLDiscoveryFilters.mount({read:()=>({}),apply:v=>applied=v});const trigger=w.document.getElementById('slFilterBtn');trigger.focus();trigger.click();assert.equal(w.document.body.style.overflow,'hidden');w.document.querySelector('[name=cuisine]').value='Thai';w.document.getElementById('slFilterApply').click();assert.equal(applied.cuisine,'Thai');assert.equal(w.location.pathname+w.location.search,'/explore?view=list');assert(!w.document.getElementById('slFilterOverlay').classList.contains('active'));assert.equal(w.document.activeElement,trigger);assert.equal(w.document.body.style.overflow,'');}finally{w.close();}
});
