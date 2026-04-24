const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // Reduced for zero-downtime deploys (old+new instance = 20 total, within limits)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased for Render cold-start tolerance
});

// Log DB config on startup (safe — no secrets)
if (!process.env.DATABASE_URL) {
  console.error('[db] ⚠️  DATABASE_URL is NOT set — pool will fail!');
} else {
  try {
    const u = new URL(process.env.DATABASE_URL);
    console.log('[db] DATABASE_URL host:', u.hostname, '| db:', u.pathname.slice(1), '| ssl:', process.env.NODE_ENV === 'production');
  } catch (e) {
    console.error('[db] DATABASE_URL is malformed:', e.message);
  }
}

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

module.exports = pool;