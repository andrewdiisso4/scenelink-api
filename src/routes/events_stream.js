/**
 * SceneLink — Phase 9A realtime layer (Server-Sent Events)
 *
 * GET /api/events/stream  (auth via ?token= or Authorization header)
 *   - Opens a long-lived text/event-stream.
 *   - Pushes lightweight "ping" events with the user's current unread counts
 *     (messages + notifications) every POLL_MS, plus an immediate first frame.
 *   - The frontend uses this to update badges in realtime without polling loops.
 *   - On any disconnect, the client reconnects with exponential backoff and
 *     pauses while the tab is hidden (handled in sl-social-core.js).
 *
 * Design notes:
 *   - SSE chosen over WebSocket: no new deps, survives Render's HTTP proxy,
 *     auto-reconnect is built into EventSource, and we only need server->client.
 *   - Connection is authenticated with the same JWT. Unauthorized => 401.
 *   - Heartbeat comment every 25s keeps proxies from closing idle streams.
 *   - Hard cap on stream lifetime (10 min) to avoid zombie connections; client
 *     reconnects transparently.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();
const POLL_MS = 15000;       // push unread snapshot every 15s
const HEARTBEAT_MS = 25000;  // SSE comment heartbeat
const MAX_LIFETIME_MS = 10 * 60 * 1000;

function authFromReq(req) {
  let token = null;
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) token = h.slice(7);
  if (!token && req.query.token) token = String(req.query.token);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return null;
  }
}

async function unreadSnapshot(userId) {
  try {
    const [n, m] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND read_at IS NULL`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
           FROM messages msg
           JOIN conversation_participants cp
             ON cp.conversation_id = msg.conversation_id AND cp.user_id = $1
          WHERE msg.sender_id <> $1
            AND (cp.last_read_at IS NULL OR msg.created_at > cp.last_read_at)`,
        [userId]
      ),
    ]);
    return { notifications: n.rows[0].c, messages: m.rows[0].c };
  } catch (_) {
    return { notifications: 0, messages: 0 };
  }
}

router.get('/stream', async (req, res) => {
  const user = authFromReq(req);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');

  let closed = false;
  const send = (event, data) => {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* socket gone */ }
  };

  // immediate first frame
  unreadSnapshot(user.id).then((s) => send('unread', s)).catch(() => {});

  const pollTimer = setInterval(() => {
    unreadSnapshot(user.id).then((s) => send('unread', s)).catch(() => {});
  }, POLL_MS);

  const hbTimer = setInterval(() => {
    if (!closed) { try { res.write(`: hb ${Date.now()}\n\n`); } catch (_) {} }
  }, HEARTBEAT_MS);

  const lifeTimer = setTimeout(() => { cleanup(); try { res.end(); } catch (_) {} }, MAX_LIFETIME_MS);

  function cleanup() {
    closed = true;
    clearInterval(pollTimer);
    clearInterval(hbTimer);
    clearTimeout(lifeTimer);
  }

  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = router;
