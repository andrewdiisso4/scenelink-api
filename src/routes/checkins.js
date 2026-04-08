const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/checkins
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.venue_id, c.note, c.created_at,
              v.name as venue_name, v.slug as venue_slug, v.image_url as venue_image,
              v.neighborhood as venue_neighborhood
       FROM checkins c JOIN venues v ON c.venue_id = v.id
       WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ checkins: result.rows });
  } catch (err) {
    console.error('Checkins error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/checkins
router.post('/', requireAuth, async (req, res) => {
  try {
    const { venue_id, note } = req.body;
    if (!venue_id) return res.status(400).json({ error: 'venue_id is required' });

    const result = await pool.query(
      `INSERT INTO checkins (user_id, venue_id, note) VALUES ($1, $2, $3)
       RETURNING id, venue_id, note, created_at`,
      [req.user.id, venue_id, note || '']
    );

    // Increment going_count
    await pool.query('UPDATE venues SET going_count = going_count + 1 WHERE id = $1', [venue_id]);

    res.status(201).json({ checkin: result.rows[0] });
  } catch (err) {
    console.error('Create checkin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;