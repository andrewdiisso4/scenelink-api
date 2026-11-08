/**
 * Admin event inspection and cleanup. Automatic public event writers are retired.
 * All routes require admin auth via shared middleware (JWT admin OR x-admin-secret).
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

// All routes admin-protected
router.use(requireAdmin);

// ============================================================
// GET /admin/events/summary
// ============================================================
router.get('/summary', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_active = true) AS active,
        COUNT(*) FILTER (WHERE date >= CURRENT_DATE) AS upcoming,
        COUNT(*) FILTER (WHERE date < CURRENT_DATE) AS past,
        COUNT(*) FILTER (WHERE source = 'ticketmaster') AS ticketmaster,
        COUNT(*) FILTER (WHERE source = 'eventbrite') AS eventbrite,
        COUNT(*) FILTER (WHERE source = 'manual' OR source IS NULL) AS manual,
        COUNT(*) FILTER (WHERE venue_id IS NOT NULL) AS with_venue,
        COUNT(*) FILTER (WHERE venue_id IS NULL) AS without_venue,
        COUNT(*) FILTER (WHERE is_featured = true) AS featured
      FROM events
    `);
    const imports = await pool.query(`SELECT COUNT(*)::int AS total, MAX(started_at) AS last_import_at FROM event_imports`);
    res.json({ ...r.rows[0], imports_total: imports.rows[0].total, last_import_at: imports.rows[0].last_import_at });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ============================================================
// GET /admin/events/list
// ============================================================
router.get('/list', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const q = req.query.q || '';
    const source = req.query.source || '';
    const scope = req.query.scope || ''; // upcoming|past|all
    const conds = [], vals = [];
    let i = 1;
    if (q) { conds.push(`(title ILIKE $${i} OR venue_name ILIKE $${i})`); vals.push(`%${q}%`); i++; }
    if (source) { conds.push(`source = $${i++}`); vals.push(source); }
    if (scope === 'upcoming') conds.push(`date >= CURRENT_DATE`);
    else if (scope === 'past') conds.push(`date < CURRENT_DATE`);
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const totalQ = await pool.query(`SELECT COUNT(*)::int AS total FROM events ${where}`, vals);
    vals.push(limit, offset);
    const r = await pool.query(`
      SELECT id, title, category, venue_id, venue_name, venue_neighborhood,
             date, start_time, end_date, price, source, external_id, event_url,
             is_featured, is_live, is_active, attending_count, created_at, updated_at
      FROM events ${where}
      ORDER BY date DESC, start_time
      LIMIT $${i++} OFFSET $${i++}
    `, vals);
    res.json({ events: r.rows, total: totalQ.rows[0].total, limit, offset });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ============================================================
// GET /admin/events/imports
// ============================================================
router.get('/imports', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const r = await pool.query(
      `SELECT * FROM event_imports ORDER BY started_at DESC LIMIT $1`, [limit]
    );
    res.json({ imports: r.rows, total: r.rows.length });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ============================================================
// POST /admin/events/cleanup — remove past events older than N days
// ============================================================
router.post('/cleanup', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(parseInt(req.body?.days) || 7, 365));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0,10);
    // Soft: mark is_active=false for events with date < cutoff
    const r = await pool.query(
      `UPDATE events SET is_active = false, updated_at = now()
        WHERE date < $1 AND is_active = true RETURNING id`,
      [cutoff]
    );
    res.json({ ok: true, deactivated: r.rowCount, cutoff });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Retired direct writers must not fetch, create, modify, reactivate or delete
// public events. Provider data belongs in isolated inactive staging pending review.
router.post('/import/ticketmaster', (_req, res) => res.status(410).json({
  ok: false,
  code: 'EVENT_IMPORT_REQUIRES_STAGING',
  error: 'Direct event import is retired. Use the reviewed inactive staging pipeline.',
  automatic_publication: false,
}));
router.post('/seed/curated', (_req, res) => res.status(410).json({
  ok: false,
  code: 'SYNTHETIC_EVENTS_DISABLED',
  error: 'Synthetic event generation is disabled. Real events require source review.',
}));

// ============================================================
// DELETE /admin/events/:id
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM events WHERE id=$1 RETURNING id`, [req.params.id]);
    res.json({ ok: r.rowCount > 0, deleted: r.rowCount });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
