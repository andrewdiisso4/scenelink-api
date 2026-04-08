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
app.use('/api/venues', require('./routes/venues'));
app.use('/api/events', require('./routes/events'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/checkins', require('./routes/checkins'));

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

    // Check if we need to seed
    const venueCount = await pool.query('SELECT COUNT(*) FROM venues');
    if (parseInt(venueCount.rows[0].count) === 0) {
      console.log('📦 Database empty, running seed...');
      const { seedDatabase } = require('./seeds/seed');
      await seedDatabase(pool);
      console.log('✅ Database seeded successfully');
    } else {
      console.log(`✅ Database already has ${venueCount.rows[0].count} venues`);
    }
  } catch (err) {
    console.error('❌ Database init error:', err.message);
    // Don't crash — schema might already exist with different extension setup
    // Try just checking connection
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database connection OK (schema may need manual init)');
    } catch (connErr) {
      console.error('❌ Cannot connect to database:', connErr.message);
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