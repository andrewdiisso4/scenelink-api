'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname,'../frontend/admin.html'),'utf8');
const source = fs.readFileSync(path.join(__dirname,'../frontend/js/sl-admin-portal.js'),'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve,15));
const id = 'd9c35fb0-b02c-4f64-98cf-c4a66054ab5f';
const venue = {id,name:'Cafe <Boston> & Friends',neighborhood:'South End',type:'restaurant',website:'https://example.invalid/',is_featured:false,is_trending:true,is_active:false};
async function setup(t, opts={}) {
  const calls=[], logins=[];
  const d=new JSDOM(html,{url:'https://scenelink.test/admin.html',runScripts:'outside-only'});
  const w=d.window, $=sel=>w.document.querySelector(sel), click=sel=>$(sel).click();
  t.after(()=>w.close());
  let currentUser=opts.user===undefined?{role:'admin',username:'admin-fixture'}:opts.user;
  w.SLAuth={user:()=>currentUser,token:()=>currentUser?'fixture-token':'',async refresh(){return currentUser;}, async login(email,password){logins.push([email,password]);currentUser={role:'admin',username:'admin-fixture'};}};
  w.fetch=async (url, request={})=>{
    const u = new URL(url,w.location.origin), method=request.method||'GET', body=request.body?JSON.parse(request.body):null;
    const call={path:u.pathname,query:Object.fromEntries(u.searchParams),method,body}; calls.push(call);
    const route=opts.fetch && await opts.fetch(call);
    const status=route?.status||200;
    const data=route?.data ?? (()=>{
      if (u.pathname==='/api/admin/venues/summary') return {total:123,active:120,missing_image:8,missing_website:12,missing_neighborhood:1};
      if (u.pathname==='/api/admin/stats') return {users:{total:51,this_week:3,today:1}};
      if (u.pathname==='/api/admin/contacts') return {messages:[]};
      if (u.pathname==='/api/admin/venues/list') return {venues:[venue],total:1,limit:25,offset:0};
      return {};
    })();
    return {ok:status<400,status,async text(){return JSON.stringify(data);}};
  };
  w.eval(source);
  await tick();
  return {w,$,click,calls,logins};
}
test('private admin gate login works before first successful bootstrap; denied accounts perform no admin reads',async t=>{
 const h=await setup(t,{user:null});
 assert.equal(h.$('#sl-admin-gate').style.display,'flex');assert.equal(h.calls.length,0);
 h.$('#adminEmail').value='fictional@example.invalid';h.$('#adminPassword').value='fictional-password';h.click('#adminLoginBtn');await tick();
 assert.equal(h.logins.length,1);assert.equal(h.$('#sl-admin-app').style.display,'block');
 const denied=await setup(t,{user:{role:'member'}});assert.equal(denied.$('#sl-admin-deny').style.display,'flex');assert.equal(denied.calls.length,0);
});
test('first and last user pages use confirmed page metadata, and failed results never reuse old range',async t=>{
 const makeUsers=page=>Array.from({length:page===3?1:25},(_,i)=>({display_name:'Member '+((page-1)*25+i+1),favorite_count:0,checkin_count:null}));
 let fail=false;
 const h=await setup(t,{fetch:call=>{
  if(call.path!=='/api/admin/users')return;
  const page=Number(call.query.page);
  return fail ? {status:503,data:{error:'Unavailable'}} : {data:{users:makeUsers(page),total:51,page,limit:25,pages:3}};
 }});
 h.click('[data-section=users]');await tick();assert.match(h.$('#usersCount').textContent,/1–25 of 51 users/);
 assert.equal(h.$('#usersPrev').disabled,true);assert.equal(h.$('#usersNext').disabled,false);
 h.click('#usersNext');h.click('#usersNext');await tick();assert.match(h.$('#usersCount').textContent,/26–50 of 51 users/);assert.match(h.$('#usersTbody').textContent,/Member 26/);
 h.click('#usersNext');await tick();assert.match(h.$('#usersCount').textContent,/51–51 of 51 users/);assert.equal(h.$('#usersNext').disabled,true);
 fail=true;h.click('#usersPrev');await tick();
 assert.equal(h.$('#usersCount').textContent,'User list unavailable');assert.doesNotMatch(h.$('#usersTbody').textContent,/Member 51/);
 assert.equal(h.$('#usersPrev').disabled,true);assert.equal(h.$('#usersNext').disabled,true);
 assert.deepEqual(h.calls.filter(c=>c.path==='/api/admin/users').map(c=>c.query),[{page:'1',limit:'25'},{page:'2',limit:'25'},{page:'3',limit:'25'},{page:'2',limit:'25'}]);
});
test('inactive inventory rows can only edit flags, and only a verified changed flag gets a success toast',async t=>{
 let confirm=false, finish;
 const h=await setup(t,{fetch:call=>call.method==='PATCH'?new Promise(r=>{finish=()=>r({data:confirm?{venue:{id,featured:true}}:{venue:{id,featured:false}}});}):undefined});
 h.click('[data-section=venues]');await tick();
 assert.match(h.$('#venuesTbody').textContent,/Cafe <Boston> & Friends/);
 h.click('[data-edit-index]');assert.match(h.$('#venueModalBody').textContent,/Active: No/);
 assert.equal(h.$('#venueModalBody input:not([type=checkbox])'),null);
 h.click('#venueModalSave');assert.equal(h.calls.filter(c=>c.method==='PATCH').length,0);
 h.$('[data-venue-flag=featured]').checked=true;h.click('#venueModalSave');h.click('#venueModalSave');await tick();
 assert.equal(h.calls.filter(c=>c.method==='PATCH').length,1);
 assert.deepEqual(h.calls.find(c=>c.method==='PATCH').body,{featured:true});
 assert.equal(h.$('#venueModalSave').disabled,true);
 finish();await tick();
 assert.match(h.$('#toastStack').textContent,/Save not confirmed/);
 assert.equal(h.$('#toastStack .success'),null);assert(h.$('#venueModal').classList.contains('open'));
 confirm=true;h.click('#venueModalSave');await tick();finish();await tick();
 assert.match(h.$('#toastStack .success').textContent,/Venue flags updated/);assert(!h.$('#venueModal').classList.contains('open'));
 assert.equal(h.calls.some(c=>c.path.startsWith('/api/venues/')),false);
});
test('unmounted import, review, recompute and searches never send requests or present guessed counts',async t=>{
 const h=await setup(t,{fetch:call=>call.path==='/api/admin/venues/summary'?{data:{total:123,active:120,missing_website:0}}:undefined});
 assert.equal(h.$('#stat-osm').textContent,'—');assert.match(h.$('#sourcesTbody').textContent,/unavailable/i);
 assert.equal(h.$('#recomputeQualityBtn').disabled,true);
 for (const key of ['csv-import','osm-import','import-history']) {
   h.click(`[data-section=${key}]`);assert.match(h.$(`#section-${key}`).textContent,/unavailable|disabled/i);
 }
 h.click('[data-section=data-quality]');await tick();
 assert.equal(h.$('#dq-no-image').textContent,'—');assert.equal(h.$('#dq-no-website').textContent,'0');
 assert.match(h.$('#dq-status').textContent,/source review are unavailable/i);
 assert.equal(h.$('#recomputeQualityBtn2').disabled,true);
 assert.equal(h.$('#csvFile'),null);assert.equal(h.$('#usersSearch').disabled,true);
 assert.equal(h.calls.some(c=>/import|recompute|quality=/.test(c.path+JSON.stringify(c.query))),false);
 assert(h.calls.every(c=>c.method==='GET'));
});
test('Users search stays disabled against old server and opts in only to explicit page-one capability',async t=>{
 const entries=[{display_name:'Private fictional Member'}];
 let enabled=false;
 const h=await setup(t,{fetch:call=>{
   if(call.path!=='/api/admin/users')return;
   return {data:{users:entries,total:1,page:1,limit:25,pages:1,...(enabled?{search_supported:true}:{})}};
 }});
 h.click('[data-section=users]');await tick();
 assert.equal(h.$('#usersSearch').disabled,true);assert.equal(h.$('#usersSearchBtn').disabled,true);
 h.$('#usersSearch').value='Ignored';h.click('#usersSearchBtn');await tick();
 assert.equal(h.calls.filter(c=>c.path==='/api/admin/users').length,1);
 enabled=true;h.click('#refreshBtn');await tick();
 assert.equal(h.$('#usersSearch').disabled,false);assert.equal(h.$('#usersSearchBtn').disabled,false);
 h.$('#usersSearch').value='  fictional Member  ';h.click('#usersSearchBtn');await tick();
 assert.deepEqual(h.calls.filter(c=>c.path==='/api/admin/users').at(-1).query,{page:'1',limit:'25',search:'fictional Member'});
});
test('user search after a backend rollback clearly falls back to the full list',async t=>{
 let old=false;
 const h=await setup(t,{fetch:call=>{
   if(call.path!=='/api/admin/users')return;
   if(call.query.search&&old)return {status:500,data:{error:'User search unavailable'}};
   return {data:{users:[{display_name:'All users fixture'}],total:1,page:1,limit:25,pages:1,...(!old?{search_supported:true}:{})}};
 }});
 h.click('[data-section=users]');await tick();assert.equal(h.$('#usersSearch').disabled,false);
 old=true;h.$('#usersSearch').value='Only one';h.click('#usersSearchBtn');await tick();
 assert.equal(h.$('#usersSearch').disabled,true);
 assert.match(h.$('#toastStack .warning').textContent,/Returning to the full list/);
 assert.match(h.$('#usersTbody').textContent,/All users fixture/);
 assert.equal(h.calls.filter(c=>c.path==='/api/admin/users').at(-1).query.search,undefined);
});
