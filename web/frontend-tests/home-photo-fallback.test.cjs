'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../frontend/js/sl-phase8-completion.js'),'utf8');
async function setup(venues){
 const dom=new JSDOM('<div id="phase8TonightGrid"></div>',{url:'https://scenelink.test/',runScripts:'outside-only'});
 dom.window.SLVenueData={list:async()=>({venues})};
 dom.window.eval(source);
 await new Promise(r=>setTimeout(r,15));
 return dom;
}
test('home photos retain real URL then fail once to honest local fallback',async()=>{
 const dom=await setup([{id:'1',name:'3 Little Figs',thumbnail_url:'/api/photo?name=fixture'}]);
 try{
 const w=dom.window,img=w.document.querySelector('img');
 assert.equal(img.getAttribute('src'),'/api/photo?name=fixture');
 img.dispatchEvent(new w.Event('error'));
 assert.equal(img.getAttribute('src'),'/assets/img/placeholder-venue.svg');
 assert.equal(img.alt,'Venue photo unavailable');
 img.dispatchEvent(new w.Event('error'));
 assert.equal(img.hidden,true);
 img.dispatchEvent(new w.Event('error'));
 assert.equal(img.parentElement.querySelectorAll('span').length,1);
 assert.match(img.parentElement.textContent,/Venue photo unavailable/);
 assert.match(img.parentElement.getAttribute('aria-label'),/3 Little Figs/);
 }finally{dom.window.close();}
});
test('missing photos never claim fallback is a real venue photo',async()=>{
 const dom=await setup([{id:'2',name:'360 Cafe',thumbnail_url:null}]);
 try{const img=dom.window.document.querySelector('img');assert.equal(img.alt,'Venue photo unavailable');assert.equal(img.getAttribute('src'),'/assets/img/placeholder-venue.svg');}
 finally{dom.window.close();}
});
test('photo failures are scoped to venue images and work on replacement cards',async()=>{
 const dom=await setup([{id:'1',name:'A',thumbnail_url:'https://fixture.invalid/photo.jpg'}]);
 try{
 const w=dom.window,grid=w.document.querySelector('#phase8TonightGrid');
 grid.innerHTML='<img id="other" src="/avatar.png"><a class="sl-phase8-venue-image"><img id="replacement" src="/missing.jpg"></a>';
 const other=w.document.querySelector('#other'),replacement=w.document.querySelector('#replacement');
 other.dispatchEvent(new w.Event('error'));assert.equal(other.getAttribute('src'),'/avatar.png');
 replacement.dispatchEvent(new w.Event('error'));assert.equal(replacement.getAttribute('src'),'/assets/img/placeholder-venue.svg');
 }finally{dom.window.close();}
});
