'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
// Stub transport before loading application code. No socket, SMTP or live inbox.
function offline(code){
 const script=`const assert=require('node:assert/strict');const nodemailer=require('nodemailer');let calls=0,mode='error';
 nodemailer.createTransport=()=>({sendMail:async msg=>{calls++;if(mode==='error'){const e=new Error('private-user@example.invalid private-token');e.responseCode=432;throw e;}return{accepted:mode==='reject'?[]:['recipient@example.invalid'],messageId:'offline-only'};}});
 const mailer=require('./src/services/mailer');${code}`;
 return spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'test',EMAIL_PROVIDER:'smtp',SMTP_HOST:'example.invalid',SMTP_USER:'sender@example.invalid',SMTP_PASS:'synthetic-not-a-secret',APP_BASE_URL:'https://scenelink.app'}});
}
test('welcome SMTP gets one attempt and excludes recipients/provider text from logs',()=>{
 const r=offline(`(async()=>{const result=await mailer.sendMail({to:{address:'private-user@example.invalid'},subject:'Welcome to SceneLink',text:'offline',retry:false,privateLog:true});assert.equal(calls,1);assert.equal(result.ok,false);assert.equal(result.attempts,1);})().catch(()=>process.exitCode=1);`);
 assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/private-user|private-token/);
});
test('SMTP acceptance is required; a resolved send with no accepted recipient is not success',()=>{
 const r=offline(`(async()=>{mode='reject';const rejected=await mailer.sendMail({to:{address:'recipient@example.invalid'},subject:'Welcome',text:'offline',retry:false,privateLog:true});assert.equal(rejected.ok,false);mode='accepted';const sent=await mailer.sendMail({to:{address:'recipient@example.invalid'},subject:'Welcome',text:'offline',retry:false,privateLog:true});assert.equal(sent.ok,true);assert.equal(calls,2);})().catch(()=>process.exitCode=1);`);
 assert.equal(r.status,0,r.stderr);
});
test('welcome compiles offline with a single literal recipient and plain-text URL',async()=>{
 process.env.EMAIL_PROVIDER='disabled';
 const mailer=require('../src/services/mailer'),nodemailer=require('nodemailer');
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,disableFileAccess:true,disableUrlAccess:true});
 const message=mailer.welcomeEmail({display_name:'Unverified https://attacker.invalid',email_verified:false});
 assert.doesNotMatch(message.text,/attacker/);assert.match(message.text,/https:\/\/scenelink.app\/explore.html/);
 const result=await transport.sendMail({from:'SceneLink <sender@example.invalid>',to:{address:'fictional@example.invalid'},...message});
 assert.deepEqual(result.envelope.to,['fictional@example.invalid']);assert.match(result.message.toString(),/Content-Type: multipart\/alternative/);transport.close();
});

test('welcome provides the same useful destinations in HTML and plain text without tracking assets',()=>{
 process.env.EMAIL_PROVIDER='disabled';
 const mailer=require('../src/services/mailer');
 for(const email_verified of [false,true]){
  const message=mailer.welcomeEmail({display_name:'Casey Preview',email_verified});
  for(const route of ['/explore.html','/profile','/contact.html','/privacy.html','/terms.html']){
   const url=new URL(route,mailer.APP_BASE_URL).href;
   assert(message.text.includes(url),'Plain text missing '+route);assert(message.html.includes('href="'+url+'"'),'HTML missing '+route);
  }
  const assets=[...message.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(assets,[new URL('/images/brand/scenelink-full.png',mailer.APP_BASE_URL).href]);
  assert.match(message.html,/alt="SceneLink — Eat\. Drink\. Discover\."/);
  assert.doesNotMatch(message.html,/<script\b|<iframe\b|token=|utm_/i);
  assert.equal(message.replyTo,mailer.SUPPORT_EMAIL);assert(message.text.includes(mailer.SUPPORT_EMAIL));
 }
});

test('welcome preserves verified-name escaping and never claims an unverified account is ready to participate',()=>{
 process.env.EMAIL_PROVIDER='disabled';
 const {welcomeEmail}=require('../src/services/mailer');
 const unsafe='Casey <img src="https://example.invalid/pixel"> & friends';
 const unverified=welcomeEmail({display_name:unsafe,email_verified:false});
 assert.doesNotMatch(unverified.html+unverified.text,/example\.invalid|Casey/);assert.match(unverified.text,/sign in and verify your email first/);assert.match(unverified.html,/request a separate confirmation link/);
 const verified=welcomeEmail({display_name:unsafe,email_verified:true});
 assert.match(verified.html,/Casey &lt;img src=&quot;https:\/\/example\.invalid\/pixel&quot;&gt; &amp; friends/);
 assert(!verified.html.includes('<img src="https://example.invalid/pixel">'));
 assert.doesNotMatch(verified.text,/verify your email first/);assert(verified.text.includes(unsafe));
});

test('privateLog also redacts transient warnings if another caller allows retries',()=>{
 const r=offline(`(async()=>{const result=await mailer.sendMail({to:{address:'private-user@example.invalid'},subject:'private subject',text:'offline',privateLog:true});assert.equal(calls,3);assert.equal(result.ok,false);})().catch(()=>process.exitCode=1);`);
 assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/private-user|private-token|private subject/);
});
