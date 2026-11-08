const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // PGlite has one embedded backend; do not pretend its socket multiplexing is
  // native multi-connection concurrency. Production/native settings are unchanged.
  max: process.env.NODE_ENV === 'test' && process.env.SCENELINK_TEST_ENGINE === 'pglite' ? 1 : 10,
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
  // Driver errors can carry a Client/connection object; never dump credentials,
  // session keys or query parameters into logs. Retain only an error category.
  console.error('[db] pool-error:', /^[A-Z0-9_]{1,40}$/.test(String(err?.code||'')) ? err.code : 'CONNECTION_ERROR');
});

module.exports = pool;