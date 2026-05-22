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

// DELETE /api/checkins/:id — Phase 6E: delete own check-in
// Verifies ownership, decrements venue.going_count (clamped at 0), returns 404 if not owned.
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // UUID format guard — Postgres will throw 22P02 on a malformed UUID.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    const owns = await pool.query(
      'SELECT id, venue_id FROM checkins WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (owns.rows.length === 0) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    const venueId = owns.rows[0].venue_id;

    await pool.query('DELETE FROM checkins WHERE id = $1 AND user_id = $2', [id, userId]);
    await pool.query(
      'UPDATE venues SET going_count = GREATEST(0, going_count - 1) WHERE id = $1',
      [venueId]
    );

    res.json({ success: true, deleted_id: id });
  } catch (err) {
    console.error('[checkins] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/checkins/tonight-stats
// Aggregates live tonight-in-Boston stats: people out, trending venues, hot spots.
// No auth required — this is a public widget.
//
// PHASE 6E TRUTH-CLEANUP: previously this endpoint padded the response with
// Math.random() baselines so the UI never showed zeros. That was hidden fake
// data. We now return raw counts + a `source` flag, and the frontend
// truth-gates display when source !== 'live'.
router.get('/tonight-stats', async (req, res) => {
  try {
    // "People out tonight" = distinct users who checked in in the last 4 hours
    const peopleOutQ = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS count FROM checkins WHERE created_at >= NOW() - INTERVAL '4 hours'`
    );

    // "Trending" = venues with >= 5 checkins in the last 3 hours
    const trendingQ = await pool.query(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT venue_id FROM checkins
          WHERE created_at >= NOW() - INTERVAL '3 hours'
          GROUP BY venue_id
         HAVING COUNT(*) >= 5
       ) t`
    );

    // "Hot spots" = venues with going_count >= 20
    const hotQ = await pool.query(
      `SELECT COUNT(*)::int AS count FROM venues WHERE going_count >= 20`
    );

    const peopleOut = peopleOutQ.rows[0].count || 0;
    const trendingCount = trendingQ.rows[0].count || 0;
    const hotSpots = hotQ.rows[0].count || 0;

    // 'live' only when there is actual measured activity in the last 4 hours.
    // Frontend truth-gate hides the widget when source !== 'live'.
    const source = peopleOut > 0 ? 'live' : 'quiet';

    res.set('Cache-Control', 'public, max-age=60'); // cache 60 s
    res.json({
      peopleOut,
      trendingCount,
      hotSpots,
      lastUpdated: new Date().toISOString(),
      source
    });
  } catch (err) {
    console.error('tonight-stats error:', err);
    // Fail closed — return zeros with source='error' so the UI hides the widget.
    res.status(200).json({
      peopleOut: 0,
      trendingCount: 0,
      hotSpots: 0,
      lastUpdated: new Date().toISOString(),
      source: 'error'
    });
  }
});

module.exports = router;
