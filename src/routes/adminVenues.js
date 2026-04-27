/**
 * /api/admin/venues/* — CSV import, OSM import, enrichment, data quality
 * All routes protected by requireAdmin (JWT role='admin' OR x-admin-secret).
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const {
  normalizeCsvRow, validateVenue, upsertVenue, computeQuality
} = require('../services/venue-helpers');
const {
  fetchVenues, osmToVenue, CATEGORY_FILTERS, CITY_PRESETS,
  MAX_BBOX_DEG, MAX_RESULTS, validateBbox
} = require('../services/osm-service');

// Protect all routes
router.use(requireAdmin);

// ---- list venues with filters (admin view — includes inactive) ----
router.get('/list', async (req, res) => {
  try {
    const q = req.query.q || '';
    const source = req.query.source || '';
    const quality = req.query.quality || '';
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const where = [];
    const vals = [];
    if (q)       { vals.push('%'+q+'%');   where.push(`(name ILIKE $${vals.length} OR address ILIKE $${vals.length} OR neighborhood ILIKE $${vals.length})`); }
    if (source)  { vals.push(source);      where.push(`source = $${vals.length}`); }
    if (quality) { vals.push(quality);     where.push(`data_quality = $${vals.length}`); }
    const wh = where.length ? 'WHERE ' + where.join(' AND ') : '';

    vals.push(limit, offset);
    const r = await pool.query(
      `SELECT id, slug, name, category, type, neighborhood, city, lat, lng, image_url,
              data_quality, data_quality_score, source, osm_id, osm_type, is_active, updated_at
       FROM venues ${wh}
       ORDER BY updated_at DESC
       LIMIT $${vals.length-1} OFFSET $${vals.length}`,
      vals
    );
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM venues ${wh}`, vals.slice(0, vals.length-2));
    res.json({ venues: r.rows, total: c.rows[0].n, limit, offset });
  } catch (err) {
    console.error('[admin/venues/list]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- summary stats for dashboard ----
router.get('/summary', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active)::int AS active,
        COUNT(*) FILTER (WHERE source = 'openstreetmap')::int AS osm,
        COUNT(*) FILTER (WHERE source = 'csv')::int AS csv,
        COUNT(*) FILTER (WHERE source = 'curated')::int AS curated,
        COUNT(*) FILTER (WHERE lat IS NULL OR lng IS NULL)::int AS missing_coords,
        COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '')::int AS missing_image,
        COUNT(*) FILTER (WHERE category IS NULL OR category = '')::int AS missing_category,
        COUNT(*) FILTER (WHERE neighborhood IS NULL OR neighborhood = '')::int AS missing_neighborhood,
        COUNT(*) FILTER (WHERE website IS NULL OR website = '')::int AS missing_website,
        AVG(data_quality_score)::int AS avg_quality
      FROM venues
    `);
    const imports = await pool.query(`SELECT COUNT(*)::int AS n, MAX(started_at) AS last_started FROM venue_imports`).catch(()=>({rows:[{n:0,last_started:null}]}));
    res.json({ ...r.rows[0], imports_total: imports.rows[0].n, last_import_at: imports.rows[0].last_started });
  } catch (err) {
    console.error('[admin/venues/summary]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- CSV import (accepts parsed JSON rows from frontend) ----
router.post('/import', async (req, res) => {
  try {
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : null;
    if (!rows) return res.status(400).json({ error: 'Body must be { rows: [...] }' });
    if (!rows.length) return res.status(400).json({ error: 'No rows' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Max 5000 rows per import' });

    const ifExists = (req.body.ifExists === 'skip') ? 'skip' : 'update';
    const label = (req.body.label || 'csv-import').substring(0, 200);

    const stats = { inserted: 0, updated: 0, skipped: 0, errored: 0 };
    const errors = [];

    for (let i=0; i<rows.length; i++) {
      const raw = rows[i];
      try {
        const v = normalizeCsvRow(raw);
        const valErrs = validateVenue(v);
        if (valErrs.length) {
          stats.errored++;
          errors.push({ row: i+1, name: raw.name || '', errors: valErrs });
          continue;
        }
        const result = await upsertVenue(pool, v, { ifExists });
        stats[result.action]++;
      } catch (err) {
        stats.errored++;
        errors.push({ row: i+1, name: (raw && raw.name) || '', errors: [err.message] });
      }
    }

    // Audit log
    const adminId = (req.admin && req.admin.userId) || null;
    await pool.query(
      `INSERT INTO venue_imports
       (admin_user_id, source, label, rows_total, rows_inserted, rows_updated, rows_skipped, rows_errored, errors, params, status, completed_at)
       VALUES ($1,'csv',$2,$3,$4,$5,$6,$7,$8,$9,'completed',NOW())`,
      [adminId, label, rows.length, stats.inserted, stats.updated, stats.skipped, stats.errored,
       JSON.stringify(errors.slice(0, 200)), JSON.stringify({ ifExists })]
    );

    res.json({ ok: true, total: rows.length, ...stats, errors: errors.slice(0, 50) });
  } catch (err) {
    console.error('[admin/venues/import]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- OSM preview (count only, no import) ----
router.post('/osm/preview', async (req, res) => {
  try {
    const { bbox, city, categories } = req.body || {};
    const cats = Array.isArray(categories) ? categories : [];
    let finalBbox = bbox;
    if (!finalBbox && city && CITY_PRESETS[city]) finalBbox = CITY_PRESETS[city].bbox;
    if (!finalBbox) return res.status(400).json({ error: 'bbox or city is required' });

    const { elements, endpoint, cached } = await fetchVenues(finalBbox, cats);
    const sample = elements.slice(0, 10).map(el => {
      const v = osmToVenue(el);
      return v ? { name: v.name, category: v.category, lat: v.lat, lng: v.lng } : null;
    }).filter(Boolean);

    res.json({
      ok: true,
      endpoint,
      cached,
      total: elements.length,
      bbox: finalBbox,
      categories: cats,
      sample,
      attribution: '© OpenStreetMap contributors (ODbL)'
    });
  } catch (err) {
    console.error('[admin/venues/osm/preview]', err);
    res.status(400).json({ error: err.message });
  }
});

// ---- OSM import ----
router.post('/osm/import', async (req, res) => {
  try {
    const { bbox, city, categories, limit, ifExists = 'skip' } = req.body || {};
    const cats = Array.isArray(categories) ? categories : [];
    let finalBbox = bbox;
    let label = 'osm-' + (cats.join(',') || 'all');
    if (!finalBbox && city && CITY_PRESETS[city]) {
      finalBbox = CITY_PRESETS[city].bbox;
      label = `osm-${city}-${cats.join(',')}`;
    }
    if (!finalBbox) return res.status(400).json({ error: 'bbox or city is required' });

    const importLimit = Math.min(parseInt(limit) || MAX_RESULTS, MAX_RESULTS);

    const { elements, endpoint, cached } = await fetchVenues(finalBbox, cats);
    const toImport = elements.slice(0, importLimit);

    const stats = { inserted: 0, updated: 0, skipped: 0, errored: 0 };
    const errors = [];

    for (let i=0; i<toImport.length; i++) {
      const el = toImport[i];
      try {
        const v = osmToVenue(el);
        if (!v) { stats.skipped++; continue; }
        const valErrs = validateVenue(v);
        if (valErrs.length) {
          stats.errored++;
          errors.push({ row: i+1, name: v.name, errors: valErrs });
          continue;
        }
        const result = await upsertVenue(pool, v, { ifExists: ifExists === 'update' ? 'update' : 'skip' });
        stats[result.action]++;
      } catch (err) {
        stats.errored++;
        errors.push({ row: i+1, name: (el.tags && el.tags.name) || '', errors: [err.message] });
      }
    }

    const adminId = (req.admin && req.admin.userId) || null;
    await pool.query(
      `INSERT INTO venue_imports
       (admin_user_id, source, label, rows_total, rows_inserted, rows_updated, rows_skipped, rows_errored, errors, params, status, completed_at)
       VALUES ($1,'osm',$2,$3,$4,$5,$6,$7,$8,$9,'completed',NOW())`,
      [adminId, label, toImport.length, stats.inserted, stats.updated, stats.skipped, stats.errored,
       JSON.stringify(errors.slice(0, 200)), JSON.stringify({ bbox: finalBbox, city, categories: cats, ifExists, cached, endpoint })]
    );

    res.json({
      ok: true,
      total_elements: elements.length,
      processed: toImport.length,
      ...stats,
      endpoint,
      cached,
      attribution: '© OpenStreetMap contributors (ODbL)'
    });
  } catch (err) {
    console.error('[admin/venues/osm/import]', err);
    res.status(400).json({ error: err.message });
  }
});

// ---- OSM helpers ----
router.get('/osm/categories', (req, res) => {
  res.json({
    categories: Object.keys(CATEGORY_FILTERS),
    city_presets: CITY_PRESETS,
    max_bbox_deg: MAX_BBOX_DEG,
    max_results: MAX_RESULTS,
    attribution: '© OpenStreetMap contributors (ODbL)'
  });
});

// ---- Import history ----
router.get('/imports', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 200);
    const r = await pool.query(
      `SELECT id, admin_user_id, source, label,
              rows_total, rows_inserted, rows_updated, rows_skipped, rows_errored,
              status, started_at, completed_at, params
       FROM venue_imports
       ORDER BY started_at DESC
       LIMIT $1`, [limit]);
    res.json({ imports: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Import errors ----
router.get('/imports/:id/errors', async (req, res) => {
  try {
    const r = await pool.query(`SELECT errors FROM venue_imports WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ errors: r.rows[0].errors || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Edit single venue ----
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['name','description','address','neighborhood','city','state',
                     'lat','lng','category','type','phone','website','reservation_url',
                     'image_url','cover_image_url','hours_display','price_level',
                     'is_active','featured','trending','data_quality'];
    const sets = [];
    const vals = [req.params.id];
    Object.keys(req.body || {}).forEach(k => {
      if (allowed.includes(k)) {
        vals.push(req.body[k]);
        sets.push(`${k}=$${vals.length}`);
      }
    });
    if (req.body.vibe_tags) {
      vals.push(JSON.stringify(req.body.vibe_tags));
      sets.push(`vibe_tags=$${vals.length}::jsonb`);
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid fields' });
    sets.push(`updated_at=NOW()`);
    const r = await pool.query(
      `UPDATE venues SET ${sets.join(', ')} WHERE id=$1
       RETURNING id, slug, name, data_quality, is_active`, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });

    // Recompute quality after edit
    const full = await pool.query(`SELECT name, address, city, neighborhood, category, lat, lng, image_url, website, phone, description, vibe_tags FROM venues WHERE id=$1`, [req.params.id]);
    if (full.rows.length) {
      const row = full.rows[0];
      const q = computeQuality({
        ...row,
        vibe_tags: Array.isArray(row.vibe_tags) ? row.vibe_tags : []
      });
      await pool.query(`UPDATE venues SET data_quality=$1, data_quality_score=$2 WHERE id=$3`,
        [q.status, q.score, req.params.id]);
    }
    res.json({ ok: true, venue: r.rows[0] });
  } catch (err) {
    console.error('[admin/venues/:id patch]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Deactivate venue ----
router.post('/:id/deactivate', async (req, res) => {
  try {
    const r = await pool.query(`UPDATE venues SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Recompute quality for all venues ----
router.post('/recompute-quality', async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, name, address, city, neighborhood, category, lat, lng, image_url, website, phone, description, vibe_tags FROM venues`);
    let updated = 0;
    for (const row of r.rows) {
      const q = computeQuality({
        ...row,
        vibe_tags: Array.isArray(row.vibe_tags) ? row.vibe_tags : []
      });
      await pool.query(`UPDATE venues SET data_quality=$1, data_quality_score=$2 WHERE id=$3`,
        [q.status, q.score, row.id]);
      updated++;
    }
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Enrich by backfilling Boston neighborhoods for venues with lat/lng ----
router.post('/enrich/neighborhoods', async (req, res) => {
  try {
    // Very rough Boston neighborhood bboxes. Admins can refine later.
    const HOODS = [
      { name: 'Back Bay',      bbox: [42.346, -71.094, 42.358, -71.069] },
      { name: 'Seaport',       bbox: [42.340, -71.048, 42.358, -71.020] },
      { name: 'North End',     bbox: [42.362, -71.060, 42.374, -71.048] },
      { name: 'Beacon Hill',   bbox: [42.355, -71.075, 42.364, -71.058] },
      { name: 'Fenway',        bbox: [42.338, -71.108, 42.350, -71.088] },
      { name: 'South End',     bbox: [42.332, -71.085, 42.346, -71.065] },
      { name: 'Downtown',      bbox: [42.352, -71.068, 42.362, -71.053] },
      { name: 'Cambridge',     bbox: [42.361, -71.120, 42.400, -71.080] },
      { name: 'Allston',       bbox: [42.348, -71.145, 42.365, -71.118] },
      { name: 'Jamaica Plain', bbox: [42.300, -71.130, 42.325, -71.100] },
      { name: 'Somerville',    bbox: [42.375, -71.120, 42.405, -71.075] },
    ];
    let updated = 0;
    for (const h of HOODS) {
      const r = await pool.query(
        `UPDATE venues SET neighborhood=$1, updated_at=NOW()
         WHERE (neighborhood IS NULL OR neighborhood = '')
           AND lat BETWEEN $2 AND $3
           AND lng BETWEEN $4 AND $5`,
        [h.name, h.bbox[0], h.bbox[2], h.bbox[1], h.bbox[3]]
      );
      updated += r.rowCount;
    }
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;