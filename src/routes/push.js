const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const VALID_PLATFORMS = ['ios','android','web'];

// POST /api/push/register-token — called from native app after user grants permission
router.post('/register-token', requireAuth, async (req, res) => {
  try {
    const { token, platform, device_id, app_version } = req.body || {};

    if (!token || typeof token !== 'string' || token.length < 10)
      return res.status(400).json({ error: 'Invalid token' });
    if (!platform || !VALID_PLATFORMS.includes(platform))
      return res.status(400).json({ error: 'Invalid platform' });

    // UPSERT — if the token exists, update ownership to this user and mark active
    const { rows } = await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform, device_id, app_version, active, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,NOW())
       ON CONFLICT (token, platform) DO UPDATE SET
         user_id      = EXCLUDED.user_id,
         device_id    = EXCLUDED.device_id,
         app_version  = EXCLUDED.app_version,
         active       = TRUE,
         last_seen_at = NOW()
       RETURNING id, created_at`,
      [req.user.id, token, platform, device_id || null, app_version || null]
    );
    res.status(201).json({ token: rows[0] });
  } catch (e) {
    console.error('[push] register-token error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/push/token — unregister (logout, uninstall hint)
router.delete('/token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Missing token' });

    await pool.query(
      `UPDATE push_tokens SET active = FALSE WHERE token = $1 AND user_id = $2`,
      [token, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[push] DELETE /token error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/push/tokens — list active tokens for current user (debugging)
router.get('/tokens', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, platform, device_id, app_version, last_seen_at, created_at
       FROM push_tokens WHERE user_id = $1 AND active = TRUE
       ORDER BY last_seen_at DESC`,
      [req.user.id]
    );
    res.json({ tokens: rows });
  } catch (e) {
    console.error('[push] GET /tokens error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;