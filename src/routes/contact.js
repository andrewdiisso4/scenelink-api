/**
 * SceneLink — Contact Form Backend (Phase 5D-C1)
 * POST /api/contact  — stores message in DB + forwards to info@scenelink.app
 * GET  /api/contact  — admin: list messages (requires x-admin-secret)
 *
 * Email: uses centralized /services/mailer.js (GoDaddy/M365 SMTP via env).
 * Reply-To: set to user's email so admin "Reply" goes back to the sender.
 */

const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const mailer = require('../services/mailer');
const router = express.Router();
const { contactLimiter } = require('../middleware/rateLimits');

async function forwardContactToAdmin(msg) {
  const to = mailer.CONTACT_FORWARD_TO; // info@scenelink.app
  const tpl = mailer.contactNotifyAdminEmail({
    name: msg.name, email: msg.email,
    subject: msg.subject || 'New contact form submission',
    message: msg.message,
  });
  // Set Reply-To = sender so the admin can reply directly.
  const r = await mailer.sendMail({
    to,
    replyTo: msg.email,
    subject: tpl.subject,
    html: tpl.html,
  });
  if (r.skipped) {
    console.log(`[contact/forward-skipped] mailer disabled. Stored msg id=${msg.id} from=${msg.email}`);
  }
  return r.ok;
}

async function sendUserAck(msg) {
  const tpl = mailer.contactAckEmail({ name: msg.name });
  const r = await mailer.sendMail({ to: msg.email, ...tpl });
  return r.ok;
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/contact — submit a contact message
// ──────────────────────────────────────────────────────────────────────────
router.post('/', contactLimiter, optionalAuth, async (req, res) => {
  try {
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255),
        message TEXT NOT NULL,
        source VARCHAR(100) DEFAULT 'contact-page',
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(32) DEFAULT 'new',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});

    const { name, email, subject, message, source } = req.body || {};

    // Validation
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Name is required (min 2 chars)' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!message || String(message).trim().length < 5) {
      return res.status(400).json({ error: 'Message is required (min 5 chars)' });
    }

    const result = await pool.query(
      `INSERT INTO contact_messages (name, email, subject, message, source, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        String(name).trim().slice(0, 255),
        String(email).trim().toLowerCase().slice(0, 255),
        String(subject || '').trim().slice(0, 255) || null,
        String(message).trim().slice(0, 5000),
        String(source || 'contact-page').slice(0, 100),
        req.user ? req.user.id : null,
      ]
    );

    const row = result.rows[0];
    const msgObj = {
      id: row.id, name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      subject: subject || '', message: String(message).trim(),
      source: source || 'contact-page',
    };

    // Fire emails (non-blocking)
    Promise.all([forwardContactToAdmin(msgObj), sendUserAck(msgObj)]).catch(() => {});

    res.json({
      ok: true,
      id: row.id,
      message: "Your message has been received. We'll get back to you within 1 business day.",
      email_confirmation: mailer.isReady(),
    });
  } catch (err) {
    console.error('[contact/POST]', err);
    res.status(500).json({ error: `Failed to send message. Please email ${mailer.SUPPORT_EMAIL} directly.` });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/contact — admin: list contact messages
// ──────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const status = req.query.status || null;
    const params = [limit];
    const where = status ? `WHERE status = $2` : '';
    if (status) params.push(status);

    const result = await pool.query(
      `SELECT id, name, email, subject, LEFT(message, 200) as preview, source, status, created_at
       FROM contact_messages
       ${where}
       ORDER BY created_at DESC
       LIMIT $1`,
      params
    );
    const count = await pool.query('SELECT COUNT(*) as total FROM contact_messages' + (status ? ' WHERE status=$1' : ''), status ? [status] : []);
    res.json({ messages: result.rows, total: parseInt(count.rows[0].total) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contact/:id — mark as read/resolved (admin)
router.patch('/:id', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { status } = req.body || {};
    if (!['new', 'read', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'status must be new|read|resolved' });
    }
    await pool.query('UPDATE contact_messages SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
