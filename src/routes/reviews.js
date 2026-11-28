const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const H = require('../launch/shared');
const { availableVenueSQL } = require('../services/venue-helpers');

const router = express.Router();
const write = rateLimit({windowMs:60000, max:90, standardHeaders:true, legacyHeaders:false,
  keyGenerator:req => req.user.id, message:{error:'Too many actions. Wait a minute and try again.'}});

// UUID format validator
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/reviews?venue_id=xxx
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { venue_id } = req.query;
    if (!venue_id) return res.status(400).json({ error: 'venue_id is required' });
    if (!UUID_RE.test(venue_id)) return res.status(400).json({ error: 'Invalid venue_id format', reviews: [] });

    const result = await pool.query(
      `SELECT r.id, r.rating, r.content, r.created_at,
              u.display_name, u.avatar_url
       FROM reviews r JOIN users u ON r.user_id = u.id
       WHERE r.venue_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
      [venue_id]
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    console.error('Reviews error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reviews
router.post('/', requireAuth, H.noStore, write, H.wrap(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new H.HttpError(400, 'Expected a review');
  const venueId = H.id(body.venue_id, 'venue_id'), rating = body.rating;
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new H.HttpError(400, 'Rating must be a number between 1 and 5');
  }
  const content = H.text(body.content, 'review', 2000);
  const review = await H.transaction(pool, async db => {
    // This legacy POST remains mounted after the canonical review read route.
    // Apply the same narrow fixture policy before either review or rating writes.
    const participant = await db.query(
      `SELECT u.id FROM users u WHERE u.id = $1 AND ${H.nonFixtureSQL()}`,
      [req.user.id]
    );
    if (!participant.rows.length) throw new H.HttpError(403, 'Social participation unavailable');

    // Lock before inserting so concurrent reviews serialize their aggregate updates.
    // The availability check is re-evaluated if a venue update held this row first.
    const venue = await db.query(`SELECT id FROM venues WHERE id=$1 AND ${availableVenueSQL('')} FOR UPDATE`, [venueId]);
    if (!venue.rows.length) throw new H.HttpError(404, 'Venue unavailable');
    const result = await db.query(
      `INSERT INTO reviews (user_id, venue_id, rating, content) VALUES ($1, $2, $3, $4)
       RETURNING id, rating, content, created_at`,
      [req.user.id, venueId, rating, content]
    );

    // Update venue rating
    await db.query(
      `UPDATE venues SET
        rating = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE venue_id = $1),
        review_count = (SELECT COUNT(*) FROM reviews WHERE venue_id = $1),
        updated_at = NOW()
       WHERE id = $1`,
      [venueId]
    );

    return result.rows[0];
  });
  res.status(201).json({ review });
}));

module.exports = router;
