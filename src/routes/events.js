const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const EVENT_COLUMNS = `
  e.id, e.title, e.description, e.category,
  e.venue_id, e.venue_name, e.venue_slug, e.venue_neighborhood,
  e.image_url, e.date, e.start_time, e.end_time, e.price,
  e.is_featured, e.is_live, e.attending_count, e.rating, e.created_at,
  e.event_url,
  v.lat AS venue_lat, v.lng AS venue_lng
`;

// GET /api/events
router.get('/', optionalAuth, async (req, res) => {
  try {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (req.query.category && req.query.category !== 'all') {
      conditions.push(`e.category ILIKE $${idx++}`);
      values.push(`%${req.query.category}%`);
    }
    if (req.query.date) {
      conditions.push(`e.date = $${idx++}`);
      values.push(req.query.date);
    }
    if (req.query.venue_id) {
      conditions.push(`e.venue_id = $${idx++}`);
      values.push(req.query.venue_id);
    }
    if (req.query.is_featured === 'true') {
      conditions.push(`e.is_featured = true`);
    }
    if (req.query.q) {
      conditions.push(`(e.title ILIKE $${idx} OR e.description ILIKE $${idx} OR e.venue_name ILIKE $${idx})`);
      values.push(`%${req.query.q}%`);
      idx++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await pool.query(
      `SELECT ${EVENT_COLUMNS} FROM events e LEFT JOIN venues v ON e.venue_id = v.id ${where} ORDER BY e.date ASC, e.start_time ASC`,
      values
    );

    res.json({ events: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Events list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${EVENT_COLUMNS} FROM events e LEFT JOIN venues v ON e.venue_id = v.id WHERE e.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ event: result.rows[0] });
  } catch (err) {
    console.error('Event detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;