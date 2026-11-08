'use strict';
// Bounded server-to-provider upload. Never trust a browser-supplied asset URL/receipt.
const crypto = require('node:crypto');
const H = require('./shared');
const MAX_BYTES = 4 * 1024 * 1024;
function provider(env = process.env) {
  try {
    const u = new URL(env.CLOUDINARY_URL || '');
    if (u.protocol !== 'cloudinary:' || !/^[a-z0-9_-]+$/i.test(u.hostname) || !u.username || !u.password || !env.CLOUDINARY_UPLOAD_PRESET) return null;
    return { cloud: u.hostname, key: decodeURIComponent(u.username), secret: decodeURIComponent(u.password), preset: env.CLOUDINARY_UPLOAD_PRESET };
  } catch (_) { return null; }
}
function image(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_BYTES * 4 / 3) + 100) throw new H.HttpError(400, 'Image must be PNG, JPEG, or WebP, at most 4 MB');
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!m) throw new H.HttpError(400, 'Invalid image');
  const b = Buffer.from(m[2], 'base64');
  const valid = m[1] === 'png' ? b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : m[1] === 'jpeg' ? b[0] === 255 && b[1] === 216 && b[2] === 255 : b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP';
  if (!valid || b.length < 12 || b.length > MAX_BYTES || b.toString('base64') !== m[2]) throw new H.HttpError(400, 'Invalid or oversized image');
  return {bytes:b.length,mime:'image/'+m[1],data:value};
}
function assetURL(url, p, publicId) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com' || !u.pathname.startsWith('/'+p.cloud+'/image/upload/') || !u.pathname.endsWith('/'+publicId+'.webp') || u.username || u.password || u.search || u.hash) throw new H.HttpError(502, 'Invalid media-provider response');
  return u.href;
}
function install({router,pool,auth,write,fetchImpl=globalThis.fetch,env=process.env}) {
  router.get('/media/capability', H.noStore, (req,res)=>{const p=provider(env);res.json({enabled:!!p,provider:p?'cloudinary':null,max_bytes:MAX_BYTES,formats:['image/png','image/jpeg','image/webp'],contract:'server-upload-v1'});});
  router.post('/media/upload',auth.requireAuth,H.noStore,write,H.wrap(async(req,res)=>{
    const p=provider(env);if(!p)throw new H.HttpError(503,'Media storage is not configured');
    const kind=req.body?.kind;if(!['avatar','post'].includes(kind))throw new H.HttpError(400,'Invalid upload kind');
    const source=image(req.body?.data);const publicId=`scenelink/${req.user.id}/${kind}/${crypto.randomUUID()}`;
    const form=new URLSearchParams({file:source.data,public_id:publicId,upload_preset:p.preset,overwrite:'false',format:'webp'});
    let response,payload;
    try {
      response=await fetchImpl(`https://api.cloudinary.com/v1_1/${p.cloud}/image/upload`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(p.key+':'+p.secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(25000),redirect:'error'});
      payload=await response.json();
    }catch(_){throw new H.HttpError(503,'Image upload unavailable. Please retry.');}
    if(!response.ok)throw new H.HttpError(502,'The image provider could not accept this upload');
    if(payload.public_id!==publicId||payload.resource_type!=='image'||payload.format!=='webp')throw new H.HttpError(502,'Invalid media-provider response');
    if(Array.isArray(payload.moderation)&&payload.moderation.some(x=>x.status!=='approved'))return res.status(202).json({pending_review:true,message:'Image is awaiting provider moderation. It has not been attached to your account or post.'});
    const url=assetURL(payload.secure_url,p,publicId);
    const asset=await H.transaction(pool,async db=>{
      const r=await db.query(`INSERT INTO media_assets(owner_id,url,thumb_url,mime_type,width,height,bytes,kind) VALUES($1,$2,$2,'image/webp',$3,$4,$5,$6) RETURNING id,url,thumb_url,width,height,kind`,[req.user.id,url,Number(payload.width)||null,Number(payload.height)||null,Number(payload.bytes)||null,kind]);
      if(kind==='avatar')await db.query('UPDATE users SET avatar_url=$1,profile_revision=profile_revision+1,updated_at=NOW() WHERE id=$2',[url,req.user.id]);
      return r.rows[0];
    });res.status(201).json({asset});
  }));
  for(const route of ['/media/sign','/media/record'])router.post(route,auth.requireAuth,H.noStore,(req,res)=>res.status(409).json({error:'Update the app to use verified image uploads',code:'CLIENT_UPDATE_REQUIRED'}));
}
module.exports={install,provider,image,assetURL,MAX_BYTES};
