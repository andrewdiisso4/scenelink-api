const express = require('express');
const pool = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

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
router.post('/', requireAuth, async (req, res) => {
  try {
    const { venue_id, rating, content } = req.body;
    if (!venue_id || !rating) return res.status(400).json({ error: 'venue_id and rating are required' });
    if (!UUID_RE.test(venue_id)) return res.status(400).json({ error: 'Invalid venue_id format' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

    const result = await pool.query(
      `INSERT INTO reviews (user_id, venue_id, rating, content) VALUES ($1, $2, $3, $4)
       RETURNING id, rating, content, created_at`,
      [req.user.id, venue_id, rating, content || '']
    );

    // Update venue rating
    await pool.query(
      `UPDATE venues SET
        rating = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE venue_id = $1),
        review_count = (SELECT COUNT(*) FROM reviews WHERE venue_id = $1),
        updated_at = NOW()
       WHERE id = $1`,
      [venue_id]
    );

    res.status(201).json({ review: result.rows[0] });
  } catch (err) {
    console.error('Create review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;