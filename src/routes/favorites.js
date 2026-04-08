const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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
    const { venue_id } = req.body;
    if (!venue_id) return res.status(400).json({ error: 'venue_id is required' });

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

module.exports = router;