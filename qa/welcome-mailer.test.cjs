'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
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
  for(const route of ['/explore.html','/profile.html','/contact.html','/privacy.html','/terms.html']){
   const url=new URL(route,mailer.APP_BASE_URL).href;
   assert(message.text.includes(url),'Plain text missing '+route);assert(message.html.includes('href="'+url+'"'),'HTML missing '+route);
   assert(fs.statSync(path.join(__dirname,'../web/frontend',route)).isFile(),route+' is a direct published file');
  }
  const assets=[...message.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);
  const logo='/images/brand/welcome-scenelink-logo.png';
  assert.deepEqual(assets,[new URL(logo,mailer.APP_BASE_URL).href]);
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../web/frontend',logo))).digest('hex'),
      'ba80587846e74ea44b79fcdf4c04795dc38cdedf990d3ed8f3b1765c46daddab','exact owner-supplied official email logo');
  assert.match(message.html,/<img[^>]+alt=""[^>]+aria-hidden="true"/);
  const imageBlocked=message.html.replace(/<img\b[^>]*>/gi,'');
  assert.match(imageBlocked,/>SceneLink<\/p>/);assert.match(imageBlocked,/>Eat\. Drink\. Discover\.<\/p>/);
  assert.doesNotMatch(message.html,/<script\b|<iframe\b|token=|utm_/i);
  assert.equal(message.replyTo,mailer.SUPPORT_EMAIL);assert(message.text.includes(mailer.SUPPORT_EMAIL));
 }
});

test('welcome preserves verified-name escaping and never claims an unverified account is ready to participate',()=>{
 process.env.EMAIL_PROVIDER='disabled';
 const {welcomeEmail}=require('../src/services/mailer');
 const unsafe='Casey <img src="https://example.invalid/pixel"> & friends';
 const unverified=welcomeEmail({display_name:unsafe,email_verified:false});
 assert.doesNotMatch(unverified.html+unverified.text,/example\.invalid|Casey/);assert.match(unverified.text,/sign in and verify your email first/);assert.match(unverified.html,/Resend verification email/);assert.match(unverified.html,/not a verification link/);assert.match(unverified.text,/separate verification message/);
 const verified=welcomeEmail({display_name:unsafe,email_verified:true});
 assert.match(verified.html,/Casey &lt;img src=&quot;https:\/\/example\.invalid\/pixel&quot;&gt; &amp; friends/);
 assert(!verified.html.includes('<img src="https://example.invalid/pixel">'));
 assert.doesNotMatch(verified.text,/verify your email first/);assert(verified.text.includes(unsafe));assert.match(verified.text,/Set up your profile/);assert.doesNotMatch(verified.html,/Resend verification email|not a verification link/);
});

test('privateLog also redacts transient warnings if another caller allows retries',()=>{
 const r=offline(`(async()=>{const result=await mailer.sendMail({to:{address:'private-user@example.invalid'},subject:'private subject',text:'offline',privateLog:true});assert.equal(calls,3);assert.equal(result.ok,false);})().catch(()=>process.exitCode=1);`);
 assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/private-user|private-token|private subject/);
});

test('welcome has clean, labeled account actions, complementary text, and high-contrast CTA',()=>{
 process.env.EMAIL_PROVIDER='disabled';
 const {welcomeEmail,APP_BASE_URL}=require('../src/services/mailer');
 const getLum = hex => Array.from(hex.match(/../g),n=>parseInt(n,16)/255)
    .map(s=>s<0.04045?s/12.92:((s+.055)/1.055)**2.4)
    .reduce((l,c,i)=>l+c*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(getLum(a),getLum(b))+.05)/(Math.min(getLum(a),getLum(b))+.05);
 for(const email_verified of [false,true]){
    const template=welcomeEmail({email_verified});
    const refs=[...template.html.matchAll(/href="([^"]+)"/g)].map(m=>new URL(m[1]));
    assert.equal(refs.length,5);
    assert(refs.every(link=>link.origin===new URL(APP_BASE_URL).origin&&!link.search&&!link.hash));
    assert.equal((template.html.match(/<h1\b/g)||[]).length,1);
    assert.match(template.html,/<h1[^>]*>Welcome to SceneLink<\/h1>/);
    assert.match(template.html,email_verified?/>Set up your profile<\//:/>Open your profile<\//);
    assert.match(template.text,email_verified?/Make it yours/:/One step before you connect/);
    assert.doesNotMatch(template.text,/unsubscrib|newsletter|password|payment/i);
    const cta=template.html.match(/bgcolor="#([0-9a-f]{6})"[^>]*><a href="[^"]+" style="[^"]*color:#([0-9a-f]{6})[^"]*"[^>]*>Explore Boston/i);
    assert(cta);
    assert(contrast(cta[1],cta[2])>=7);
    assert(contrast('c9c6be','2b271e')>=7);
 }
});
