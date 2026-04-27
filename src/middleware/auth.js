const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'scenelink-prod-secret-change-me';
const JWT_EXPIRY = '7d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// Required auth - returns 401 if no valid token
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth - attaches user if token present, but doesn't require it
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // ignore invalid tokens for optional auth
    }
  }
  next();
}

/**
 * Require admin — two supported modes:
 *   1. JWT with role='admin' in token — re-verified against DB row
 *   2. Legacy: x-admin-secret header matching process.env.ADMIN_SECRET
 *      (kept for Alembic-style ops tooling and migration)
 * Returns 401 if not authed, 403 if authed but not admin.
 */
async function requireAdmin(req, res, next) {
  // Path 1: admin secret header (ops tooling only)
  const secret = req.headers['x-admin-secret'];
  if (secret && process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET) {
    req.admin = { via: 'secret' };
    return next();
  }

  // Path 2: JWT with admin role (users via /admin portal)
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    // Re-verify role from DB — JWT role can be stale
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
    if (!result.rows.length) return res.status(401).json({ error: 'User not found' });
    const role = result.rows[0].role;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = { via: 'jwt', userId: decoded.id };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { generateToken, requireAuth, optionalAuth, requireAdmin, JWT_SECRET };