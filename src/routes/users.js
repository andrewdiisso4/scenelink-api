/**
 * SceneLink — Public user lookup + search + Phase 6E block/unblock
 * Endpoints:
 *   GET    /api/users/me                  — current authenticated user
 *   GET    /api/users/search?q=           — search users (public, optional auth)
 *                                           Filters out users blocked by OR blocking the caller.
 *   GET    /api/users/blocked             — list users the caller has blocked (auth)
 *   POST   /api/users/:id/block           — block a user (auth)
 *   DELETE /api/users/:id/block           — unblock a user (auth)
 *   GET    /api/users/:identifier         — public profile by username or UUID
 *                                           If caller is blocked or has blocked target,
 *                                           returns 404 (don't leak existence).
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
// Phase 6E: filters out users blocked by, or who have blocked, the caller (when authenticated).
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const me = req.user && req.user.id;

    const like = `%${q.toLowerCase()}%`;

    // When authenticated, exclude blocking pairs in either direction.
    const blockExclusion = me
      ? `AND u.id NOT IN (
            SELECT blocked_id FROM user_blocks WHERE blocker_id = $3
            UNION
            SELECT blocker_id FROM user_blocks WHERE blocked_id = $3
         )`
      : '';

    const r = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.neighborhood, u.bio
         FROM users u
        WHERE u.is_active = true
          AND ( LOWER(u.username) LIKE $1 OR LOWER(u.display_name) LIKE $1 )
          ${me ? 'AND u.id <> $3' : ''}
          ${blockExclusion}
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

// GET /api/users/blocked — Phase 6E: list users the caller has blocked
router.get('/blocked', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.blocked_id AS id, b.created_at AS blocked_at,
              u.username, u.display_name, u.avatar_url
         FROM user_blocks b
         JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = $1
        ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json({ blocked: r.rows });
  } catch (err) {
    console.error('[users] blocked list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/block — Phase 6E: block a user
// Side effects: any existing friendship between the two is set to 'declined'
// (effectively breaking the friendship). Idempotent on duplicate blocks.
router.post('/:id/block', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const targetId = req.params.id;

    if (!UUID_RE.test(targetId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    if (targetId === me) {
      return res.status(400).json({ error: "Can't block yourself" });
    }

    // Confirm target exists and is active.
    const tgt = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1',
      [targetId]
    );
    if (!tgt.rows.length) return res.status(404).json({ error: 'User not found' });

    // Idempotent insert — if already blocked, return existing row.
    const ins = await pool.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING
       RETURNING id, created_at`,
      [me, targetId, (req.body && req.body.reason) || null]
    );

    // Tear down any existing friendship between the two (canonical pair).
    const a = me < targetId ? me : targetId;
    const b = me < targetId ? targetId : me;
    await pool.query(
      `UPDATE friendships SET status = 'declined', updated_at = NOW()
        WHERE user_a_id = $1 AND user_b_id = $2 AND status IN ('pending','accepted')`,
      [a, b]
    );

    res.status(201).json({
      success: true,
      blocked_id: targetId,
      already_blocked: ins.rows.length === 0
    });
  } catch (err) {
    console.error('[users] block error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id/block — Phase 6E: unblock a user
router.delete('/:id/block', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const targetId = req.params.id;

    if (!UUID_RE.test(targetId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const del = await pool.query(
      'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING id',
      [me, targetId]
    );

    if (del.rows.length === 0) {
      return res.status(404).json({ error: 'Not blocked' });
    }

    res.json({ success: true, unblocked_id: targetId });
  } catch (err) {
    console.error('[users] unblock error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:identifier — UUID or username
// Phase 6E: if caller has blocked OR is blocked by target, return 404
// to avoid leaking existence/profile to a blocked party.
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

    const me = req.user && req.user.id;

    // Block hide — either direction => 404.
    if (me && me !== user.id) {
      const blockCheck = await pool.query(
        `SELECT 1 FROM user_blocks
          WHERE (blocker_id = $1 AND blocked_id = $2)
             OR (blocker_id = $2 AND blocked_id = $1)
          LIMIT 1`,
        [me, user.id]
      );
      if (blockCheck.rows.length) {
        return res.status(404).json({ error: 'User not found' });
      }
    }

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
