/**
 * SceneLink universal search
 * GET /api/search/universal?q=&limit=
 * Returns launch-safe venue, neighborhood, category, and people suggestions for the universal header search.
 */
const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

function clampLimit(value, fallback = 6, max = 12) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function normalizeQuery(q) {
  return String(q || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function cache(res, seconds = 20) {
  res.setHeader('Cache-Control', `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=30`);
}

const CARD_COLUMNS = `
  v.id, v.slug, v.name, v.type, v.category, v.cuisine, v.neighborhood,
  v.price_level, v.price_label, v.rating, v.review_count, v.buzz_score,
  CASE
    WHEN v.google_photo_names IS NOT NULL AND jsonb_array_length(v.google_photo_names) > 0
      THEN '/api/photo?name=' || (v.google_photo_names->>0) || '&w=480'
    WHEN v.image_url IS NOT NULL AND v.image_url NOT LIKE '%unsplash.com%' AND v.image_url NOT LIKE '%pexels.com%'
      THEN v.image_url
    ELSE NULL
  END AS thumbnail_url
`;

router.get('/universal', optionalAuth, async (req, res) => {
  try {
    const q = normalizeQuery(req.query.q || req.query.search);
    const limit = clampLimit(req.query.limit, 6, 12);

    if (!q) {
      const [venues, neighborhoods, categories] = await Promise.all([
        pool.query(
          `SELECT ${CARD_COLUMNS}
             FROM venues v
            WHERE v.is_active = true
            ORDER BY v.featured DESC NULLS LAST, v.trending DESC NULLS LAST, v.buzz_score DESC NULLS LAST, v.rating DESC NULLS LAST
            LIMIT $1`,
          [limit]
        ),
        pool.query(
          `SELECT neighborhood, COUNT(*)::int AS count
             FROM venues
            WHERE is_active = true AND neighborhood IS NOT NULL AND neighborhood <> ''
            GROUP BY neighborhood
            ORDER BY count DESC, neighborhood ASC
            LIMIT 8`
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(category,''), NULLIF(type,''), 'Venue') AS label, COUNT(*)::int AS count
             FROM venues
            WHERE is_active = true
            GROUP BY label
            ORDER BY count DESC, label ASC
            LIMIT 8`
        ),
      ]);
      cache(res, 60);
      return res.json({
        query: q,
        venues: venues.rows,
        people: [],
        neighborhoods: neighborhoods.rows,
        categories: categories.rows,
        suggestions: ['Date night', 'Rooftop bars', 'North End Italian', 'Live music', 'Cocktails'],
      });
    }

    const like = `%${q.toLowerCase()}%`;
    const prefix = `${q.toLowerCase()}%`;
    const me = req.user && req.user.id;

    const peopleSql = me
      ? `SELECT u.id, u.username, u.display_name, u.avatar_url, u.neighborhood, 'person' AS kind
           FROM users u
          WHERE u.is_active = true
            AND u.id <> $3
            AND (LOWER(u.username) LIKE $1 OR LOWER(u.display_name) LIKE $1)
            AND u.id NOT IN (
              SELECT blocked_id FROM user_blocks WHERE blocker_id = $3
              UNION
              SELECT blocker_id FROM user_blocks WHERE blocked_id = $3
            )
          ORDER BY CASE
              WHEN LOWER(u.username) = $2 THEN 0
              WHEN LOWER(u.username) LIKE $2 THEN 1
              WHEN LOWER(u.display_name) LIKE $2 THEN 2
              ELSE 3 END,
            u.display_name ASC NULLS LAST
          LIMIT ${Math.min(limit, 6)}`
      : `SELECT u.id, u.username, u.display_name, u.avatar_url, u.neighborhood, 'person' AS kind
           FROM users u
          WHERE u.is_active = true
            AND (LOWER(u.username) LIKE $1 OR LOWER(u.display_name) LIKE $1)
          ORDER BY CASE
              WHEN LOWER(u.username) = $2 THEN 0
              WHEN LOWER(u.username) LIKE $2 THEN 1
              WHEN LOWER(u.display_name) LIKE $2 THEN 2
              ELSE 3 END,
            u.display_name ASC NULLS LAST
          LIMIT ${Math.min(limit, 6)}`;

    const [venues, people, neighborhoods, categories] = await Promise.all([
      pool.query(
        `SELECT ${CARD_COLUMNS},
                CASE
                  WHEN LOWER(v.name) = $2 THEN 0
                  WHEN LOWER(v.name) LIKE $2 THEN 1
                  WHEN LOWER(v.neighborhood) LIKE $2 THEN 2
                  WHEN LOWER(COALESCE(v.cuisine,'')) LIKE $2 THEN 3
                  ELSE 4
                END AS match_rank
           FROM venues v
          WHERE v.is_active = true
            AND (
              LOWER(v.name) LIKE $1 OR LOWER(COALESCE(v.cuisine,'')) LIKE $1 OR
              LOWER(COALESCE(v.neighborhood,'')) LIKE $1 OR LOWER(COALESCE(v.type,'')) LIKE $1 OR
              LOWER(COALESCE(v.category,'')) LIKE $1 OR LOWER(COALESCE(v.vibe,'')) LIKE $1 OR
              LOWER(COALESCE(v.short_desc,'')) LIKE $1 OR LOWER(COALESCE(v.description,'')) LIKE $1
            )
          ORDER BY match_rank ASC, v.featured DESC NULLS LAST, v.buzz_score DESC NULLS LAST, v.rating DESC NULLS LAST
          LIMIT $3`,
        [like, prefix, limit]
      ),
      pool.query(peopleSql, me ? [like, prefix, me] : [like, prefix]),
      pool.query(
        `SELECT neighborhood, COUNT(*)::int AS count
           FROM venues
          WHERE is_active = true AND neighborhood IS NOT NULL AND neighborhood <> '' AND LOWER(neighborhood) LIKE $1
          GROUP BY neighborhood
          ORDER BY CASE WHEN LOWER(neighborhood) LIKE $2 THEN 0 ELSE 1 END, count DESC, neighborhood ASC
          LIMIT 6`,
        [like, prefix]
      ),
      pool.query(
        `SELECT label, COUNT(*)::int AS count
           FROM (
             SELECT COALESCE(NULLIF(cuisine,''), NULLIF(category,''), NULLIF(type,''), 'Venue') AS label
               FROM venues
              WHERE is_active = true
                AND LOWER(COALESCE(cuisine, category, type, '')) LIKE $1
           ) c
          GROUP BY label
          ORDER BY CASE WHEN LOWER(label) LIKE $2 THEN 0 ELSE 1 END, count DESC, label ASC
          LIMIT 6`,
        [like, prefix]
      ),
    ]);

    cache(res, 20);
    res.json({
      query: q,
      venues: venues.rows,
      people: people.rows,
      neighborhoods: neighborhoods.rows,
      categories: categories.rows,
      suggestions: [q, `${q} tonight`, `${q} near me`, `${q} Boston`].slice(0, 4),
    });
  } catch (err) {
    console.error('[search] universal error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
