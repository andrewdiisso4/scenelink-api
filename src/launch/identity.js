'use strict';
const crypto=require('node:crypto');
const H=require('./shared');
const SELF='id,email,username,display_name,avatar_url,bio,neighborhood,city,role,created_at,is_private,allow_messages,profile_revision,social_links,discoverable,show_achievements,share_read_receipts,(email_verified_at IS NOT NULL AND verified_email=lower(email)) AS email_verified';
function password(value){if(typeof value!=='string'||value.length<8||Buffer.byteLength(value,'utf8')>72||value.includes('\u0000'))throw new H.HttpError(400,'Use a password of at least 8 characters and at most 72 UTF-8 bytes');return value;}
function email(value){const s=H.text(value,'email',254,{required:true}).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new H.HttpError(400,'Enter a valid email');return s;}
function username(value){const s=H.text(value,'username',24,{required:true}).toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(s))throw new H.HttpError(400,'Username must be 3–24 letters, numbers or underscores');return s;}
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function install({router,pool,auth,write,authLimit,resetLimit,bcrypt,mailer,env=process.env}){
  const secured=[auth.requireAuth,H.noStore];
  router.get('/auth/username-available',H.noStore,H.wrap(async(req,res)=>{const name=username(req.query.u||req.query.username);const r=await pool.query('SELECT id FROM users WHERE lower(username)=$1',[name]);res.json({available:!r.rows.length,valid:true,username:name});}));
  router.post('/auth/signup',H.noStore,authLimit,H.wrap(async(req,res)=>{
    const b=req.body||{},em=email(b.email),pw=password(b.password),name=username(b.username),display=H.text(b.display_name||name,'display name',80,{required:true});
    const hash=await bcrypt.hash(pw,12);
    const r=await pool.query(`INSERT INTO users(email,password_hash,username,display_name,avatar_url,bio,neighborhood) VALUES($1,$2,$3,$4,NULL,'','') RETURNING ${SELF},auth_version`,[em,hash,name,display]);
    const user=r.rows[0],token=auth.generateToken(user);delete user.auth_version;
    // Welcome mail is optional; account persistence does not depend on mail delivery.
    if(mailer?.isReady())setImmediate(async()=>{try{await mailer.sendMail({to:user.email,...mailer.welcomeEmail(user)});}catch(_){console.error('[identity] welcome-mail-failed');}});
    res.status(201).json({user,token,verification_required:!user.email_verified,verification_delivery:mailer?.isReady()?'not_requested':'unavailable'});
  }));
  router.post('/auth/login',H.noStore,authLimit,H.wrap(async(req,res)=>{
    const em=email(req.body?.email),pw=req.body?.password;
    // Login verifies existing credentials; new-password policy belongs to signup/reset.
    if(typeof pw!=='string'||!pw.length||Buffer.byteLength(pw,'utf8')>72||pw.includes('\u0000'))throw new H.HttpError(401,'Invalid email or password');
    const r=await pool.query(`SELECT ${SELF},password_hash,auth_version,is_active,is_suspended FROM users WHERE lower(email)=$1`,[em]);const user=r.rows[0];
    if(!user||!user.is_active||user.is_suspended||!user.password_hash||!await bcrypt.compare(pw,user.password_hash))throw new H.HttpError(401,'Invalid email or password');
    const token=auth.generateToken(user);for(const k of ['password_hash','auth_version','is_active','is_suspended'])delete user[k];res.json({user,token});
  }));
  router.get('/auth/me',...secured,H.wrap(async(req,res)=>{const r=await pool.query(`SELECT ${SELF},oauth_provider FROM users WHERE id=$1`,[req.user.id]);if(!r.rows.length)throw new H.HttpError(401,'Account unavailable');res.json({user:r.rows[0]});}));
  router.post('/auth/forgot-password',H.noStore,resetLimit,H.wrap(async(req,res)=>{
    const em=email(req.body?.email);
    if(!mailer?.isReady())throw new H.HttpError(503,'Password recovery email is not configured');
    const generic={ok:true,message:'If this account is eligible, a password reset email has been requested. Check your inbox and spam folder.'};
    const token=crypto.randomBytes(32).toString('hex');
    const r=await pool.query(`UPDATE users SET reset_token=$2,reset_token_expires=NOW()+INTERVAL '1 hour' WHERE lower(email)=$1 AND is_active IS TRUE AND COALESCE(is_suspended,false)=false RETURNING id,email,display_name`,[em,digest(token)]);
    if(r.rows.length){const user=r.rows[0];const base=new URL(env.APP_BASE_URL||'https://scenelink.app');if(base.protocol!=='https:'&&env.NODE_ENV==='production')throw new H.HttpError(503,'Password recovery origin is misconfigured');
      const reset=new URL('/reset-password.html',base);reset.hash='token='+token; // fragment avoids HTTP/referrer/query logs
      try{const mail=await mailer.sendMail({to:user.email,...mailer.passwordResetEmail({name:user.display_name,resetUrl:reset.href})});if(!mail.ok)console.error('[identity] reset-mail-not-delivered');}catch(_){console.error('[identity] reset-mail-failed');}}
    res.status(202).json(generic);
  }));
  router.post('/auth/reset-password',H.noStore,resetLimit,H.wrap(async(req,res)=>{
    const token=H.text(req.body?.token,'reset token',64,{required:true});if(!/^[0-9a-f]{64}$/.test(token))throw new H.HttpError(400,'Invalid or expired reset link');const pw=password(req.body?.password),hash=await bcrypt.hash(pw,12);
    // Token consumption and session version increment happen in ONE guarded UPDATE.
    const r=await pool.query(`UPDATE users SET password_hash=$1,reset_token=NULL,reset_token_expires=NULL,auth_version=auth_version+1,updated_at=NOW()
      WHERE reset_token=$2 AND reset_token_expires>NOW() AND is_active IS TRUE AND COALESCE(is_suspended,false)=false RETURNING id`,[hash,digest(token)]);
    if(!r.rows.length)throw new H.HttpError(400,'Invalid or expired reset link');res.json({ok:true,message:'Password updated. All prior sessions are revoked. Sign in again.'});
  }));
  router.delete('/auth/account',...secured,write,H.wrap(async(req,res)=>{
    const reason=H.text(req.body?.reason,'reason',500),pw=req.body?.password;
    await H.transaction(pool,async db=>{
      const r=await db.query('SELECT id,email,password_hash FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);const u=r.rows[0];if(!u)throw new H.HttpError(401,'Account unavailable');
      // OAuth-only accounts must set a password by verified-email recovery first.
      if(!u.password_hash)throw new H.HttpError(400,'Set a password using email recovery before deleting this account');
      if(typeof pw!=='string'||Buffer.byteLength(pw)>72||!await bcrypt.compare(pw,u.password_hash))throw new H.HttpError(400,'Password confirmation is incorrect');
      await db.query('INSERT INTO user_deletions(user_id,email_hash,deletion_reason,ip_address) VALUES($1,$2,$3,$4)',[u.id,digest(u.email.toLowerCase()),reason,String(req.ip||'').slice(0,100)]);
      await db.query('DELETE FROM users WHERE id=$1',[u.id]);
    });res.json({ok:true,deleted:true});
  }));
}
module.exports={install,password,email,username,digest,SELF};
