'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../frontend'),tick=()=>new Promise(r=>setTimeout(r,20));
async function make(t,{token='session-a',hash='#my-rsvps',handle}={}){
 const d=new JSDOM('<main id="slConnectedEvents"></main>',{url:'https://scenelink.test/events'+hash,runScripts:'outside-only'}),w=d.window,calls=[];
 t.after(()=>w.close());w.AbortController=AbortController;if(token)w.localStorage.setItem('sl_jwt_token',token);
 let logins=0;w.SLAuthUI={open:()=>logins++};
 w.fetch=async(url,opts={})=>{const req={url,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null};calls.push(req);const data=await handle?.(req)||{events:[],rsvps:[],has_more:false};return new Response(JSON.stringify(data),{status:data.__status||200});};
 for(const file of ['sl-connected-api.js','sl-events.js'])w.eval(fs.readFileSync(path.join(root,'js',file),'utf8'));
 await tick();return{w,calls,logins:()=>logins,panel:()=>w.document.getElementById('slMyRSVPs'),click:s=>w.document.querySelector(s).click()};
}
test('profile includes direct owner RSVP destination',()=>{assert.match(fs.readFileSync(path.join(root,'js/sl-social-profile.js'),'utf8'),/href="\/events#my-rsvps">My RSVPs/);});
test('history deep link loads real data with honest booking boundary',async t=>{
 const m=await make(t,{handle:r=>r.url.includes('/rsvps/mine')?{rsvps:[{event_id:'event-1',title:'Fixture event',status:'going',audience:'private'}]}:null});
 assert.match(m.panel().textContent,/Fixture event/);assert.match(m.panel().textContent,/not tickets, reservations or verified attendance/);assert.equal(m.logins(),0);
});
test('guest deep link never triggers unsolicited login or history request',async t=>{
 const m=await make(t,{token:''});assert.match(m.panel().textContent,/Sign in/);assert(!m.calls.some(r=>r.url.includes('/rsvps/mine')));assert.equal(m.logins(),0);
 m.click('[data-show-rsvps]');await tick();assert.equal(m.logins(),1);
});
test('malformed history cannot become false empty success',async t=>{
 const m=await make(t,{handle:r=>r.url.includes('/rsvps/mine')?{ok:true}:null});assert.match(m.panel().textContent,/unavailable/);assert(!m.panel().textContent.includes('No saved RSVPs'));
});
test('late old-session history is discarded after sign out',async t=>{
 let release;const m=await make(t,{handle:r=>r.url.includes('/rsvps/mine')?new Promise(resolve=>release=resolve):null});
 m.w.localStorage.removeItem('sl_jwt_token');m.w.dispatchEvent(new m.w.Event('sl-auth-changed'));
 release({rsvps:[{title:'Private old-session event',event_id:'event-1',status:'going',audience:'private'}]});await tick();
 assert.match(m.panel().textContent,/Sign in/);assert(!m.panel().textContent.includes('Private old-session'));
});
test('event card mutation refreshes already open history',async t=>{
 let saved=false;
 const m=await make(t,{handle:r=>{
  if(r.method==='PUT'){saved=true;return{rsvp:{status:'going'},my_rsvp:'going',rsvp_is_reservation:false};}
  if(r.url.includes('/rsvps/mine'))return{rsvps:saved?[{event_id:'event-1',title:'Fixture event',status:'going',audience:'private'}]:[]};
  return{events:[{id:'event-1',title:'Fixture event',date:'2099-04-15',source_review_status:'reviewed',rsvp_is_reservation:false,my_rsvp:saved?'going':null}],has_more:false};
 }});
 assert.match(m.panel().textContent,/No saved RSVPs/);m.click('[data-rsvp="going"]');await tick();await tick();
 assert.match(m.panel().textContent,/Fixture event/);assert.equal(m.calls.filter(r=>r.url.includes('/rsvps/mine')).length,2);
});

const eventId='a0000001-0000-4000-8000-000000000001';
const sourceURL='https://tickets.example.invalid/event/a';
function occurrence(extra={}){
 return {id:eventId,title:'Reviewed fixture',date:'2099-04-15',source_review_status:'reviewed',
   source_url:sourceURL,event_url:sourceURL,rsvp_is_reservation:false,booking_status:'not_booked',
   booking:{status:'external_link',url:sourceURL,reservation_confirmed:false,requires_external_confirmation:true},...extra};
}
test('event deep link calls exact public detail, saves private intent and removes RSVP independently of external link',async t=>{
 let saved=false,putBody;
 const m=await make(t,{hash:'?event='+eventId,handle:r=>{
  if(r.method==='PUT'){saved=true;putBody=r.body;return {rsvp:{status:'going'},my_rsvp:'going',rsvp_is_reservation:false};}
  if(r.method==='DELETE'){saved=false;return {removed:true,my_rsvp:null,rsvp_is_reservation:false};}
  return {event:occurrence({my_rsvp:saved?'going':null,my_rsvp_revision:saved?1:null,my_rsvp_audience:saved?'private':null})};
 }});
 assert.equal(m.calls.length,1);
 assert.equal(m.calls[0].url,'/api/events/'+eventId);
 const external=m.w.document.querySelector('[data-external-event-page]');
 assert.equal(external.href,sourceURL);assert.equal(external.target,'_blank');assert.match(external.rel,/noreferrer/);
 assert.match(m.w.document.body.textContent,/does not receive a confirmation/);
 m.click('[data-rsvp="going"]');await tick();await tick();
 assert.deepEqual(putBody,{status:'going',audience:'private',revision:0});
 assert.match(m.w.document.getElementById('slEventStatus').textContent,/No ticket or reservation was booked/);
 m.click('[data-remove-rsvp]');await tick();await tick();
 assert(!saved);assert.match(m.w.document.getElementById('slEventStatus').textContent,/does not cancel external tickets/);
 assert(m.calls.every(x=>x.url==='/api/events/'+eventId||x.url==='/api/events/'+eventId+'/rsvp'));
});
test('archived exact reviewed link cannot create RSVP or offer stale tickets but permits removal',async t=>{
 const m=await make(t,{hash:'?event='+eventId,handle:()=>({event:occurrence({date:'2000-01-01',my_rsvp:'going'})})});
 assert.match(m.w.document.body.textContent,/New RSVPs are closed/);
 assert.equal(m.w.document.querySelector('[data-rsvp], [data-external-event-page]'),null);
 assert.ok(m.w.document.querySelector('[data-remove-rsvp]'));
});
test('bad, duplicate, unavailable, and substituted event links do not expose listing content',async t=>{
 for(const [query,data,requests] of [
   ['?event=invalid',{},0],['?event='+eventId+'&event='+eventId,{},0],
   ['?event='+eventId,{event:occurrence({source_review_status:'unreviewed'})},1],
   ['?event='+eventId,{event:occurrence({id:'wrong'})},1],
   ['?event='+eventId,{__status:404,error:'private detail'},1],
 ]){
   const m=await make(t,{hash:query,handle:()=>data});
   assert.equal(m.calls.length,requests);
   assert.match(m.w.document.body.textContent,/Event unavailable/);
   assert.doesNotMatch(m.w.document.body.textContent,/Reviewed fixture|private detail/);
 }
});
test('unreviewed, invented or unsafe booking facts do not render an external action',async t=>{
 for(const invalid of [occurrence({event_url:'https://different.example.invalid/event'}),
    occurrence({booking:{...occurrence().booking,reservation_confirmed:true}}),
    occurrence({booking_status:'confirmed'}),
    occurrence({event_url:'javascript:alert(1)',source_url:'javascript:alert(1)',booking:{...occurrence().booking,url:'javascript:alert(1)'}})]){
   const m=await make(t,{hash:'?event='+eventId,handle:()=>({event:invalid})});
   assert.equal(m.w.document.querySelector('[data-external-event-page]'),null);
   assert.match(m.w.document.body.textContent,/In-site tickets and reservations are unavailable/);
 }
});
