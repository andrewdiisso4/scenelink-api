'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=n=>fs.readFileSync(path.join(__dirname,'../frontend/js/',n),'utf8');
const universal=read('sl-universal-search.js'),legacy=read('sl-search-enhanced.js');
const bundle=read('sl-bundle-7d-ui.js'),mark='/* === js/sl-search-enhanced.js === */';
const bundled=bundle.split(mark)[1].split('/* === js/')[0].trim();
function harness(source,legacyFirst){
 const dom=new JSDOM('<header></header><input id="searchInput" type="search">',{url:'https://scenelink.test/'}),w=dom.window;
 Object.defineProperty(w.document,'readyState',{value:'complete'});
 const timers=new Map(),calls=[],links=[],drafts=[];let serial=0;
 const win={location:{href:''},addEventListener:w.addEventListener.bind(w),dispatchEvent:w.dispatchEvent.bind(w),__SL_PHASE8D_RECOVERY__:true};
 const response={venues:[{id:'v1',slug:'canonical-venue',name:'Venue fixture'}]};
 const fetch=async url=>{calls.push(url);return {ok:true,status:200,text:async()=>JSON.stringify(response),json:async()=>response};};
 const ctx=vm.createContext({window:win,document:w.document,localStorage:w.localStorage,fetch,Event:w.Event,CustomEvent:w.CustomEvent,AbortController:w.AbortController,URL,console,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id)});
 if(legacyFirst)vm.runInContext(source,ctx);vm.runInContext(universal,ctx);if(!legacyFirst)vm.runInContext(source,ctx);
 w.document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();links.push(a.getAttribute('href'));}});
 w.addEventListener('sl-concierge-draft',e=>drafts.push(e.detail.prompt));
 const input=w.document.querySelector('.slus-input');
 async function run(ms){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}for(let i=0;i<8;i++)await Promise.resolve();}
 return{dom,w,win,input,calls,links,drafts,run,async search(q){input.value=q;input.dispatchEvent(new w.Event('input'));await run(160);await run(220);},key(k){input.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));}};
}
test('deployed legacy bundle segment matches standalone ownership guard',()=>assert.equal(bundled,legacy.trim()));
for(const [label,source]of [['standalone',legacy],['deployed bundle segment',bundled]])for(const first of [false,true])test(label+' preserves universal ownership through initial and late scans; legacy-first='+first,async()=>{
 const h=harness(source,first);try{
  await h.run(1000);await h.run(3000);h.win.SLSearchEnhanced.init();h.win.SLSearchEnhanced.attach(h.input);
  const root=h.input.closest('.sl-universal-search');assert.equal(h.input.__slSearchAttached,undefined);assert.equal(root.querySelectorAll('.sl-search-dropdown').length,0);assert.equal(root.querySelectorAll('.slus-panel').length,1);
  assert.equal(h.w.document.getElementById('searchInput').__slSearchAttached,true,'dedicated page input remains legacy-owned');
  await h.search('venue');assert.equal(h.calls.length,1);assert.match(h.calls[0],/\/search\/universal\?/);
  h.key('ArrowDown');h.key('Enter');assert.deepEqual(h.links,['/explore.html?venue=canonical-venue']);assert.equal(h.win.location.href,'');
  await h.search('typed query');h.key('Enter');assert.equal(h.win.location.href,'/explore.html?q=typed%20query');
  await h.search('draft');h.key('ArrowDown');h.key('ArrowDown');h.key('Enter');assert.deepEqual(h.drafts,['draft']);assert.equal(h.calls.length,3);assert(!h.calls.some(x=>/concierge|venues\/search/.test(x)));
 }finally{h.dom.window.close();}
});
