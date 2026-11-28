'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const {validateEnvironment, disableExternalServices, ENVIRONMENT_ID} = require('./guard.cjs');
const {installGate, issueCookie, validCookie, COOKIE, TTL, CSP, destination} = require('./gate.cjs');
const {script:browserScript} = require('./browser-bootstrap.cjs');
const {installFrontend} = require('./start.cjs');
const root = path.resolve(__dirname,'../..');
function environment() {
  return {NODE_ENV:'test',ACCEPTANCE_MODE:'isolated-synthetic',ACCEPTANCE_ENVIRONMENT_ID:ENVIRONMENT_ID,
    ACCEPTANCE_DB_NAME:'scenelink_release_qa_20261123',ACCEPTANCE_DB_HOST:'127.0.0.1',
    DATABASE_URL:'postgresql://qa:synthetic-test-only@127.0.0.1:5432/scenelink_release_qa_20261123',
    ACCEPTANCE_PUBLIC_ORIGIN:'http://127.0.0.1:4000',PORT:'4000',JWT_SECRET:crypto.randomBytes(32).toString('hex'),
    ACCEPTANCE_ACCESS_SECRET:crypto.randomBytes(32).toString('hex'),ACCEPTANCE_FIXTURE_PASSWORD:crypto.randomBytes(24).toString('hex')};
}

async function listen(t, app, config) {
  const server = await new Promise(resolve => {
    const running = app.listen(0, '127.0.0.1', () => resolve(running));
  });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  config.origin = 'http://127.0.0.1:' + server.address().port;
  return config.origin;
}

test('startup permits only the bound QA host, database, mode and origin', () => {
  const env = environment();
  const valid = validateEnvironment(env,root);
  assert.equal(valid.databaseName,env.ACCEPTANCE_DB_NAME);
  assert.equal(valid.bindHost,'127.0.0.1');
  for (const changes of [
    {ACCEPTANCE_MODE:''},{ACCEPTANCE_ENVIRONMENT_ID:'production'}, {ACCEPTANCE_DB_NAME:'scenelink_prod'},
    {ACCEPTANCE_DB_HOST:'different.invalid'}, {DATABASE_URL:env.DATABASE_URL+'?host=production.invalid'},
    {DATABASE_URL:env.DATABASE_URL+'#ignored'}, {DATABASE_URL:env.DATABASE_URL.replace('127.0.0.1','localhost'),ACCEPTANCE_DB_HOST:'localhost'},
    {DATABASE_URL:env.DATABASE_URL.replace(':5432','')}, {DATABASE_URL:env.DATABASE_URL.replace('/scenelink_release','/prod')},
    {ACCEPTANCE_PUBLIC_ORIGIN:'https://scenelink.app'}, {ACCEPTANCE_PUBLIC_ORIGIN:'http://127.0.0.1:4000/?secret=ignored'},
    {PORT:'0'}, {JWT_SECRET:'too-short'}, {ACCEPTANCE_ACCESS_SECRET:env.JWT_SECRET},
    {ACCEPTANCE_FIXTURE_PASSWORD:'short'}, {ACCEPTANCE_FIXTURE_PASSWORD:'é'.repeat(37)}
  ]) assert.throws(()=>validateEnvironment({...env,...changes},root), /^Error: Acceptance refused:/);
});

test('hosted mode binds a dedicated Render service, generated database suffix and source commit', () => {
  const env={...environment(),NODE_ENV:'production',RENDER_SERVICE_NAME:ENVIRONMENT_ID+'-a1b2',
    ACCEPTANCE_DB_HOST:'dpg-qa-test-a',ACCEPTANCE_DB_NAME:'scenelink_release_qa_20261123_a1b2',
    DATABASE_URL:'postgresql://qa:synthetic@dpg-qa-test-a/scenelink_release_qa_20261123_a1b2',
    ACCEPTANCE_PUBLIC_ORIGIN:undefined,RENDER_EXTERNAL_URL:'https://'+ENVIRONMENT_ID+'-a1b2.onrender.com',RENDER_GIT_COMMIT:'a'.repeat(40)};
  const valid=validateEnvironment(env,root);
  assert.equal(valid.local,false);assert.equal(valid.bindHost,'0.0.0.0');
  for (const changes of [{RENDER_SERVICE_NAME:'scenelink-api-prod'}, {RENDER_GIT_COMMIT:''},
    {RENDER_EXTERNAL_URL:'https://scenelink-api-prod.onrender.com'}, {NODE_ENV:'development'},
    {DATABASE_URL:env.DATABASE_URL.replace('dpg-qa-test-a','prod.example.invalid'),ACCEPTANCE_DB_HOST:'prod.example.invalid'},
    {ACCEPTANCE_DB_NAME:'scenelink_release_qa_20261123_'+ 'a'.repeat(17)}]) assert.throws(()=>validateEnvironment({...env,...changes},root), /Acceptance refused:/);
});

test('a .env file is rejected before app configuration can be loaded', t => {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'scenelink-acceptance-env-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  fs.writeFileSync(path.join(folder,'.env'),'DATABASE_URL=must-not-load');
  assert.throws(()=>validateEnvironment(environment(),folder), /\.env files are not permitted/);
});

test('initial scope strips provider credentials and forces all side effects off', () => {
  const env={...environment(),SMTP_PASS:'synthetic',OPENAI_API_KEY:'synthetic',CLOUDINARY_URL:'synthetic',
    GOOGLE_CLIENT_ID:'synthetic',APPLE_CLIENT_ID:'synthetic',APNS_KEY_P8:'synthetic',FCM_SERVICE_ACCOUNT_JSON:'synthetic',
    ADMIN_SECRET:'synthetic',SENTRY_DSN:'synthetic',ALLOW_DEMO_SEED:'true',FORCE_RESEED:'true',RUN_ALL_SQL_MIGRATIONS:'true'};
  disableExternalServices(env,validateEnvironment(env,root));
  for(const name of ['SMTP_PASS','OPENAI_API_KEY','CLOUDINARY_URL','GOOGLE_CLIENT_ID','APPLE_CLIENT_ID','APNS_KEY_P8','FCM_SERVICE_ACCOUNT_JSON','ADMIN_SECRET','SENTRY_DSN','RUN_ALL_SQL_MIGRATIONS']) assert.equal(env[name],undefined);
  assert.equal(env.EMAIL_PROVIDER,'disabled');assert.equal(env.ALLOW_DEMO_SEED,'false');assert.equal(env.FORCE_RESEED,'false');
  assert.equal(env.CONCIERGE_AI_PILOT_ENABLED,'false');assert.equal(env.ENABLE_PROVIDER_FETCH,'false');
  assert.equal(env.APP_BASE_URL,'http://127.0.0.1:4000');
});

test('gate cookies reject tampering, expiry, duplicate values and a different environment secret', () => {
  const config=validateEnvironment(environment(),root), now=Date.now(), token=issueCookie(config,now);
  assert.equal(validCookie(config,COOKIE+'='+token,now+1000),true);
  assert.equal(validCookie(config,COOKIE+'='+token+'x',now),false);
  assert.equal(validCookie(config,COOKIE+'='+token,now+TTL*1000),false);
  assert.equal(validCookie(config,COOKIE+'='+token+'; '+COOKIE+'='+token,now),false);
  assert.equal(validCookie({...config,accessSecret:'different'},COOKIE+'='+token,now),false);
  for(const value of ['https://scenelink.app','//scenelink.app','/\\evil','/\r\nLocation:bad']) assert.equal(destination(value),'/__acceptance/');
});

test('browser overlay survives bundled configuration and keeps real connected requests inside the gated origin', async t => {
  const {JSDOM}=require(path.join(root,'web/node_modules/jsdom'));
  const dom=new JSDOM('<!doctype html>',{url:'https://qa.example.invalid/plan-with-friends.html',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,calls=[];
  w.fetch=async(input,options)=>{calls.push({input,options});return new Response(JSON.stringify({plans:[]}),{status:200,headers:{'Content-Type':'application/json'}});};
  Object.assign(w,{Response,Headers,Request,AbortController});
  w.eval(browserScript(w.location.origin,'fixture-commit'));
  w.eval(fs.readFileSync(path.join(root,'web/frontend/js/config.js'),'utf8'));
  // The bundle assigns this object again; the acceptance overlay must survive.
  w.SL_CONFIG={API_BASE_URL:'https://production.example.invalid/api',GOOGLE_CLIENT_ID:'unavailable',APPLE_ENABLED:true};
  assert.equal(w.SL_CONFIG.API_BASE_URL,'/api');assert.equal(w.SL_CONFIG.API_BASE,w.location.origin);
  assert.equal(w.SL_CONFIG.GOOGLE_CLIENT_ID,'');assert.equal(w.SL_CONFIG.APPLE_ENABLED,false);
  w.localStorage.setItem('sl_jwt_token','synthetic-account-token');
  w.eval(fs.readFileSync(path.join(root,'web/frontend/js/sl-connected-api.js'),'utf8'));
  const result=await w.SLConnected.request('/plans');
  assert.equal(Array.isArray(result.plans),true);assert.equal(calls.length,1);
  assert.equal(calls[0].options.credentials,'same-origin');
  const headers=new Headers(calls[0].options.headers);assert.equal(headers.get('authorization'),'Bearer synthetic-account-token');
  assert.equal(new URL(calls[0].input,w.location.href).origin,w.location.origin);
  await assert.rejects(w.fetch('https://scenelink-api-prod.onrender.com/api/health'),/External requests/);
  await assert.rejects(w.fetch(new w.URL('https://scenelink-api-prod.onrender.com/api/health')),/External requests/);
  await assert.rejects(w.fetch(new Request('https://scenelink-api-prod.onrender.com/api/health')),/External requests/);
  assert.equal(calls.length,1,'No external request may reach the transport');
});

test('QA overlay hides unavailable admin-secret controls and preserves shipped account sign-in', async t => {
  const {JSDOM,VirtualConsole}=require(path.join(root,'web/node_modules/jsdom'));
  const html=fs.readFileSync(path.join(root,'web/frontend/admin.html'),'utf8');
  const user={id:'synthetic-admin',role:'admin',username:'qa_admin',email:'qa.admin@example.invalid'};
  const password='  synthetic fixture password  ';
  const calls=[];
  const dom=new JSDOM(html,{url:'https://qa.example.invalid/admin.html',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
    beforeParse(w) {
      w.fetch=async(input,options={})=>{
        const call={path:new URL(input,w.location.href).pathname,options};
        calls.push(call);
        const body=call.path==='/api/auth/login'?{user,token:'synthetic-admin-token'}:
          call.path==='/api/auth/me'?{user}:
          call.path==='/api/admin/stats'?{users:{total:2},venues:{total:4}}:
          call.path==='/api/admin/venues/summary'?{total:4,active:3}:
          call.path==='/api/admin/contacts'?{messages:[],total:0}:{};
        return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
      };
      // Match /env.js running in the head before the admin controls exist.
      w.eval(browserScript(w.location.origin,'fixture-commit'));
    }});
  const w=dom.window,$=id=>w.document.getElementById(id);
  t.after(()=>w.close());
  w.eval(fs.readFileSync(path.join(root,'web/frontend/js/sl-auth-core.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'web/frontend/js/sl-admin-portal.js'),'utf8'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal($('sl-admin-gate').style.display,'flex');
  const secretHint=$('useSecretLink').closest('.gate-hint');
  assert.equal(w.getComputedStyle(secretHint).display,'none','Do not offer the disabled QA auth method');
  assert.equal($('adminSecret').disabled,true);
  assert.equal($('useSecretBtn').disabled,true);
  $('useSecretLink').click();
  assert.equal(w.getComputedStyle($('secretGate')).display,'none','Existing portal listeners must not reveal it');
  $('useSecretBtn').click();
  assert.equal(calls.length,0,'The unavailable method must not initiate an auth probe');
  assert.equal($('adminEmail').disabled,false);
  assert.equal($('adminPassword').disabled,false);
  assert.equal($('adminLoginBtn').disabled,false);
  $('adminEmail').value=' '+user.email+' ';
  $('adminPassword').value=password;
  $('adminLoginBtn').click();
  await new Promise(resolve=>setImmediate(resolve));
  const loginCalls=calls.filter(call=>call.path==='/api/auth/login');
  assert.equal(loginCalls.length,1);
  assert.deepEqual(JSON.parse(loginCalls[0].options.body),{email:user.email,password});
  assert.equal($('sl-admin-app').style.display,'block');
  assert.equal($('adminPassword').value,'');
  const protectedCalls=calls.filter(call=>call.path.startsWith('/api/admin/'));
  assert(protectedCalls.length>0);
  for(const call of protectedCalls) {
    const headers=new Headers(call.options.headers);
    assert.equal(headers.get('authorization'),'Bearer synthetic-admin-token');
    assert.equal(headers.has('x-admin-secret'),false);
    assert.equal(call.options.credentials,'same-origin');
  }
});

test('real HTTP gate protects files and API, preserves bearer auth and enforces same-origin writes', async t => {
  const config=validateEnvironment(environment(),root), app=express();
  let healthy=true, writes=0;
  installGate(app,config,{health:async()=>healthy});
  app.get('/private.html',(req,res)=>res.send('private fixture'));
  app.all('/api/probe',(req,res)=>{ if(req.method==='POST') writes++; res.json({authorization:req.get('authorization')||null}); });
  const base=await listen(t,app,config);
  let result=await fetch(base+'/__acceptance/health');assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'ok'});
  healthy=false;result=await fetch(base+'/__acceptance/health');assert.equal(result.status,503);assert.deepEqual(await result.json(),{status:'unavailable'});healthy=true;
  result=await fetch(base+'/private.html');assert.equal(result.status,401);assert(!((await result.text()).includes('private fixture')));
  result=await fetch(base+'/api/probe',{headers:{Authorization:'Bearer synthetic-account'}});assert.equal(result.status,401);
  assert.equal(result.headers.get('referrer-policy'),'no-referrer');
  result=await fetch(base+'/__acceptance/unlock',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:'incorrect'})});assert.equal(result.status,401);
  result=await fetch(base+'/__acceptance/unlock',{method:'POST',headers:{Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:config.accessSecret,next:'/private.html'}),redirect:'manual'});
  assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/private.html');
  const setCookie=result.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert(setCookie.includes(flag));
  const cookie=setCookie.split(';')[0];
  result=await fetch(base+'/api/probe',{method:'POST',headers:{Cookie:cookie,Authorization:'Bearer synthetic-account',Origin:config.origin}});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{authorization:'Bearer synthetic-account'});
  assert.equal(result.headers.get('content-security-policy'),CSP);assert.match(CSP,/connect-src 'self'/);assert.match(CSP,/worker-src 'none'/);
  assert.match(result.headers.get('cache-control'),/no-store/);
  assert.equal(result.headers.get('referrer-policy'),'no-referrer');
  const rejectedOrigins = [
    ['missing', {Referer:base+'/__acceptance/', 'Sec-Fetch-Site':'same-origin'}],
    ['null', {Origin:'null', 'Sec-Fetch-Site':'same-origin'}],
    ['foreign', {Origin:'https://other.example.invalid', 'Sec-Fetch-Site':'same-origin'}],
    ['cross-site', {Origin:base, 'Sec-Fetch-Site':'cross-site'}]
  ];
  for (const route of ['/__acceptance/unlock', '/__acceptance/lock', '/api/probe']) {
    for (const [name, headers] of rejectedOrigins) {
      result=await fetch(base+route,{method:'POST',redirect:'manual',
        headers:{Cookie:cookie,Authorization:'Bearer synthetic-account','Content-Type':'application/x-www-form-urlencoded',...headers},
        body:new URLSearchParams({secret:config.accessSecret})});
      assert.equal(result.status,403,route+' rejects '+name+' origin');
      assert.equal(result.headers.has('set-cookie'),false,route+' must not issue or clear a cookie');
      assert.deepEqual(await result.json(),{error:'Same-origin acceptance request required'});
    }
  }
  assert.equal(writes,1,'Rejected API writes must not reach the protected handler');
  result=await fetch(base+'/private.html',{headers:{Cookie:cookie}});assert.equal(result.status,200);
  result=await fetch(base+'/__acceptance/lock',{method:'POST',headers:{Cookie:cookie,Origin:base,'Sec-Fetch-Site':'same-origin'},redirect:'manual'});
  assert.equal(result.status,303);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
});

test('gate form responses use strict-origin while recovery documents keep no-referrer', async t => {
  const config=validateEnvironment(environment(),root), app=express();
  installGate(app,config);
  installFrontend(app,config);
  const base=await listen(t,app,config);
  const request=(route,options={})=>fetch(base+route,{...options,redirect:'manual'});
  async function formResponse(response,status,action) {
    assert.equal(response.status,status);
    assert.equal(response.headers.get('referrer-policy'),'strict-origin',response.url+' form policy');
    const html=await response.text();
    const form=html.match(/<form\b[^>]*>/i)?.[0];
    assert(form&&form.includes('action="'+action+'"'),'Expected the real '+action+' form');
    assert.match(form,/method="post"/i);
    assert.doesNotMatch(html,/<meta\b[^>]*name=["']referrer["']/i,'No meta policy may override the form response policy');
  }
  // A locked recovery URL serves the unlock form, not the private recovery document.
  for (const [route,status] of [
    ['/__acceptance/unlock?next=%2Fadmin.html',200],
    ['/admin.html',401],
    ['/reset-password.html?token=synthetic-test-token',401]
  ]) await formResponse(await request(route),status,'/__acceptance/unlock');
  const unlock=secret=>request('/__acceptance/unlock',{method:'POST',
    headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret})});
  const retry=await unlock('incorrect');
  assert.equal(retry.headers.has('set-cookie'),false);
  await formResponse(retry,401,'/__acceptance/unlock');
  const unlocked=await unlock(config.accessSecret);
  assert.equal(unlocked.status,303);
  const cookie=unlocked.headers.get('set-cookie').split(';')[0];
  await formResponse(await request('/__acceptance/',{headers:{Cookie:cookie}}),200,'/__acceptance/lock');
  for (const page of ['reset-password','business-reset-password','verify-email']) {
    for (const suffix of ['.html','']) {
      const response=await request('/'+page+suffix+'?token=synthetic-test-token',{headers:{Cookie:cookie}});
      assert.equal(response.status,200,page+suffix);
      assert.equal(response.headers.get('referrer-policy'),'no-referrer',page+suffix);
      assert.match(await response.text(),/<meta\s+name="referrer"\s+content="no-referrer"\s*\/?\s*>/i);
    }
  }
  const staticPage=await request('/admin.html',{headers:{Cookie:cookie}});
  assert.equal(staticPage.status,200);
  assert.equal(staticPage.headers.get('referrer-policy'),'no-referrer');
});
