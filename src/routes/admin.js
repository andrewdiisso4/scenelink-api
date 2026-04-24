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

module.exports = router;
