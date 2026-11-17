'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../frontend'),tick=()=>new Promise(r=>setTimeout(r,20));
async function make(t,{token='session-a',hash='#my-rsvps',handle}={}){
 const d=new JSDOM('<main id="slConnectedEvents"></main>',{url:'https://scenelink.test/events'+hash,runScripts:'outside-only'}),w=d.window,calls=[];
 t.after(()=>w.close());w.AbortController=AbortController;if(token)w.localStorage.setItem('sl_jwt_token',token);
 let logins=0;w.SLAuthUI={open:()=>logins++};
 w.fetch=async(url,opts={})=>{const req={url,method:opts.method||'GET'};calls.push(req);const data=await handle?.(req)||{events:[],rsvps:[],has_more:false};return new Response(JSON.stringify(data),{status:200});};
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
  return{events:[{id:'event-1',title:'Fixture event',source_review_status:'reviewed',rsvp_is_reservation:false,my_rsvp:saved?'going':null}],has_more:false};
 }});
 assert.match(m.panel().textContent,/No saved RSVPs/);m.click('[data-rsvp="going"]');await tick();await tick();
 assert.match(m.panel().textContent,/Fixture event/);assert.equal(m.calls.filter(r=>r.url.includes('/rsvps/mine')).length,2);
});
