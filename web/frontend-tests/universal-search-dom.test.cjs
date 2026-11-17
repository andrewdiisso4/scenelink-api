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
