'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const frontend = path.join(__dirname, '../frontend');
const html = fs.readFileSync(path.join(frontend, 'admin.html'), 'utf8');
const authSource = fs.readFileSync(path.join(frontend, 'js/sl-auth-core.js'), 'utf8');
const portalSource = fs.readFileSync(process.env.SCENELINK_ADMIN_TEST_SOURCE || path.join(frontend, 'js/sl-admin-portal.js'), 'utf8');
const wait = () => new Promise(resolve => setTimeout(resolve, 25));
const admin = {id:'admin-fixture',role:'admin',username:'Admin Fixture',email:'admin@example.invalid'};
const member = {id:'member-fixture',role:'member',username:'Member Fixture'};
const response = (data, status=200) => ({ok:status>=200&&status<300,status,json:async()=>data,text:async()=>JSON.stringify(data)});

async function setup(t, options={}) {
  const dom = new JSDOM(html, {url:'https://scenelink.test/admin.html', runScripts:'outside-only', virtualConsole:new VirtualConsole()});
  const w=dom.window, calls=[];
  t.after(()=>w.close());
  const $=selector=>w.document.querySelector(selector);
  if (options.token) w.localStorage.setItem('sl_jwt_token', options.token);
  if (options.cachedUser) w.localStorage.setItem('sl_user_cache', JSON.stringify({user:options.cachedUser}));
  if (options.secret) w.localStorage.setItem('sl_admin_secret', options.secret);
  let currentUser=options.user || admin;
  w.fetch=async(url, init={})=>{
    const u=new URL(url,w.location.origin);
    const call={path:u.pathname,query:Object.fromEntries(u.searchParams),method:init.method||'GET',headers:init.headers||{},body:init.body?JSON.parse(init.body):null};
    calls.push(call);
    if(options.fetch) { const custom=await options.fetch(call); if(custom)return custom; }
    if(call.path==='/api/auth/login') {
      currentUser=call.body.email==='member@example.invalid'?member:admin;
      return response({token:currentUser===member?'member-token':'admin-token',user:currentUser});
    }
    if(call.path==='/api/auth/me') {
      if(call.headers.Authorization==='Bearer expired-token')return response({error:'Session expired'},401);
      return response({user:currentUser});
    }
    if(call.path==='/api/auth/logout')return response({ok:true,revoked:true});
    if(call.path==='/api/admin/venues/summary')return response({total:17,active:16,missing_website:1});
    if(call.path==='/api/admin/stats')return response({users:{total:2,this_week:1,today:1},venues:{total:17,active:16,featured:1,trending:1}});
    if(call.path==='/api/admin/contacts')return response({messages:[],total:0});
    if(call.path==='/api/admin/users')return response({users:[{id:'one',display_name:'Private Admin Fixture'}],total:1,page:1,limit:25,pages:1,search_supported:true});
    return response({});
  };
  w.eval(authSource);
  w.eval(portalSource);
  await wait();
  return {w,$,calls,click:selector=>$(selector).click(),setUser:value=>{currentUser=value;}};
}
const adminCalls=h=>h.calls.filter(c=>c.path.startsWith('/api/admin/'));
async function login(h,email='admin@example.invalid') {
  h.$('#adminEmail').value=email;
  h.$('#adminPassword').value='  exact password  ';
  h.click('#adminLoginBtn');
  await wait();
}

test('shipped auth module opens the signed-out gate and submits the exact password once',async t=>{
  const h=await setup(t);
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.$('#sl-admin-deny').style.display,'none');
  assert.equal(adminCalls(h).length,0);
  h.$('#adminEmail').value=' admin@example.invalid ';
  h.$('#adminPassword').value='  exact password  ';
  h.click('#adminLoginBtn');h.click('#adminLoginBtn');
  await wait();
  assert.deepEqual(h.calls.filter(c=>c.path==='/api/auth/login').map(c=>c.body),[{email:'admin@example.invalid',password:'  exact password  '}]);
  assert.equal(h.$('#sl-admin-app').style.display,'block');
  assert.equal(h.$('#adminPassword').value,'');
  assert(adminCalls(h).length>0);
  assert(adminCalls(h).every(c=>c.headers.Authorization==='Bearer admin-token'));
  assert(h.calls.filter(c=>c.path==='/api/auth/me').length<5,'auth events must not trigger a refresh loop');
});

test('a returning admin must receive a fresh server role and sends token() as the bearer value',async t=>{
  const h=await setup(t,{token:'admin-token',cachedUser:member});
  assert.equal(h.$('#sl-admin-app').style.display,'block');
  assert(h.calls.some(c=>c.path==='/api/auth/me'));
  assert(adminCalls(h).every(c=>c.headers.Authorization==='Bearer admin-token'));
  h.click('[data-section=users]');await wait();
  assert.match(h.$('#usersTbody').textContent,/Private Admin Fixture/);
});

test('a member cannot gain access by retaining an admin in the local cache',async t=>{
  const h=await setup(t,{token:'member-token',cachedUser:admin,user:member});
  assert.equal(h.$('#sl-admin-deny').style.display,'flex');
  assert.equal(h.$('#sl-admin-app').style.display,'none');
  assert.equal(adminCalls(h).length,0);
});

test('an expired token returns to sign-in without exposing protected data',async t=>{
  const h=await setup(t,{token:'expired-token',cachedUser:admin});
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.w.localStorage.getItem('sl_jwt_token'),null);
  assert.equal(adminCalls(h).length,0);
});

test('an unavailable auth service cannot unlock a cached admin and preserves the token for retry',async t=>{
  let unavailable=true;
  const h=await setup(t,{token:'admin-token',cachedUser:admin,fetch:c=>c.path==='/api/auth/me'&&unavailable?response({error:'Unavailable'},503):null});
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.match(h.$('#gateError').textContent,/could not be verified/);
  assert.equal(h.w.localStorage.getItem('sl_jwt_token'),'admin-token');
  assert.equal(adminCalls(h).length,0);
  unavailable=false;await login(h);
  assert.equal(h.$('#sl-admin-app').style.display,'block');
});

test('logout clears data immediately and a delayed protected response cannot return it',async t=>{
  let resolveUsers;
  const h=await setup(t,{token:'admin-token',fetch:c=>c.path==='/api/admin/users'?new Promise(r=>{resolveUsers=r;}):null});
  h.click('[data-section=users]');await wait();
  h.click('#sbLogout');
  assert.equal(h.$('#sl-admin-app').style.display,'none');
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.$('#usersTbody').textContent,'');
  resolveUsers(response({users:[{display_name:'Should never return'}],total:1,page:1,limit:25,pages:1}));
  await wait();
  assert.equal(h.$('#usersTbody').textContent,'');
  assert.equal(h.$('#sb-users-count').textContent,'');
  assert.equal(h.w.localStorage.getItem('sl_jwt_token'),null);
  assert(h.calls.some(c=>c.path==='/api/auth/logout'&&c.headers.Authorization==='Bearer admin-token'));
});

test('revocation on a protected read clears existing rows and returns to sign-in',async t=>{
  let revoked=false;
  const h=await setup(t,{token:'admin-token',fetch:c=>revoked&&c.path==='/api/admin/users'?response({error:'Session revoked'},401):null});
  h.click('[data-section=users]');await wait();
  assert.match(h.$('#usersTbody').textContent,/Private Admin Fixture/);
  revoked=true;h.click('#refreshBtn');await wait();
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.$('#sl-admin-app').style.display,'none');
  assert.equal(h.$('#usersTbody').textContent,'');
  assert.equal(h.w.localStorage.getItem('sl_jwt_token'),null);
});

test('a new member session cannot inherit the old admin rows or delayed responses',async t=>{
  let resolveUsers;
  const h=await setup(t,{token:'admin-token',fetch:c=>c.path==='/api/admin/users'?new Promise(r=>{resolveUsers=r;}):null});
  h.click('[data-section=users]');await wait();
  await h.w.SLAuth.login('member@example.invalid','password');await wait();
  resolveUsers(response({users:[{display_name:'Old admin data'}],total:1,page:1,limit:25,pages:1}));
  await wait();
  assert.equal(h.$('#sl-admin-deny').style.display,'flex');
  assert.equal(h.$('#usersTbody').textContent,'');
  assert.equal(adminCalls(h).filter(c=>c.headers.Authorization==='Bearer member-token').length,0);
});

test('delayed A-to-B-to-A storage events invalidate old admin reads even when the current token matches',async t=>{
  let resolveUsers;
  const h=await setup(t,{token:'admin-token',fetch:c=>c.path==='/api/admin/users'?new Promise(r=>{resolveUsers=r;}):null});
  h.click('[data-section=users]');await wait();
  h.w.dispatchEvent(new h.w.StorageEvent('storage',{key:'sl_jwt_token',oldValue:'admin-token',newValue:'member-token'}));
  h.w.dispatchEvent(new h.w.StorageEvent('storage',{key:'sl_jwt_token',oldValue:'member-token',newValue:'admin-token'}));
  await wait();
  resolveUsers(response({users:[{display_name:'Stale storage response'}],total:1,page:1,limit:25,pages:1}));
  await wait();
  assert.equal(h.$('#sl-admin-app').style.display,'block');
  assert.equal(h.$('#usersTbody').textContent,'');
});

test('late body-read failures do not overwrite the next signed-in session',async t=>{
  let rejectBody, delay=true;
  const h=await setup(t,{token:'admin-token',fetch:c=>c.path==='/api/admin/users'&&delay?{ok:true,status:200,text:()=>new Promise((_,reject)=>{rejectBody=reject;})}:null});
  h.click('[data-section=users]');await wait();
  await h.w.SLAuth.logout({reload:false});delay=false;
  await login(h);h.click('[data-section=users]');await wait();
  rejectBody(new Error('Old response body failed'));await wait();
  assert.match(h.$('#usersTbody').textContent,/Private Admin Fixture/);
  assert.doesNotMatch(h.$('#usersTbody').textContent,/Old response/);
  assert.doesNotMatch(h.$('#toastStack').textContent,/Old response/);
});

test('secret fallback is verified by the API and logout removes it',async t=>{
  const h=await setup(t,{secret:'fixture-admin-secret'});
  assert.equal(h.$('#sl-admin-app').style.display,'block');
  assert(adminCalls(h).every(c=>c.headers['x-admin-secret']==='fixture-admin-secret'));
  assert(adminCalls(h).every(c=>!c.headers.Authorization));
  h.click('#sbLogout');await wait();
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.w.localStorage.getItem('sl_admin_secret'),null);
});

test('a delayed save from the prior session cannot unlock a new pending venue save',async t=>{
  const saves=[];
  const entry={id:'venue-fixture',name:'Fixture Cafe',is_active:false,is_featured:false,is_trending:false};
  const h=await setup(t,{token:'admin-token',fetch:c=>{
    if(c.path==='/api/admin/venues/list')return response({venues:[entry],total:1,limit:25,offset:0});
    if(c.method==='PATCH')return new Promise(resolve=>{saves.push({resolve,body:c.body});});
  }});
  async function beginSave(){
    h.click('[data-section=venues]');await wait();
    h.click('[data-edit-index]');h.$('[data-venue-flag=featured]').checked=true;h.click('#venueModalSave');await wait();
  }
  await beginSave();assert.equal(saves.length,1);
  h.click('#sbLogout');await wait();await login(h);await beginSave();
  assert.equal(saves.length,2);assert.equal(h.$('#venueModalSave').disabled,true);
  saves[0].resolve(response({venue:{id:entry.id,featured:true}}));await wait();
  assert.equal(h.$('#venueModalSave').disabled,true,'old completion must leave the new save locked');
  h.click('#venueModalSave');await wait();assert.equal(saves.length,2);
  saves[1].resolve(response({venue:{id:entry.id,featured:true}}));await wait();
  assert.equal(h.$('#venueModalSave').disabled,false);
  assert.match(h.$('#toastStack .success').textContent,/Venue flags updated/);
});

test('an invalid admin secret cannot open the portal and is removed',async t=>{
  const h=await setup(t,{secret:'invalid-secret',fetch:c=>c.path==='/api/admin/venues/summary'?response({error:'Authentication required'},401):null});
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.$('#sl-admin-app').style.display,'none');
  assert.equal(h.w.localStorage.getItem('sl_admin_secret'),null);
  assert.match(h.$('#gateError').textContent,/not accepted/);
});

test('an unavailable secret-verification endpoint keeps the portal closed without deleting the credential',async t=>{
  const h=await setup(t,{secret:'fixture-secret',fetch:c=>c.path==='/api/admin/venues/summary'?response({error:'Unavailable'},503):null});
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.$('#sl-admin-app').style.display,'none');
  assert.equal(h.w.localStorage.getItem('sl_admin_secret'),'fixture-secret');
  assert.match(h.$('#gateError').textContent,/could not be verified/);
});

test('a rejected password keeps the usable login gate and allows a successful retry',async t=>{
  let rejectLogin=true;
  const h=await setup(t,{fetch:c=>rejectLogin&&c.path==='/api/auth/login'?response({error:'Invalid email or password'},401):null});
  await login(h);
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.match(h.$('#gateError').textContent,/Invalid email or password/);
  assert.equal(h.$('#adminLoginBtn').disabled,false);
  assert.equal(h.w.localStorage.getItem('sl_jwt_token'),null);
  assert.equal(adminCalls(h).length,0);
  rejectLogin=false;await login(h);
  assert.equal(h.$('#sl-admin-app').style.display,'block');
});

test('a server role denial clears protected data and the denial sign-out remains functional',async t=>{
  let demoted=false;
  const h=await setup(t,{token:'admin-token',fetch:c=>demoted&&c.path==='/api/admin/users'?response({error:'Admin access required'},403):null});
  h.click('[data-section=users]');await wait();
  assert.match(h.$('#usersTbody').textContent,/Private Admin Fixture/);
  demoted=true;h.click('#refreshBtn');await wait();
  assert.equal(h.$('#sl-admin-deny').style.display,'flex');
  assert.equal(h.$('#sl-admin-app').style.display,'none');
  assert.equal(h.$('#usersTbody').textContent,'');
  h.click('#denyLogout');await wait();
  assert.equal(h.$('#sl-admin-gate').style.display,'flex');
  assert.equal(h.w.localStorage.getItem('sl_jwt_token'),null);
});

test('an email-verification write restriction does not misidentify an administrator as a denied member',async t=>{
  const h=await setup(t,{token:'admin-token',fetch:c=>c.method==='PATCH'?response({error:'Verify your email before participating on SceneLink.',code:'EMAIL_VERIFICATION_REQUIRED'},403):null});
  await h.w.SLAdmin.markContact('contact-fixture','read');
  assert.equal(h.$('#sl-admin-app').style.display,'block');
  assert.equal(h.$('#sl-admin-deny').style.display,'none');
  assert.match(h.$('#toastStack').textContent,/Verify your email/);
  assert.equal(h.w.localStorage.getItem('sl_jwt_token'),'admin-token');
});

test('a delayed overview contact count cannot restore the prior session badges or cards after logout',async t=>{
  let resolveContacts;
  const h=await setup(t,{token:'admin-token',fetch:c=>c.path==='/api/admin/contacts'?new Promise(resolve=>{resolveContacts=resolve;}):null});
  assert(h.$('#stat-users-card'));
  h.click('#sbLogout');
  resolveContacts(response({messages:[],total:9}));await wait();
  assert.equal(h.$('#sb-users-count').textContent,'');
  assert.equal(h.$('#sb-contacts-count').textContent,'');
  assert.equal(h.$('#stat-users-card'),null);
});
