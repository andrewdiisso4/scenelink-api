'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const pool=require('../config/database');
const auth=require('../middleware/auth');
const H=require('./shared');
const router=express.Router();
const authLimit=rateLimit({windowMs:900000,max:30,standardHeaders:true,legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again later.'}});
const resetLimit=rateLimit({windowMs:900000,max:5,standardHeaders:true,legacyHeaders:false,message:{error:'Too many recovery requests. Try again later.'}});
const CONTRACT='social-search-2026-09-09';
// User identity is authenticated before write limiting; no raw forwarded headers.
const write=rateLimit({windowMs:60000,max:90,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Too many actions. Wait a minute and try again.'}});
const upload=rateLimit({windowMs:3600000,max:15,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Upload limit reached. Please try again later.'}});
router.get('/launch/capabilities',H.noStore,H.wrap(async(req,res)=>{
  const schema=await pool.query('SELECT version FROM launch_schema_versions WHERE version=$1',[CONTRACT]);
  if(!schema.rows.length)throw new H.HttpError(503,'Schema upgrade required');
  const rooms=await pool.query("SELECT version FROM launch_schema_versions WHERE version='connected-rooms-2026-09-09'");
  const rsvps=await pool.query("SELECT version FROM launch_schema_versions WHERE version='event-rsvps-2026-10-30'");
  const lists=await pool.query("SELECT version FROM launch_schema_versions WHERE version='private-list-invitations-2026-11-09'");
  const social=await pool.query("SELECT version FROM launch_schema_versions WHERE version='social-profile-messaging-2026-10-30'");
  res.json({contract:CONTRACT,features:{private_list_invitations:lists.rows.length>0,email_verification:true,profiles:true,profile_editing:social.rows.length>0,external_social_links:social.rows.length>0,verified_social_accounts:false,earned_achievements:social.rows.length>0,private_people_search:social.rows.length>0,message_edits:social.rows.length>0,message_deletion:social.rows.length>0,message_change_sync:social.rows.length>0,opt_in_read_receipts:social.rows.length>0,message_attachments:false,typing_indicators:false,presence:false,feed:true,friends:true,messages:true,venue_search:true,private_profiles:true,post_audiences:true,session_revocation:true,group_creation:false,decision_rooms:rooms.rows.length>0,event_rsvps:rsvps.rows.length>0,event_source_review:rsvps.rows.length>0,provider_reservations:false,realtime:'visible-page-polling'},release:process.env.RENDER_GIT_COMMIT||null});
}));
router.post('/auth/logout',auth.requireAuth,H.noStore,H.wrap(async(req,res)=>{
  await pool.query('INSERT INTO auth_revocations(token_hash,user_id,expires_at) VALUES($1,$2,to_timestamp($3)) ON CONFLICT(token_hash) DO NOTHING',[req.authTokenHash,req.user.id,req.authExpires]);res.json({ok:true,revoked:true});
}));
router.post('/auth/logout-all',auth.requireAuth,H.noStore,write,H.wrap(async(req,res)=>{
  await pool.query('UPDATE users SET auth_version=auth_version+1,updated_at=NOW() WHERE id=$1',[req.user.id]);res.json({ok:true,revoked_all:true});
}));
require('./verification').install({router,pool,auth,resetLimit,mailer:require('../services/mailer')});
require('./identity').install({router,pool,auth,write,authLimit,resetLimit,bcrypt:require('bcryptjs'),mailer:require('../services/mailer')});
for(const name of ['people','posts','messages','discovery','notifications','rooms','events'])require('./'+name).install({router,pool,auth,write});
require('./media').install({router,pool,auth,write:upload});
// Do not silently fall through to older handlers with weaker permissions.
for(const prefix of ['/users','/posts','/checkins','/friends','/conversations','/media','/rooms','/venues','/events','/search','/social','/notifications','/reports'])router.use(prefix,H.noStore,(req,res)=>res.status(404).json({error:'Endpoint not found'}));
module.exports=router;
