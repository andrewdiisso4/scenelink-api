'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const profile=fs.readFileSync(path.resolve(__dirname,'../frontend/js/sl-social-profile.js'),'utf8');
const rooms=fs.readFileSync(path.resolve(__dirname,'../frontend/js/sl-connected-plans.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<3;i++)await tick();};
const defer=()=>{let resolve;return{promise:new Promise(r=>{resolve=r}),resolve};};
const id='ab123456-7777-4888-8abc-012345678901',user='ab123456-7777-4888-8abc-012345678902';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const myRoom={id,name:'Dinner <with friends>',event_date:'2026-12-04',state:'confirmed',owner_name:'Fictional owner',members:[],options:[]};
const sample={name:'Drinks <and dinner>',updated_at:'2026-11-28T01:15:05Z',date:'2026-12-04',stops:[{venue_name:'Harbor <Room>'},{venue_name:'Old Stop',venue_available:false}],legacy_venues:[{name:'Bonus Stop'}]};
async function app(t,{url='/profile',session='A',intercept}={}){
  const dom=new JSDOM('<main id="slSocialProfile"></main>',{url:'https://scenelink.test'+url,runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
  const calls=[];
  const request=async(path,opts={})=>{
    const call={path,session,method:opts.method||'GET'};calls.push(call);
    const value=intercept?.(call);if(value!==undefined)return await value;
    if(path==='/users/me')return{user:{id:user,display_name:session==='A'?'Test member A':'Test member B',username:'qa_member_a'}};
    if(path==='/users/me/achievements')return{source:'persisted_scenelink_activity',badges:[]};
    if(path==='/users/another')return{user:{id,display_name:'Another Person',username:'another'},can_view:true,is_me:false};
    if(path==='/rooms?limit=5&offset=0')return{rooms:[myRoom]};
    if(path==='/plans')return{plans:[sample]};
    throw new Error('Unexpected path '+path);
  };
  w.SLConnected={token:()=>session,esc,request,safeUrl:()=>''};w.eval(profile);await settle();
  return{w,calls,query:selector=>w.document.querySelector(selector),switchUser:async token=>{session=token;w.dispatchEvent(new w.CustomEvent('sl-auth-changed'));await settle();}};
}
test('show saved plans from own profile, reopen a real-route group plan and read ordered personal stops',async t=>{
  const h=await app(t);
  const button=h.query('#slspShowPlans'),target=h.query('#slspSavedPlans');
  assert(button);assert(target.hidden);
  assert(!h.calls.some(c=>c.path==='/plans'||c.path.startsWith('/rooms')));
  assert.equal(h.query('a[href="/my-lists#want-to-try"]').textContent,'Favorites');
  button.click();await settle();
  assert.equal(button.getAttribute('aria-expanded'),'true');assert(!target.hidden);
  const link=target.querySelector('a[href^="/plan-with-friends?"]');
  assert.equal(link.textContent,'Dinner <with friends>');
  assert.equal(link.pathname,'/plan-with-friends');
  assert.equal(new URL(link.href).searchParams.get('room_id'),id);
  assert.match(target.textContent,/Venue selected · not booked/);
  const itinerary=target.querySelector('details');assert(!itinerary.open);
  itinerary.querySelector('summary').click();assert(itinerary.open);
  assert.deepEqual([...itinerary.querySelectorAll('ol li')].map(li=>li.textContent),['Harbor <Room>','Old Stop · Currently unavailable']);
  assert.equal(itinerary.querySelector('ul li').textContent,'Bonus Stop');
  assert.match(itinerary.textContent,/not a reservation/);
  assert.deepEqual(h.calls.slice(-2).map(c=>[c.method,c.path]),[['GET','/rooms?limit=5&offset=0'],['GET','/plans']]);
  assert.equal(h.w.localStorage.length,0);assert.equal(h.w.sessionStorage.length,0);

  const reopened=new JSDOM('<main id="slConnectedPlans"></main>',{url:link.href,runScripts:'outside-only'}),w=reopened.window;t.after(()=>w.close());
  const detailCalls=[];
  w.SLConnected={token:()=> 'A',esc,request:async p=>{detailCalls.push(p);if(p==='/rooms/'+id)return{room:myRoom};if(p.startsWith('/rooms?'))return{rooms:[myRoom]};if(p.startsWith('/friends?'))return{friends:[]};if(p==='/rooms/invitations')return{invitations:[]};if(p==='/friends/pending')return{incoming:[],outgoing:[]};throw new Error('Unexpected '+p);}};
  w.eval(rooms);await settle();
  assert(detailCalls.includes('/rooms/'+id));
  assert.equal(w.document.querySelector('#slRoomDetail h2')?.textContent,'Dinner <with friends>');
});
test('signed-out and other-member profiles cannot reveal private controls or fetch plans',async t=>{
  for(const scenario of [{session:''},{url:'/profile?user=another'}]){
    const h=await app(t,scenario);
    assert(!h.query('#slspShowPlans'));
    assert(!h.query('#slspSavedPlans'));
    assert(!h.calls.some(c=>c.path==='/plans'||c.path.startsWith('/rooms')));
  }
});
test('plan previews are isolated across account switches and delayed responses are ignored',async t=>{
  const d=defer();
  const h=await app(t,{intercept:c=>c.path==='/plans'?(c.session==='A'?d.promise:{plans:[]}):c.path.startsWith('/rooms')?{rooms:[]}:undefined});
  h.query('#slspShowPlans').click();const old=h.query('#slspSavedPlans');
  await h.switchUser('B');
  assert(!old.isConnected);
  h.query('#slspShowPlans').click();await settle();
  d.resolve({plans:[{name:'OLD_PRIVATE_PLAN',stops:[]}]});await settle();
  assert.match(h.query('#slspSavedPlans').textContent,/No saved itineraries yet/);
  assert.doesNotMatch(h.w.document.body.textContent,/OLD_PRIVATE_PLAN/);
});
test('a partial failure leaves the usable section available and refresh can recover',async t=>{
  let failed=true;
  const h=await app(t,{intercept:c=>c.path==='/plans'&&failed?Promise.reject(new Error('Internal error')):undefined});
  h.query('#slspShowPlans').click();await settle();
  assert(h.query('#slspSavedPlans a[href^="/plan-with-friends?"]'));
  assert.match(h.query('#slspSavedPlans').textContent,/Saved itineraries could not be loaded/);
  assert.equal(h.query('#slspShowPlans').textContent,'Refresh saved plans');
  failed=false;h.query('#slspShowPlans').click();await settle();
  assert.match(h.query('#slspSavedPlans details').textContent,/Drinks <and dinner>/);
  assert.equal(h.query('#slspPlansStatus').textContent,'Saved plans loaded.');
});
