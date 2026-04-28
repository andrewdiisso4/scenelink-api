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
        { name: 'Back Bay',       bbox: [42.346, -71.094, 42.358, -71.069] },
        { name: 'Seaport',        bbox: [42.340, -71.048, 42.358, -71.020] },
        { name: 'North End',      bbox: [42.362, -71.060, 42.374, -71.048] },
        { name: 'Beacon Hill',    bbox: [42.355, -71.075, 42.364, -71.058] },
        { name: 'Fenway',         bbox: [42.338, -71.108, 42.350, -71.088] },
        { name: 'South End',      bbox: [42.332, -71.085, 42.346, -71.065] },
        { name: 'Downtown',       bbox: [42.352, -71.068, 42.362, -71.053] },
        { name: 'Chinatown',      bbox: [42.349, -71.064, 42.354, -71.057] },
        { name: 'Charlestown',    bbox: [42.370, -71.080, 42.396, -71.050] },
        { name: 'South Boston',   bbox: [42.325, -71.060, 42.355, -71.020] },
        { name: 'East Boston',    bbox: [42.360, -71.050, 42.400, -70.980] },
        { name: 'Dorchester',     bbox: [42.275, -71.090, 42.325, -71.030] },
        { name: 'Roxbury',        bbox: [42.310, -71.110, 42.340, -71.070] },
        { name: 'Mission Hill',   bbox: [42.325, -71.110, 42.340, -71.090] },
        { name: 'Mattapan',       bbox: [42.265, -71.105, 42.290, -71.075] },
        { name: 'Roslindale',     bbox: [42.275, -71.145, 42.300, -71.115] },
        { name: 'West Roxbury',   bbox: [42.260, -71.175, 42.295, -71.135] },
        { name: 'Hyde Park',      bbox: [42.240, -71.145, 42.275, -71.110] },
        { name: 'Brighton',       bbox: [42.338, -71.175, 42.365, -71.145] },
        { name: 'Allston',        bbox: [42.348, -71.145, 42.365, -71.118] },
        { name: 'Jamaica Plain',  bbox: [42.300, -71.130, 42.325, -71.095] },
        { name: 'Cambridge',      bbox: [42.361, -71.130, 42.405, -71.080] },
        { name: 'Somerville',     bbox: [42.375, -71.130, 42.420, -71.075] },
        { name: 'Brookline',      bbox: [42.318, -71.145, 42.355, -71.108] },
        { name: 'Watertown',      bbox: [42.360, -71.195, 42.385, -71.160] },
        { name: 'Medford',        bbox: [42.400, -71.135, 42.440, -71.080] },
        { name: 'Chelsea',        bbox: [42.385, -71.045, 42.410, -71.010] },
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


// ---- Normalize categories (dedupe café/cafe, etc.) ----
router.post('/normalize/categories', async (req, res) => {
  try {
    const MAP = {
      // de-accent / case variants
      'café': 'cafe',
      'Café': 'cafe',
      'CAFE': 'cafe',
      'Cafe': 'cafe',
      'Bar': 'bar',
      'BAR': 'bar',
      'Restaurant': 'restaurant',
      'RESTAURANT': 'restaurant',
      'Pub': 'pub',
      'Night Club': 'nightclub',
      'Night club': 'nightclub',
      'night club': 'nightclub',
      'Nightclub': 'nightclub',
      'Fast Food': 'fast_food',
      'fast food': 'fast_food',
      'Fast-food': 'fast_food',
      'Ice Cream': 'ice_cream',
      'ice cream': 'ice_cream',
      'Ice cream': 'ice_cream',
      'Bakery': 'bakery',
      'BAKERY': 'bakery',
      'Brewery': 'brewery',
      'Theatre': 'theatre',
      'Theater': 'theatre',
      'theater': 'theatre',
      'Cinema': 'cinema',
      'CINEMA': 'cinema',
      'Winery': 'winery',
      'Wine Bar': 'wine_bar',
      'wine bar': 'wine_bar',
      'Coffee Shop': 'cafe',
      'coffee shop': 'cafe',
      'Coffee': 'cafe',
    };
    let updated = 0;
    for (const [from, to] of Object.entries(MAP)) {
      const r = await pool.query(
        `UPDATE venues SET category = $1, updated_at = NOW() WHERE category = $2`,
        [to, from]
      );
      updated += r.rowCount;
    }
    // Also normalize type → Title Case-aware copy to category when missing
    const r2 = await pool.query(
      `UPDATE venues SET category = LOWER(type), updated_at = NOW()
       WHERE (category IS NULL OR category = '') AND type IS NOT NULL AND type != ''`);
    updated += r2.rowCount;
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Assign vibe_tags from category + name heuristics ----
router.post('/enrich/vibes', async (req, res) => {
  try {
    // Pull all venues missing vibes
    const rows = await pool.query(`SELECT id, name, category, type, neighborhood FROM venues
                                    WHERE (vibe_tags IS NULL OR jsonb_array_length(vibe_tags) = 0)
                                    LIMIT 5000`);
    let updated = 0;
    for (const v of rows.rows) {
      const tags = new Set();
      const cat = (v.category || v.type || '').toLowerCase();
      const nameLC = (v.name || '').toLowerCase();
      const nhood = (v.neighborhood || '').toLowerCase();
      // Base vibe from category
      if (cat.includes('nightclub') || cat.includes('club')) { tags.add('lively'); tags.add('late-night'); tags.add('groups'); }
      if (cat.includes('bar') || cat === 'pub') { tags.add('drinks'); tags.add('groups'); }
      if (cat.includes('wine')) { tags.add('date-night'); tags.add('upscale'); tags.add('cocktails'); }
      if (cat === 'brewery') { tags.add('drinks'); tags.add('groups'); tags.add('casual'); }
      if (cat === 'cafe' || cat === 'coffee shop') { tags.add('casual'); tags.add('low-key'); tags.add('daytime'); }
      if (cat === 'restaurant') { tags.add('dinner'); }
      if (cat === 'theatre' || cat === 'cinema') { tags.add('date-night'); tags.add('groups'); }
      // Name heuristics
      if (nameLC.includes('lounge')) { tags.add('upscale'); tags.add('date-night'); tags.add('cocktails'); }
      if (nameLC.includes('rooftop')) { tags.add('upscale'); tags.add('date-night'); }
      if (nameLC.includes('sports')) { tags.add('sports-bar'); tags.add('groups'); tags.add('casual'); }
      if (nameLC.includes('jazz')) { tags.add('live-music'); tags.add('date-night'); tags.add('low-key'); }
      if (nameLC.includes('irish') || nameLC.includes('pub')) { tags.add('groups'); tags.add('casual'); }
      if (nameLC.includes('tapas')) { tags.add('date-night'); tags.add('groups'); }
      if (nameLC.includes('steak') || nameLC.includes('chophouse')) { tags.add('upscale'); tags.add('date-night'); tags.add('dinner'); }
      if (nameLC.includes('bistro')) { tags.add('date-night'); tags.add('dinner'); }
      if (nameLC.includes('speakeasy')) { tags.add('cocktails'); tags.add('date-night'); tags.add('upscale'); }
      if (nameLC.includes('cocktail')) { tags.add('cocktails'); }
      if (nameLC.includes('diner')) { tags.add('casual'); tags.add('late-night'); }
      if (nameLC.includes('pizza')) { tags.add('casual'); tags.add('groups'); }
      // Neighborhood hints
      if (nhood === 'seaport' || nhood === 'back bay' || nhood === 'beacon hill') tags.add('upscale');
      if (nhood === 'fenway' || nhood === 'allston') tags.add('groups');
      if (nhood === 'north end') tags.add('date-night');

      if (tags.size) {
        await pool.query(`UPDATE venues SET vibe_tags = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(Array.from(tags)), v.id]);
        updated++;
      }
    }
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;