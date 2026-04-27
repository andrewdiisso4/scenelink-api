/**
 * SceneLink — Check-ins
 * Endpoints:
 *   GET  /api/checkins                — own check-ins
 *   POST /api/checkins                — { venue_id, note? }
 *   GET  /api/checkins/venue/:venueId — recent public check-ins at a venue
 */
const express = require('express');
const pool = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET own check-ins
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.id, c.venue_id, c.note, c.created_at,
              v.name AS venue_name, v.slug AS venue_slug, v.image_url AS venue_image,
              v.neighborhood AS venue_neighborhood
         FROM checkins c JOIN venues v ON c.venue_id = v.id
        WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ checkins: r.rows });
  } catch (err) {
    console.error('[checkins] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST check in
router.post('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { venue_id, note } = req.body || {};
    if (!venue_id || !UUID_RE.test(venue_id)) return res.status(400).json({ error: 'venue_id required' });
    if (note && String(note).length > 1000) return res.status(400).json({ error: 'note too long (max 1000)' });

    const venue = await pool.query('SELECT id FROM venues WHERE id=$1 AND is_active=true', [venue_id]);
    if (!venue.rows.length) return res.status(404).json({ error: 'Venue not found' });

    const ins = await pool.query(
      `INSERT INTO checkins (user_id, venue_id, note) VALUES ($1,$2,$3)
         RETURNING id, venue_id, note, created_at`,
      [me, venue_id, note || null]
    );
    await pool.query('UPDATE venues SET going_count = going_count + 1 WHERE id=$1', [venue_id]);
    res.status(201).json({ checkin: ins.rows[0] });
  } catch (err) {
    console.error('[checkins] create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET public check-ins at a venue
router.get('/venue/:venueId', optionalAuth, async (req, res) => {
  try {
    const { venueId } = req.params;
    if (!UUID_RE.test(venueId)) return res.status(400).json({ error: 'Invalid venue id' });
    const r = await pool.query(
      `SELECT c.id, c.note, c.created_at,
              u.id AS user_id, u.username, u.display_name, u.avatar_url
         FROM checkins c JOIN users u ON u.id=c.user_id
        WHERE c.venue_id=$1
        ORDER BY c.created_at DESC
        LIMIT 20`,
      [venueId]
    );
    res.json({ checkins: r.rows });
  } catch (err) {
    console.error('[checkins] venue list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;