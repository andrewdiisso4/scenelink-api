const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const VALID_TARGETS = ['post','review','user','comment','message'];
const VALID_REASONS = ['spam','harassment','hate_speech','violence','sexual_content',
  'misinformation','illegal','impersonation','self_harm','other'];

// POST /api/reports — flag content/users
router.post('/', requireAuth, async (req, res) => {
  try {
    const { target_type, target_id, reason, details } = req.body || {};

    if (!target_type || !VALID_TARGETS.includes(target_type))
      return res.status(400).json({ error: 'Invalid target_type' });
    if (!target_id)
      return res.status(400).json({ error: 'Missing target_id' });
    if (!reason || !VALID_REASONS.includes(reason))
      return res.status(400).json({ error: 'Invalid reason' });
    if (details && details.length > 1000)
      return res.status(400).json({ error: 'Details too long (max 1000)' });

    // Can't report yourself
    if (target_type === 'user' && target_id === req.user.id)
      return res.status(400).json({ error: 'Cannot report yourself' });

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    try {
      const { rows } = await pool.query(
        `INSERT INTO content_reports (reporter_id, target_type, target_id, reason, details)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, created_at, status`,
        [req.user.id, target_type, target_id, reason, details || null]
      );
      return res.status(201).json({ report: rows[0] });
    } catch (e) {
      // unique constraint means already reported & pending
      if (e.code === '23505') {
        return res.status(200).json({ already_reported: true });
      }
      throw e;
    }
  } catch (e) {
    console.error('[reports] POST error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/mine — list current user's submitted reports (for transparency)
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, target_type, target_id, reason, status, created_at
       FROM content_reports WHERE reporter_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ reports: rows });
  } catch (e) {
    console.error('[reports] GET /mine error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;