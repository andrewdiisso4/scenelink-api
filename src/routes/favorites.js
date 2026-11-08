const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const H = require('../launch/shared');
const {savedVenue,availableVenueSQL} = require('../services/venue-helpers');
const router = express.Router();
router.use(H.noStore);

async function lockFavorite(db,userId,venueId) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['scenelink:favorite:'+userId+':'+venueId]);
}
async function availableVenue(db,venueId) {
  const row=await db.query(`SELECT id FROM venues WHERE id=$1 AND ${availableVenueSQL('')} FOR SHARE`,[venueId]);
  if(!row.rows.length)throw new H.HttpError(404,'Venue unavailable');
}
router.get('/',requireAuth,H.wrap(async(req,res)=>{
  const result=await pool.query(`SELECT f.id,f.venue_id,f.created_at,
    v.name AS venue_name,v.slug AS venue_slug,v.type AS venue_type,v.image_url AS venue_image,
    NULL::numeric AS venue_rating,v.neighborhood AS venue_neighborhood,v.price_label AS venue_price,
    v.source,v.reservation_url,v.opentable_url,v.resy_url,v.website,(${availableVenueSQL('v')}) AS venue_available
    FROM favorites f JOIN venues v ON f.venue_id=v.id WHERE f.user_id=$1 ORDER BY f.created_at DESC,f.id`,[req.user.id]);
  res.json({favorites:result.rows.map(savedVenue)});
}));
// Legacy toggle remains supported, but all writes for a user/venue serialize.
// Prefer the explicit POST/DELETE endpoints for replay-safe network retries.
router.post('/toggle',requireAuth,H.wrap(async(req,res)=>{
  const venueId=H.id(req.body?.venue_id,'venue'),me=req.user.id;
  const favorited=await H.transaction(pool,async db=>{
    await lockFavorite(db,me,venueId);
    const old=await db.query('SELECT id FROM favorites WHERE user_id=$1 AND venue_id=$2',[me,venueId]);
    if(old.rows.length){await db.query('DELETE FROM favorites WHERE user_id=$1 AND venue_id=$2',[me,venueId]);return false;}
    await availableVenue(db,venueId);
    await db.query('INSERT INTO favorites(user_id,venue_id) VALUES($1,$2) ON CONFLICT(user_id,venue_id) DO NOTHING',[me,venueId]);return true;
  });res.json({favorited,venue_id:venueId});
}));
router.post('/:venueId',requireAuth,H.wrap(async(req,res)=>{
  const venueId=H.id(req.params.venueId,'venue'),me=req.user.id;
  await H.transaction(pool,async db=>{
    await lockFavorite(db,me,venueId);await availableVenue(db,venueId);
    await db.query('INSERT INTO favorites(user_id,venue_id) VALUES($1,$2) ON CONFLICT(user_id,venue_id) DO NOTHING',[me,venueId]);
  });res.json({ok:true,favorited:true,venue_id:venueId});
}));
router.delete('/:venueId',requireAuth,H.wrap(async(req,res)=>{
  const venueId=H.id(req.params.venueId,'venue'),me=req.user.id;
  await H.transaction(pool,async db=>{await lockFavorite(db,me,venueId);await db.query('DELETE FROM favorites WHERE user_id=$1 AND venue_id=$2',[me,venueId]);});
  res.json({ok:true,favorited:false,venue_id:venueId});
}));
module.exports=router;
