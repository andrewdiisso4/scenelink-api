/**
 * SceneLink Admin API
 * All routes require X-Admin-Secret header matching ADMIN_SECRET env var
 * GET /api/admin/stats       — aggregate counts
 * GET /api/admin/users       — paginated user list
 * GET /api/admin/venues      — paginated venue list
 * GET /api/admin/activity    — recent activity
 * GET /api/admin/plans       — recent plans
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

function requireAdmin(req, res, next) {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    if (!ADMIN_SECRET) return res.status(503).json({ error: 'Admin not configured' });
    if (!secret || secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
    next();
}

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const [users, venues, plans, checkins, activity, reviews, favorites] = await Promise.all([
            pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL \'7 days\') as week, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL \'24 hours\') as today FROM users'),
            pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active, COUNT(*) FILTER (WHERE featured = true) as featured, COUNT(*) FILTER (WHERE trending = true) as trending FROM venues'),
            pool.query('SELECT COUNT(*) as total FROM plans').catch(() => ({ rows: [{ total: 0 }] })),
            pool.query('SELECT COUNT(*) as total FROM checkins').catch(() => ({ rows: [{ total: 0 }] })),
            pool.query('SELECT COUNT(*) as total FROM activity').catch(() => ({ rows: [{ total: 0 }] })),
            pool.query('SELECT COUNT(*) as total FROM reviews').catch(() => ({ rows: [{ total: 0 }] })),
            pool.query('SELECT COUNT(*) as total FROM favorites').catch(() => ({ rows: [{ total: 0 }] })),
        ]);

        res.json({
            users: {
                total: parseInt(users.rows[0].total),
                this_week: parseInt(users.rows[0].week),
                today: parseInt(users.rows[0].today),
            },
            venues: {
                total: parseInt(venues.rows[0].total),
                active: parseInt(venues.rows[0].active),
                featured: parseInt(venues.rows[0].featured),
                trending: parseInt(venues.rows[0].trending),
            },
            plans: parseInt(plans.rows[0].total),
            checkins: parseInt(checkins.rows[0].total),
            activity: parseInt(activity.rows[0].total),
            reviews: parseInt(reviews.rows[0].total),
            favorites: parseInt(favorites.rows[0].total),
            generated_at: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[admin/stats]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/users?page=1&limit=50&search=
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const search = req.query.search ? `%${req.query.search}%` : null;

        const whereClause = search ? 'WHERE email ILIKE $3 OR display_name ILIKE $3 OR username ILIKE $3' : '';
        const params = search ? [limit, offset, search] : [limit, offset];

        const [usersResult, countResult] = await Promise.all([
            pool.query(
                `SELECT id, email, display_name, username, avatar_url, neighborhood, role, oauth_provider,
                        is_active, created_at, updated_at,
                        (SELECT COUNT(*) FROM checkins WHERE user_id = users.id) as checkin_count,
                        (SELECT COUNT(*) FROM favorites WHERE user_id = users.id) as favorite_count
                 FROM users ${whereClause}
                 ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
                params
            ),
            pool.query(
                `SELECT COUNT(*) as total FROM users ${whereClause}`,
                search ? [search] : []
            ),
        ]);

        res.json({
            users: usersResult.rows,
            total: parseInt(countResult.rows[0].total),
            page,
            limit,
            pages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
        });
    } catch (err) {
        console.error('[admin/users]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/venues?page=1&limit=50&search=&neighborhood=
router.get('/venues', requireAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const neighborhood = req.query.neighborhood || '';
        const type = req.query.type || '';

        let where = [];
        let params = [limit, offset];
        let idx = 3;

        if (search) { where.push(`(name ILIKE $${idx} OR address ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
        if (neighborhood) { where.push(`neighborhood ILIKE $${idx}`); params.push(`%${neighborhood}%`); idx++; }
        if (type) { where.push(`type = $${idx}`); params.push(type); idx++; }

        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

        const [venuesResult, countResult] = await Promise.all([
            pool.query(
                `SELECT id, slug, name, type, category, neighborhood, address, rating, review_count,
                        buzz_score, going_count, price_label, is_active, featured, trending, spotlight,
                        is_claimed, created_at, updated_at
                 FROM venues ${whereSQL}
                 ORDER BY buzz_score DESC NULLS LAST, rating DESC NULLS LAST LIMIT $1 OFFSET $2`,
                params
            ),
            pool.query(
                `SELECT COUNT(*) as total FROM venues ${whereSQL}`,
                params.slice(2)
            ),
        ]);

        res.json({
            venues: venuesResult.rows,
            total: parseInt(countResult.rows[0].total),
            page,
            limit,
            pages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
        });
    } catch (err) {
        console.error('[admin/venues]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/activity?limit=50
router.get('/activity', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const result = await pool.query(
            `SELECT id, user_name, user_display_name, type, venue_name, venue_neighborhood,
                    content, rating, likes, comments, created_at
             FROM activity
             ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        res.json({ activity: result.rows, total: result.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/plans?limit=50
router.get('/plans', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const result = await pool.query(
            `SELECT id, title, status, creator_id, date, time, attendee_count,
                    created_at, updated_at
             FROM plans
             ORDER BY created_at DESC LIMIT $1`,
            [limit]
        ).catch(() => ({ rows: [] }));
        res.json({ plans: result.rows, total: result.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/venues/:id — toggle featured/trending/active
router.patch('/venues/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { featured, trending, spotlight, is_active } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;
        if (featured !== undefined) { updates.push(`featured = $${idx++}`); params.push(featured); }
        if (trending !== undefined) { updates.push(`trending = $${idx++}`); params.push(trending); }
        if (spotlight !== undefined) { updates.push(`spotlight = $${idx++}`); params.push(spotlight); }
        if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(is_active); }
        if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
        updates.push(`updated_at = NOW()`);
        params.push(id);
        const result = await pool.query(
            `UPDATE venues SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, featured, trending, spotlight, is_active`,
            params
        );
        res.json({ venue: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/contacts?limit=50&status=new
router.get('/contacts', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const status = req.query.status || null;
        const where = status ? `WHERE status = $2` : '';
        const params = status ? [limit, status] : [limit];
        const result = await pool.query(
            `SELECT id, name, email, subject, LEFT(message,300) as preview, source, status, created_at
             FROM contact_messages ${where}
             ORDER BY created_at DESC LIMIT $1`,
            params
        ).catch(() => ({ rows: [] }));
        const cnt = await pool.query(
            `SELECT COUNT(*) as total FROM contact_messages ${where}`,
            status ? [status] : []
        ).catch(() => ({ rows: [{ total: 0 }] }));
        res.json({ messages: result.rows, total: parseInt(cnt.rows[0].total) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/contacts/:id — mark status
router.patch('/contacts/:id', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!['new','read','resolved'].includes(status)) return res.status(400).json({ error: 'invalid status' });
        await pool.query('UPDATE contact_messages SET status=$1 WHERE id=$2', [status, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/business — list business users
router.get('/business', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const result = await pool.query(
            `SELECT id, email, venue_name, venue_id, tier, status, phone, website, created_at, last_login
             FROM business_users ORDER BY created_at DESC LIMIT $1`, [limit]
        ).catch(() => ({ rows: [] }));
        const cnt = await pool.query('SELECT COUNT(*) as total FROM business_users').catch(() => ({ rows: [{ total: 0 }] }));
        res.json({ business_users: result.rows, total: parseInt(cnt.rows[0].total) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/test-email — verify SMTP configuration
router.post('/test-email', requireAdmin, async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Provide "to" email address in body' });

    const smtpConfigured = !!(
        (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS &&
         process.env.SMTP_PASS !== 'PLACEHOLDER_SET_THIS') ||
        process.env.SENDGRID_API_KEY
    );

    if (!smtpConfigured) {
        return res.json({
            ok: false,
            smtp_configured: false,
            message: 'No SMTP credentials set. Add SMTP_HOST, SMTP_USER, SMTP_PASS (or SENDGRID_API_KEY) to Render env vars.',
            env_vars_needed: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'ADMIN_NOTIFY_EMAIL'],
            current: {
                SMTP_HOST: process.env.SMTP_HOST || '(not set)',
                SMTP_USER: process.env.SMTP_USER || '(not set)',
                SMTP_PASS: process.env.SMTP_PASS ? (process.env.SMTP_PASS === 'PLACEHOLDER_SET_THIS' ? 'PLACEHOLDER — needs real value' : '(set)') : '(not set)',
                ADMIN_NOTIFY_EMAIL: process.env.ADMIN_NOTIFY_EMAIL || '(not set)',
            }
        });
    }

    try {
        const nodemailer = require('nodemailer');
        let transporter;
        if (process.env.SENDGRID_API_KEY) {
            transporter = nodemailer.createTransport({ host: 'smtp.sendgrid.net', port: 587, auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY } });
        } else {
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
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

// POST /api/admin/reseed — force database reseed
router.post('/reseed', requireAdmin, async (req, res) => {
    try {
        const { seedDatabase } = require('../seeds/seed');
        await seedDatabase(pool);
        const vc = await pool.query('SELECT COUNT(*) FROM venues');
        const ec = await pool.query('SELECT COUNT(*) FROM events');
        res.json({ ok: true, venue_count: parseInt(vc.rows[0].count), event_count: parseInt(ec.rows[0].count) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/stats — overall platform stats
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const safeCount = async (query) => {
            try {
                const r = await pool.query(query);
                return r.rows[0];
            } catch (e) {
                return { total: 0, new_count: 0 };
            }
        };

        const [users, venues, contacts, business, checkins, favorites, subscribers] = await Promise.all([
            safeCount('SELECT COUNT(*) as total FROM users'),
            safeCount('SELECT COUNT(*) as total FROM venues'),
            safeCount("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='new') as new_count FROM contact_messages"),
            safeCount('SELECT COUNT(*) as total FROM business_users'),
            safeCount('SELECT COUNT(*) as total FROM checkins'),
            safeCount('SELECT COUNT(*) as total FROM favorites'),
            safeCount("SELECT COUNT(*) as total FROM newsletter_subscribers WHERE status='active'"),
        ]);

        res.json({
            users: parseInt(users.total || 0),
            venues: parseInt(venues.total || 0),
            contacts: parseInt(contacts.total || 0),
            contacts_new: parseInt(contacts.new_count || 0),
            business_users: parseInt(business.total || 0),
            checkins: parseInt(checkins.total || 0),
            favorites: parseInt(favorites.total || 0),
            newsletter_subscribers: parseInt(subscribers.total || 0),
            generated_at: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
