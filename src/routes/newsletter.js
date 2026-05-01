/**
 * SceneLink — Newsletter / Email Signup
 * POST /api/newsletter/subscribe — adds email to subscribers table
 * GET  /api/newsletter/subscribers — admin: list subscribers
 */

const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const router = express.Router();

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
router.post('/subscribe', optionalAuth, async (req, res) => {
    try {
        const { email, name, source } = req.body || {};
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
            return res.status(400).json({ error: 'A valid email is required' });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const cleanName = String(name || '').trim().slice(0, 255) || null;

        // Upsert — if already subscribed, just return success
        const result = await pool.query(
            `INSERT INTO newsletter_subscribers (email, name, source, user_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO UPDATE SET status='active', subscribed_at=NOW()
             RETURNING id, subscribed_at`,
            [cleanEmail, cleanName, String(source || 'footer').slice(0, 100), req.user ? req.user.id : null]
        );

        // Log to console for Render logs (even without email)
        console.log(`[newsletter] NEW SUBSCRIBER: ${cleanEmail} | source: ${source || 'footer'} | id: ${result.rows[0].id}`);

        // Send confirmation email if SMTP configured
        setImmediate(async () => {
            try {
                const nodemailer = require('nodemailer');
                let transporter = null;
                if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS &&
                    process.env.SMTP_PASS !== 'PLACEHOLDER_SET_THIS') {
                    transporter = nodemailer.createTransport({
                        host: process.env.SMTP_HOST,
                        port: parseInt(process.env.SMTP_PORT || '587'),
                        secure: process.env.SMTP_SECURE === 'true',
                        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
                    });
                } else if (process.env.SENDGRID_API_KEY) {
                    transporter = nodemailer.createTransport({
                        host: 'smtp.sendgrid.net', port: 587,
                        auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
                    });
                }

                if (transporter) {
                    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
                    await transporter.sendMail({
                        from: `SceneLink <${fromEmail}>`,
                        to: cleanEmail,
                        subject: '🎵 You\'re in — SceneLink weekly picks',
                        html: `
                            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#fff;border-radius:12px">
                                <div style="text-align:center;margin-bottom:24px">
                                    <span style="font-size:26px;font-weight:700;color:#D4AF37">🎵 SceneLink</span>
                                </div>
                                <h2 style="color:#fff;font-size:20px;margin-bottom:12px">You're in the Scene! 🎉</h2>
                                <p style="color:#ccc;font-size:15px;line-height:1.7">
                                    Thanks for subscribing${cleanName ? ', ' + cleanName : ''}! Every week you'll get:
                                </p>
                                <ul style="color:#ccc;font-size:14px;line-height:2;padding-left:20px">
                                    <li>🔥 <strong>This week's trending spots</strong> in Boston</li>
                                    <li>📅 <strong>Upcoming events</strong> worth knowing about</li>
                                    <li>💎 <strong>Hidden gems</strong> you might have missed</li>
                                    <li>🤖 <strong>AI Concierge tips</strong> for the best nights out</li>
                                </ul>
                                <div style="text-align:center;margin:28px 0">
                                    <a href="https://scenelink.app/explore.html" style="background:#D4AF37;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">Explore Boston Now →</a>
                                </div>
                                <p style="color:#555;font-size:11px;text-align:center">
                                    You can unsubscribe at any time by emailing <a href="mailto:hello@scenelink.app" style="color:#D4AF37">hello@scenelink.app</a>
                                </p>
                            </div>`,
                        text: `Thanks for subscribing to SceneLink! Every week you'll get trending spots, upcoming events, and hidden gems in Boston.\n\nExplore now: https://scenelink.app/explore.html\n\n— The SceneLink Team`,
                    });

                    // Notify admin
                    if (process.env.ADMIN_NOTIFY_EMAIL) {
                        await transporter.sendMail({
                            from: fromEmail,
                            to: process.env.ADMIN_NOTIFY_EMAIL,
                            subject: `[SceneLink] New subscriber: ${cleanEmail}`,
                            text: `New newsletter subscriber: ${cleanEmail}\nSource: ${source || 'footer'}\nName: ${cleanName || '—'}`,
                        }).catch(() => {});
                    }
                }
            } catch (err) {
                console.warn('[newsletter] Email failed:', err.message);
            }
        });

        res.json({ ok: true, message: 'You\'re subscribed! Check your inbox for a welcome email.' });
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
        const count = await pool.query('SELECT COUNT(*) as total FROM newsletter_subscribers WHERE status=\'active\'');
        res.json({ subscribers: result.rows, total: parseInt(count.rows[0].total) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;