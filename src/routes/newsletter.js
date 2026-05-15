/**
 * SceneLink — Newsletter / Email Signup (Phase 5D-C1)
 * POST /api/newsletter/subscribe — adds email to subscribers table + sends confirmation
 * GET  /api/newsletter/subscribers — admin: list subscribers
 *
 * Email: uses centralized /services/mailer.js (GoDaddy/M365 SMTP via env).
 * Sender: info@scenelink.app
 */

const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const mailer = require('../services/mailer');
const router = express.Router();
const { contactLimiter } = require('../middleware/rateLimits');

// Ensure subscribers table exists
async function ensureTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255),
            source VARCHAR(100) DEFAULT 'footer',
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            status VARCHAR(32) DEFAULT 'active',
            subscribed_at TIMESTAMPTZ DEFAULT NOW()
        )
    `).catch(() => {});
}
ensureTable();

// POST /api/newsletter/subscribe
router.post('/subscribe', contactLimiter, optionalAuth, async (req, res) => {
    try {
        const { email, name, source } = req.body || {};
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
            return res.status(400).json({ error: 'A valid email is required' });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const cleanName = String(name || '').trim().slice(0, 255) || null;

        const result = await pool.query(
            `INSERT INTO newsletter_subscribers (email, name, source, user_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO UPDATE SET status='active', subscribed_at=NOW()
             RETURNING id, subscribed_at`,
            [cleanEmail, cleanName, String(source || 'footer').slice(0, 100), req.user ? req.user.id : null]
        );

        console.log(`[newsletter] subscriber id=${result.rows[0].id} source=${source || 'footer'}`);

        // Send confirmation + admin notify (non-blocking)
        setImmediate(async () => {
            try {
                const tpl = mailer.newsletterConfirmEmail(cleanEmail);
                await mailer.sendMail({ to: cleanEmail, ...tpl });

                if (process.env.ADMIN_NOTIFY_EMAIL || mailer.SUPPORT_EMAIL) {
                    await mailer.sendMail({
                        to: process.env.ADMIN_NOTIFY_EMAIL || mailer.SUPPORT_EMAIL,
                        subject: `[SceneLink] New newsletter subscriber: ${cleanEmail}`,
                        html: `<div style="font-family:sans-serif;padding:20px;background:#111;color:#fff;border-radius:8px">
                            <h3 style="color:#D4AF37;margin:0 0 12px">New newsletter subscriber</h3>
                            <p style="color:#ccc;font-size:14px;margin:6px 0"><strong>Email:</strong> ${cleanEmail}</p>
                            <p style="color:#ccc;font-size:14px;margin:6px 0"><strong>Source:</strong> ${source || 'footer'}</p>
                            ${cleanName ? `<p style="color:#ccc;font-size:14px;margin:6px 0"><strong>Name:</strong> ${cleanName}</p>` : ''}
                          </div>`,
                    });
                }
            } catch (err) {
                console.warn('[newsletter] confirm email failed:', err.message);
            }
        });

        res.json({ ok: true, message: "You're subscribed! Check your inbox for a confirmation email." });
    } catch (err) {
        console.error('[newsletter/subscribe]', err);
        res.status(500).json({ error: 'Subscription failed. Please try again.' });
    }
});

// GET /api/newsletter/subscribers — admin only
router.get('/subscribers', async (req, res) => {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const limit = Math.min(500, parseInt(req.query.limit) || 100);
        const result = await pool.query(
            'SELECT id, email, name, source, status, subscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC LIMIT $1',
            [limit]
        );
        const count = await pool.query("SELECT COUNT(*) as total FROM newsletter_subscribers WHERE status='active'");
        res.json({ subscribers: result.rows, total: parseInt(count.rows[0].total) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
