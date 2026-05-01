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

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== MIDDLEWARE ====================

// CORS — allow frontend origins
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:3000,https://scenelink.app,https://www.scenelink.app')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin === o || origin.endsWith('.netlify.app'))) {
      return callback(null, true);
    }
    callback(null, true); // Be permissive in production for now
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
app.use('/api/venues', require('./routes/venues'));
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

// ==================== DATABASE INIT ====================
async function initDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'config', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✅ Database schema initialized');

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

// ==================== START SERVER ====================
app.listen(PORT, async () => {
  console.log(`🚀 SceneLink API running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
  await initDatabase();
});

module.exports = app;