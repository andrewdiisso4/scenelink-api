/**
 * Admin Events routes — automated importers, cleanup, history.
 * All routes require admin auth via shared middleware (JWT admin OR x-admin-secret).
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

// All routes admin-protected
router.use(requireAdmin);

// ============================================================
// Helpers
// ============================================================

function catMap(tmClass) {
  // Ticketmaster segment.name -> our category
  const s = (tmClass || '').toLowerCase();
  if (s.includes('music')) return 'Live Music';
  if (s.includes('sports')) return 'Sports';
  if (s.includes('arts') || s.includes('theatre') || s.includes('theater')) return 'Arts & Culture';
  if (s.includes('film')) return 'Film';
  if (s.includes('misc')) return 'Nightlife';
  return 'Events';
}

async function findVenueMatch(name, lat, lng) {
  if (!name) return null;
  try {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nn = norm(name);
    // STRICT: only exact (normalized) name match. No substring matching — too lossy for concert venues.
    const r = await pool.query(
      `SELECT id, name, neighborhood, slug, lat, lng FROM venues
        WHERE is_active = true
          AND regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = $1
        LIMIT 1`,
      [nn]
    );
    if (r.rows.length) return r.rows[0];
    // Proximity fallback: only TIGHT 50m radius AND require name similarity (first word match)
    if (lat && lng && name.length >= 3) {
      const firstWord = name.split(/\s+/)[0].toLowerCase();
      if (firstWord.length >= 4) {
        const r2 = await pool.query(
          `SELECT id, name, neighborhood, slug, lat, lng,
            (6371 * acos(LEAST(1, cos(radians($1))*cos(radians(lat::float))*cos(radians(lng::float)-radians($2)) + sin(radians($1))*sin(radians(lat::float))))) AS km
            FROM venues WHERE is_active = true
              AND lat IS NOT NULL AND lng IS NOT NULL
              AND lower(name) LIKE $3
            ORDER BY km ASC LIMIT 1`,
          [lat, lng, firstWord + '%']
        );
        if (r2.rows.length && r2.rows[0].km <= 0.05) return r2.rows[0]; // 50m
      }
    }
  } catch (e) { console.error('findVenueMatch err:', e.message); }
  return null;
}

function formatTime(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
  } catch { return null; }
}

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

// ============================================================
// POST /admin/events/import/ticketmaster
// Body: { keyword?, size?, days_ahead?, city? }
// Requires TICKETMASTER_API_KEY env var. If missing, returns friendly error.
// ============================================================
router.post('/import/ticketmaster', async (req, res) => {
  const KEY = process.env.TICKETMASTER_API_KEY || process.env.SCENELINK_API_CONSUMER_KEY;
  if (!KEY) {
    return res.status(400).json({
      ok: false,
      error: 'Ticketmaster API key not configured',
      hint: 'Set TICKETMASTER_API_KEY (or SCENELINK_API_CONSUMER_KEY) env var in Render. Get a free key at https://developer.ticketmaster.com'
    });
  }
  const started = Date.now();
  const size = Math.min(parseInt(req.body?.size) || 50, 200);
  const days = Math.min(parseInt(req.body?.days_ahead) || 30, 180);
  const keyword = req.body?.keyword || '';
  const city = req.body?.city || 'Boston';

  // Build search window
  const today = new Date().toISOString().slice(0,19) + 'Z';
  const endD = new Date(Date.now() + days * 86400000).toISOString().slice(0,19) + 'Z';

  const params = new URLSearchParams({
    apikey: KEY,
    city,
    countryCode: 'US',
    startDateTime: today,
    endDateTime: endD,
    size: String(size),
    sort: 'date,asc',
    locale: '*'
  });
  if (keyword) params.set('keyword', keyword);

  // Log import start
  const logRes = await pool.query(
    `INSERT INTO event_imports (source, query) VALUES ('ticketmaster', $1) RETURNING id`,
    [JSON.stringify({ keyword, city, size, days_ahead: days })]
  );
  const importId = logRes.rows[0].id;

  let fetched = 0, inserted = 0, updated = 0, skipped = 0, errored = 0;
  let errSample = '';
  try {
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`Ticketmaster API returned ${r.status}`);
    const data = await r.json();
    const events = (data._embedded && data._embedded.events) || [];
    fetched = events.length;

    for (const ev of events) {
      try {
        const ext = ev.id;
        const title = ev.name;
        if (!title || !ext) { skipped++; continue; }
        const dates = ev.dates || {};
        const start = dates.start || {};
        const d = start.localDate || (start.dateTime ? start.dateTime.slice(0,10) : null);
        if (!d) { skipped++; continue; }
        const startTime = start.localTime ? formatTime(`2000-01-01T${start.localTime}`) :
                         (start.dateTime ? formatTime(start.dateTime) : null);
        const classifications = ev.classifications || [];
        const segment = classifications[0] && classifications[0].segment ? classifications[0].segment.name : '';
        const category = catMap(segment);
        const priceRange = ev.priceRanges && ev.priceRanges[0];
        const price = priceRange ? `$${Math.round(priceRange.min)}${priceRange.min !== priceRange.max ? '-$' + Math.round(priceRange.max) : ''}` : '';
        const imgs = ev.images || [];
        const bestImg = imgs.find(i => i.ratio === '16_9' && i.width >= 640) || imgs[0];
        const imageUrl = bestImg ? bestImg.url : null;
        const eventUrl = ev.url;

        // Venue info
        const emb = ev._embedded || {};
        const tmVenues = emb.venues || [];
        const tmv = tmVenues[0];
        const tmvName = tmv ? tmv.name : null;
        const tmvLat = tmv && tmv.location ? parseFloat(tmv.location.latitude) : null;
        const tmvLng = tmv && tmv.location ? parseFloat(tmv.location.longitude) : null;

        const matched = tmvName ? await findVenueMatch(tmvName, tmvLat, tmvLng) : null;

        // Upsert by (source, external_id)
        const existing = await pool.query(
          `SELECT id FROM events WHERE source = 'ticketmaster' AND external_id = $1`, [ext]
        );
        if (existing.rows.length) {
          await pool.query(`
            UPDATE events SET
              title = $1, description = $2, category = $3,
              venue_id = $4, venue_name = $5, venue_slug = $6, venue_neighborhood = $7,
              image_url = $8, date = $9, start_time = $10,
              price = $11, event_url = $12, raw_json = $13,
              is_active = true, updated_at = now()
            WHERE id = $14
          `, [
            title.slice(0,500),
            (ev.info || ev.pleaseNote || '').slice(0,2000),
            category,
            matched ? matched.id : null,
            matched ? matched.name : tmvName,
            matched ? matched.slug : null,
            matched ? matched.neighborhood : null,
            imageUrl,
            d,
            startTime,
            price,
            eventUrl,
            JSON.stringify({ tm_id: ext, segment }),
            existing.rows[0].id
          ]);
          updated++;
        } else {
          await pool.query(`
            INSERT INTO events (
              title, description, category, venue_id, venue_name, venue_slug, venue_neighborhood,
              image_url, date, start_time, price, source, external_id, event_url, raw_json,
              is_featured, is_active
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ticketmaster',$12,$13,$14,false,true)
          `, [
            title.slice(0,500),
            (ev.info || ev.pleaseNote || '').slice(0,2000),
            category,
            matched ? matched.id : null,
            matched ? matched.name : tmvName,
            matched ? matched.slug : null,
            matched ? matched.neighborhood : null,
            imageUrl,
            d,
            startTime,
            price,
            ext,
            eventUrl,
            JSON.stringify({ tm_id: ext, segment })
          ]);
          inserted++;
        }
      } catch (e) {
        errored++;
        errSample = errSample || e.message;
      }
    }
  } catch (e) {
    errSample = e.message;
  }

  const duration = Date.now() - started;
  await pool.query(
    `UPDATE event_imports SET rows_fetched=$1, rows_inserted=$2, rows_updated=$3,
      rows_skipped=$4, rows_errored=$5, duration_ms=$6, error_sample=$7, finished_at=now()
      WHERE id=$8`,
    [fetched, inserted, updated, skipped, errored, duration, errSample.slice(0,500), importId]
  );
  res.json({ ok: errored < fetched, fetched, inserted, updated, skipped, errored, duration_ms: duration, error_sample: errSample });
});

// ============================================================
// POST /admin/events/seed/curated — generates curated fallback events tied to real venues
// Body: { count?, categories? }
// Safe to run without external API keys.
// ============================================================
router.post('/seed/curated', async (req, res) => {
  try {
    const count = Math.min(parseInt(req.body?.count) || 30, 200);
    // Pull real venues to attach events to
    const vr = await pool.query(`
      SELECT id, name, slug, neighborhood, category, lat, lng
      FROM venues
      WHERE is_active = true
        AND neighborhood IS NOT NULL
        AND category IN ('bar','pub','nightclub','brewery','restaurant','cafe')
      ORDER BY random()
      LIMIT $1
    `, [count * 2]);

    const CURATED = [
      { title: 'Trivia Night', cat: 'Food & Drink', time: '8:00 PM', price: 'Free entry' },
      { title: 'Live Jazz Set', cat: 'Live Music', time: '8:30 PM', price: '$10' },
      { title: 'DJ Spotlight', cat: 'Nightlife', time: '10:00 PM', price: '$15' },
      { title: 'Weekend Brunch', cat: 'Brunch', time: '11:00 AM', price: '$25-$45' },
      { title: 'Happy Hour Specials', cat: 'Food & Drink', time: '5:00 PM', price: 'Free' },
      { title: 'Wine Tasting', cat: 'Food & Drink', time: '7:00 PM', price: '$35' },
      { title: 'Open Mic Comedy', cat: 'Comedy', time: '9:00 PM', price: 'Free' },
      { title: 'Acoustic Night', cat: 'Live Music', time: '7:30 PM', price: 'Free' },
      { title: 'Karaoke Night', cat: 'Nightlife', time: '9:30 PM', price: 'Free' },
      { title: 'Game Watch Party', cat: 'Sports', time: '7:00 PM', price: 'Free' },
    ];

    let inserted = 0;
    const now = new Date();
    for (let i = 0; i < Math.min(count, vr.rows.length); i++) {
      const v = vr.rows[i];
      const c = CURATED[i % CURATED.length];
      // Filter match: nightclub venues → nightlife, bar → food/drink etc
      const daysAhead = 1 + Math.floor(Math.random() * 14);
      const d = new Date(now.getTime() + daysAhead * 86400000).toISOString().slice(0,10);
      const extId = `curated_${v.id.slice(0,8)}_${i}`;
      try {
        const exists = await pool.query(`SELECT id FROM events WHERE source='curated' AND external_id=$1`, [extId]);
        if (exists.rows.length) continue;
        await pool.query(`
          INSERT INTO events (
            title, description, category, venue_id, venue_name, venue_slug, venue_neighborhood,
            image_url, date, start_time, price, source, external_id,
            is_featured, is_active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'curated',$12,$13,true)
        `, [
          `${c.title} at ${v.name}`,
          `${c.title} hosted at ${v.name} in ${v.neighborhood}.`,
          c.cat,
          v.id,
          v.name,
          v.slug,
          v.neighborhood,
          null, // let frontend fall back to venue image
          d,
          c.time,
          c.price,
          extId,
          Math.random() < 0.2
        ]);
        inserted++;
      } catch (e) { /* skip dupes */ }
    }
    res.json({ ok: true, inserted, attempted: Math.min(count, vr.rows.length) });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

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
