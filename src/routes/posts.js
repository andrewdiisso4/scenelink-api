/**
 * SceneLink — Posts (social feed), likes, comments
 * Endpoints:
 *   GET  /api/posts/feed                 — merged feed (posts + checkins + reviews + plan_shares), newest first
 *   GET  /api/posts?user_id=             — posts by a specific user (public)
 *   POST /api/posts                      { body, venue_id?, image_url? }
 *   DELETE /api/posts/:id                — delete own post
 *   POST /api/posts/:id/like             — toggle like
 *   GET  /api/posts/:id/comments
 *   POST /api/posts/:id/comments         { body }
 *   DELETE /api/posts/:id/comments/:commentId
 */

const express = require('express');
const pool = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to decorate posts with viewer's like state
async function decoratePostsWithViewer(rows, viewerId) {
  if (!rows.length || !viewerId) return rows.map(r => ({ ...r, liked_by_me: false }));
  const ids = rows.map(r => r.id);
  const r = await pool.query(
    `SELECT post_id FROM post_likes WHERE user_id=$1 AND post_id = ANY($2::uuid[])`,
    [viewerId, ids]
  );
  const liked = new Set(r.rows.map(x => x.post_id));
  return rows.map(x => ({ ...x, liked_by_me: liked.has(x.id) }));
}

// --------- FEED (merged) ---------
// Real posts + checkins + reviews. Empty when no real users have acted.
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const viewer = req.user && req.user.id;

    // 1) Real posts
    const postsR = await pool.query(
      `SELECT p.id, p.user_id, p.body, p.venue_id, p.image_url, p.like_count, p.comment_count,
              p.created_at,
              'post' AS kind,
              u.username, u.display_name, u.avatar_url,
              v.name AS venue_name, v.slug AS venue_slug, v.neighborhood AS venue_neighborhood, v.image_url AS venue_image
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN venues v ON v.id = p.venue_id
        WHERE p.is_public = true
        ORDER BY p.created_at DESC
        LIMIT $1`,
      [limit]
    );

    // 2) Real checkins
    const ciR = await pool.query(
      `SELECT c.id, c.user_id, c.note AS body, c.venue_id, NULL::text AS image_url,
              0 AS like_count, 0 AS comment_count, c.created_at,
              'checkin' AS kind,
              u.username, u.display_name, u.avatar_url,
              v.name AS venue_name, v.slug AS venue_slug, v.neighborhood AS venue_neighborhood, v.image_url AS venue_image
         FROM checkins c
         JOIN users u ON u.id = c.user_id
         JOIN venues v ON v.id = c.venue_id
        ORDER BY c.created_at DESC
        LIMIT $1`,
      [limit]
    );

    // 3) Real reviews (only real users — excludes any purged synthetic ones)
    const rvR = await pool.query(
      `SELECT r.id, r.user_id, r.content AS body, r.venue_id, NULL::text AS image_url,
              0 AS like_count, 0 AS comment_count, r.created_at,
              'review' AS kind, r.rating,
              u.username, u.display_name, u.avatar_url,
              v.name AS venue_name, v.slug AS venue_slug, v.neighborhood AS venue_neighborhood, v.image_url AS venue_image
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         JOIN venues v ON v.id = r.venue_id
        WHERE u.email NOT LIKE 'seed_reviewer_%@scenelink.app'
        ORDER BY r.created_at DESC
        LIMIT $1`,
      [limit]
    );

    const merged = [...postsR.rows, ...ciR.rows, ...rvR.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    // Decorate only the real-post rows with liked_by_me
    const postsDecorated = await decoratePostsWithViewer(
      merged.filter(x => x.kind === 'post'),
      viewer
    );
    const postsById = new Map(postsDecorated.map(p => [p.id, p]));
    const out = merged.map(x => x.kind === 'post' ? postsById.get(x.id) : { ...x, liked_by_me: false });

    res.json({ items: out, total: out.length });
  } catch (err) {
    console.error('[posts] feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/posts?user_id=
router.get('/', optionalAuth, async (req, res) => {
  try {
    const viewer = req.user && req.user.id;
    const userId = req.query.user_id;
    if (!userId || !UUID_RE.test(userId)) return res.status(400).json({ error: 'user_id required' });
    const r = await pool.query(
      `SELECT p.id, p.user_id, p.body, p.venue_id, p.image_url, p.like_count, p.comment_count, p.created_at,
              u.username, u.display_name, u.avatar_url,
              v.name AS venue_name, v.slug AS venue_slug, v.neighborhood AS venue_neighborhood, v.image_url AS venue_image
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN venues v ON v.id = p.venue_id
        WHERE p.user_id = $1 AND p.is_public = true
        ORDER BY p.created_at DESC
        LIMIT 50`,
      [userId]
    );
    const decorated = await decoratePostsWithViewer(r.rows, viewer);
    res.json({ posts: decorated });
  } catch (err) {
    console.error('[posts] by-user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts
router.post('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const body = String((req.body && req.body.body) || '').trim();
    const venue_id = (req.body && req.body.venue_id) || null;
    const image_url = (req.body && req.body.image_url) || null;
    if (!body && !venue_id) return res.status(400).json({ error: 'Post must have body or venue_id' });
    if (body.length > 2000) return res.status(400).json({ error: 'body too long (max 2000)' });
    if (venue_id && !UUID_RE.test(venue_id)) return res.status(400).json({ error: 'Invalid venue_id' });

    const ins = await pool.query(
      `INSERT INTO posts (user_id, body, venue_id, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, body, venue_id, image_url, like_count, comment_count, created_at`,
      [me, body || null, venue_id, image_url]
    );
    res.status(201).json({ post: ins.rows[0] });
  } catch (err) {
    console.error('[posts] create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });
    const del = await pool.query(
      `DELETE FROM posts WHERE id=$1 AND user_id=$2 RETURNING id`,
      [id, me]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Post not found or not yours' });
    res.json({ removed: true, id });
  } catch (err) {
    console.error('[posts] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/like  — toggle
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });
    const p = await pool.query('SELECT id, user_id FROM posts WHERE id=$1', [id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Post not found' });

    const existing = await pool.query(
      'SELECT id FROM post_likes WHERE post_id=$1 AND user_id=$2',
      [id, me]
    );
    let liked;
    if (existing.rows.length) {
      await pool.query('DELETE FROM post_likes WHERE id=$1', [existing.rows[0].id]);
      await pool.query('UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id=$1', [id]);
      liked = false;
    } else {
      await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2)', [id, me]);
      await pool.query('UPDATE posts SET like_count = like_count + 1 WHERE id=$1', [id]);
      liked = true;
      // Notify author (if not self-like)
      if (p.rows[0].user_id !== me) {
        await pool.query(
          `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id)
           VALUES ($1, $2, 'post_like', 'post', $3)`,
          [p.rows[0].user_id, me, id]
        );
      }
    }
    const counts = await pool.query('SELECT like_count FROM posts WHERE id=$1', [id]);
    res.json({ liked, like_count: counts.rows[0].like_count });
  } catch (err) {
    console.error('[posts] like error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/posts/:id/comments
router.get('/:id/comments', optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });
    const r = await pool.query(
      `SELECT c.id, c.user_id, c.body, c.created_at,
              u.username, u.display_name, u.avatar_url
         FROM post_comments c JOIN users u ON u.id = c.user_id
        WHERE c.post_id = $1
        ORDER BY c.created_at ASC
        LIMIT 200`,
      [id]
    );
    res.json({ comments: r.rows });
  } catch (err) {
    console.error('[posts] comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const id = req.params.id;
    const body = String((req.body && req.body.body) || '').trim();
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });
    if (!body) return res.status(400).json({ error: 'body required' });
    if (body.length > 1000) return res.status(400).json({ error: 'body too long (max 1000)' });

    const p = await pool.query('SELECT id, user_id FROM posts WHERE id=$1', [id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Post not found' });

    const ins = await pool.query(
      `INSERT INTO post_comments (post_id, user_id, body)
       VALUES ($1, $2, $3) RETURNING id, post_id, user_id, body, created_at`,
      [id, me, body]
    );
    await pool.query('UPDATE posts SET comment_count = comment_count + 1 WHERE id=$1', [id]);

    if (p.rows[0].user_id !== me) {
      await pool.query(
        `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id)
         VALUES ($1, $2, 'post_comment', 'comment', $3)`,
        [p.rows[0].user_id, me, ins.rows[0].id]
      );
    }
    res.status(201).json({ comment: ins.rows[0] });
  } catch (err) {
    console.error('[posts] add comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/posts/:id/comments/:commentId
router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id, commentId } = req.params;
    if (!UUID_RE.test(id) || !UUID_RE.test(commentId)) return res.status(400).json({ error: 'Invalid id' });
    const del = await pool.query(
      `DELETE FROM post_comments WHERE id=$1 AND post_id=$2 AND user_id=$3 RETURNING id`,
      [commentId, id, me]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Comment not found or not yours' });
    await pool.query('UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id=$1', [id]);
    res.json({ removed: true, id: commentId });
  } catch (err) {
    console.error('[posts] delete comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;