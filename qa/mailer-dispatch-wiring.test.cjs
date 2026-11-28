'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const {PGlite} = require('@electric-sql/pglite');
const {createDispatcher,enqueue} = require('../src/services/welcome');
const fs = require('node:fs');
const express = require('express');
const {once} = require('node:events');
const fixedId='10000000-0000-4000-8000-000000000001';
const oldId='10000000-0000-4000-8000-000000000002';
const inbox='local-mail-check@example.invalid';
const cutoff='2026-11-28T01:00:00Z';

function productionMailer(t, config) {
 const vars={EMAIL_PROVIDER:'disabled',SMTP_HOST:undefined,SMTP_USER:undefined,SMTP_PASS:undefined,
  SIGNUP_MAIL_TRANSPORT:undefined,RESEND_SIGNUP_API_KEY:undefined,RESEND_SIGNUP_WELCOME_NOT_BEFORE:undefined,
  ACCEPTANCE_MODE:undefined,APP_BASE_URL:'https://scenelink.app',...config};
 const original=Object.fromEntries(Object.keys(vars).map(key=>[key,process.env[key]]));
 for(const [key,value] of Object.entries(vars)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 delete require.cache[require.resolve('../src/services/mailer')];
 t.after(()=>{for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 delete require.cache[require.resolve('../src/services/mailer')];});
 return require('../src/services/mailer');
}
test('configured Resend is reached through the real newsletter router and real welcome dispatcher; no legacy queue blast',async t=>{
 const outgoing=[];
 const actualFetch=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  if(String(url).startsWith('http://127.0.0.1:'))return actualFetch(url,options);
  assert.equal(url,'https://api.resend.com/emails');
  const payload=JSON.parse(options.body);
  outgoing.push({payload,method:options.method});
  assert.equal(options.headers.Authorization,'Bearer re_fictional_wiring');
  return {ok:true,json:async()=>({id:'fake-provider-acceptance'})};
 });
 const mailer=productionMailer(t,{SIGNUP_MAIL_TRANSPORT:'resend',RESEND_SIGNUP_API_KEY:'re_fictional_wiring',RESEND_SIGNUP_WELCOME_NOT_BEFORE:cutoff});
 const {createRouter}=require('../src/routes/newsletter');
 assert.equal(mailer.isReady(),false);
 assert.equal(mailer.isReadyFor('signup-welcome'),true);
 assert.equal(mailer.isReadyFor('newsletter-confirm'),true);
 assert.equal(mailer.isReadyFor('account-verify'),false);
 assert.equal(mailer.welcomeNotBefore,cutoff);
 const db=new PGlite();await db.waitReady;t.after(()=>db.close());
 await db.exec("CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE SQL AS 'SELECT gen_random_uuid()'; CREATE TABLE users(id uuid PRIMARY KEY,email text,display_name text,email_verified_at timestamptz,verified_email text,is_active boolean DEFAULT true,is_suspended boolean DEFAULT false); CREATE TABLE launch_schema_versions(version text PRIMARY KEY);");
 await db.exec(fs.readFileSync(require.resolve('../migrations/014_signup_welcome_email.sql'),'utf8'));
 await db.exec(fs.readFileSync(require.resolve('../migrations/019_newsletter_opt_in.sql'),'utf8'));
 await db.query("INSERT INTO users(id,email) VALUES ($1,$2),($3,'legacy@example.invalid')",[fixedId,inbox,oldId]);
 await enqueue(db,{id:fixedId,email:inbox});
 await enqueue(db,{id:oldId,email:'legacy@example.invalid'});
 await db.query("UPDATE signup_welcome_emails SET created_at=($2::timestamptz+INTERVAL '1 minute') WHERE user_id=$1",[fixedId,cutoff]);
 await db.query("UPDATE signup_welcome_emails SET created_at=($2::timestamptz-INTERVAL '1 minute') WHERE user_id=$1",[oldId,cutoff]);
 const dispatch=createDispatcher({pool:db,mailer});
 await dispatch.drain();
 await dispatch.drain();
 assert.equal(outgoing.length,1);
 assert.match(outgoing[0].payload.subject,/Welcome to SceneLink/);
 assert.deepEqual(outgoing[0].payload.to,[inbox]);
 assert.deepEqual((await db.query('SELECT status FROM signup_welcome_emails ORDER BY created_at')).rows.map(x=>x.status),['pending','accepted']);
 assert.equal((await db.query('SELECT * FROM newsletter_subscribers')).rows.length,0);
 const app=express();app.use(express.json());app.use('/api/newsletter',createRouter({pool:db,mailer}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const api='http://127.0.0.1:'+server.address().port+'/api/newsletter/';
 const post=(part,payload)=>globalThis.fetch(api+part,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 assert.equal((await post('subscribe',{email:inbox})).status,202);
 assert.equal((await post('subscribe',{email:inbox})).status,202);
 assert.equal(outgoing.length,2);
 assert.deepEqual(outgoing[1].payload.to,[inbox]);
 const match=/\#mode=confirm&token=([A-Za-z0-9_-]+)/.exec(outgoing[1].payload.text);
 assert(match);
 assert.equal((await post('confirm',{token:match[1]})).status,200);
 assert.equal((await post('unsubscribe',{token:match[1]})).status,200);
 const result=await mailer.sendMail({to:inbox,subject:'Reset/verification stays on SMTP',purpose:'account-verify'});
 assert.equal(result.ok,false);assert.equal(outgoing.length,2);
});
test('missing selected Resend key cannot fall back to configured SMTP; unrelated mail can still use SMTP',async t=>{
 let smtp=0;
 t.mock.method(nodemailer,'createTransport',()=>({sendMail:async()=>{smtp++;return{accepted:[inbox]};}}));
 t.mock.method(globalThis,'fetch',async()=>assert.fail('No Resend traffic permitted'));
 const mailer=productionMailer(t,{EMAIL_PROVIDER:'godaddy',SMTP_USER:inbox,SMTP_PASS:'fictional',SIGNUP_MAIL_TRANSPORT:'resend'});
 assert.equal(mailer.isReadyFor('signup-welcome'),false);
 assert.equal(mailer.isReadyFor('newsletter-confirm'),false);
 assert.equal(mailer.isReadyFor('account-verify'),true);
 assert.equal((await mailer.sendMail({purpose:'newsletter-confirm',to:{address:inbox}})).reason,'mailer-not-ready');
 assert.equal(smtp,0);
 assert.equal((await mailer.sendMail({to:inbox,subject:'Fictional verification',privateLog:true})).ok,true);
 assert.equal(smtp,1);
});
test('the default SMTP readiness path works without Resend',async t=>{
 const mailer=productionMailer(t,{});
 assert.equal(mailer.isReadyFor('newsletter-confirm'),false);
 assert.equal(mailer.isReadyFor('signup-welcome'),false);
 assert.equal(mailer.welcomeNotBefore,null);
});
