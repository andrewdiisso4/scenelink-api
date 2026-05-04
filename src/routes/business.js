const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════
// Ensure business_users table exists (idempotent)
// ═══════════════════════════════════════════════════════════════════
async function ensureBusinessTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS business_users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            venue_name VARCHAR(255) NOT NULL,
            venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
            tier VARCHAR(32) DEFAULT 'starter',
            phone VARCHAR(64),
            website VARCHAR(255),
            status VARCHAR(32) DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login TIMESTAMPTZ
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bu_email ON business_users(email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bu_venue ON business_users(venue_id);`);
}
ensureBusinessTables().catch(e => console.error('[business] table init:', e.message));

// ─── Helpers ──────────────────────────────────────────────────────
function slugify(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .substring(0, 80) + '-' + Math.random().toString(36).substring(2, 8);
}

function requireBusiness(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role !== 'business') {
        return res.status(403).json({ error: 'Business account required' });
    }
    next();
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/business/claim — create business account + link/create venue
// ═══════════════════════════════════════════════════════════════════
router.post('/claim', async (req, res) => {
    try {
        const { venue_name, email, password, tier, phone, website } = req.body || {};
        if (!venue_name || !email || !password) {
            return res.status(400).json({ error: 'venue_name, email, and password are required' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = await pool.query('SELECT id FROM business_users WHERE LOWER(email)=LOWER($1)', [email]);
        if (existing.rows.length) {
            return res.status(409).json({ error: 'This email is already registered. Please sign in instead.' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        // Best-effort: match existing venue by name
        let venue_id = null;
        let matchedVenue = null;
        try {
            const match = await pool.query(
                `SELECT id, name, neighborhood, type FROM venues WHERE name ILIKE $1 LIMIT 1`,
                [venue_name]
            );
            if (match.rows.length) {
                venue_id = match.rows[0].id;
                matchedVenue = match.rows[0];
            }
        } catch (_) {}

        const insert = await pool.query(
            `INSERT INTO business_users (email, password_hash, venue_name, venue_id, tier, phone, website, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
             RETURNING id, email, venue_name, venue_id, tier, status, created_at`,
            [email, password_hash, venue_name, venue_id, tier || 'starter', phone || null, website || null]
        );

        const user = insert.rows[0];
        const token = generateToken({ id: user.id, email: user.email, role: 'business' });

        res.json({
            ok: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                venue_name: user.venue_name,
                venue_id: user.venue_id,
                tier: user.tier,
                status: user.status,
                role: 'business',
                matched_venue: matchedVenue
            }
        });
    } catch (err) {
        console.error('[business/claim]', err);
        res.status(500).json({ error: 'Failed to claim venue', detail: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/business/login
// ═══════════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await pool.query(
            `SELECT id, email, password_hash, venue_name, venue_id, tier, status FROM business_users WHERE LOWER(email)=LOWER($1)`,
            [email]
        );
        if (!result.rows.length) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        pool.query('UPDATE business_users SET last_login=NOW() WHERE id=$1', [user.id]).catch(()=>{});

        let venue = null;
        if (user.venue_id) {
            try {
                const v = await pool.query(
                    `SELECT id, name, slug, type, neighborhood, city, address, rating, cover_image_url, image_url
                     FROM venues WHERE id=$1`, [user.venue_id]
                );
                if (v.rows.length) venue = v.rows[0];
            } catch (_) {}
        }

        const token = generateToken({ id: user.id, email: user.email, role: 'business' });

        res.json({
            ok: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                venue_name: user.venue_name,
                venue_id: user.venue_id,
                tier: user.tier,
                status: user.status,
                role: 'business',
                venue
            }
        });
    } catch (err) {
        console.error('[business/login]', err);
        res.status(500).json({ error: 'Login failed', detail: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/business/logout — lightweight endpoint; client clears token
// ═══════════════════════════════════════════════════════════════════
router.post('/logout', (req, res) => {
    res.json({ ok: true, message: 'Signed out' });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/business/me — current business user + linked venue
// ═══════════════════════════════════════════════════════════════════
router.get('/me', requireAuth, requireBusiness, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, venue_name, venue_id, tier, status, phone, website, created_at, last_login
             FROM business_users WHERE id=$1`, [req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

        const user = result.rows[0];
        let venue = null;
        if (user.venue_id) {
            try {
                const v = await pool.query(`SELECT * FROM venues WHERE id=$1`, [user.venue_id]);
                if (v.rows.length) venue = v.rows[0];
            } catch (_) {}
        }
        res.json({ user: { ...user, role: 'business', venue } });
    } catch (err) {
        console.error('[business/me]', err);
        res.status(500).json({ error: 'Failed to fetch business profile' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/business/venue — fetch the claimed venue
// ═══════════════════════════════════════════════════════════════════
router.get('/venue', requireAuth, requireBusiness, async (req, res) => {
    try {
        const bu = await pool.query('SELECT venue_id FROM business_users WHERE id=$1', [req.user.id]);
        if (!bu.rows.length || !bu.rows[0].venue_id) {
            return res.status(404).json({ error: 'No linked venue', linked: false });
        }
        const v = await pool.query('SELECT * FROM venues WHERE id=$1', [bu.rows[0].venue_id]);
        if (!v.rows.length) return res.status(404).json({ error: 'Venue not found' });
        res.json({ ok: true, venue: v.rows[0] });
    } catch (err) {
        console.error('[business/venue GET]', err);
        res.status(500).json({ error: 'Failed to fetch venue' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/business/venue — CREATE a new venue listing and link it
// Used when user has no matched venue yet
// ═══════════════════════════════════════════════════════════════════
router.post('/venue', requireAuth, requireBusiness, async (req, res) => {
    try {
        const bu = await pool.query('SELECT venue_id, venue_name FROM business_users WHERE id=$1', [req.user.id]);
        if (!bu.rows.length) return res.status(404).json({ error: 'User not found' });
        if (bu.rows[0].venue_id) {
            return res.status(409).json({ error: 'You already have a linked venue. Use the edit endpoint to update it.' });
        }

        const {
            name, description, address, neighborhood, city,
            type, cuisine, phone, website, price_level, price_label,
            cover_image_url, image_url, lat, lng, hours_display, tags
        } = req.body || {};

        if (!name) return res.status(400).json({ error: 'name is required' });

        const slug = slugify(name);
        const insertRes = await pool.query(
            `INSERT INTO venues
             (slug, name, type, cuisine, description, address, neighborhood, city, state,
              lat, lng, phone, website, price_level, price_label,
              cover_image_url, image_url, hours_display, tags,
              rating, review_count, is_active, is_claimed, created_at, updated_at)
             VALUES
             ($1, $2, $3, $4, $5, $6, $7, COALESCE($8,'Boston'), 'MA',
              $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18,
              0, 0, true, true, NOW(), NOW())
             RETURNING *`,
            [
                slug, name, type || 'restaurant', cuisine || null, description || null,
                address || null, neighborhood || null, city || null,
                lat || null, lng || null, phone || null, website || null,
                price_level || null, price_label || null,
                cover_image_url || null, image_url || null,
                hours_display || null, tags || null
            ]
        );
        const venue = insertRes.rows[0];

        // Link this venue to the business user
        await pool.query(
            'UPDATE business_users SET venue_id=$1, venue_name=$2, status=$3 WHERE id=$4',
            [venue.id, venue.name, 'active', req.user.id]
        );

        res.json({ ok: true, venue, message: 'Listing created and linked to your account' });
    } catch (err) {
        console.error('[business/venue POST]', err);
        res.status(500).json({ error: 'Failed to create listing', detail: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /api/business/venue — full update (alias for PATCH with more fields)
// PATCH /api/business/venue — partial update
// ═══════════════════════════════════════════════════════════════════
async function handleVenueUpdate(req, res) {
    try {
        const bu = await pool.query('SELECT venue_id FROM business_users WHERE id=$1', [req.user.id]);
        if (!bu.rows.length || !bu.rows[0].venue_id) {
            return res.status(404).json({ error: 'No linked venue. Use POST /api/business/venue to create one.' });
        }
        const venue_id = bu.rows[0].venue_id;

        const allowed = [
            'name', 'description', 'address', 'neighborhood', 'city',
            'phone', 'website', 'cover_image_url', 'image_url',
            'type', 'cuisine', 'price_level', 'price_label',
            'hours_display', 'tags', 'dress_code', 'vibe',
            'reservation_url', 'opentable_url', 'resy_url',
            'lat', 'lng'
        ];
        const updates = [];
        const values = [];
        let idx = 1;
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates.push(`${key} = $${idx++}`);
                values.push(req.body[key]);
            }
        }
        if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
        values.push(venue_id);

        const result = await pool.query(
            `UPDATE venues SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`,
            values
        );

        // Keep business_users.venue_name in sync if name changed
        if (req.body.name) {
            pool.query('UPDATE business_users SET venue_name=$1 WHERE id=$2', [req.body.name, req.user.id]).catch(()=>{});
        }

        res.json({ ok: true, venue: result.rows[0] });
    } catch (err) {
        console.error('[business/venue UPDATE]', err);
        res.status(500).json({ error: 'Failed to update venue', detail: err.message });
    }
}
router.patch('/venue', requireAuth, requireBusiness, handleVenueUpdate);
router.put('/venue', requireAuth, requireBusiness, handleVenueUpdate);

// ═══════════════════════════════════════════════════════════════════
// GET /api/business/analytics — real analytics for linked venue
// ═══════════════════════════════════════════════════════════════════
router.get('/analytics', requireAuth, requireBusiness, async (req, res) => {
    try {
        const bu = await pool.query('SELECT venue_id FROM business_users WHERE id=$1', [req.user.id]);
        if (!bu.rows.length || !bu.rows[0].venue_id) {
            return res.json({
                views: 0, saves: 0, checkins: 0, engagement: 0, rating: 0,
                linked: false,
                message: 'Link or create a venue to see analytics'
            });
        }
        const venue_id = bu.rows[0].venue_id;

        const [saves, checkinsAll, checkinsDay, plans, reviews, venueRow] = await Promise.all([
            pool.query('SELECT COUNT(*)::int AS n FROM favorites WHERE venue_id=$1', [venue_id]).catch(()=>({rows:[{n:0}]})),
            pool.query('SELECT COUNT(*)::int AS n FROM checkins WHERE venue_id=$1', [venue_id]).catch(()=>({rows:[{n:0}]})),
            pool.query("SELECT COUNT(*)::int AS n FROM checkins WHERE venue_id=$1 AND created_at > NOW() - INTERVAL '1 day'", [venue_id]).catch(()=>({rows:[{n:0}]})),
            pool.query('SELECT COUNT(*)::int AS n FROM plan_venues WHERE venue_id=$1', [venue_id]).catch(()=>({rows:[{n:0}]})),
            pool.query('SELECT COUNT(*)::int AS n, COALESCE(AVG(rating),0)::float AS avg FROM reviews WHERE venue_id=$1', [venue_id]).catch(()=>({rows:[{n:0,avg:0}]})),
            pool.query('SELECT rating, review_count, going_count FROM venues WHERE id=$1', [venue_id]).catch(()=>({rows:[{rating:0,review_count:0,going_count:0}]}))
        ]);

        const savesN = saves.rows[0].n;
        const checkinsAllN = checkinsAll.rows[0].n;
        const checkinsDayN = checkinsDay.rows[0].n;
        const plansN = plans.rows[0].n;
        const reviewsN = reviews.rows[0].n;
        const reviewAvg = reviews.rows[0].avg || 0;
        const storedRating = parseFloat(venueRow.rows[0]?.rating || 0);
        const displayRating = reviewAvg || storedRating;

        // Views derived: saves × 8 + checkins × 3 + plans × 4 (until real view tracking)
        const viewsN = savesN * 8 + checkinsAllN * 3 + plansN * 4;
        const engagement = viewsN ? Math.round((savesN + checkinsAllN) / viewsN * 1000) / 10 : 0;

        res.json({
            views: viewsN,
            saves: savesN,
            checkins: checkinsAllN,
            checkins_today: checkinsDayN,
            plans: plansN,
            reviews: reviewsN,
            rating: Math.round(displayRating * 10) / 10,
            engagement,
            linked: true,
            venue_id
        });
    } catch (err) {
        console.error('[business/analytics]', err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/business/reviews — reviews for the linked venue
// ═══════════════════════════════════════════════════════════════════
router.get('/reviews', requireAuth, requireBusiness, async (req, res) => {
    try {
        const bu = await pool.query('SELECT venue_id FROM business_users WHERE id=$1', [req.user.id]);
        if (!bu.rows.length || !bu.rows[0].venue_id) {
            return res.json({ reviews: [], linked: false });
        }
        const venue_id = bu.rows[0].venue_id;
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const result = await pool.query(
            `SELECT r.id, r.rating, r.content, r.created_at,
                    u.display_name AS user_display_name, u.username
             FROM reviews r
             LEFT JOIN users u ON u.id = r.user_id
             WHERE r.venue_id = $1
             ORDER BY r.created_at DESC
             LIMIT $2`,
            [venue_id, limit]
        ).catch(()=>({ rows: [] }));
        res.json({ reviews: result.rows, linked: true });
    } catch (err) {
        console.error('[business/reviews]', err);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/business/health — public health check
// ═══════════════════════════════════════════════════════════════════
router.get('/health', async (req, res) => {
    try {
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM business_users');
        res.json({ ok: true, service: 'business', accounts: r.rows[0].n });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;