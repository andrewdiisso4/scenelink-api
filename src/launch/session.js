'use strict';
const crypto=require('node:crypto');
const {UUID}=require('./shared');
function makeAuth({jwt,pool,secret,adminSecret}) {
  if(typeof secret!=='string'||Buffer.byteLength(secret.trim())<32||/change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(?:jwt[-_ ]?)?secret/i.test(secret))throw new Error('JWT_SECRET must be a non-placeholder secret of at least 32 bytes');
  const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
  const generateToken=user=>jwt.sign({id:user.id,role:user.role,v:Number(user.auth_version||0),jti:crypto.randomUUID()},secret,{expiresIn:'7d',algorithm:'HS256'});
  const generateBusinessToken=user=>jwt.sign({id:user.id,role:'business',kind:'business',v:Number(user.auth_version||0),jti:crypto.randomUUID()},secret,{expiresIn:'7d',algorithm:'HS256'});
  async function check(req,res,next,optional,business=false) {
    res.setHeader('Cache-Control','private, no-store');
    const header=req.headers.authorization;
    if(!header){if(optional)return next();return res.status(401).json({error:'Authentication required'});}
    let decoded,token;
    try{
      if(typeof header!=='string'||header.length>8192||!/^Bearer [^\s]+$/.test(header))throw Error();token=header.slice(7);
      decoded=jwt.verify(token,secret,{algorithms:['HS256']});
      if(!UUID.test(decoded.id)||!Number.isInteger(decoded.exp)||!Number.isInteger(decoded.v??0))throw Error();
      if(business ? decoded.kind!=='business' : decoded.kind==='business')throw Error();
    }catch(_){return res.status(401).json({error:'Invalid or expired session'});}
    const tokenHash=hash(token);let user;
    try{
      const r=business ? await pool.query(`SELECT u.id,u.email,'business' AS role,u.auth_version
        FROM business_users u WHERE u.id=$1 AND u.status='active' AND u.auth_version=$2
        AND NOT EXISTS(SELECT 1 FROM business_auth_revocations r WHERE r.token_hash=$3 AND r.expires_at>NOW())`,[decoded.id,decoded.v??0,tokenHash]) : await pool.query(`SELECT u.id,u.email,u.role,u.auth_version,u.is_private,u.allow_messages,u.email_verified_at,u.verified_email
        FROM users u WHERE u.id=$1 AND u.is_active IS TRUE AND COALESCE(u.is_suspended,false)=false
        AND u.auth_version=$2 AND NOT EXISTS(SELECT 1 FROM auth_revocations r WHERE r.token_hash=$3 AND r.expires_at>NOW())`,[decoded.id,decoded.v??0,tokenHash]);user=r.rows[0];
    }catch(_){return res.status(503).json({error:'Session verification unavailable. Please retry.'});}
    if(!user)return res.status(401).json({error:'Session expired or revoked'});
    if(!business && !['GET','HEAD','OPTIONS'].includes(req.method) && !require('./verification').verified(user)) {
      const path=(req.originalUrl||req.url||'').split('?')[0].replace(/\/+$/,'').toLowerCase();
      const withdrawingOwnRsvp=req.method==='DELETE'&&/^\/api\/events\/[0-9a-f-]{36}\/rsvp$/.test(path);
      const deletingOwnMessage=req.method==='DELETE'&&/^\/api\/conversations\/[0-9a-f-]{36}\/messages\/[0-9a-f-]{36}$/.test(path);
      const withdrawingListMembership=req.method==='DELETE'&&/^\/api\/lists\/[0-9a-f-]{36}\/members\/[0-9a-f-]{36}$/.test(path);
      const decliningList=req.method==='PUT'&&/^\/api\/lists\/[0-9a-f-]{36}\/invitation$/.test(path)&&req.body?.response==='declined';
      if(!withdrawingListMembership && !decliningList && !deletingOwnMessage && !withdrawingOwnRsvp && !['/api/auth/verification/request','/api/auth/logout','/api/auth/logout-all','/api/auth/account','/api/users/me/settings','/api/reports'].includes(path) && !/^\/api\/users\/[0-9a-f-]{36}\/block$/i.test(path))return res.status(403).json({error:'Verify your email before participating on SceneLink.',code:'EMAIL_VERIFICATION_REQUIRED'});
    }
    req.user=user;req.authTokenHash=tokenHash;req.authExpires=decoded.exp;
    res.setHeader('Cache-Control','private, no-store');return next();
  }
  const requireAuth=(req,res,next)=>check(req,res,next,false),optionalAuth=(req,res,next)=>check(req,res,next,true);
  const requireBusinessAuth=(req,res,next)=>check(req,res,next,false,true);
  function requireAdmin(req,res,next){
    const got=req.headers['x-admin-secret'];
    if(typeof got==='string'&&adminSecret){const a=Buffer.from(got),b=Buffer.from(adminSecret);if(a.length===b.length&&crypto.timingSafeEqual(a,b)){req.admin={via:'secret'};return next();}}
    return requireAuth(req,res,()=>{if(req.user.role!=='admin')return res.status(403).json({error:'Admin access required'});req.admin={via:'jwt',userId:req.user.id};return next();});
  }
  return{generateToken,generateBusinessToken,requireAuth,requireBusinessAuth,optionalAuth,requireAdmin,JWT_SECRET:secret};
}
module.exports={makeAuth};
