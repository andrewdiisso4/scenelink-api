'use strict';
const crypto=require('node:crypto');
const H=require('./shared');
const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
const GENERIC={ok:true,message:'If verification is needed, an email has been requested. Check your inbox and spam folder.'};
function verified(user){return !!user.email_verified_at && String(user.verified_email||'').toLowerCase()===String(user.email||'').toLowerCase();}
function install({router,pool,auth,mailer,env=process.env}){
 const rateLimit=require('express-rate-limit');
 const requestLimit=rateLimit({windowMs:3600000,max:10,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Too many verification requests. Please try later.',code:'VERIFICATION_RATE_LIMITED'}});
 const confirmLimit=rateLimit({windowMs:900000,max:30,standardHeaders:true,legacyHeaders:false,message:{error:'Too many verification attempts. Please try later.',code:'VERIFICATION_RATE_LIMITED'}});
 router.post('/auth/verification/request',auth.requireAuth,H.noStore,requestLimit,H.wrap(async(req,res)=>{
  // Authenticated, current-account only: supplied email/IDs cannot target another user.
  if(!mailer?.isReady())throw new H.HttpError(503,'Verification email is not configured. Your account remains read-only.','VERIFICATION_UNAVAILABLE');
  const origin=new URL(env.APP_BASE_URL||'https://scenelink.app');
  if(origin.protocol!=='https:' && env.NODE_ENV==='production')throw new H.HttpError(503,'Verification email origin is misconfigured','VERIFICATION_UNAVAILABLE');
  const raw=crypto.randomBytes(32).toString('hex');
  const user=await H.transaction(pool,async db=>{
   const r=await db.query('SELECT id,email,email_verified_at,verified_email FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);const u=r.rows[0];
   if(!u||verified(u))return null;
   const limits=await db.query("SELECT count(*)::int AS n,COALESCE(bool_or(created_at>NOW()-INTERVAL '60 seconds'),false) AS recent FROM email_verification_tokens WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",[u.id]);
   if(limits.rows[0].recent||limits.rows[0].n>=5)throw new H.HttpError(429,'Please wait before requesting another verification email.','VERIFICATION_RATE_LIMITED');
   await db.query('UPDATE email_verification_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL',[u.id]);
   await db.query("INSERT INTO email_verification_tokens(token_hash,user_id,email,expires_at) VALUES($1,$2,lower($3),NOW()+INTERVAL '24 hours')",[digest(raw),u.id,u.email]);return u;
  });
  if(user){
   const link=new URL('/verify-email.html',origin);link.hash='token='+raw;
   let sent;try{sent=await mailer.sendMail({to:user.email,subject:'Verify your SceneLink email',text:'Confirm your email to participate on SceneLink. This link expires in 24 hours: '+link.href+'\nIf you did not request this, ignore this email.'});}catch(_){sent={ok:false};}
   if(!sent?.ok){await pool.query('UPDATE email_verification_tokens SET consumed_at=NOW() WHERE token_hash=$1',[digest(raw)]);throw new H.HttpError(503,'Verification email could not be sent. Please retry later.','VERIFICATION_UNAVAILABLE');}
  }
  res.status(202).json(GENERIC);
 }));
 router.post('/auth/verification/confirm',H.noStore,confirmLimit,H.wrap(async(req,res)=>{
  const raw=req.body?.token;if(typeof raw!=='string'||!/^[a-f0-9]{64}$/.test(raw))throw new H.HttpError(400,'Invalid or expired verification link');
  await H.transaction(pool,async db=>{
   // Lock account first, matching resend lock order; stale email and tokens fail closed.
   const r=await db.query(`SELECT u.id,u.email FROM users u JOIN email_verification_tokens t ON t.user_id=u.id
    WHERE t.token_hash=$1 AND t.consumed_at IS NULL AND t.expires_at>NOW() AND t.email=lower(u.email)
    AND u.is_active IS TRUE AND COALESCE(u.is_suspended,false)=false FOR UPDATE OF u`,[digest(raw)]);
   if(!r.rows.length)throw new H.HttpError(400,'Invalid or expired verification link');const u=r.rows[0];
   const used=await db.query('UPDATE email_verification_tokens SET consumed_at=NOW() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() RETURNING user_id',[digest(raw)]);
   if(!used.rows.length)throw new H.HttpError(400,'Invalid or expired verification link');
   await db.query('UPDATE users SET email_verified_at=NOW(),verified_email=lower(email),auth_version=auth_version+1,updated_at=NOW() WHERE id=$1',[u.id]);
   await db.query('UPDATE email_verification_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL',[u.id]);
  });
  res.json({ok:true,message:'Email verified. Sign in again to continue.'});
 }));
}
module.exports={install,verified,digest};
