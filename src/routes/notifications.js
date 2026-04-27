/**
 * SceneLink — Notifications
 * Endpoints:
 *   GET   /api/notifications                — list (newest first)
 *   GET   /api/notifications/unread-count
 *   POST  /api/notifications/read-all
 *   POST  /api/notifications/:id/read
 */
const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const r = await pool.query(
      `SELECT n.id, n.type, n.ref_type, n.ref_id, n.data, n.read_at, n.created_at,
              a.id AS actor_id, a.username AS actor_username, a.display_name AS actor_display_name, a.avatar_url AS actor_avatar_url
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2`,
      [me, limit]
    );
    res.json({ notifications: r.rows });
  } catch (err) {
    console.error('[notifications] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const r = await pool.query(
      `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id=$1 AND read_at IS NULL`,
      [me]
    );
    res.json({ unread: r.rows[0].unread });
  } catch (err) {
    console.error('[notifications] unread-count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    await pool.query(
      `UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`,
      [me]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] read-all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
    const up = await pool.query(
      `UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id`,
      [id, me]
    );
    if (!up.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, id });
  } catch (err) {
    console.error('[notifications] read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;