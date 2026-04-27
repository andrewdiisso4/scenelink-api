const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Helper: build WHERE clause from query params
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

  conditions.push('v.is_active = true');
  return { where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : 'WHERE v.is_active = true', values };
}

const VENUE_COLUMNS = `
  v.id, v.slug, v.name, v.type, v.category, v.cuisine, v.genre,
  v.address, v.neighborhood, v.city, v.state, v.zip_code,
  v.lat, v.lng, v.description, v.short_desc, v.phone, v.website, v.email,
  v.price_level, v.price_label, v.hours_json, v.hours_display, v.is_open_now,
  v.image_url, v.image_urls, v.cover_image_url,
  v.rating, v.review_count, v.buzz_score, v.going_count, v.friends_going,
  v.cover_charge, v.dress_code, v.tags, v.badges, v.features,
  v.vibe, v.highlight, v.why_hot, v.pair_with,
  v.spotlight, v.trending, v.featured, v.time_slot,
  v.is_active, v.is_claimed,
  v.reservation_url, v.opentable_url, v.resy_url, v.yelp_url, v.google_maps_url, v.place_id, v.source,
  v.osm_id, v.osm_type, v.data_quality, v.data_quality_score, v.vibe_tags, v.external_id,
  v.created_at, v.updated_at
`;

// GET /api/venues
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    const offset = parseInt(req.query.offset) || 0;

    const countQ = await pool.query(`SELECT COUNT(*) FROM venues v ${where}`, values);
    const total = parseInt(countQ.rows[0].count);

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v ${where} ORDER BY v.rating DESC, v.buzz_score DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    res.json({ venues: result.rows, total, limit, offset });
  } catch (err) {
    console.error('Venues list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/tonight
router.get('/tonight', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v ${where} ORDER BY v.buzz_score DESC, v.rating DESC`,
      values
    );
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Tonight error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/explore
router.get('/explore', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v ${where} ORDER BY v.rating DESC, v.review_count DESC`,
      values
    );
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Explore error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/nightlife
router.get('/nightlife', optionalAuth, async (req, res) => {
  try {
    const baseFilters = buildVenueFilters(req.query);
    // Add nightlife type filter
    const nightlifeTypes = ['bar', 'nightclub', 'lounge', 'cocktail_bar', 'brewery', 'beer_hall', 'dive_bar', 'rooftop_bar'];
    const typePlaceholders = nightlifeTypes.map((_, i) => `$${baseFilters.values.length + i + 1}`).join(',');
    const where = baseFilters.where + ` AND v.type IN (${typePlaceholders})`;
    const values = [...baseFilters.values, ...nightlifeTypes];

    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v ${where} ORDER BY v.buzz_score DESC, v.rating DESC`,
      values
    );
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Nightlife error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/featured
router.get('/featured', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v WHERE v.is_active = true AND (v.featured = true OR v.trending = true OR v.spotlight = true) ORDER BY v.rating DESC`,
    );
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Featured error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/search
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { where, values } = buildVenueFilters(req.query);
    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v ${where} ORDER BY v.rating DESC LIMIT 50`,
      values
    );
    res.json({ venues: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/slug/:slug
router.get('/slug/:slug', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v WHERE v.slug = $1 AND v.is_active = true`,
      [req.params.slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const venue = result.rows[0];

    // Get reviews
    const reviews = await pool.query(
      `SELECT r.id, r.rating, r.content, r.created_at, u.display_name, u.avatar_url
       FROM reviews r JOIN users u ON r.user_id = u.id
       WHERE r.venue_id = $1 ORDER BY r.created_at DESC LIMIT 10`,
      [venue.id]
    );

    // Get similar venues (same type, different venue)
    const similar = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v WHERE v.type = $1 AND v.id != $2 AND v.is_active = true ORDER BY v.rating DESC LIMIT 4`,
      [venue.type, venue.id]
    );

    res.json({ venue, reviews: reviews.rows, similar_venues: similar.rows });
  } catch (err) {
    console.error('Venue detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/nearby — geospatial search (lat/lng + radius km)
router.get('/nearby', optionalAuth, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = Math.min(parseFloat(req.query.radius_km) || 2, 25); // km, capped
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat & lng are required numbers' });
    }
    // Bounding box prefilter (degrees) for index usage
    const dlat = radius / 111;
    const dlng = radius / (111 * Math.cos(lat * Math.PI/180));
    const south = lat - dlat, north = lat + dlat, west = lng - dlng, east = lng + dlng;

    // Haversine distance in km via SQL
    const q = `
      SELECT ${VENUE_COLUMNS},
             v.vibe_tags, v.data_quality, v.data_quality_score,
             (6371 * acos(
                LEAST(1, GREATEST(-1,
                  cos(radians($1)) * cos(radians(v.lat::float)) *
                  cos(radians(v.lng::float) - radians($2)) +
                  sin(radians($1)) * sin(radians(v.lat::float))
                ))
             )) AS distance_km
      FROM venues v
      WHERE v.is_active = true
        AND v.lat IS NOT NULL AND v.lng IS NOT NULL
        AND v.lat BETWEEN $3 AND $4
        AND v.lng BETWEEN $5 AND $6
      ORDER BY distance_km ASC
      LIMIT $7
    `;
    const r = await pool.query(q, [lat, lng, south, north, west, east, limit]);
    // Filter again precisely by radius
    const venues = r.rows.filter(v => (v.distance_km || 0) <= radius);
    res.json({
      venues,
      total: venues.length,
      origin: { lat, lng },
      radius_km: radius,
      attribution: 'Includes data © OpenStreetMap contributors (ODbL) where source=openstreetmap'
    });
  } catch (err) {
    console.error('Venues nearby error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/venues/:id (UUID-based lookup)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid venue ID format' });
    }

    const result = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v WHERE v.id = $1 AND v.is_active = true`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const venue = result.rows[0];

    const reviews = await pool.query(
      `SELECT r.id, r.rating, r.content, r.created_at, u.display_name, u.avatar_url
       FROM reviews r JOIN users u ON r.user_id = u.id
       WHERE r.venue_id = $1 ORDER BY r.created_at DESC LIMIT 10`,
      [venue.id]
    );

    const similar = await pool.query(
      `SELECT ${VENUE_COLUMNS} FROM venues v WHERE v.type = $1 AND v.id != $2 AND v.is_active = true ORDER BY v.rating DESC LIMIT 4`,
      [venue.type, venue.id]
    );

    res.json({ venue, reviews: reviews.rows, similar_venues: similar.rows });
  } catch (err) {
    console.error('Venue by ID error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




module.exports = router;
