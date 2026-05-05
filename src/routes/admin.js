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
        // Use SELECT * to be resilient to schema differences across environments
        const result = await pool.query(
            `SELECT * FROM activity ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        res.json({ activity: result.rows, total: result.rows.length });
    } catch (err) {
        // Graceful degradation if activity table doesn't exist yet
        if (err.code === '42P01') {
            return res.json({ activity: [], total: 0, note: 'activity table not yet created' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ────────────── Admin-portal compatibility aliases ──────────────
// GET /api/admin/venues/summary — simple venue summary for admin dashboard
router.get('/venues/summary', requireAdmin, async (req, res) => {
    try {
        const total = await pool.query('SELECT COUNT(*) FROM venues');
        let active = { rows: [{ count: 0 }] };
        let featured = { rows: [{ count: 0 }] };
        let trending = { rows: [{ count: 0 }] };
        try { active = await pool.query("SELECT COUNT(*) FROM venues WHERE is_active = true OR is_active IS NULL"); } catch(_) {}
        try { featured = await pool.query('SELECT COUNT(*) FROM venues WHERE featured = true'); } catch(_) {}
        try { trending = await pool.query('SELECT COUNT(*) FROM venues WHERE trending = true'); } catch(_) {}

        let missingImage = 0, missingNeighborhood = 0, missingWebsite = 0;
        try {
            missingImage = parseInt((await pool.query("SELECT COUNT(*) FROM venues WHERE image_url IS NULL OR image_url = ''")).rows[0].count);
        } catch(_) {}
        try {
            missingNeighborhood = parseInt((await pool.query("SELECT COUNT(*) FROM venues WHERE neighborhood IS NULL OR neighborhood = ''")).rows[0].count);
        } catch(_) {}
        try {
            missingWebsite = parseInt((await pool.query("SELECT COUNT(*) FROM venues WHERE website IS NULL OR website = ''")).rows[0].count);
        } catch(_) {}

        res.json({
            total: parseInt(total.rows[0].count),
            active: parseInt(active.rows[0].count),
            featured: parseInt(featured.rows[0].count),
            trending: parseInt(trending.rows[0].count),
            missing_image: missingImage,
            missing_neighborhood: missingNeighborhood,
            missing_website: missingWebsite
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/venues/list — admin venue list (alias for portal compatibility)
router.get('/venues/list', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(500, parseInt(req.query.limit) || 50);
        const offset = parseInt(req.query.offset) || 0;
        const q = req.query.q || '';
        const params = [limit, offset];
        let where = '1=1';
        if (q) {
            params.push('%' + q + '%');
            where = `(LOWER(name) LIKE LOWER($${params.length}) OR LOWER(neighborhood) LIKE LOWER($${params.length}))`;
        }
        const rows = await pool.query(
            `SELECT id, name, neighborhood, type, cuisine, rating, image_url AS image, website, featured AS is_featured, trending AS is_trending, is_active, created_at
             FROM venues
             WHERE ${where}
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            params
        );
        const countRes = await pool.query(`SELECT COUNT(*) FROM venues WHERE ${where}`, params.slice(2));
        res.json({ venues: rows.rows, total: parseInt(countRes.rows[0].count), limit, offset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/venues/imports — list of CSV imports (stub, returns empty until feature added)
router.get('/venues/imports', requireAdmin, async (req, res) => {
    try {
        // Try to read from admin_imports table if it exists
        const r = await pool.query(
            "SELECT * FROM information_schema.tables WHERE table_name='admin_imports'"
        );
        if (r.rows.length === 0) return res.json({ imports: [], total: 0 });
        const data = await pool.query('SELECT * FROM admin_imports ORDER BY created_at DESC LIMIT 50');
        res.json({ imports: data.rows, total: data.rows.length });
    } catch (err) {
        res.json({ imports: [], total: 0 });
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

// ═══════════════════════════════════════════════════════════════════════
// EVENTS CURATION (admin-only)
// ═══════════════════════════════════════════════════════════════════════

// Ensure events table has expected columns (idempotent, safe on restart)
async function ensureEventsTable() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
            venue_name TEXT,
            venue_slug TEXT,
            venue_neighborhood TEXT,
            image_url TEXT,
            date DATE,
            start_time TEXT,
            end_time TEXT,
            price TEXT,
            is_featured BOOLEAN DEFAULT false,
            is_live BOOLEAN DEFAULT false,
            attending_count INTEGER DEFAULT 0,
            rating NUMERIC(2,1),
            event_url TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await pool.query(`CREATE INDEX IF NOT EXISTS events_date_idx ON events(date);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS events_featured_idx ON events(is_featured) WHERE is_featured = true;`);
    } catch (err) {
        console.error('[admin/ensureEventsTable]', err.message);
    }
}
ensureEventsTable();

// GET /api/admin/events  — full list (includes past events)
router.get('/events', requireAdmin, async (req, res) => {
    try {
        const q = await pool.query(`
            SELECT e.*, v.lat AS venue_lat, v.lng AS venue_lng
            FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            ORDER BY e.date DESC NULLS LAST, e.created_at DESC
            LIMIT 200
        `);
        res.json({ ok: true, events: q.rows, total: q.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/events  — create an event
router.post('/events', requireAdmin, async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.title) return res.status(400).json({ error: 'title is required' });
        if (!b.date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

        // If venue_id given, hydrate name/slug/neighborhood from venues
        let venueName = b.venue_name || null;
        let venueSlug = b.venue_slug || null;
        let venueNeighborhood = b.venue_neighborhood || null;
        if (b.venue_id) {
            const vq = await pool.query('SELECT name, slug, neighborhood FROM venues WHERE id=$1', [b.venue_id]);
            if (vq.rows.length) {
                venueName = venueName || vq.rows[0].name;
                venueSlug = venueSlug || vq.rows[0].slug;
                venueNeighborhood = venueNeighborhood || vq.rows[0].neighborhood;
            }
        }

        const ins = await pool.query(`
            INSERT INTO events
            (title, description, category, venue_id, venue_name, venue_slug, venue_neighborhood,
             image_url, date, start_time, end_time, price, is_featured, is_live,
             attending_count, rating, event_url, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())
            RETURNING *
        `, [
            b.title, b.description || null, b.category || null,
            b.venue_id || null, venueName, venueSlug, venueNeighborhood,
            b.image_url || null, b.date, b.start_time || null, b.end_time || null,
            b.price || null, !!b.is_featured, !!b.is_live,
            parseInt(b.attending_count) || 0,
            b.rating ? Number(b.rating) : null,
            b.event_url || null
        ]);
        res.json({ ok: true, event: ins.rows[0] });
    } catch (err) {
        console.error('[admin/events POST]', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/events/:id  — update an event
router.patch('/events/:id', requireAdmin, async (req, res) => {
    try {
        const allowed = [
            'title', 'description', 'category', 'venue_id', 'venue_name',
            'venue_slug', 'venue_neighborhood', 'image_url', 'date', 'start_time',
            'end_time', 'price', 'is_featured', 'is_live', 'attending_count',
            'rating', 'event_url'
        ];
        const updates = [];
        const values = [];
        let idx = 1;
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                let val = req.body[key];
                if (['is_featured', 'is_live'].includes(key)) val = !!val;
                if (['attending_count'].includes(key)) val = parseInt(val) || 0;
                if (['rating'].includes(key)) val = val === null || val === '' ? null : Number(val);
                updates.push(`${key}=$${idx++}`);
                values.push(val);
            }
        }
        if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
        updates.push('updated_at=NOW()');
        values.push(req.params.id);
        const q = await pool.query(
            `UPDATE events SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
            values
        );
        if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true, event: q.rows[0] });
    } catch (err) {
        console.error('[admin/events PATCH]', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/events/:id
router.delete('/events/:id', requireAdmin, async (req, res) => {
    try {
        const q = await pool.query('DELETE FROM events WHERE id=$1 RETURNING id', [req.params.id]);
        if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true, deleted: q.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// REVIEW MODERATION
// ═══════════════════════════════════════════════════════════════════════

// PATCH /api/admin/reviews/:id  — hide or unhide a review
router.patch('/reviews/:id', requireAdmin, async (req, res) => {
    try {
        const { is_hidden } = req.body || {};
        // Ensure column exists
        try {
            await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false`);
        } catch (_) {}
        const q = await pool.query(
            'UPDATE reviews SET is_hidden=$1 WHERE id=$2 RETURNING *',
            [!!is_hidden, req.params.id]
        );
        if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true, review: q.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// BUSINESS ACCOUNT MODERATION
// ═══════════════════════════════════════════════════════════════════════

// PATCH /api/admin/business-users/:id  — enable/disable business account
router.patch('/business-users/:id', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!['active', 'disabled', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'status must be active | disabled | pending' });
        }
        const q = await pool.query(
            'UPDATE business_users SET status=$1 WHERE id=$2 RETURNING id, email, venue_name, status',
            [status, req.params.id]
        );
        if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true, business_user: q.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
