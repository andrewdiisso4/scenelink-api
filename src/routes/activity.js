const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/activity
router.get('/', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const result = await pool.query(
      `SELECT a.id, a.user_id, a.user_name, a.user_display_name, a.user_avatar,
              a.type, a.venue_id, a.venue_name, a.venue_type, a.venue_neighborhood,
              a.venue_image, a.venue_rating, a.content, a.rating, a.likes, a.comments,
              a.created_at
       FROM activities a
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ activities: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Activity feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;