'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{JSDOM}=require('jsdom'),root=path.resolve(__dirname,'../frontend');
function dom(fetch){const d=new JSDOM('<!doctype html><html><head></head><body><button id="origin">Open</button></body></html>',{url:'https://scenelink.test/explore',runScripts:'outside-only'});const w=d.window;w.fetch=fetch;w.AbortController=AbortController;for(const name of ['sl-connected-api','sl-venue-detail'])w.eval(fs.readFileSync(path.join(root,'js/'+name+'.js'),'utf8'));return d;}
const reply=d=>({ok:true,status:200,json:async()=>d}),tick=()=>new Promise(r=>setTimeout(r,20));
const fixture=id=>({id,name:'Venue '+id,lat:null,lng:null,booking:{status:'not_available'}});
test('slow earlier venue cannot overwrite a later venue; closing suppresses in-flight details',{timeout:5000},async()=>{const wait={};const d=dom(url=>url.includes('/reviews')?Promise.resolve(reply({reviews:[]})):new Promise(r=>wait[url]=r)),w=d.window;const a=w.SLVenueDetail.open('one'),b=w.SLVenueDetail.open('two');wait['/api/venues/two'](reply(fixture('two')));await b;wait['/api/venues/one'](reply(fixture('one')));await a;assert.match(w.document.querySelector('.sl-vd-content').textContent,/Venue two/);assert(!w.document.querySelector('.sl-vd-content').textContent.includes('Venue one'));const c=w.SLVenueDetail.open('three');const back=new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}));w.SLVenueDetail.close();wait['/api/venues/three'](reply(fixture('three')));await c;assert(!w.document.getElementById('sl-venue-detail').classList.contains('sl-open'));await back;assert.equal(w.location.hash,'');d.window.close();});
test('malicious venue fields render literally, unsafe links never become anchors, unknown facts explicit',async()=>{const bad='<img src=x onerror="window.pwned=1">';const d=dom(async url=>reply(url.includes('reviews')?{reviews:[{display_name:bad,content:bad,rating:5}]}:{...fixture('safe'),name:bad,description:bad,website:'javascript:alert(1)',booking:{status:'external_link',url:'data:text/html,pwn'}}));await d.window.SLVenueDetail.open('safe');await tick();const content=d.window.document.querySelector('.sl-vd-content');assert(content.textContent.includes(bad));assert(!content.querySelector('[onerror]'));assert(!content.querySelector('a[href^="javascript:"]'));assert.match(content.textContent,/Not provided/);assert.match(content.textContent,/No reservation has been made/);assert.equal(d.window.pwned,undefined);d.window.close();});
test('escape closes detail, restores keyboard focus and preserves underlying query',async()=>{const d=dom(async url=>reply(url.includes('reviews')?{reviews:[]}:fixture('safe'))),w=d.window;w.history.replaceState(null,'','/explore?q=Quincy');const origin=w.document.getElementById('origin');origin.focus();await w.SLVenueDetail.open('safe');w.document.querySelector('.sl-vd-close').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();assert.equal(w.document.activeElement,origin);assert.equal(w.location.pathname+w.location.search+w.location.hash,'/explore?q=Quincy');assert.equal(w.document.body.style.overflow,'');d.window.close();});
test('failed save does not set saved success, repeated click is deduplicated',async()=>{let writes=0;const d=dom(async(url,opts)=>{if(url.includes('/favorites/')){writes++;return{ok:false,status:503,json:async()=>({error:'Storage unavailable'})};}return reply(url.includes('/reviews')?{reviews:[]}:fixture('safe'));}),w=d.window;w.localStorage.setItem('sl_jwt_token','fixture');await w.SLVenueDetail.open('safe');const b=w.document.querySelector('[data-save-venue]');b.click();b.click();await tick();assert.equal(writes,1);assert.equal(b.textContent,'Save venue');assert.match(w.document.querySelector('[data-venue-status]').textContent,/Storage unavailable/);assert.equal(b.disabled,false);d.window.close();});
test('a venue deep link loads its canonical slug without needing a directory record; close preserves search',async()=>{
 const calls=[],d=dom(async url=>{calls.push(url);return reply(url.includes('/reviews')?{reviews:[]}:fixture('contessa'));}),w=d.window;
 try{w.history.replaceState(null,'','/explore?q=dinner&venue=contessa');w.dispatchEvent(new w.PopStateEvent('popstate'));await tick();
 assert(calls.includes('/api/venues/contessa'));assert.match(w.document.querySelector('.sl-vd-content').textContent,/Venue contessa/);
 w.SLVenueDetail.close();await tick();assert.equal(w.location.pathname+w.location.search+w.location.hash,'/explore?q=dinner');assert(!w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));
 }finally{d.window.close();}
});
test('Back and Forward reopen canonical details and malformed external hashes do not throw',async()=>{
 const d=dom(async url=>reply(url.includes('/reviews')?{reviews:[]}:fixture('contessa'))),w=d.window;
 try{await tick();await w.SLVenueDetail.open('contessa');w.history.back();await tick();assert(!w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));
 w.history.forward();await tick();assert(w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));assert.match(w.document.querySelector('.sl-vd-content').textContent,/Venue contessa/);
 w.history.replaceState(null,'','/explore#venue=%E0%A4%A');w.dispatchEvent(new w.HashChangeEvent('hashchange'));assert(!w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));
 }finally{d.window.close();}
});
for(const scenario of ['error-event','already-failed','healthy'])test('canonical venue hero handles '+scenario+' without an image retry loop',async t=>{
 const photo='/api/photo?name=places/fictional-test-only-photo/media',placeholder='/assets/img/placeholder-venue.svg';
 const d=dom(async url=>reply(url.includes('/reviews')?{reviews:[]}:{...fixture('photo-fixture'),thumbnail_url:photo})),w=d.window;
 t.after(()=>w.close());
 const proto=w.HTMLImageElement.prototype,src=Object.getOwnPropertyDescriptor(proto,'src');let assignments=0;
 Object.defineProperty(proto,'src',{...src,set(value){assignments++;src.set.call(this,value);}});
 Object.defineProperty(proto,'complete',{configurable:true,get:()=>scenario!=='error-event'});
 Object.defineProperty(proto,'naturalWidth',{configurable:true,get:()=>scenario==='healthy'?640:0});
 await w.SLVenueDetail.open('photo-fixture');
 const image=w.document.querySelector('.sl-vd-image');
 if(scenario==='healthy'){
   assert.equal(image.getAttribute('src'),photo);assert.equal(image.alt,'Venue photo-fixture');assert.equal(assignments,0);return;
 }
 if(scenario==='error-event'){
   assert.equal(image.getAttribute('src'),photo);assert.equal(assignments,0);
   image.dispatchEvent(new w.Event('error'));
 }
 assert.equal(image.getAttribute('src'),placeholder);assert.equal(image.alt,'Venue photo unavailable');assert.equal(assignments,1);
 image.dispatchEvent(new w.Event('error'));image.dispatchEvent(new w.Event('error'));
 assert.equal(assignments,1,'a failing placeholder cannot trigger another request');
 assert.equal(image.getAttribute('src'),placeholder);assert(!image.hasAttribute('onerror'));
 assert(fs.existsSync(path.join(root,placeholder)),'fallback uses the existing honest non-photo asset');
});
test('an already unavailable placeholder is not assigned to itself on failure',async t=>{
 const d=dom(async url=>reply(url.includes('/reviews')?{reviews:[]}:fixture('no-photo'))),w=d.window;t.after(()=>w.close());
 await w.SLVenueDetail.open('no-photo');const image=w.document.querySelector('.sl-vd-image');
 let assignments=0;Object.defineProperty(image,'src',{set(){assignments++;}});
 image.dispatchEvent(new w.Event('error'));image.dispatchEvent(new w.Event('error'));
 assert.equal(assignments,0);assert.equal(image.alt,'Venue photo unavailable');
});

test('share copies only the canonical venue and a signed-out recipient can open it', async t => {
  const calls = [], written = [];
  const id = 'stable-id_99';
  const fetch = async url => {
    calls.push(url);
    return reply(url.includes('/reviews') ? {reviews: []} : fixture(id));
  };
  const d = dom(fetch), w = d.window;
  t.after(() => w.close());
  w.history.replaceState(null, '', '/my-lists?list=private-list&invite=private-invite&token=private-state');
  Object.defineProperty(w.navigator, 'clipboard', {
    value: {writeText: async url => { written.push(url); }},
  });
  await w.SLVenueDetail.open('alias');
  const before = calls.length;
  const share = w.document.querySelector('[data-share-venue]');
  share.click(); share.click();
  await tick();
  assert.equal(written.length, 1);
  const link = new URL(written[0]);
  assert.equal(link.origin, w.location.origin);
  assert.equal(link.pathname, '/explore');
  assert.deepEqual([...link.searchParams], [['venue', id]]);
  assert.equal(link.hash, '');
  assert.equal(calls.length, before, 'copying must not make a network request');
  assert.match(w.document.querySelector('[data-venue-share-status]').textContent, /Venue link copied/);
  assert.equal(w.document.querySelector('[data-manual-share]').hidden, true);

  const recipient = dom(fetch), other = recipient.window;
  t.after(() => other.close());
  other.history.replaceState(null, '', written[0]);
  other.dispatchEvent(new other.PopStateEvent('popstate'));
  await tick();
  assert.equal(other.localStorage.getItem('sl_jwt_token'), null);
  assert(calls.includes('/api/venues/' + encodeURIComponent(id)));
  assert.equal(other.document.querySelector('.sl-vd-content h1').textContent, 'Venue ' + id);
});

for (const scenario of ['missing', 'denied']) {
  test('share leaves a usable manual link when clipboard is ' + scenario, async t => {
    const d = dom(async url => reply(url.includes('/reviews') ? {reviews: []} : fixture('pizza')));
    const w = d.window;
    t.after(() => w.close());
    if (scenario === 'denied') {
      Object.defineProperty(w.navigator, 'clipboard', {
        value: {writeText: async () => { throw new Error('Not allowed'); }},
      });
    }
    await w.SLVenueDetail.open('pizza');
    const share = w.document.querySelector('[data-share-venue]');
    share.focus();
    share.click();
    await tick();
    const manual = w.document.querySelector('[data-manual-share]');
    const input = manual.querySelector('input');
    assert.equal(manual.hidden, false);
    assert.equal(input.readOnly, true);
    assert.equal(input.value, 'https://scenelink.test/explore?venue=pizza');
    assert.equal(w.document.activeElement, input);
    assert.equal(input.selectionEnd, input.value.length);
    assert.match(w.document.querySelector('[data-venue-share-status]').textContent, /Couldn’t copy automatically/);
    assert.equal(share.disabled, false);
  });
}

test('a late copy response cannot show the previous address or take focus from a different venue', async t => {
  const d = dom(async url => reply(url.includes('/reviews') ? {reviews: []} : fixture(url.split('/').pop())));
  const w = d.window; t.after(() => w.close());
  let reject;
  Object.defineProperty(w.navigator, 'clipboard', {
    value: {writeText: () => new Promise((resolve, fail) => { reject = fail; })},
  });
  await w.SLVenueDetail.open('first');
  w.document.querySelector('[data-share-venue]').click();
  await w.SLVenueDetail.open('second');
  const save = w.document.querySelector('[data-save-venue]');
  save.focus();
  reject(new Error('Not allowed'));
  await tick();
  assert.equal(w.document.activeElement, save);
  assert.equal(w.document.querySelector('[data-manual-share]').hidden, true);
  assert.equal(w.document.querySelector('[data-venue-share-status]').textContent, '');
});
