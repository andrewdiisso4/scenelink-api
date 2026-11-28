'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../src/services/resend-signup');
const env={SIGNUP_MAIL_TRANSPORT:'resend',RESEND_SIGNUP_API_KEY:'re_fictional',RESEND_SIGNUP_WELCOME_NOT_BEFORE:'2026-11-28T00:00:00Z'};
const opts={to:{address:'fictional@example.invalid'},subject:'SceneLink',html:'<p>Welcome</p>',text:'Welcome',purpose:'signup-welcome'};
test('only selected signup mail uses verified sender, one recipient and no retry/fallback',async()=>{
 const sent=[];
 const client=create({env,fetcher:async(url,init)=>{sent.push({url,init});return {ok:true,json:async()=>({id:'fake'})};}});
 for(const purpose of ['signup-welcome','newsletter-confirm']) assert.equal((await client.send({...opts,purpose})).ok,true);
 for(const purpose of [undefined,'account-verify','contact','campaign']) assert.equal((await client.send({...opts,purpose})).ok,false);
 assert.equal((await client.send({...opts,to:{address:'a@example.invalid,b@example.invalid'}})).ok,false);
 assert.equal(sent.length,2);
 for(const {url,init} of sent){
   assert.equal(url,'https://api.resend.com/emails');assert.equal(init.redirect,'error');
   assert.equal(init.headers.Authorization,'Bearer re_fictional');
   const body=JSON.parse(init.body);assert.deepEqual(body.to,['fictional@example.invalid']);
   assert.equal(body.from,'SceneLink <hello@mail.scenelink.app>');assert.equal(body.reply_to,'info@scenelink.app');
 }
});
test('missing key and acceptance mode fail closed; welcome requires no-backfill cutoff',async()=>{
 const never=async()=>assert.fail('unexpected provider call');
 for(const disabled of [{...env,ACCEPTANCE_MODE:'isolated-synthetic'},{...env,RESEND_SIGNUP_API_KEY:''},{}]){
   const client=create({env:disabled,fetcher:never});
   assert.equal((await client.send(opts)).ok,false);
   assert.equal((await client.send({...opts,purpose:'newsletter-confirm'})).ok,false);
 }
 const client=create({env:{...env,RESEND_SIGNUP_WELCOME_NOT_BEFORE:''},fetcher:never});
 assert.equal(client.ready('signup-welcome'),false);assert.equal(client.ready('newsletter-confirm'),true);
});
test('ambiguous provider response is not retried',async()=>{
 let attempts=0;
 const c=create({env,fetcher:async()=>{attempts++;throw Error('provider diagnostics');}});
 assert.deepEqual(await c.send(opts),{ok:false}); assert.equal(attempts,1);
});
