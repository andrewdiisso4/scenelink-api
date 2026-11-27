'use strict';
const serviceId='srv-dc2b7nifngtc73bbu81g';
const origin='https://scenelink-release-qa-20261123-smn6.onrender.com';
const endpoint='https://api.resend.com/emails';
const sender='SceneLink QA <verify@mail.scenelink.app>';
const subject='Verify your SceneLink email';
const refuse=()=>new Error('Isolated Resend verification refused');
function configure(env,config,fetcher=globalThis.fetch,clock=Date.now){
  const pre='ACCEPTANCE_RESEND_', pick=name=>env[pre+name];
  const mode=pick('MODE'),key=pick('KEY'),until=pick('UNTIL'),run=pick('RUN'),recipient=pick('RECIPIENT');
  for(const name of Object.keys(env))if(name.startsWith(pre))delete env[name];
  if(mode===undefined||mode==='off')return null;
  const expires=Date.parse(until||''), start=clock();
  if(mode!=='one-verification'||config.local||config.origin!==origin||env.RENDER_SERVICE_ID!==serviceId||
     env.RENDER_EXTERNAL_URL!==origin||!/^re_[A-Za-z0-9_-]{12,240}$/.test(key||'')||
     !/^[a-z0-9]+(?:[._+-][a-z0-9]+)*@scenelink\.app$/.test(recipient||'')||recipient.length>80||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(until||'')||!Number.isFinite(expires)||
     expires<=start||expires-start>3600000||!/^[a-f0-9]{32}$/.test(run||'')||typeof fetcher!=='function')throw refuse();
  let attempted=false;
  const ready=()=>!attempted&&clock()<expires;
  async function send(opts){
    if(!ready()||!opts||typeof opts.to!=='string'||opts.to.toLowerCase()!==recipient||
      opts.subject!==subject||typeof opts.text!=='string'||opts.text.length>600||
      Object.keys(opts).some(k=>!['to','subject','text'].includes(k)))throw refuse();
    const prefix='Confirm your email to participate on SceneLink. This link expires in 24 hours: '+origin+'/verify-email.html#token=';
    const suffix='\nIf you did not request this, ignore this email.';
    if(!opts.text.startsWith(prefix)||!opts.text.endsWith(suffix)||
       !/^[a-f0-9]{64}$/.test(opts.text.slice(prefix.length,-suffix.length)))throw refuse();
    attempted=true;
    try {
      const reply=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'scenelink-qa-verify-'+run},
        body:JSON.stringify({from:sender,to:[recipient],subject,text:opts.text})});
      if(!reply.ok||!/^application\/json\b/i.test(reply.headers.get('content-type')||'')){await reply.body?.cancel();throw refuse();}
      const reader=reply.body.getReader(),chunks=[];let length=0;
      try{
        for(;;){ const {done,value}=await reader.read();if(done)break;length+=value.length;
          if(length>2048){await reader.cancel();throw refuse();}chunks.push(value); }
      }finally{reader.releaseLock();}
      const id=JSON.parse(Buffer.concat(chunks).toString('utf8')).id;
      if(typeof id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw refuse();
      return {ok:true,messageId:id,attempts:1};
    }catch{return {ok:false,error:'Isolated Resend delivery not confirmed',attempts:1};}
  }
  return Object.freeze({ready,send});
}
module.exports={configure};
