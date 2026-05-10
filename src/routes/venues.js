const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * ------------------------------------------------------------------
 * Payload tiers (performance optimisation pass 2026-05-08)
 * ------------------------------------------------------------------
 *  - CARD_COLUMNS     ~400 B/venue  — list/grid views
 *  - MAP_COLUMNS      ~120 B/venue  — map markers (bounded queries)
 *  - DETAIL_COLUMNS   ~2 KB/venue   — venue-details page only
 *
 * The legacy /api/venues route returns CARD tier by default; passing
 * ?view=detail keeps backwards compatibility for pages that still read
 * the full object.
 * ------------------------------------------------------------------
 */

// Thumbnail (single best photo) — derived from google_photo_names[0] when present,
// else a non-stock image_url, else null so the client falls back to category SVG.
const THUMB_EXPR = `
  CASE
    WHEN v.google_photo_names IS NOT NULL
         AND jsonb_array_length(v.google_photo_names) > 0
      THEN '/api/photo?name=' ||
           (v.google_photo_names->>0)
           || '&w=600'
    WHEN v.image_url IS NOT NULL
         AND v.image_url NOT LIKE '%unsplash.com%'
         AND v.image_url NOT LIKE '%pexels.com%'
      THEN v.image_url
    ELSE NULL
  END AS thumbnail_url
`;

// Card payload — ONLY fields needed to render a list/grid card
const CARD_COLUMNS = `
  v.id, v.slug, v.name,
  v.type, v.category, v.cuisine,
  v.neighborhood,
  v.price_level, v.price_label,
  v.rating, v.review_count,
  v.lat, v.lng,
  v.is_open_now,
  v.has_real_photo,
  v.trending, v.featured, v.spotlight,
  v.reservation_url, v.reservation_live, v.reservation_provider,
  v.website,
  ${THUMB_EXPR}
`;

// Map-marker payload — bare minimum for clustering + popup
const MAP_COLUMNS = `
  v.id, v.slug, v.name,
  v.type, v.category,
  v.lat, v.lng,
  v.rating, v.buzz_score
`;

// Full venue detail (used only by /api/venues/:id and ?view=detail)
const DETAIL_COLUMNS = `
  v.id, v.slug, v.name, v.type, v.category, v.cuisine, v.genre,
  v.address, v.neighborhood, v.city, v.state, v.zip_code,
  v.lat, v.lng, v.description, v.short_desc, v.phone, v.website, v.email,
  v.price_level, v.price_label, v.hours_json, v.hours_display, v.is_open_now,
  v.image_url, v.image_urls, v.cover_image_url,
  v.rating, v.review_count, v.buzz_score, v.going_count, v.friends_going,
  v.cover_charge, v.dress_code, v.tags, v.badges, v.features,
  v.vibe, v.vibe_tags, v.highlight, v.why_hot, v.pair_with,
  v.spotlight, v.trending, v.featured, v.time_slot,
  v.is_active, v.is_claimed,
  v.reservation_url, v.opentable_url, v.resy_url, v.yelp_url,
  v.google_maps_url, v.place_id, v.source,
  v.google_place_id, v.google_photo_names, v.has_real_photo,
  v.website_live, v.reservation_live, v.reservation_provider,
  v.business_status, v.needs_manual_review, v.review_reasons, v.data_quality_score,
  v.enriched_at,
  v.created_at, v.updated_at,
  ${THUMB_EXPR}
`;

function columnsForView(view) {
  if (view === 'detail') return DETAIL_COLUMNS;
  if (view === 'map')    return MAP_COLUMNS;
  return CARD_COLUMNS;
}

// ------------------------------------------------------------------
// Filters
// ------------------------------------------------------------------
function buildVenueFilters(query) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (query.type && query.type !== 'all') {
    conditions.push(`v.type = $${idx++}`);
    values.push(query.type);
  }
  if (query.cuisine && query.cuisine !== 'all') {
    conditions.push(`v.cuisine ILIKE $${idx++}`);
    values.push(`%${query.cuisine}%`);
  }
  if (query.neighborhood && query.neighborhood !== 'all') {
    conditions.push(`v.neighborhood ILIKE $${idx++}`);
    values.push(`%${query.neighborhood}%`);
  }
  if (query.price_level) {
    conditions.push(`v.price_level = $${idx++}`);
    values.push(parseInt(query.price_level));
  }
  if (query.vibe) {
    conditions.push(`v.vibe ILIKE $${idx++}`);
    values.push(`%${query.vibe}%`);
  }
  if (query.time_slot && query.time_slot !== 'all') {
    conditions.push(`v.time_slot = $${idx++}`);
    values.push(query.time_slot);
  }
  if (query.q || query.search) {
    const term = query.q || query.search;
    conditions.push(`(v.name ILIKE $${idx} OR v.cuisine ILIKE $${idx} OR v.neighborhood ILIKE $${idx} OR v.description ILIKE $${idx})`);
    values.push(`%${term}%`);
    idx++;
  }

  // Geospatial bounding box for map views: "sw_lat,sw_lng,ne_lat,ne_lng"
  const bbox = query.bbox;
  if (bbox) {
    const parts = String(bbox).split(',').map(parseFloat);
    if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
      conditions.push(`v.lat BETWEEN $${idx} AND $${idx + 1}`);
      values.push(parts[0], parts[2]); idx += 2;
      conditions.push(`v.lng BETWEEN $${idx} AND $${idx + 1}`);
      values.push(parts[1], parts[3]); idx += 2;
    }
  }

  conditions.push('v.is_active = true');
  return {
    where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : 'WHERE v.is_active = true',
    values
  };
}

function sendCached(res, seconds = 60) {
  res.setHeader('Cache-Control', `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=30`);
}

// ------------------------------------------------------------------
// Routes (ordered — specific routes BEFORE /:id)
// ------------------------------------------------------------------

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const view = req.query.view === 'detail' ? 'detail' : 'card';
    const columns = columnsForView(view);
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;

    const countPromise = pool.query(`SELECT COUNT(*) FROM venues v ${where}`, values);
    values.push(limit, offset);
    const rowsPromise = pool.query(
      `SELECT ${columns} FROM venues v ${where} ORDER BY v.rating DESC NULLS LAST, v.buzz_score DESC NULLS LAST LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const [countQ, result] = await Promise.all([countPromise, rowsPromise]);
    const total = parseInt(countQ.rows[0].count);

    sendCached(res, 60);
    res.json({ venues: result.rows, total, limit, offset, view });
  } catch (err) {
    console.error('Venues list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/map', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
    values.push(limit);
    const result = await pool.query(
      `SELECT ${MAP_COLUMNS} FROM venues v ${where} AND v.lat IS NOT NULL AND v.lng IS NOT NULL ORDER BY v.buzz_score DESC NULLS LAST LIMIT $${values.length}`,
      values
    );
    sendCached(res, 120);
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Map error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tonight', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const limit = Math.min(parseInt(req.query.limit) || 24, 60);
    values.push(limit);
    const result = await pool.query(
      `SELECT ${CARD_COLUMNS} FROM venues v ${where} AND (v.trending = true OR v.featured = true OR v.spotlight = true OR v.buzz_score >= 50) ORDER BY v.buzz_score DESC NULLS LAST, v.rating DESC NULLS LAST LIMIT $${values.length}`,
      values
    );
    sendCached(res, 60);
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Tonight error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/explore', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT ${CARD_COLUMNS} FROM venues v ${where} ORDER BY v.rating DESC NULLS LAST, v.review_count DESC NULLS LAST LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    sendCached(res, 60);
    res.json({ venues: result.rows, total: result.rows.length, limit, offset });
  } catch (err) {
    console.error('Explore error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/nightlife', optionalAuth, async (req, res) => {
  try {
    const baseFilters = buildVenueFilters(req.query);
    const nightlifeTypes = ['bar', 'nightclub', 'lounge', 'cocktail_bar', 'brewery', 'beer_hall', 'dive_bar', 'rooftop_bar'];
    const typePlaceholders = nightlifeTypes.map((_, i) => `$${baseFilters.values.length + i + 1}`).join(',');
    const where = baseFilters.where + ` AND v.type IN (${typePlaceholders})`;
    const values = [...baseFilters.values, ...nightlifeTypes];
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT ${CARD_COLUMNS} FROM venues v ${where} ORDER BY v.buzz_score DESC NULLS LAST, v.rating DESC NULLS LAST LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    sendCached(res, 60);
    res.json({ venues: result.rows, total: result.rows.length, limit, offset });
  } catch (err) {
    console.error('Nightlife error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/featured', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 30);
    const result = await pool.query(
      `SELECT ${CARD_COLUMNS} FROM venues v WHERE v.is_active = true AND (v.featured = true OR v.trending = true OR v.spotlight = true) ORDER BY v.rating DESC NULLS LAST LIMIT $1`,
      [limit]
    );
    sendCached(res, 120);
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Featured error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    values.push(limit);
    const result = await pool.query(
      `SELECT ${CARD_COLUMNS} FROM venues v ${where} ORDER BY v.rating DESC NULLS LAST LIMIT $${values.length}`,
      values
    );
    sendCached(res, 30);
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/slug/:slug', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${DETAIL_COLUMNS} FROM venues v WHERE v.slug = $1 AND v.is_active = true LIMIT 1`,
      [req.params.slug]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Venue not found' });
    sendCached(res, 300);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Venue slug error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${DETAIL_COLUMNS} FROM venues v WHERE v.id = $1 AND v.is_active = true LIMIT 1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Venue not found' });
    sendCached(res, 300);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Venue id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;