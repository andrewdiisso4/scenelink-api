/**
 * SceneLink — Contact Form Backend
 * POST /api/contact  — stores message in DB + sends admin email notification
 * GET  /api/contact  — admin: list messages (requires x-admin-secret)
 */

const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const router = express.Router();

// ── Email transporter (reuse SMTP config from auth.js pattern) ──────────────
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    console.log('[contact] SMTP transporter ready');
  } else if (SENDGRID_KEY) {
    transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: SENDGRID_KEY },
    });
    console.log('[contact] SendGrid transporter ready');
  } else {
    console.log('[contact] No email config — messages stored in DB only');
  }
} catch (e) {
  console.warn('[contact] nodemailer init error:', e.message);
}

async function sendAdminNotification(msg) {
  const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER || 'hello@scenelink.app';
  const FROM_EMAIL  = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@scenelink.app';

  if (!transporter) {
    // Log to console so Render logs capture it
    console.log(`[contact/new-message]
  From:    ${msg.name} <${msg.email}>
  Subject: ${msg.subject}
  Message: ${msg.message}
  Source:  ${msg.source}
  ID:      ${msg.id}
`);
    return false;
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#fff;border-radius:12px">
      <div style="text-align:center;margin-bottom:20px">
        <span style="font-size:20px;font-weight:700;color:#D4AF37">🎵 SceneLink</span>
        <span style="display:block;font-size:12px;color:#888;margin-top:4px">New Contact Form Submission</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#888;width:90px">From</td><td style="padding:8px 0;color:#fff;font-weight:600">${msg.name} <${msg.email}></td></tr>
        <tr><td style="padding:8px 0;color:#888">Subject</td><td style="padding:8px 0;color:#D4AF37;font-weight:600">${msg.subject || '(none)'}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Source</td><td style="padding:8px 0;color:#aaa">${msg.source || 'contact-page'}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Time</td><td style="padding:8px 0;color:#aaa">${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</td></tr>
      </table>
      <div style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:#888;margin-bottom:8px">MESSAGE</div>
        <div style="font-size:14px;color:#fff;line-height:1.6;white-space:pre-wrap">${msg.message}</div>
      </div>
      <div style="text-align:center">
        <a href="mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject || 'Your SceneLink message')}"
           style="background:#D4AF37;color:#000;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">
          Reply to ${msg.name}
        </a>
      </div>
      <p style="color:#555;font-size:11px;text-align:center;margin-top:20px">
        Message ID: ${msg.id} · View all at <a href="https://scenelink.app/admin.html" style="color:#D4AF37">admin dashboard</a>
      </p>
    </div>`;

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `[SceneLink Contact] ${msg.subject || 'New message'} — ${msg.name}`,
      text: `New contact from ${msg.name} <${msg.email}>\n\nSubject: ${msg.subject}\n\n${msg.message}\n\n---\nID: ${msg.id}`,
      html,
    });
    console.log(`[contact] Admin notification sent to ${ADMIN_EMAIL}`);
    return true;
  } catch (err) {
    console.error('[contact] Email send failed:', err.message);
    return false;
  }
}

async function sendUserConfirmation(msg) {
  if (!transporter) return false;
  const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER || 'hello@scenelink.app';

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#fff;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:22px;font-weight:700;color:#D4AF37">🎵 SceneLink</span>
      </div>
      <h2 style="color:#fff;font-size:20px;margin-bottom:12px">We got your message!</h2>
      <p style="color:#aaa;font-size:14px;line-height:1.6;margin-bottom:16px">
        Hi ${msg.name}, thanks for reaching out. We typically reply within 1 business day.
      </p>
      <div style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:#888;margin-bottom:8px">YOUR MESSAGE</div>
        <div style="font-size:13px;color:#ccc;line-height:1.6;white-space:pre-wrap">${msg.message.slice(0, 300)}${msg.message.length > 300 ? '…' : ''}</div>
      </div>
      <p style="color:#666;font-size:12px;text-align:center">
        In the meantime, explore Boston nightlife at <a href="https://scenelink.app" style="color:#D4AF37">scenelink.app</a>
      </p>
    </div>`;

  try {
    await transporter.sendMail({
      from: `SceneLink <${FROM_EMAIL}>`,
      to: msg.email,
      subject: 'We received your message — SceneLink',
      text: `Hi ${msg.name},\n\nThanks for contacting SceneLink! We'll get back to you within 1 business day.\n\nYour message:\n${msg.message}\n\n— The SceneLink Team`,
      html,
    });
    return true;
  } catch (err) {
    console.warn('[contact] User confirmation email failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contact — submit a contact message
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
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

    // Store in DB
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
    const msgObj = { id: row.id, name: String(name).trim(), email: String(email).trim(), subject: subject || '', message: String(message).trim(), source: source || 'contact-page' };

    // Fire emails (non-blocking — don't fail request if email fails)
    Promise.all([
      sendAdminNotification(msgObj),
      sendUserConfirmation(msgObj),
    ]).catch(() => {});

    res.json({
      ok: true,
      id: row.id,
      message: 'Your message has been received. We\'ll get back to you within 1 business day.',
      email_confirmation: !!transporter,
    });
  } catch (err) {
    console.error('[contact/POST]', err);
    res.status(500).json({ error: 'Failed to send message. Please email hello@scenelink.app directly.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contact — admin: list contact messages
// ─────────────────────────────────────────────────────────────────────────────
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