'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../frontend/js/sl-universal-search.js'),'utf8');
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reply=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
async function harness(fetch){
 const dom=new JSDOM('<header></header>',{url:'https://scenelink.test/',runScripts:'outside-only'}),w=dom.window;
 w.fetch=fetch;w.eval(source);await tick(5);
 const input=w.document.querySelector('.slus-input');
 return {dom,w,input,async search(q){input.value=q;input.dispatchEvent(new w.Event('input'));await tick(180);}};
}
test('canonical universal response renders venues, authorized users, named areas and category links',async()=>{
 const calls=[],h=await harness(async(url)=>{calls.push(url);return reply({venues:[{id:'v1',slug:'test-venue',name:'Fixture Venue'}],users:[{id:'u1',username:'fixture',display_name:'Fixture Person'}],neighborhoods:[{name:'Back Bay'}],categories:[{name:'cocktail_bar'}]});});
 try{await h.search('fixture');const links=[...h.w.document.querySelectorAll('a.slus-item')];
 assert.deepEqual(links.map(a=>a.getAttribute('href')),['/explore.html?venue=test-venue','/profile.html?user=fixture','/explore.html?neighborhood=Back%20Bay','/explore.html?q=cocktail_bar']);
 assert.match(links[1].textContent,/Fixture Person/);assert.match(links[2].textContent,/Back Bay/);assert.match(links[3].textContent,/cocktail_bar/);assert.equal(calls.length,1);
 }finally{h.dom.window.close();}
});
test('empty authorized user list does not revive legacy people results',async()=>{
 const h=await harness(async()=>reply({venues:[],users:[],people:[{username:'private-fixture',display_name:'Must not render'}],categories:[],neighborhoods:[]}));
 try{await h.search('fixture');assert.doesNotMatch(h.w.document.body.textContent,/Must not render/);assert.equal(h.w.document.querySelectorAll('a[href^="/profile"]').length,0);}finally{h.dom.window.close();}
});
for(const change of ['clear','account'])test('late user results are discarded after '+change,async()=>{
 let finish;const h=await harness(()=>new Promise(r=>{finish=r;}));
 try{h.w.localStorage.setItem('sl_jwt_token','fixture-session');await h.search('fixture');
 if(change==='clear'){h.input.value='';h.input.dispatchEvent(new h.w.Event('input'));}else h.w.localStorage.removeItem('sl_jwt_token');
 finish(reply({users:[{username:'private-fixture',display_name:'Must not render'}]}));await tick(10);assert.doesNotMatch(h.w.document.body.textContent,/Must not render/);
 }finally{h.dom.window.close();}
});
test('facet names are escaped and literal query values are encoded',async()=>{
 const name='<img src=x onerror=alert(1)> & Boston';const h=await harness(async()=>reply({users:[],neighborhoods:[{name}],categories:[{name}]}));
 try{await h.search('fixture');assert.equal(h.w.document.querySelectorAll('.slus-item img').length,0);const a=h.w.document.querySelector('a.slus-item');assert.equal(a.getAttribute('href'),'/explore.html?neighborhood='+encodeURIComponent(name));assert.match(a.textContent,/<img src=x/);}finally{h.dom.window.close();}
});
test('authentication change clears already displayed user suggestions',async()=>{
 const h=await harness(async()=>reply({users:[{username:'fixture',display_name:'Visible fixture'}]}));
 try{await h.search('fixture');assert.match(h.w.document.body.textContent,/Visible fixture/);h.w.dispatchEvent(new h.w.Event('sl-auth-changed'));assert.doesNotMatch(h.w.document.body.textContent,/Visible fixture/);assert.equal(h.w.document.querySelector('.sl-universal-search').classList.contains('open'),false);}finally{h.dom.window.close();}
});
test('keyboard click on suggestion chip runs search; tabbing into results keeps them open',async()=>{
 const h=await harness(async()=>reply({}));try{h.input.focus();const chip=h.w.document.querySelector('[data-slus-chip]');chip.focus();await tick(150);assert(h.w.document.querySelector('.sl-universal-search').classList.contains('open'));chip.click();assert.equal(h.input.value,chip.getAttribute('data-slus-chip'));}finally{h.w.close();}
});
test('ArrowDown and Enter reach Ask AI as an unsent draft with no provider request',async()=>{
 const calls=[],h=await harness(async url=>{calls.push(url);return reply({});});try{const drafts=[];h.w.__SL_PHASE8D_RECOVERY__=true;h.w.addEventListener('sl-concierge-draft',e=>drafts.push(e.detail.prompt));await h.search('quiet dinner');h.input.focus();h.input.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));h.input.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.deepEqual(drafts,['quiet dinner']);assert(calls.every(u=>u.startsWith('/api/search/universal')));}finally{h.w.close();}
});
test('pointer activation opens one draft, not both mousedown and click',async()=>{
 const h=await harness(async()=>reply({}));try{const drafts=[];h.w.__SL_PHASE8D_RECOVERY__=true;h.w.addEventListener('sl-concierge-draft',e=>drafts.push(e.detail.prompt));await h.search('rooftop');const ask=h.w.document.querySelector('[data-slus-ask-ai]');ask.dispatchEvent(new h.w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));ask.click();assert.deepEqual(drafts,['rooftop']);}finally{h.w.close();}
});
test('focus leaving search, Escape from a result, and outside click dismiss dropdown',async()=>{
 const h=await harness(async()=>reply({}));try{const root=h.w.document.querySelector('.sl-universal-search'),outside=h.w.document.createElement('button');h.w.document.body.appendChild(outside);h.input.focus();let chip=root.querySelector('[data-slus-chip]');chip.focus();await tick(5);assert(root.classList.contains('open'));h.input.focus();await tick(5);assert(root.classList.contains('open'));chip=root.querySelector('[data-slus-chip]');chip.focus();chip.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.w.document.activeElement,h.input);assert(!root.classList.contains('open'));h.input.blur();h.input.focus();outside.focus();await tick(5);assert(!root.classList.contains('open'));h.input.focus();outside.click();assert(!root.classList.contains('open'));}finally{h.w.close();}
});
test('combobox announces selected result, scrolls it into view, and clears selection on dismissal',async()=>{
 const h=await harness(async()=>reply({venues:[{id:'v',name:'Venue'}]}));try{const w=h.w,root=w.document.querySelector('.sl-universal-search');h.input.focus();assert.equal(h.input.getAttribute('role'),'combobox');assert.equal(h.input.getAttribute('aria-expanded'),'true');assert.equal(w.document.getElementById(h.input.getAttribute('aria-controls')).getAttribute('role'),'listbox');assert(root.querySelectorAll('[role=option]').length>0);await h.search('venue');let scrolled=[];for(const e of root.querySelectorAll('[role=option]'))e.scrollIntoView=opts=>scrolled.push({id:e.id,opts});for(let i=0;i<2;i++)h.input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));const id=h.input.getAttribute('aria-activedescendant'),selected=w.document.getElementById(id);assert(selected.hasAttribute('data-slus-ask-ai'));assert.equal(selected.getAttribute('aria-selected'),'true');assert.equal(root.querySelectorAll('[aria-selected=true]').length,1);assert.equal(scrolled.at(-1).id,id);assert.equal(scrolled.at(-1).opts.block,'nearest');h.input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.input.getAttribute('aria-expanded'),'false');assert(!h.input.hasAttribute('aria-activedescendant'));assert.equal(root.querySelectorAll('[aria-selected=true]').length,0);
 }finally{h.w.close();}
});
test('changing query and auth session clears stale active-descendant state',async()=>{const h=await harness(async()=>reply({}));try{await h.search('a');h.input.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert(h.input.hasAttribute('aria-activedescendant'));h.input.value='b';h.input.dispatchEvent(new h.w.Event('input'));assert(!h.input.hasAttribute('aria-activedescendant'));h.w.dispatchEvent(new h.w.Event('sl-auth-changed'));assert.equal(h.input.getAttribute('aria-expanded'),'false');assert(!h.input.hasAttribute('aria-activedescendant'));}finally{h.w.close();}});


test('failed venue and avatar thumbnails become escaped text without retrying image loads',async()=>{
 const calls=[],h=await harness(async url=>{calls.push(url);return reply({venues:[{id:'v',name:'Pizza',thumbnail_url:'/missing.jpg'}],users:[{id:'u',username:'friend',display_name:'<img Friend',avatar_url:'/missing-avatar.jpg'}]});});
 try{await h.search('fixture');const thumbs=[...h.w.document.querySelectorAll('[data-slus-fallback]')],images=thumbs.map(t=>t.querySelector('img'));assert.equal(images.length,2);
 images.forEach(img=>img.dispatchEvent(new h.w.Event('error')));
 assert.equal(thumbs[0].textContent,'⌖');assert.equal(thumbs[1].textContent,'<F');assert.equal(thumbs[1].children.length,0);assert.equal(h.w.document.querySelectorAll('.slus-thumb img').length,0);
 images.forEach(img=>img.dispatchEvent(new h.w.Event('error')));assert.equal(calls.length,1);assert.equal(thumbs[0].textContent,'⌖');assert(thumbs.every(t=>t.getAttribute('aria-hidden')==='true'));assert(!h.w.document.querySelector('[onerror]'));
 }finally{h.w.close();}
});
test('missing venue photos and avatars use non-image fallbacks immediately',async()=>{
 const h=await harness(async()=>reply({venues:[{id:'v',name:'Pizza'}],users:[{id:'u',username:'friend',display_name:'Ada Friend'}]}));
 try{await h.search('fixture');const thumbs=[...h.w.document.querySelectorAll('[data-slus-fallback]')];assert.deepEqual(thumbs.map(t=>t.textContent),['⌖','AF']);assert.equal(h.w.document.querySelectorAll('.slus-thumb img').length,0);}finally{h.w.close();}
});
test('placeholder URL failure is terminal, without loading another placeholder',async()=>{
 const h=await harness(async()=>reply({venues:[{id:'v',name:'Pizza',thumbnail_url:'/images/placeholder.svg'}]}));
 try{await h.search('fixture');const image=h.w.document.querySelector('.slus-thumb img'),thumb=image.parentElement;image.dispatchEvent(new h.w.Event('error'));assert.equal(thumb.textContent,'⌖');assert.equal(thumb.querySelector('img'),null);}finally{h.w.close();}
});
test('suggestion title and subtitle are separate block lines with a shrinking text track',async()=>{
 const h=await harness(async()=>reply({venues:[{id:'v',name:'Long venue name',cuisine:'pizza',neighborhood:'Cambridge'}],users:[{id:'u',username:'friend',display_name:'Ada Friend'}],neighborhoods:[{name:'North End'}],categories:[{name:'cafe'}]}));
 try{const style=h.w.document.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../frontend/css/sl-universal-search.css'),'utf8');h.w.document.head.appendChild(style);await h.search('fixture');const copies=[...h.w.document.querySelectorAll('.slus-copy')];assert.equal(copies.length,5);for(const copy of copies){assert.equal(h.w.getComputedStyle(copy).minWidth,'0');for(const el of copy.children)assert.equal(h.w.getComputedStyle(el).display,'block');assert.match(copy.textContent,/\S\s+\S/);}assert.match(copies[0].textContent,/Long venue name pizza/);
 }finally{h.w.close();}
});
