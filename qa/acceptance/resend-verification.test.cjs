'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const {configure}=require('./resend-verification.cjs');
const origin='https://scenelink-release-qa-20261123-smn6.onrender.com', now=Date.parse('2026-11-25T18:00:00Z');
const cfg={origin,local:false}, to='qa-unusable-example@scenelink.app', id='877a7334-be82-4dda-b68a-939a2198a3bd';
const env=()=>({RENDER_SERVICE_ID:'srv-dc2b7nifngtc73bbu81g',RENDER_EXTERNAL_URL:origin,
  ACCEPTANCE_RESEND_MODE:'one-verification',ACCEPTANCE_RESEND_KEY:'re_fake_credential_XYZ',ACCEPTANCE_RESEND_RECIPIENT:to,
  ACCEPTANCE_RESEND_UNTIL:'2026-11-25T18:30:00Z',ACCEPTANCE_RESEND_RUN:'a'.repeat(32)});
const message={to,subject:'Verify your SceneLink email',text:'Confirm your email to participate on SceneLink. This link expires in 24 hours: '+origin+'/verify-email.html#token='+'b'.repeat(64)+'\nIf you did not request this, ignore this email.'};
test('off by default; removes private settings on both rejected and disabled configurations',()=>{
  a.equal(configure({},cfg),null);
  for(const overrides of [{RENDER_SERVICE_ID:'prod'},{RENDER_EXTERNAL_URL:'https://scenelink.app'},
    {ACCEPTANCE_RESEND_UNTIL:'2026-11-25T19:00:01Z'},{ACCEPTANCE_RESEND_RUN:'bad'},{ACCEPTANCE_RESEND_KEY:'bad-secret'},
    {ACCEPTANCE_RESEND_RECIPIENT:'qa@example.invalid'},{ACCEPTANCE_RESEND_RECIPIENT:'A <x@scenelink.app>'}, {ACCEPTANCE_RESEND_RECIPIENT:undefined}]){
    const e={...env(),...overrides}; a.throws(()=>configure(e,cfg,()=>{},()=>now),/verification refused/);
    a.ok(!Object.keys(e).some(k=>k.startsWith('ACCEPTANCE_RESEND_')));
  }
  const e={...env(),ACCEPTANCE_RESEND_MODE:'off'};a.equal(configure(e,cfg,()=>{},()=>now),null);
  a.equal(e.ACCEPTANCE_RESEND_KEY,undefined);a.equal(e.ACCEPTANCE_RESEND_RECIPIENT,undefined);
  a.throws(()=>configure(env(),{...cfg,local:true},()=>{},()=>now),/verification refused/);
});
test('one recipient, one exact message and one concurrent attempt; no provider redirect',async()=>{
  const calls=[],e=env(),m=configure(e,cfg,async(...arg)=>{calls.push(arg);return Response.json({id});},()=>now);
  a.equal(e.ACCEPTANCE_RESEND_RECIPIENT,undefined);
  for(const shape of [{to:[to]},{to:'other@scenelink.app'},{cc:to},{from:to},{replyTo:to},{html:'x'},{subject:'Welcome to SceneLink'},
    {text:message.text.replace(origin,'https://scenelink.app')},{text:message.text+'\nextra'}])
    await a.rejects(m.send({...message,...shape}),/verification refused/);
  a.equal(calls.length,0);
  const [accept,refusal]=await Promise.allSettled([m.send(message),m.send(message)]);a.equal(refusal.status,'rejected');
  a.deepEqual(accept.value,{ok:true,messageId:id,attempts:1});a.equal(calls.length,1);a.equal(m.ready(),false);
  const [url,req]=calls[0]; a.equal(url,'https://api.resend.com/emails');a.equal(req.redirect,'error');a.equal(req.method,'POST');
  a.equal(req.headers['Idempotency-Key'],'scenelink-qa-verify-'+'a'.repeat(32));
  a.deepEqual(JSON.parse(req.body),{from:'SceneLink QA <verify@mail.scenelink.app>',to:[to],subject:message.subject,text:message.text});
});
test('expiry, network errors, oversize responses and rejected sends never retry or leak the provider error',async()=>{
  for(const fetcher of [async()=>{throw Error('private data');},async()=>new Response('nope',{status:429}),
    async()=>Response.json({id:'x'.repeat(2500)}),async()=>Response.json({id:'not-an-id'})]){
    const m=configure(env(),cfg,fetcher,()=>now);
    a.deepEqual(await m.send(message),{ok:false,error:'Isolated Resend delivery not confirmed',attempts:1});
    await a.rejects(m.send(message),/verification refused/);
  }
  let time=now;const m=configure(env(),cfg,()=>a.fail('Unexpected fetch'),()=>time);time+=1800000;
  await a.rejects(m.send(message),/verification refused/);
});
test('real app mailer delegates only when the isolated launcher is armed',async()=>{
  process.env.EMAIL_PROVIDER='disabled';
  const mailer=require('../../src/services/mailer');
  const m=configure(env(),cfg,async()=>Response.json({id}),()=>now);
  a.equal(mailer.isReady(),false);a.throws(()=>mailer.enableIsolatedVerification(m),/refused/);
  process.env.ACCEPTANCE_MODE='isolated-synthetic';mailer.enableIsolatedVerification(m);
  a.equal(mailer.isReady(),true);a.equal((await mailer.sendMail({...message,subject:'Welcome to SceneLink'})).ok,false);
  a.equal(mailer.isReady(),true);a.equal((await mailer.sendMail(message)).messageId,id);a.equal(mailer.isReady(),false);
});
