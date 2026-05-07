/**
 * Demo seed endpoint — provisions the reviewer account with seed data.
 * Admin-secret gated. Idempotent.
 *
 *   POST /api/admin/seed-demo-account  (header: X-Admin-Secret)
 *
 * Provisions:
 *   - User:  reviewer@scenelink.app  / SceneReview2026!
 *   - User:  reviewer-friend@scenelink.app  (companion for social/messaging screens)
 *   - 5 favorites (first 5 featured venues)
 *   - 2 lists: "Date Night Boston" (3 venues), "South End Brunch" (4 venues)
 *   - 1 plan: "Saturday Night Out" (3 stops) with both users as members
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'scenelink-prod-secret-change-me';
const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.role === 'admin') {
        req.user = decoded;
        return next();
      }
    } catch (_) {}
  }
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET) {
    return next();
  }
  return res.status(403).json({ error: 'forbidden' });
}

const REVIEWER_EMAIL = 'reviewer@scenelink.app';
const REVIEWER_PASSWORD = 'SceneReview2026!';
const REVIEWER_DISPLAY = 'App Reviewer';
const REVIEWER_USERNAME = 'reviewer';

const FRIEND_EMAIL = 'reviewer-friend@scenelink.app';
const FRIEND_PASSWORD = 'SceneReview2026-Friend';
const FRIEND_DISPLAY = 'Jordan Taylor';
const FRIEND_USERNAME = 'jordan_t';

async function upsertUser(email, password, display, username) {
  const hash = await bcrypt.hash(password, 10);
  // UPSERT — update password + display on every seed call (idempotent + recoverable)
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, username, city, role, is_active)
     VALUES ($1, $2, $3, $4, 'Boston', 'user', true)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       display_name  = EXCLUDED.display_name,
       username      = EXCLUDED.username,
       is_active     = true,
       updated_at    = NOW()
     RETURNING id, email, display_name, username`,
    [email, hash, display, username]
  );
  return result.rows[0];
}

async function ensureFavorite(userId, venueId) {
  // table definition: favorites (user_id, venue_id unique)
  await pool.query(
    `INSERT INTO favorites (user_id, venue_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, venueId]
  );
}

async function ensureList(userId, name, description, venueIds) {
  // Check if this exact named list already exists for this user (idempotent)
  const existing = await pool.query(
    `SELECT id FROM lists WHERE user_id = $1 AND name = $2 LIMIT 1`,
    [userId, name]
  );
  let listId;
  if (existing.rows.length) {
    listId = existing.rows[0].id;
    // Update description to latest
    await pool.query(`UPDATE lists SET description = $1, updated_at = NOW() WHERE id = $2`, [description, listId]);
  } else {
    const created = await pool.query(
      `INSERT INTO lists (user_id, name, description, is_public) VALUES ($1, $2, $3, true) RETURNING id`,
      [userId, name, description]
    );
    listId = created.rows[0].id;
  }
  // Ensure venues are in the list
  for (const venueId of venueIds) {
    await pool.query(
      `INSERT INTO list_venues (list_id, venue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [listId, venueId]
    );
  }
  return listId;
}

async function ensurePlan(userId, friendUserId, name, dateStr, venueIds) {
  const existing = await pool.query(
    `SELECT id FROM plans WHERE user_id = $1 AND name = $2 LIMIT 1`,
    [userId, name]
  );
  let planId;
  if (existing.rows.length) {
    planId = existing.rows[0].id;
    await pool.query(`UPDATE plans SET date = $1, updated_at = NOW() WHERE id = $2`, [dateStr, planId]);
  } else {
    const created = await pool.query(
      `INSERT INTO plans (user_id, name, date, status) VALUES ($1, $2, $3, 'draft') RETURNING id`,
      [userId, name, dateStr]
    );
    planId = created.rows[0].id;
  }
  for (const venueId of venueIds) {
    await pool.query(
      `INSERT INTO plan_venues (plan_id, venue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [planId, venueId]
    );
  }
  // Add both users as members (owner + friend)
  await pool.query(
    `INSERT INTO plan_members (plan_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
    [planId, userId]
  );
  if (friendUserId) {
    await pool.query(
      `INSERT INTO plan_members (plan_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [planId, friendUserId]
    );
  }
  return planId;
}

router.post('/seed-demo-account', requireAdmin, async (req, res) => {
  const report = { steps: [], success: false };
  try {
    // 1. Create/update users
    const reviewer = await upsertUser(REVIEWER_EMAIL, REVIEWER_PASSWORD, REVIEWER_DISPLAY, REVIEWER_USERNAME);
    report.steps.push({ step: 'user:reviewer', id: reviewer.id, email: reviewer.email });

    const friend = await upsertUser(FRIEND_EMAIL, FRIEND_PASSWORD, FRIEND_DISPLAY, FRIEND_USERNAME);
    report.steps.push({ step: 'user:friend', id: friend.id, email: friend.email });

    // 2. Pick 10 venues. Prefer featured/curated; fall back to top-rated.
    const venueQ = await pool.query(
      `SELECT id, name, neighborhood
         FROM venues
        WHERE is_active = true
        ORDER BY
          CASE WHEN LOWER(type) = 'restaurant' THEN 0 ELSE 1 END,
          COALESCE(friends_going, 0) DESC,
          created_at DESC
        LIMIT 12`
    );
    const venues = venueQ.rows;
    if (venues.length < 8) {
      return res.status(500).json({ error: 'not enough venues to seed', count: venues.length });
    }
    report.steps.push({ step: 'venues:selected', count: venues.length });

    // 3. Favorites (first 5)
    for (let i = 0; i < 5 && i < venues.length; i++) {
      await ensureFavorite(reviewer.id, venues[i].id);
    }
    report.steps.push({ step: 'favorites:seeded', count: Math.min(5, venues.length) });

    // 4. Lists
    const dateNightList = await ensureList(
      reviewer.id,
      'Date Night Boston',
      'Hand-picked spots for a great night out — intimate, vibey, and worth the reservation.',
      venues.slice(0, 3).map(v => v.id)
    );
    report.steps.push({ step: 'list:date-night', id: dateNightList });

    const brunchList = await ensureList(
      reviewer.id,
      'South End Brunch',
      'Lazy-Saturday-morning brunch spots in the South End and Back Bay.',
      venues.slice(3, 7).map(v => v.id)
    );
    report.steps.push({ step: 'list:brunch', id: brunchList });

    // 5. Plan — "Saturday Night Out" — 3 stops, both users as members
    const nextSat = (() => {
      const d = new Date();
      const daysUntilSat = (6 - d.getUTCDay() + 7) % 7 || 7;
      d.setUTCDate(d.getUTCDate() + daysUntilSat);
      return d.toISOString().slice(0, 10);
    })();
    const planId = await ensurePlan(
      reviewer.id,
      friend.id,
      'Saturday Night Out',
      nextSat,
      venues.slice(0, 3).map(v => v.id)
    );
    report.steps.push({ step: 'plan:saturday', id: planId, date: nextSat });

    // 6. Friend also adds one favorite so the social feed has something to show
    if (venues[7]) await ensureFavorite(friend.id, venues[7].id);
    if (venues[8]) await ensureFavorite(friend.id, venues[8].id);

    report.success = true;
    report.reviewer = {
      email: REVIEWER_EMAIL,
      password: REVIEWER_PASSWORD,
      id: reviewer.id,
    };
    report.friend = {
      email: FRIEND_EMAIL,
      display_name: FRIEND_DISPLAY,
      id: friend.id,
    };
    return res.json(report);
  } catch (err) {
    console.error('[demo-seed] error:', err && err.message, err && err.stack && err.stack.split('\n')[0]);
    report.error = err.message || String(err);
    return res.status(500).json(report);
  }
});

// Quick status check — confirms reviewer account exists (gated the same way)
router.get('/seed-demo-account/status', requireAdmin, async (req, res) => {
  try {
    const u = await pool.query(`SELECT id, email, display_name FROM users WHERE email = $1 LIMIT 1`, [REVIEWER_EMAIL]);
    if (!u.rows.length) return res.json({ exists: false });
    const userId = u.rows[0].id;
    const favs = await pool.query(`SELECT COUNT(*)::int AS n FROM favorites WHERE user_id = $1`, [userId]);
    const lists = await pool.query(`SELECT COUNT(*)::int AS n FROM lists WHERE user_id = $1`, [userId]);
    const plans = await pool.query(`SELECT COUNT(*)::int AS n FROM plans WHERE user_id = $1`, [userId]);
    return res.json({
      exists: true,
      user: u.rows[0],
      favorites: favs.rows[0].n,
      lists: lists.rows[0].n,
      plans: plans.rows[0].n,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;