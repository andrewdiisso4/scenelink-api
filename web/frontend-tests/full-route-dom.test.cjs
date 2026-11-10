'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{JSDOM,VirtualConsole}=require('jsdom'),root=path.resolve(__dirname,'../frontend');
const venue={id:'00000000-0000-4000-8000-000000000001',slug:'fixture-venue',name:'TEST ONLY Venue',type:'bar',neighborhood:'Quincy',city:'Quincy',address:'TEST ONLY address',lat:null,lng:null,source:'local-test-fixture',booking:{status:'not_available'},thumbnail_url:'/assets/img/placeholder-venue.svg'};
for(const page of ['index','explore','nightlife','tonight','events','plan-with-friends','profile','messages','my-lists'])test('all locally included scripts initialize '+page+' without uncaught errors',async()=>{
 const errors=[],v=new VirtualConsole();v.on('jsdomError',e=>{if(!/Not implemented: (navigation|window.scrollTo|HTMLCanvasElement)/.test(e.message))errors.push(e.message)});
 const d=new JSDOM(fs.readFileSync(path.join(root,page+'.html'),'utf8'),{url:'https://scenelink.test/'+(page==='index'?'':page),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:v}),w=d.window;
 w.Response=Response;w.Request=Request;w.Headers=Headers;w.AbortController=AbortController;w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.fetch=async(input,opts={})=>{const u=typeof input==='string'?input:input.url;if(!u.startsWith('/api')&&!u.startsWith('https://scenelink.test/'))return new Response(JSON.stringify({error:'External services are blocked in this test'}),{status:503,headers:{'Content-Type':'application/json'}});let body={};if(u.includes('/api/venues'))body=u.includes('/venues/slug/')?venue:{venues:[venue],total:1,has_more:false};else if(u.includes('/api/events'))body={events:[],total:0};else if(u.includes('/api/health'))body={ok:true};else if(u.includes('version.json'))body=JSON.parse(fs.readFileSync(path.join(root,'version.json')));else return new Response(JSON.stringify({error:'Synthetic guest session'}),{status:401,headers:{'Content-Type':'application/json'}});return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});};
 for(const script of [...w.document.scripts]){
  const src=script.getAttribute('src');if(src&&/^(https?:|\/\/)/.test(src))continue;if(script.type==='application/ld+json'||script.type==='application/json')continue;
  const code=src?fs.readFileSync(path.join(root,src.split('?')[0].replace(/^\//,'')),'utf8'):script.textContent;
  try{w.eval(code);}catch(e){errors.push((src||'inline')+': '+e.stack);}
 }
 await new Promise(r=>setTimeout(r,320));
 assert.deepEqual(errors,[],errors.join('\n'));
 if(page==='index')assert(w.document.getElementById('phase8TonightGrid').textContent.includes('TEST ONLY Venue'));
 if(page==='index') {
  const card=w.document.querySelector('.sl-phase8-neighborhood-card');
  assert.equal(card.getAttribute('href'),'/explore.html?neighborhood=Back+Bay');
  const button=w.document.querySelector('[data-phase8-menu]'),links=w.document.getElementById('phase8NavLinks');
  assert.equal(button.getAttribute('aria-expanded'),'false');
  for(let repeat=0;repeat<3;repeat++){
   button.click();assert(links.classList.contains('open'));assert.equal(button.getAttribute('aria-expanded'),'true');
   links.querySelector('a').focus();
   w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   assert(!links.classList.contains('open'));assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(w.document.activeElement,button);
  }
  button.click();button.click();assert(!links.classList.contains('open'));assert.equal(button.getAttribute('aria-expanded'),'false');
  button.click();w.document.querySelector('main').click();assert(!links.classList.contains('open'));assert.equal(button.getAttribute('aria-expanded'),'false');
  button.click();const anchor=links.querySelector('a');anchor.addEventListener('click',event=>event.preventDefault(),{once:true});anchor.click();
  assert(!links.classList.contains('open'));assert.equal(button.getAttribute('aria-expanded'),'false');
 }

 if(page==='events')assert(w.document.getElementById('eventsGrid').textContent.includes('No reviewed events'));
 if(page==='plan-with-friends')assert(w.document.getElementById('slConnectedPlans').textContent.includes('Make plans together'));
 if(page==='explore'||page==='nightlife')assert(w.document.getElementById('slListCards').textContent.includes('TEST ONLY Venue'));
 if(page==='tonight')assert(w.document.getElementById('slTonightPagination'));
 d.window.close();
});
