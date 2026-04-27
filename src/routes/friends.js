/**
 * SceneLink — Friends & Friend Requests
 * Endpoints:
 *   GET  /api/friends                    — accepted friends of current user
 *   GET  /api/friends/pending            — pending requests (incoming + outgoing)
 *   POST /api/friends/request            { user_id | username }
 *   POST /api/friends/accept             { friendship_id }
 *   POST /api/friends/decline            { friendship_id }
 *   DELETE /api/friends/:friendUserId    — remove accepted friend OR cancel outgoing pending
 *   GET  /api/users/search?q=            — search by display_name/username (public, optional auth)
 *
 * Also mounted: /api/users/:identifier   (public profile by username or id) — see users route.
 */

const express = require('express');
const pool = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Canonical ordering helper — friendships table enforces user_a_id < user_b_id
function canonicalPair(u1, u2) {
  return u1 < u2 ? { a: u1, b: u2 } : { a: u2, b: u1 };
}

async function resolveTargetUserId(body) {
  if (body.user_id && UUID_RE.test(body.user_id)) return body.user_id;
  if (body.username) {
    const r = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
      [String(body.username).trim()]
    );
    if (r.rows.length) return r.rows[0].id;
  }
  return null;
}

// GET /api/friends — accepted friends
router.get('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const r = await pool.query(
      `SELECT f.id AS friendship_id, f.status, f.created_at,
              u.id, u.username, u.display_name, u.avatar_url, u.neighborhood
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END
        WHERE (f.user_a_id = $1 OR f.user_b_id = $1)
          AND f.status = 'accepted'
        ORDER BY u.display_name ASC NULLS LAST, u.username ASC`,
      [me]
    );
    res.json({ friends: r.rows });
  } catch (err) {
    console.error('[friends] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/pending — requests to act on + outgoing we sent
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const r = await pool.query(
      `SELECT f.id AS friendship_id, f.status, f.created_at, f.requester_id,
              CASE WHEN f.requester_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
              u.id AS other_user_id, u.username, u.display_name, u.avatar_url
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END
        WHERE (f.user_a_id = $1 OR f.user_b_id = $1)
          AND f.status = 'pending'
        ORDER BY f.created_at DESC`,
      [me]
    );
    res.json({
      incoming: r.rows.filter(x => x.direction === 'incoming'),
      outgoing: r.rows.filter(x => x.direction === 'outgoing')
    });
  } catch (err) {
    console.error('[friends] pending error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/request
router.post('/request', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const targetId = await resolveTargetUserId(req.body || {});
    if (!targetId) return res.status(400).json({ error: 'user_id or username required' });
    if (targetId === me) return res.status(400).json({ error: "Can't friend yourself" });

    const { a, b } = canonicalPair(me, targetId);

    // Existing row?
    const existing = await pool.query(
      'SELECT id, status, requester_id FROM friendships WHERE user_a_id = $1 AND user_b_id = $2',
      [a, b]
    );
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.status === 'accepted') return res.status(200).json({ friendship_id: row.id, status: 'accepted', already_friends: true });
      if (row.status === 'pending')  return res.status(200).json({ friendship_id: row.id, status: 'pending', already_requested: true });
      if (row.status === 'declined') {
        // Re-open as pending if either side retries
        const up = await pool.query(
          `UPDATE friendships SET status='pending', requester_id=$1, updated_at=NOW()
           WHERE id = $2 RETURNING id, status`,
          [me, row.id]
        );
        return res.json({ friendship_id: up.rows[0].id, status: 'pending', reopened: true });
      }
      if (row.status === 'blocked') return res.status(403).json({ error: 'Cannot send request' });
    }

    const ins = await pool.query(
      `INSERT INTO friendships (user_a_id, user_b_id, requester_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, status, created_at`,
      [a, b, me]
    );

    // Notify recipient
    await pool.query(
      `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id)
       VALUES ($1, $2, 'friend_request', 'friendship', $3)`,
      [targetId, me, ins.rows[0].id]
    );

    res.status(201).json({ friendship_id: ins.rows[0].id, status: 'pending' });
  } catch (err) {
    console.error('[friends] request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/accept { friendship_id }
router.post('/accept', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { friendship_id } = req.body || {};
    if (!friendship_id || !UUID_RE.test(friendship_id))
      return res.status(400).json({ error: 'friendship_id required' });

    const f = await pool.query(
      `SELECT id, user_a_id, user_b_id, requester_id, status FROM friendships WHERE id = $1`,
      [friendship_id]
    );
    if (!f.rows.length) return res.status(404).json({ error: 'Friendship not found' });
    const row = f.rows[0];
    // Only the *other* side (non-requester) can accept
    if (row.requester_id === me) return res.status(403).json({ error: 'Cannot accept your own request' });
    if (row.user_a_id !== me && row.user_b_id !== me) return res.status(403).json({ error: 'Not a party to this friendship' });
    if (row.status !== 'pending') return res.status(409).json({ error: `Cannot accept — status is ${row.status}` });

    await pool.query(
      `UPDATE friendships SET status='accepted', updated_at=NOW() WHERE id = $1`,
      [friendship_id]
    );
    // Notify requester
    await pool.query(
      `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id)
       VALUES ($1, $2, 'friend_accept', 'friendship', $3)`,
      [row.requester_id, me, friendship_id]
    );
    res.json({ friendship_id, status: 'accepted' });
  } catch (err) {
    console.error('[friends] accept error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/decline { friendship_id }
router.post('/decline', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { friendship_id } = req.body || {};
    if (!friendship_id || !UUID_RE.test(friendship_id))
      return res.status(400).json({ error: 'friendship_id required' });

    const f = await pool.query(
      `SELECT id, user_a_id, user_b_id, requester_id, status FROM friendships WHERE id = $1`,
      [friendship_id]
    );
    if (!f.rows.length) return res.status(404).json({ error: 'Friendship not found' });
    const row = f.rows[0];
    if (row.user_a_id !== me && row.user_b_id !== me) return res.status(403).json({ error: 'Forbidden' });
    if (row.status !== 'pending') return res.status(409).json({ error: `Cannot decline — status is ${row.status}` });

    await pool.query(
      `UPDATE friendships SET status='declined', updated_at=NOW() WHERE id = $1`,
      [friendship_id]
    );
    res.json({ friendship_id, status: 'declined' });
  } catch (err) {
    console.error('[friends] decline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/friends/:friendUserId  — removes accepted friendship or cancels outgoing pending
router.delete('/:friendUserId', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const target = req.params.friendUserId;
    if (!UUID_RE.test(target)) return res.status(400).json({ error: 'Invalid friendUserId' });
    const { a, b } = canonicalPair(me, target);
    const del = await pool.query(
      `DELETE FROM friendships
         WHERE user_a_id = $1 AND user_b_id = $2
           AND (status = 'accepted' OR (status = 'pending' AND requester_id = $3))
       RETURNING id, status`,
      [a, b, me]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'No friendship to remove' });
    res.json({ removed: true, friendship_id: del.rows[0].id, was_status: del.rows[0].status });
  } catch (err) {
    console.error('[friends] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;