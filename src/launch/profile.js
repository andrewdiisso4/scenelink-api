'use strict';
const H=require('./shared');
const {isDeepStrictEqual}=require('node:util');
const PROVIDERS=Object.freeze({
 instagram:{host:'instagram.com',hosts:['instagram.com','www.instagram.com'],path:/^\/[A-Za-z0-9_][A-Za-z0-9_.]{0,29}\/?$/},
 facebook:{host:'facebook.com',hosts:['facebook.com','www.facebook.com'],path:/^\/[A-Za-z0-9][A-Za-z0-9.]{2,79}\/?$/},
 tiktok:{host:'www.tiktok.com',hosts:['tiktok.com','www.tiktok.com'],path:/^\/@[A-Za-z0-9_][A-Za-z0-9_.]{1,23}\/?$/},
 x:{host:'x.com',hosts:['x.com','www.x.com','twitter.com','www.twitter.com'],path:/^\/[A-Za-z0-9_]{1,15}\/?$/},
 youtube:{host:'www.youtube.com',hosts:['youtube.com','www.youtube.com'],path:/^\/(?:@[A-Za-z0-9_.-]{3,30}|channel\/UC[A-Za-z0-9_-]{20,30})\/?$/},
 linkedin:{host:'www.linkedin.com',hosts:['linkedin.com','www.linkedin.com'],path:/^\/in\/[A-Za-z0-9][A-Za-z0-9-]{1,99}\/?$/},
 snapchat:{host:'www.snapchat.com',hosts:['snapchat.com','www.snapchat.com'],path:/^\/add\/[A-Za-z][A-Za-z0-9_.-]{2,14}\/?$/}
});
const RESERVED=new Set(['accounts','account','login','logout','signup','register','oauth','auth','redirect','share','sharer','intent','home','explore','search','settings','privacy','terms','help','support','about','reels','stories','watch','gaming','marketplace','groups','events','notifications','messages','download']);
function socialLinks(value){
 if(!Array.isArray(value)||value.length>7)throw new H.HttpError(400,'Provide up to seven external profile links');
 const seen=new Set();
 return value.map(link=>{
  if(!link||typeof link!=='object'||Array.isArray(link)||typeof link.provider!=='string'||!Object.hasOwn(PROVIDERS,link.provider))throw new H.HttpError(400,'Unsupported social profile provider');
  if(seen.has(link.provider))throw new H.HttpError(400,'Only one profile link per provider');seen.add(link.provider);
  if(link.verified!==undefined&&link.verified!==false||link.kind!==undefined&&link.kind!=='external_profile')throw new H.HttpError(400,'External links are not verified accounts');
  const cfg=PROVIDERS[link.provider];let u;
  try {
   if(typeof link.url!=='string'||link.url.length>400||/[\s\\%]/.test(link.url))throw Error();
   u=new URL(link.url);
   if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!cfg.hosts.includes(u.hostname)||!cfg.path.test(u.pathname)||RESERVED.has(u.pathname.split('/')[1].toLowerCase()))throw Error();
  }catch(_){throw new H.HttpError(400,'Use a direct HTTPS '+link.provider+' profile URL without tracking, credentials or redirects');}
  u.hostname=cfg.host;u.pathname=u.pathname.replace(/\/$/,'');
  return{provider:link.provider,url:u.href,kind:'external_profile',verified:false};
 }).sort((a,b)=>a.provider.localeCompare(b.provider));
}
const SETTINGS=['is_private','allow_messages','discoverable','show_achievements','share_read_receipts'];
const EDITABLE=['display_name','bio','neighborhood','city','username','avatar_url','social_links'];
function expectedRevision(value){if(value===undefined)return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>2147483646)throw new H.HttpError(400,'Provide a positive integer profile revision');return value;}
async function update(pool,me,b,settings=false){
 if(!b||typeof b!=='object'||Array.isArray(b))throw new H.HttpError(400,'Provide profile changes');
 const allowed=settings?SETTINGS:EDITABLE;
 for(const key of Object.keys(b))if(key!=='revision'&&!allowed.includes(key))throw new H.HttpError(400,'Unsupported profile field: '+key);
 const revision=expectedRevision(b.revision),changes={};
 for(const [key,max] of [['display_name',80],['bio',500],['neighborhood',80],['city',80]])if(b[key]!==undefined)changes[key]=H.text(b[key],key,max,{required:key==='display_name'});
 if(b.username!==undefined)changes.username=require('./identity').username(b.username);
 if(b.avatar_url!==undefined)changes.avatar_url=H.https(b.avatar_url);
 if(b.social_links!==undefined)changes.social_links=socialLinks(b.social_links);
 for(const key of SETTINGS)if(b[key]!==undefined){if(key==='allow_messages'){if(!['everyone','friends','none'].includes(b[key]))throw new H.HttpError(400,'Invalid message permission');}else if(typeof b[key]!=='boolean')throw new H.HttpError(400,key+' must be true or false');changes[key]=b[key];}
 if(!Object.keys(changes).length)throw new H.HttpError(400,'No profile changes provided');
 return H.transaction(pool,async db=>{
  const old=(await db.query('SELECT '+require('./identity').SELF+' FROM users WHERE id=$1 FOR UPDATE',[me])).rows[0];
  if(!old)throw new H.HttpError(401,'Account unavailable');
  if(changes.avatar_url){const owned=await db.query("SELECT id FROM media_assets WHERE owner_id=$1 AND url=$2 AND kind='avatar' LIMIT 1",[me,changes.avatar_url]);if(!owned.rows.length)throw new H.HttpError(400,'Upload an avatar to your account first');}
  const same=Object.entries(changes).every(([k,v])=>isDeepStrictEqual(old[k]??null,v));
  if(same)return{user:old,replayed:true};
  if(revision!==null&&revision!==old.profile_revision)throw new H.HttpError(409,'Your profile changed elsewhere. Refresh before saving.','STALE_PROFILE');
  const values=[me],sets=Object.entries(changes).map(([k,v])=>{values.push(k==='social_links'?JSON.stringify(v):v);return k+'=$'+values.length+(k==='social_links'?'::jsonb':'');});
  const row=(await db.query('UPDATE users SET '+sets.join(',')+',profile_revision=profile_revision+1,updated_at=NOW() WHERE id=$1 RETURNING '+require('./identity').SELF,values)).rows[0];
  return{user:row,replayed:false};
 });
}
module.exports={PROVIDERS,SETTINGS,EDITABLE,socialLinks,expectedRevision,update};
