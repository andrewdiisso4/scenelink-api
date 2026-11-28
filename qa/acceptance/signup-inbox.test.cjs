'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {configure}=require('./signup-inbox.cjs');
const origin='https://scenelink-release-qa-20261123-smn6.onrender.com';
const config={origin,local:false};
const at=Date.parse('2026-11-28T01:10:00Z');
const synth='scenelink-mail-check@example.invalid';
const env={RENDER_SERVICE_ID:'srv-dc2b7nifngtc73bbu81g',RENDER_EXTERNAL_URL:origin,
 ACCEPTANCE_SIGNUP_INBOX_MODE:'welcome-and-newsletter',ACCEPTANCE_SIGNUP_INBOX_KEY:'re_fictionalsendingcredential',
 ACCEPTANCE_SIGNUP_INBOX_RUN:'123456789012345678901234567890ab',ACCEPTANCE_SIGNUP_INBOX_RECIPIENT:'info@scenelink.app',
 ACCEPTANCE_SIGNUP_INBOX_UNTIL:'2026-11-28T02:00:00Z',ACCEPTANCE_SIGNUP_INBOX_WELCOME_NOT_BEFORE:'2026-11-28T01:00:00Z'};
const opts={to:{address:synth},subject:'Welcome to SceneLink',text:'Explore: '+origin+'/explore.html',html:'<p>Welcome</p>',purpose:'signup-welcome'};
const success=()=>new Response(JSON.stringify({id:'20000000-0000-4000-8000-000000000002'}),{headers:{'content-type':'application/json'}});
test('canary is off by default and rejects production, any other inbox, and expired or broad timing',()=>{
 const never=()=>assert.fail('external call');
 assert.equal(configure({},config,never,()=>at),null);
 for(const [settings,where] of [[{...env,RENDER_SERVICE_ID:'srv-production'},config],[{...env,ACCEPTANCE_SIGNUP_INBOX_RECIPIENT:'outside@example.invalid'},config],
   [{...env,ACCEPTANCE_SIGNUP_INBOX_UNTIL:'2026-11-28T01:02:00Z'},config],[{...env,ACCEPTANCE_SIGNUP_INBOX_WELCOME_NOT_BEFORE:'2026-11-27T02:00:00Z'},config],
   [{...env},{origin,local:true}]]) assert.throws(()=>configure(settings,where,never,()=>at),/safely configured/);
});
test('one attempt per approved purpose, including across restart; no other recipient or purpose may go outbound',async()=>{
 const claimed=new Set(),messages=[];
 const pool={query:async(sql,params)=>{if(!params)return{};const id=params.join(':');if(claimed.has(id))return{rows:[]};claimed.add(id);return{rows:[{purpose:params[1]}]};}};
 async function install(){
  const settings={...env};const init=configure(settings,config,async(url,options)=>{messages.push({url,options});return success();},()=>at);
  assert(!Object.keys(settings).some(key=>key.startsWith('ACCEPTANCE_SIGNUP_INBOX_')));
  const mailer={isReadyFor:()=>false,sendMail:async()=>({ok:false})};await init(pool,mailer);return mailer;
 }
 const mailer=await install();
 assert.equal((await mailer.sendMail({...opts,to:{address:'bad@example.invalid'}})).ok,false);
 assert.equal((await mailer.sendMail({...opts,purpose:'account-verify'})).ok,false);
 assert.equal((await mailer.sendMail(opts)).ok,true);
 assert.equal((await mailer.sendMail(opts)).ok,false);
 const afterRestart=await install();
 assert.equal((await afterRestart.sendMail(opts)).ok,false);
 const newsletter={...opts,purpose:'newsletter-confirm',subject:'Confirm your SceneLink newsletter signup'};
 assert.equal((await afterRestart.sendMail(newsletter)).ok,true);
 assert.equal(messages.length,2);
 for(const {url,options} of messages){
  assert.equal(url,'https://api.resend.com/emails');assert.equal(options.redirect,'error');
  assert.deepEqual(JSON.parse(options.body).to,['info@scenelink.app']);
  assert.match(options.headers['Idempotency-Key'],/^scenelink-signup-qa-/);
 }
});
