require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== MIDDLEWARE ====================

// CORS — strict origin whitelist
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:3000,https://scenelink.app,https://www.scenelink.app')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, server-to-server, curl in dev)
    if (!origin) return callback(null, true);
    // Allow Netlify preview deploys + configured origins
    if (
      allowedOrigins.some(o => origin === o) ||
      origin.endsWith('.netlify.app') ||
      (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1')))
    ) {
      return callback(null, true);
    }
    // Block unknown origins in production
    console.warn(`[CORS] Blocked origin: ${origin}`);
    callback(new Error('CORS policy: origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
}));

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://scenelink.app', 'https://www.scenelink.app'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb — prevent payload attacks
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ==================== RATE LIMITING ====================

// Global rate limit — all API routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  },
});
app.use('/api', globalLimiter);

// Strict rate limit for auth endpoints — prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login/signup attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes.' },
});

// Contact form rate limit — prevent spam
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 contact submissions per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact submissions. Please wait before submitting again.' },
});

// Concierge/AI rate limit
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 AI requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please slow down.' },
});

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
app.use('/api/auth', authLimiter, require('./routes/auth'));     // Auth: 10 req/15min
app.use('/api/auth', require('./routes/oauth'));                  // OAuth (no strict limit — uses provider tokens)
app.use('/api/admin', require('./routes/admin'));                 // Admin: protected by secret
app.use('/api/venues', require('./routes/venues'));
app.use('/api/events', require('./routes/events'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/checkins', require('./routes/checkins'));
app.use('/api/business', authLimiter, require('./routes/business')); // Business login: 10 req/15min
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/concierge', aiLimiter, require('./routes/concierge')); // AI: 20 req/min
app.use('/api/contact', contactLimiter, require('./routes/contact')); // Contact: 5 req/hr

// Admin: test email configuration
app.post('/api/admin/test-email', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Provide "to" email address in body' });

  // Check SMTP config
  const smtpConfigured = !!(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
    process.env.SENDGRID_API_KEY
  );

  if (!smtpConfigured) {
    return res.status(200).json({
      ok: false,
      smtp_configured: false,
      message: 'No SMTP credentials set. Add SMTP_HOST, SMTP_USER, SMTP_PASS (or SENDGRID_API_KEY) to Render env vars.',
      env_vars_needed: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'ADMIN_NOTIFY_EMAIL']
    });
  }

  try {
    const nodemailer = require('nodemailer');
    let transporter;
    if (process.env.SENDGRID_API_KEY) {
      transporter = nodemailer.createTransport({ host: 'smtp.sendgrid.net', port: 587, auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY } });
    } else {
      transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to,
      subject: '✅ SceneLink Email Test — SMTP Working',
      text: 'This is a test email from SceneLink backend. Your SMTP configuration is working correctly!',
      html: `<div style="font-family:sans-serif;max-width:480px;padding:24px;background:#111;color:#fff;border-radius:8px"><h3 style="color:#D4AF37">✅ SceneLink Email Test</h3><p>Your SMTP configuration is working correctly!</p><p style="color:#888;font-size:12px">Sent from: ${process.env.SMTP_HOST || 'SendGrid'} | ${new Date().toISOString()}</p></div>`
    });

    res.json({ ok: true, smtp_configured: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ ok: false, smtp_configured: true, error: err.message, hint: 'Check SMTP credentials. For Gmail, use App Password (not regular password).' });
  }
});

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