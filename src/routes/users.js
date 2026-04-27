/**
 * SceneLink — Public user lookup + search
 * Endpoints:
 *   GET /api/users/search?q=     — search users by username / display_name (public)
 *   GET /api/users/:identifier   — public profile by username or UUID
 *                                   (adds friendship_status if caller is authenticated)
 */
const express = require('express');
const pool = require('../config/database');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/users/me — current authenticated user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at
         FROM users WHERE id=$1`,
      [req.user.id]
    );
    res.json({ user: r.rows[0] || null });
  } catch (err) {
    console.error('[users] me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/search?q=&limit=20
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const me = req.user && req.user.id;

    const like = `%${q.toLowerCase()}%`;
    const r = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.neighborhood, u.bio
         FROM users u
        WHERE u.is_active = true
          AND ( LOWER(u.username) LIKE $1 OR LOWER(u.display_name) LIKE $1 )
          ${me ? 'AND u.id <> $3' : ''}
        ORDER BY
          CASE WHEN LOWER(u.username) = $2 THEN 0
               WHEN LOWER(u.username) LIKE $2 || '%' THEN 1
               WHEN LOWER(u.display_name) LIKE $2 || '%' THEN 2
               ELSE 3 END,
          u.display_name ASC NULLS LAST
        LIMIT ${limit}`,
      me ? [like, q.toLowerCase(), me] : [like, q.toLowerCase()]
    );
    res.json({ results: r.rows });
  } catch (err) {
    console.error('[users] search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:identifier — UUID or username
router.get('/:identifier', optionalAuth, async (req, res) => {
  try {
    const id = req.params.identifier;
    const isUuid = UUID_RE.test(id);
    const r = await pool.query(
      `SELECT id, username, display_name, avatar_url, bio, neighborhood, city, created_at
         FROM users
        WHERE is_active = true AND ${isUuid ? 'id = $1' : 'LOWER(username) = LOWER($1)'}
        LIMIT 1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = r.rows[0];

    // Aggregate public counts
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM posts    WHERE user_id = $1 AND is_public = true) AS post_count,
         (SELECT COUNT(*) FROM checkins WHERE user_id = $1) AS checkin_count,
         (SELECT COUNT(*) FROM reviews  WHERE user_id = $1) AS review_count,
         (SELECT COUNT(*) FROM friendships
            WHERE (user_a_id = $1 OR user_b_id = $1) AND status = 'accepted') AS friend_count`,
      [user.id]
    );

    let friendship_status = null;
    const me = req.user && req.user.id;
    if (me && me !== user.id) {
      const a = me < user.id ? me : user.id;
      const b = me < user.id ? user.id : me;
      const f = await pool.query(
        `SELECT id, status, requester_id FROM friendships WHERE user_a_id=$1 AND user_b_id=$2`,
        [a, b]
      );
      if (f.rows.length) {
        const row = f.rows[0];
        friendship_status = {
          id: row.id,
          status: row.status,
          direction: row.status === 'pending'
            ? (row.requester_id === me ? 'outgoing' : 'incoming')
            : null
        };
      }
    }

    res.json({
      user: {
        ...user,
        ...counts.rows[0]
      },
      is_me: me === user.id,
      friendship_status
    });
  } catch (err) {
    console.error('[users] profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;