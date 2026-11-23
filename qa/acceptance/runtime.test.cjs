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
const root = path.resolve(__dirname,'../..');
function environment() {
  return {NODE_ENV:'test',ACCEPTANCE_MODE:'isolated-synthetic',ACCEPTANCE_ENVIRONMENT_ID:ENVIRONMENT_ID,
    ACCEPTANCE_DB_NAME:'scenelink_release_qa_20261123',ACCEPTANCE_DB_HOST:'127.0.0.1',
    DATABASE_URL:'postgresql://qa:synthetic-test-only@127.0.0.1:5432/scenelink_release_qa_20261123',
    ACCEPTANCE_PUBLIC_ORIGIN:'http://127.0.0.1:4000',PORT:'4000',JWT_SECRET:crypto.randomBytes(32).toString('hex'),
    ACCEPTANCE_ACCESS_SECRET:crypto.randomBytes(32).toString('hex'),ACCEPTANCE_FIXTURE_PASSWORD:crypto.randomBytes(24).toString('hex')};
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

test('real HTTP gate protects files and API, preserves bearer auth and enforces same-origin writes', async t => {
  const config=validateEnvironment(environment(),root), app=express();
  let healthy=true;
  installGate(app,config,{health:async()=>healthy});
  app.get('/private.html',(req,res)=>res.send('private fixture'));
  app.all('/api/probe',(req,res)=>res.json({authorization:req.get('authorization')||null}));
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base='http://127.0.0.1:'+server.address().port;
  let result=await fetch(base+'/__acceptance/health');assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'ok'});
  healthy=false;result=await fetch(base+'/__acceptance/health');assert.equal(result.status,503);assert.deepEqual(await result.json(),{status:'unavailable'});healthy=true;
  result=await fetch(base+'/private.html');assert.equal(result.status,401);assert(!((await result.text()).includes('private fixture')));
  result=await fetch(base+'/api/probe',{headers:{Authorization:'Bearer synthetic-account'}});assert.equal(result.status,401);
  result=await fetch(base+'/__acceptance/unlock',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:'incorrect'})});assert.equal(result.status,401);
  result=await fetch(base+'/__acceptance/unlock',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:config.accessSecret,next:'/private.html'}),redirect:'manual'});
  assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/private.html');
  const setCookie=result.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert(setCookie.includes(flag));
  const cookie=setCookie.split(';')[0];
  result=await fetch(base+'/api/probe',{method:'POST',headers:{Cookie:cookie,Authorization:'Bearer synthetic-account',Origin:config.origin}});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{authorization:'Bearer synthetic-account'});
  assert.equal(result.headers.get('content-security-policy'),CSP);assert.match(CSP,/connect-src 'self'/);assert.match(CSP,/worker-src 'none'/);
  assert.match(result.headers.get('cache-control'),/no-store/);
  result=await fetch(base+'/api/probe',{method:'POST',headers:{Cookie:cookie,Origin:'https://scenelink.app'}});assert.equal(result.status,403);
  result=await fetch(base+'/api/probe',{method:'POST',headers:{Cookie:cookie}});assert.equal(result.status,403);
  result=await fetch(base+'/__acceptance/lock',{method:'POST',headers:{Cookie:cookie,Origin:config.origin},redirect:'manual'});
  assert.equal(result.status,303);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
});
