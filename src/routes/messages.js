/**
 * SceneLink — Direct Messages (1:1 conversations)
 * Endpoints:
 *   GET  /api/conversations                       — my conversations, newest first
 *   POST /api/conversations                       { user_id | username } — start/reuse DM
 *   GET  /api/conversations/:id/messages?before=  — paginated thread
 *   POST /api/conversations/:id/messages          { body } — send
 *   POST /api/conversations/:id/read              — mark as read (updates last_read_at)
 */

const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// GET /api/conversations — list my conversations
router.get('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const r = await pool.query(
      `SELECT c.id, c.is_group, c.title, c.last_message_at, c.created_at,
              cp_me.last_read_at,
              ( SELECT json_build_object(
                  'id', u.id, 'username', u.username,
                  'display_name', u.display_name, 'avatar_url', u.avatar_url
                )
                FROM conversation_participants cp2
                JOIN users u ON u.id = cp2.user_id
                WHERE cp2.conversation_id = c.id AND cp2.user_id <> $1
                LIMIT 1
              ) AS other_user,
              ( SELECT json_build_object('id', m.id, 'body', LEFT(m.body, 200), 'sender_id', m.sender_id, 'created_at', m.created_at)
                FROM messages m WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC LIMIT 1
              ) AS last_message,
              ( SELECT COUNT(*) FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_id <> $1
                  AND (cp_me.last_read_at IS NULL OR m.created_at > cp_me.last_read_at)
              ) AS unread_count
         FROM conversations c
         JOIN conversation_participants cp_me ON cp_me.conversation_id = c.id AND cp_me.user_id = $1
        ORDER BY c.last_message_at DESC NULLS LAST`,
      [me]
    );
    res.json({ conversations: r.rows });
  } catch (err) {
    console.error('[messages] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/conversations — start or reuse DM
router.post('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const target = await resolveTargetUserId(req.body || {});
    if (!target) return res.status(400).json({ error: 'user_id or username required' });
    if (target === me) return res.status(400).json({ error: "Can't DM yourself" });

    // Reuse existing 1:1 convo if any
    const existing = await pool.query(
      `SELECT c.id FROM conversations c
        WHERE c.is_group = false
          AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id=c.id AND user_id=$1)
          AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id=c.id AND user_id=$2)
          AND (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id=c.id) = 2
        LIMIT 1`,
      [me, target]
    );
    if (existing.rows.length) return res.json({ conversation_id: existing.rows[0].id, reused: true });

    const c = await pool.query(
      `INSERT INTO conversations (created_by, is_group) VALUES ($1, false) RETURNING id, last_message_at, created_at`,
      [me]
    );
    const convId = c.rows[0].id;
    await pool.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [convId, me, target]
    );
    res.status(201).json({ conversation_id: convId, reused: false });
  } catch (err) {
    console.error('[messages] start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Membership check
async function assertMember(convId, userId) {
  const r = await pool.query(
    'SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2',
    [convId, userId]
  );
  return r.rows.length > 0;
}

// GET /api/conversations/:id/messages?before=ISO&limit=50
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const convId = req.params.id;
    if (!UUID_RE.test(convId)) return res.status(400).json({ error: 'Invalid conversation id' });
    if (!(await assertMember(convId, me))) return res.status(403).json({ error: 'Not a participant' });

    const before = req.query.before ? new Date(req.query.before) : null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const params = [convId];
    let where = 'conversation_id = $1';
    if (before && !Number.isNaN(before.getTime())) {
      where += ' AND created_at < $2';
      params.push(before.toISOString());
    }
    const r = await pool.query(
      `SELECT m.id, m.sender_id, m.body, m.created_at,
              u.username, u.display_name, u.avatar_url
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE ${where}
        ORDER BY m.created_at DESC
        LIMIT ${limit}`,
      params
    );
    res.json({ messages: r.rows.reverse() });
  } catch (err) {
    console.error('[messages] thread error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/conversations/:id/messages
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const convId = req.params.id;
    if (!UUID_RE.test(convId)) return res.status(400).json({ error: 'Invalid conversation id' });
    const body = String((req.body && req.body.body) || '').trim();
    if (!body) return res.status(400).json({ error: 'body required' });
    if (body.length > 4000) return res.status(400).json({ error: 'message too long (max 4000)' });
    if (!(await assertMember(convId, me))) return res.status(403).json({ error: 'Not a participant' });

    const ins = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3) RETURNING id, conversation_id, sender_id, body, created_at`,
      [convId, me, body]
    );
    await pool.query(`UPDATE conversations SET last_message_at=NOW() WHERE id=$1`, [convId]);

    // Notify other participants
    const others = await pool.query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id=$1 AND user_id <> $2',
      [convId, me]
    );
    for (const row of others.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id, data)
         VALUES ($1, $2, 'new_message', 'message', $3, $4)`,
        [row.user_id, me, ins.rows[0].id, JSON.stringify({ conversation_id: convId })]
      );
    }
    res.status(201).json({ message: ins.rows[0] });
  } catch (err) {
    console.error('[messages] send error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/conversations/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const convId = req.params.id;
    if (!UUID_RE.test(convId)) return res.status(400).json({ error: 'Invalid conversation id' });
    if (!(await assertMember(convId, me))) return res.status(403).json({ error: 'Not a participant' });
    await pool.query(
      `UPDATE conversation_participants SET last_read_at=NOW() WHERE conversation_id=$1 AND user_id=$2`,
      [convId, me]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[messages] read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;