const express = require('express');
const pool = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/lists
router.get('/', requireAuth, async (req, res) => {
  try {
    const listsResult = await pool.query(
      `SELECT l.id, l.name, l.description, l.is_public, l.created_at, l.updated_at,
              (SELECT COUNT(*) FROM list_venues lv WHERE lv.list_id = l.id) as venue_count
       FROM lists l WHERE l.user_id = $1 ORDER BY l.updated_at DESC`,
      [req.user.id]
    );

    const lists = [];
    for (const list of listsResult.rows) {
      const venuesResult = await pool.query(
        `SELECT v.id, v.slug, v.name, v.type, v.image_url, v.rating, v.neighborhood, v.price_label
         FROM list_venues lv JOIN venues v ON lv.venue_id = v.id
         WHERE lv.list_id = $1 ORDER BY lv.added_at DESC`,
        [list.id]
      );
      lists.push({ ...list, venues: venuesResult.rows });
    }

    res.json({ lists });
  } catch (err) {
    console.error('Lists error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lists
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'List name is required' });
    if (cleanName.length > 80) return res.status(400).json({ error: 'List name too long (max 80 characters)' });

    const dup = await pool.query('SELECT id FROM lists WHERE user_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1', [req.user.id, cleanName]);
    if (dup.rows.length) return res.status(409).json({ error: 'You already have a list with that name' });

    const result = await pool.query(
      `INSERT INTO lists (user_id, name, description) VALUES ($1, $2, $3)
       RETURNING id, name, description, is_public, created_at, updated_at`,
      [req.user.id, cleanName, String(description || '').slice(0, 500)]
    );

    res.status(201).json({ list: { ...result.rows[0], venue_count: 0, venues: [] } });
  } catch (err) {
    console.error('Create list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lists/:listId/venues
router.post('/:listId/venues', requireAuth, async (req, res) => {
  try {
    const { venue_id } = req.body || {};
    if (!venue_id || !UUID_RE.test(String(venue_id))) return res.status(400).json({ error: 'A valid venue_id is required' });

    const venue = await pool.query('SELECT id FROM venues WHERE id=$1 AND is_active=true LIMIT 1', [venue_id]);
    if (!venue.rows.length) return res.status(404).json({ error: 'Venue not found' });

    // Verify list belongs to user
    const listCheck = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [req.params.listId, req.user.id]
    );
    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }

    await pool.query(
      `INSERT INTO list_venues (list_id, venue_id) VALUES ($1, $2)
       ON CONFLICT (list_id, venue_id) DO NOTHING`,
      [req.params.listId, venue_id]
    );

    // Update list timestamp
    await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [req.params.listId]);

    res.json({ success: true, list_id: req.params.listId, venue_id });
  } catch (err) {
    console.error('Add venue to list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lists/:listId/venues/:venueId
router.delete('/:listId/venues/:venueId', requireAuth, async (req, res) => {
  try {
    const owns = await pool.query('SELECT id FROM lists WHERE id = $1 AND user_id = $2', [req.params.listId, req.user.id]);
    if (!owns.rows.length) return res.status(404).json({ error: 'List not found' });

    await pool.query(
      'DELETE FROM list_venues WHERE list_id = $1 AND venue_id = $2',
      [req.params.listId, req.params.venueId]
    );
    await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [req.params.listId]);
    res.json({ success: true, list_id: req.params.listId, venue_id: req.params.venueId });
  } catch (err) {
    console.error('Remove venue from list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/lists/:listId — Phase 6E: rename/edit list (owner-only)
// Body: { name?: string, description?: string }
router.patch('/:listId', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body || {};
    const userId = req.user.id;
    const { listId } = req.params;

    // Confirm ownership before mutation
    const owns = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, userId]
    );
    if (owns.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }

    const sets = [];
    const vals = [];
    let i = 1;

    if (name !== undefined) {
      if (typeof name !== 'string') return res.status(400).json({ error: 'name must be a string' });
      const trimmed = name.trim();
      if (trimmed.length === 0) return res.status(400).json({ error: 'name cannot be empty' });
      if (trimmed.length > 80) return res.status(400).json({ error: 'name too long (max 80 characters)' });

      const dup = await pool.query(
        'SELECT id FROM lists WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3',
        [userId, trimmed, listId]
      );
      if (dup.rows.length) return res.status(409).json({ error: 'You already have a list with that name' });

      sets.push(`name = $${i++}`);
      vals.push(trimmed);
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' });
      }
      const desc = description == null ? '' : String(description).slice(0, 500);
      sets.push(`description = $${i++}`);
      vals.push(desc);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Provide name and/or description' });
    }

    sets.push(`updated_at = NOW()`);
    vals.push(listId);
    vals.push(userId);

    const result = await pool.query(
      `UPDATE lists SET ${sets.join(', ')}
         WHERE id = $${i++} AND user_id = $${i}
       RETURNING id, name, description, is_public, created_at, updated_at`,
      vals
    );

    res.json({ list: result.rows[0] });
  } catch (err) {
    console.error('[lists] PATCH error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lists/:listId
router.delete('/:listId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM lists WHERE id = $1 AND user_id = $2', [req.params.listId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lists/:listId/share — Phase 9A: share an owned list as a post
router.post('/:listId/share', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { listId } = req.params;
    const own = await pool.query('SELECT id, name FROM lists WHERE id=$1 AND user_id=$2', [listId, me]);
    if (!own.rows.length) return res.status(404).json({ error: 'List not found or not yours' });
    // Make it at least friends-visible by marking public when shared (owner opt-in via this action)
    await pool.query('UPDATE lists SET is_public = true WHERE id=$1 AND user_id=$2', [listId, me]);
    const body = `Check out my list: ${own.rows[0].name}`;
    const post = await pool.query(
      `INSERT INTO posts (user_id, body, ref_type, ref_id)
       VALUES ($1,$2,'list_share',$3)
       RETURNING id, user_id, body, ref_type, ref_id, created_at`,
      [me, body, listId]
    );
    res.status(201).json({ post: post.rows[0] });
  } catch (err) {
    console.error('[lists] share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lists/:listId — Phase 9A: view a list (owner always; others only if public)
router.get('/:listId', optionalAuth, async (req, res) => {
  try {
    const me = req.user && req.user.id;
    const { listId } = req.params;
    const r = await pool.query(
      `SELECT l.id, l.user_id, l.name, l.description, l.is_public, l.created_at, l.updated_at,
              u.username, u.display_name, u.avatar_url
         FROM lists l JOIN users u ON u.id = l.user_id
        WHERE l.id = $1`,
      [listId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'List not found' });
    const list = r.rows[0];
    if (!list.is_public && list.user_id !== me) {
      return res.status(403).json({ error: 'This list is private' });
    }
    const venues = await pool.query(
      `SELECT v.id, v.slug, v.name, v.type, v.image_url, v.rating, v.neighborhood, v.price_label
         FROM list_venues lv JOIN venues v ON lv.venue_id = v.id
        WHERE lv.list_id = $1 ORDER BY lv.added_at DESC`,
      [listId]
    );
    res.json({ list: { ...list, venues: venues.rows, is_owner: list.user_id === me } });
  } catch (err) {
    console.error('[lists] detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;