const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/favorites
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.venue_id, f.created_at,
              v.name as venue_name, v.slug as venue_slug, v.type as venue_type,
              v.image_url as venue_image, v.rating as venue_rating,
              v.neighborhood as venue_neighborhood, v.price_label as venue_price
       FROM favorites f
       JOIN venues v ON f.venue_id = v.id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ favorites: result.rows });
  } catch (err) {
    console.error('Favorites list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/favorites/toggle
router.post('/toggle', requireAuth, async (req, res) => {
  try {
    const { venue_id } = req.body || {};
    if (!venue_id || !UUID_RE.test(String(venue_id))) return res.status(400).json({ error: 'A valid venue_id is required' });

    const venue = await pool.query('SELECT id FROM venues WHERE id = $1 AND is_active = true LIMIT 1', [venue_id]);
    if (!venue.rows.length) return res.status(404).json({ error: 'Venue not found' });

    // Check if already favorited
    const existing = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND venue_id = $2',
      [req.user.id, venue_id]
    );

    if (existing.rows.length > 0) {
      // Remove favorite
      await pool.query('DELETE FROM favorites WHERE user_id = $1 AND venue_id = $2', [req.user.id, venue_id]);
      res.json({ favorited: false, venue_id });
    } else {
      // Add favorite
      await pool.query(
        'INSERT INTO favorites (user_id, venue_id) VALUES ($1, $2)',
        [req.user.id, venue_id]
      );
      res.json({ favorited: true, venue_id });
    }
  } catch (err) {
    console.error('Toggle favorite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/favorites/:venueId — explicit save endpoint for launch QA
router.post('/:venueId', requireAuth, async (req, res) => {
  try {
    const venueId = req.params.venueId;
    if (!UUID_RE.test(String(venueId))) return res.status(400).json({ error: 'A valid venue id is required' });
    const exists = await pool.query('SELECT id FROM venues WHERE id = $1 AND is_active = true', [venueId]);
    if (!exists.rows.length) return res.status(404).json({ error: 'Venue not found' });
    await pool.query(
      'INSERT INTO favorites (user_id, venue_id) VALUES ($1, $2) ON CONFLICT (user_id, venue_id) DO NOTHING',
      [req.user.id, venueId]
    );
    res.json({ ok: true, favorited: true, venue_id: venueId });
  } catch (err) {
    console.error('[favorites] save error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/favorites/:venueId — explicit unsave endpoint for launch QA
router.delete('/:venueId', requireAuth, async (req, res) => {
  try {
    const venueId = req.params.venueId;
    if (!UUID_RE.test(String(venueId))) return res.status(400).json({ error: 'A valid venue id is required' });
    await pool.query('DELETE FROM favorites WHERE user_id = $1 AND venue_id = $2', [req.user.id, venueId]);
    res.json({ ok: true, favorited: false, venue_id: venueId });
  } catch (err) {
    console.error('[favorites] unsave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;