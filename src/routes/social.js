/** SceneLink social summary for nav badges and launch QA. */
const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const [friends, pending, notifications, conversations, posts, lists, favorites, plans] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM friendships WHERE status='accepted' AND (user_a_id=$1 OR user_b_id=$1)`, [me]),
      pool.query(`SELECT COUNT(*)::int AS c FROM friendships WHERE status='pending' AND requester_id <> $1 AND (user_a_id=$1 OR user_b_id=$1)`, [me]),
      pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [me]),
      pool.query(`SELECT COALESCE(SUM(u.c), 0)::int AS c
                    FROM (
                      SELECT COUNT(m.id) AS c
                        FROM conversation_participants cp
                        JOIN messages m ON m.conversation_id = cp.conversation_id
                       WHERE cp.user_id = $1
                         AND m.sender_id <> $1
                         AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
                       GROUP BY cp.conversation_id
                    ) u`, [me]),
      pool.query(`SELECT COUNT(*)::int AS c FROM posts WHERE user_id=$1`, [me]),
      pool.query(`SELECT COUNT(*)::int AS c FROM lists WHERE user_id=$1`, [me]),
      pool.query(`SELECT COUNT(*)::int AS c FROM favorites WHERE user_id=$1`, [me]),
      pool.query(`SELECT COUNT(*)::int AS c FROM plans WHERE user_id=$1`, [me]),
    ]);

    res.json({
      friends: friends.rows[0].c,
      pending_friend_requests: pending.rows[0].c,
      unread_notifications: notifications.rows[0].c,
      unread_messages: conversations.rows[0].c,
      posts: posts.rows[0].c,
      lists: lists.rows[0].c,
      saved_venues: favorites.rows[0].c,
      plans: plans.rows[0].c,
    });
  } catch (err) {
    console.error('[social] summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
