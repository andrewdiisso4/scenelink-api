'use strict';
const {create}=require('../../src/services/resend-signup');
const service='srv-dc2b7nifngtc73bbu81g';
const origin='https://scenelink-release-qa-20261123-smn6.onrender.com';
const endpoint='https://api.resend.com/emails';
const allowed=new Set(['signup-welcome','newsletter-confirm']);
const stop=()=>new Error('Acceptance refused: signup inbox is not safely configured');
const disabled={ok:false,skipped:true,reason:'mailer-not-ready'};
function configure(env,config,fetcher=globalThis.fetch,clock=Date.now){
 const prefix='ACCEPTANCE_SIGNUP_INBOX_', get=key=>env[prefix+key];
 const mode=get('MODE'),key=get('KEY'),run=get('RUN'),until=get('UNTIL'),cutoff=get('WELCOME_NOT_BEFORE'),inbox=get('RECIPIENT');
 for(const name of Object.keys(env))if(name.startsWith(prefix))delete env[name];
 if(mode===undefined||mode==='off')return null;
 const start=clock(),expires=Date.parse(until),floor=Date.parse(cutoff);
 if(mode!=='welcome-and-newsletter'||config.local||config.origin!==origin||env.RENDER_SERVICE_ID!==service||
    env.RENDER_EXTERNAL_URL!==origin||inbox!=='info@scenelink.app'||!/^[a-f0-9]{32}$/.test(run||'')||
    !/^re_[A-Za-z0-9_-]{12,240}$/.test(key||'')||typeof fetcher!=='function'||
    ![until,cutoff].every(s=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s||'')&&Number.isFinite(Date.parse(s)))||
    expires<=start||expires-start>3600000||floor>start||start-floor>900000)throw stop();
 return async (pool,mailer)=>{
  await pool.query('CREATE TABLE IF NOT EXISTS acceptance_signup_inbox_attempts(run_id text NOT NULL, purpose text NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,purpose))');
  const send=mailer.sendMail.bind(mailer);
  const ready=mailer.isReadyFor.bind(mailer);
  const attempted=new Set();
  const isReadyFor=purpose=>allowed.has(purpose)?clock()<expires&&!attempted.has(purpose):ready(purpose);
  mailer.welcomeNotBefore=cutoff;
  mailer.isReadyFor=isReadyFor;
  mailer.sendMail=async opts=>{
   if(!allowed.has(opts?.purpose))return send(opts);
   const purpose=opts.purpose;
   if(!isReadyFor(purpose))return disabled;
   // Signup on the private site uses a reserved fixture address. Newsletter
   // accepts the same fixture address; only the backend maps it to our inbox.
   if(opts.to?.address!=='scenelink-mail-check@example.invalid')return {ok:false};
   if(typeof opts.text!=='string'||typeof opts.html!=='string'||opts.html.length>25000||opts.text.length>4000)return {ok:false};
   const subject=purpose==='signup-welcome'?'Welcome to SceneLink':'Confirm your SceneLink newsletter signup';
   if(opts.subject!==subject||!opts.text.includes(origin+'/'))return {ok:false};
   attempted.add(purpose);
   const claim=await pool.query('INSERT INTO acceptance_signup_inbox_attempts(run_id,purpose) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING purpose',[run,purpose]);
   if(!claim.rows.length)return {ok:false};
   if(clock()>=expires)return {ok:false};
   const adapter=create({env:{SIGNUP_MAIL_TRANSPORT:'resend',RESEND_SIGNUP_API_KEY:key,RESEND_SIGNUP_WELCOME_NOT_BEFORE:cutoff},
     fetcher:async (url,init)=>{
      if(url!==endpoint||init.method!=='POST'||init.redirect!=='error'||clock()>=expires)throw stop();
      const response=await fetcher(url,{...init,headers:{...init.headers,'Idempotency-Key':'scenelink-signup-qa-'+run+'-'+purpose}});
      if(!response.ok||!/^application\/json\b/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw stop();}
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw stop();}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
      const id=JSON.parse(Buffer.concat(chunks).toString('utf8')).id;
      if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||''))throw stop();
      return {ok:true,json:async()=>({id})};
     }});
   const result=await adapter.send({...opts,to:{address:inbox}});
   // Log only the class and delivery acceptance, never recipients/tokens/body.
   console.log('[acceptance] signup inbox '+purpose+' '+(result.ok?'accepted by provider; inbox check pending':'outcome not confirmed; no automatic retry'));
   return result;
  };
 };
}
module.exports={configure};
