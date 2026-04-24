const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'List name is required' });

    const result = await pool.query(
      `INSERT INTO lists (user_id, name, description) VALUES ($1, $2, $3)
       RETURNING id, name, description, is_public, created_at, updated_at`,
      [req.user.id, name, description || '']
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
    const { venue_id } = req.body;
    if (!venue_id) return res.status(400).json({ error: 'venue_id is required' });

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
    await pool.query(
      'DELETE FROM list_venues WHERE list_id = $1 AND venue_id = $2',
      [req.params.listId, req.params.venueId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Remove venue from list error:', err);
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

module.exports = router;