require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

// Initialize Sentry BEFORE the Express app and BEFORE any routes.
// Reads SENTRY_DSN, SENTRY_ENV, SENTRY_TRACES_SAMPLE_RATE from env.
// Fails safe — if DSN is missing or SDK unavailable, this is a no-op.
const sentry = require('./sentry');
sentry.init();

const app = express();
const PORT = process.env.PORT || 3001;

// Sentry request + tracing handlers MUST be the first middleware so they
// wrap every downstream handler.
sentry.attachRequestHandlers(app);

// Trust Render / Cloudflare proxy headers so rate-limiting + logging see real client IPs.
// Render terminates TLS and forwards via X-Forwarded-For.
app.set('trust proxy', 1);

// ==================== MIDDLEWARE ====================

// CORS — allow frontend origins
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:3000,https://scenelink.app,https://www.scenelink.app')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: function (origin, callback) {
    // Allow server-to-server / curl / mobile apps (no Origin header)
    if (!origin) return callback(null, true);
    // Approved list: env-configured origins + Netlify preview subdomains
    if (allowedOrigins.some(o => origin === o) || /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i.test(origin)) {
      return callback(null, true);
    }
    console.warn('[cors] blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
}));

// Helmet — sets HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc.
// CSP is disabled here because we serve only JSON (no HTML); the frontend CSP
// is enforced by Netlify. Permissions-Policy is set explicitly below.
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use((req, res, next) => {
    // Explicit Permissions-Policy + tighter defaults
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), interest-cohort=()');
    next();
});
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ==================== HEALTH CHECK ====================
app.get('/api/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() as time, (SELECT COUNT(*) FROM venues) as venue_count');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      db_time: dbResult.rows[0].time,
      venue_count: parseInt(dbResult.rows[0].venue_count),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

// ==================== API ROUTES ====================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/oauth')); // Google + Apple OAuth
app.use('/api/admin', require('./routes/admin')); // Admin dashboard API
app.use('/api/admin', require('./routes/demo'));  // Demo/reviewer account seed (admin-gated)
app.use('/api/venues', require('./routes/venues'));
app.use('/api/events', require('./routes/events_stream')); // Phase 9A SSE realtime (mounts /api/events/stream)
app.use('/api/events', require('./routes/events'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/checkins', require('./routes/checkins'));
app.use('/api/business', require('./routes/business'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/concierge', require('./routes/concierge'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/newsletter', require('./routes/newsletter')); // Newsletter subscriptions
app.use('/api/support', require('./routes/support')); // Dedicated contact support AI (separate from /api/concierge)
app.use('/api/photo', require('./routes/photo_proxy')); // Google Places photo proxy (keeps API key server-side)
app.use('/api/search', require('./routes/search')); // Universal header search across venues, neighborhoods, users

// Phase 3: Social + messaging (route files present but previously not mounted).
// Tables already exist in prod: conversations, conversation_participants, messages,
// friendships, notifications, posts, post_likes, post_comments.
app.use('/api/conversations', require('./routes/messages'));   // DM conversations
app.use('/api/friends',       require('./routes/friends'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/posts',         require('./routes/posts'));
app.use('/api/reports',       require('./routes/reports'));    // Content moderation reports
app.use('/api/push',          require('./routes/push'));       // Push token registration
app.use('/api/social',        require('./routes/social'));     // Social summary/badges
app.use('/api/media',         require('./routes/media'));      // Phase 9A media upload (capability-gated)

// Admin: force reseed (requires secret header)
app.post('/api/admin/reseed', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const { seedDatabase } = require('./seeds/seed');
    await seedDatabase(pool);
    const vc = await pool.query('SELECT COUNT(*) FROM venues');
    const ec = await pool.query('SELECT COUNT(*) FROM events');
    res.json({ ok: true, venue_count: parseInt(vc.rows[0].count), event_count: parseInt(ec.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for /api/users (profile endpoint alias)
app.get('/api/users/me', require('./middleware/auth').requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ user: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// /api/users/search + /api/users/:identifier — mounted AFTER the inline /api/users/me
// so the inline handler still wins for that specific path.
app.use('/api/users', require('./routes/users'));


// ==================== DATABASE MIGRATIONS ====================
async function runSqlMigrations() {
  const candidates = [
    path.join(__dirname, '..', 'migrations'),
    path.join(__dirname, 'migrations'),
  ];
  const seen = new Set();
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const key = path.join(dir, file);
      if (seen.has(key)) continue;
      seen.add(key);
      const sql = fs.readFileSync(key, 'utf8');
      if (!sql.trim()) continue;
      await pool.query(sql);
      console.log(`✅ Migration applied: ${file}`);
    }
  }
}


async function applySqlMigrations() {
  const dirs = [
    path.join(__dirname, '..', 'migrations'),
    path.join(__dirname, 'migrations')
  ];
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.sql')) files.push(path.join(dir, file));
    }
  }
  files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)) || a.localeCompare(b));
  const runAll = process.env.RUN_ALL_SQL_MIGRATIONS === 'true';
  const selected = runAll ? files : files.filter((file) => /^(002_|003_|004_|005_|006_).*\.sql$/i.test(path.basename(file)));
  for (const file of selected) {
    try {
      const sql = fs.readFileSync(file, 'utf8');
      if (!sql.trim()) continue;
      await pool.query(sql);
      console.log(`✅ Migration applied/verified: ${path.relative(path.join(__dirname, '..'), file)}`);
    } catch (err) {
      console.error(`❌ Migration failed: ${file}`, err.message || String(err));
      throw err;
    }
  }
}

// ==================== DATABASE INIT ====================
async function initDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'config', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✅ Database schema initialized');
    await applySqlMigrations();

    // Check if we need to seed. Re-seed if the DB was seeded with the old small dataset
    // (fewer than 100 venues means we should refresh with the big dataset).
    const venueCount = await pool.query('SELECT COUNT(*) FROM venues');
    const n = parseInt(venueCount.rows[0].count);
    const RESEED_THRESHOLD = parseInt(process.env.SEED_MIN_VENUES || '100', 10);
    if (n < RESEED_THRESHOLD || process.env.FORCE_RESEED === 'true') {
      console.log(`📦 Database has ${n} venues (< ${RESEED_THRESHOLD}), running full seed...`);
      const { seedDatabase } = require('./seeds/seed');
      await seedDatabase(pool);
      console.log('✅ Database seeded successfully');
    } else {
      console.log(`✅ Database already has ${n} venues`);
    }
  } catch (err) {
    console.error('❌ Database init error:', err.message || String(err), '| code:', err.code, '| first stack:', (err.stack||'').split('\n')[0]);
    console.error('❌ DATABASE_URL present?', !!process.env.DATABASE_URL, '| length:', (process.env.DATABASE_URL||'').length);
    // Don't crash — schema might already exist with different extension setup
    // Try just checking connection
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database connection OK (schema may need manual init)');
    } catch (connErr) {
      console.error('❌ Cannot connect to database:', connErr.message || String(connErr), '| code:', connErr.code);
    }
  }
}

// ==================== SENTRY QA TEST ROUTE (gated) ====================
// Triggers a controlled server-side exception so we can verify Sentry is wired.
// Gated by X-Admin-Secret header; safe to leave in production (requires secret).
app.get('/api/_sentry-test', (req, res, next) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const err = new Error('Sentry backend QA test ' + new Date().toISOString());
  err.status = 500;
  return next(err);
});

// ==================== ERROR HANDLING ====================
// 404 handler for unknown API routes (after all routes are mounted)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

// Sentry error handler MUST come BEFORE our own error handler so 5xx errors
// are reported before the response is formatted.
sentry.attachErrorHandler(app);

// Production-safe global error handler never leaks stack traces to clients
app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  // Log full detail server-side (Render logs), but NEVER in the response
  console.error('[unhandled error]', req.method, req.originalUrl, '|', err && err.message, isProd ? '' : (err && err.stack));
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error' : (err.message || 'Internal server error'),
  });
});

// ==================== START SERVER ====================
app.listen(PORT, async () => {
  console.log(`🚀 SceneLink API running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
  await initDatabase();
});

module.exports = app;