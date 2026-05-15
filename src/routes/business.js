const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Rate limiters for sensitive endpoints
const { authLimiter, passwordResetLimiter, contactLimiter } = require('../middleware/rateLimits');

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

    // Ensure reset-token columns exist (idempotent)
    try {
        await pool.query(`ALTER TABLE business_users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128);`);
        await pool.query(`ALTER TABLE business_users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bu_reset_token ON business_users(reset_token);`);
    } catch (e) { /* ignore */ }

    // Multi-venue join table (enterprise tier supports many)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS business_venues (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            business_user_id UUID REFERENCES business_users(id) ON DELETE CASCADE,
            venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
            is_primary BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(business_user_id, venue_id)
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bv_user ON business_venues(business_user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bv_venue ON business_venues(venue_id);`);

    // Venue photos gallery
    await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_photos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            caption TEXT,
            sort_order INT DEFAULT 0,
            uploaded_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vph_venue ON venue_photos(venue_id, sort_order);`);

    // Venue promotions
    await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_promos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url TEXT,
            starts_at TIMESTAMPTZ,
            ends_at TIMESTAMPTZ,
            is_active BOOLEAN DEFAULT true,
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_promo_venue ON venue_promos(venue_id, is_active);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_promo_dates ON venue_promos(starts_at, ends_at);`);
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
router.post('/claim', authLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const venue_name = body.venue_name || body.venueName;
        const email = body.email;
        const password = body.password;
        const tier = body.tier;
        const phone = body.phone;
        const website = body.website;
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
router.post('/login', authLimiter, async (req, res) => {
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
            cover_image_url, image_url, lat, lng, hours_display, tags,
            reservation_url, opentable_url, resy_url
        } = req.body || {};

        if (!name) return res.status(400).json({ error: 'name is required' });

        // Coerce tags into jsonb (venues.tags is jsonb)
        let tagsJson = null;
        if (Array.isArray(tags)) tagsJson = JSON.stringify(tags.map(String));
        else if (typeof tags === 'string' && tags.trim()) tagsJson = JSON.stringify(tags.split(',').map(s => s.trim()).filter(Boolean));

        const slug = slugify(name);
        const insertRes = await pool.query(
            `INSERT INTO venues
             (slug, name, type, cuisine, description, address, neighborhood, city, state,
              lat, lng, phone, website, price_level, price_label,
              cover_image_url, image_url, hours_display, tags,
              reservation_url, opentable_url, resy_url,
              rating, review_count, is_active, is_claimed, created_at, updated_at)
             VALUES
             ($1, $2, $3, $4, $5, $6, $7, COALESCE($8,'Boston'), 'MA',
              $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18,
              $19, $20, $21,
              0, 0, true, true, NOW(), NOW())
             RETURNING *`,
            [
                slug, name, type || 'restaurant', cuisine || null, description || null,
                address || null, neighborhood || null, city || null,
                lat || null, lng || null, phone || null, website || null,
                price_level || null, price_label || null,
                cover_image_url || null, image_url || null,
                hours_display || null, tagsJson,
                reservation_url || null, opentable_url || null, resy_url || null
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
                let val = req.body[key];
                // Coerce tags into jsonb (column is jsonb). Accept array or comma string.
                if (key === 'tags') {
                    let arr;
                    if (Array.isArray(val)) arr = val.map(String);
                    else if (typeof val === 'string' && val.trim()) arr = val.split(',').map(s => s.trim()).filter(Boolean);
                    else arr = [];
                    val = JSON.stringify(arr);
                }
                // Coerce numeric fields
                if (['price_level', 'lat', 'lng'].includes(key) && val !== null && val !== '') {
                    val = Number(val);
                    if (Number.isNaN(val)) continue;
                }
                updates.push(`${key} = $${idx++}`);
                values.push(val);
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

// ─── Helper: resolve the "active" venue for this business user ─────
// Priority: explicit ?venue_id= query param (must be owned) → business_users.venue_id → first business_venues row
async function resolveActiveVenueId(req) {
    const reqId = (req.query && req.query.venue_id) || (req.body && req.body.venue_id);
    // All venues this business owns
    const owned = await pool.query(
        `SELECT venue_id FROM business_users WHERE id=$1
         UNION
         SELECT venue_id FROM business_venues WHERE business_user_id=$1`,
        [req.user.id]
    );
    const ids = owned.rows.map(r => r.venue_id).filter(Boolean);
    if (!ids.length) return null;
    if (reqId && ids.includes(reqId)) return reqId;
    // Prefer the primary/business_users.venue_id
    const primary = await pool.query('SELECT venue_id FROM business_users WHERE id=$1', [req.user.id]);
    if (primary.rows[0] && primary.rows[0].venue_id) return primary.rows[0].venue_id;
    return ids[0];
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-VENUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

// GET /api/business/venues — list all venues this business owns
router.get('/venues', requireAuth, requireBusiness, async (req, res) => {
    try {
        const r = await pool.query(
            `WITH all_ids AS (
                SELECT venue_id, true AS is_primary FROM business_users WHERE id=$1 AND venue_id IS NOT NULL
                UNION
                SELECT venue_id, COALESCE(is_primary,false) FROM business_venues WHERE business_user_id=$1
             )
             SELECT v.id, v.name, v.type, v.neighborhood, v.city, v.image_url, v.cover_image_url,
                    v.is_active, v.is_claimed, v.rating, v.review_count,
                    BOOL_OR(a.is_primary) AS is_primary
             FROM all_ids a JOIN venues v ON v.id=a.venue_id
             GROUP BY v.id
             ORDER BY is_primary DESC, v.name`,
            [req.user.id]
        );
        res.json({ venues: r.rows, count: r.rows.length });
    } catch (err) {
        console.error('[business/venues list]', err);
        res.status(500).json({ error: 'Failed to list venues' });
    }
});

// POST /api/business/venues/add — Enterprise tier: claim/create an additional venue
router.post('/venues/add', requireAuth, requireBusiness, async (req, res) => {
    try {
        // Gate: only pro / enterprise tiers can add more than 1 venue
        const bu = await pool.query('SELECT tier FROM business_users WHERE id=$1', [req.user.id]);
        const tier = (bu.rows[0] && bu.rows[0].tier) || 'starter';
        const existing = await pool.query(
            `SELECT COUNT(*)::int AS n FROM (
                SELECT venue_id FROM business_users WHERE id=$1 AND venue_id IS NOT NULL
                UNION
                SELECT venue_id FROM business_venues WHERE business_user_id=$1
             ) a`,
            [req.user.id]
        );
        const count = existing.rows[0].n;
        const maxAllowed = tier === 'enterprise' ? 99 : (tier === 'pro' ? 3 : 1);
        if (count >= maxAllowed) {
            return res.status(403).json({
                error: `Your ${tier} plan allows ${maxAllowed} venue${maxAllowed === 1 ? '' : 's'}. Upgrade to add more.`,
                current: count, max: maxAllowed, tier
            });
        }

        const { name, description, address, neighborhood, city, type, price_level, phone, website, cover_image_url, image_url, existing_venue_id } = req.body || {};

        let venue;
        if (existing_venue_id) {
            // Claim an existing venue (no duplicate rows)
            const v = await pool.query('SELECT * FROM venues WHERE id=$1', [existing_venue_id]);
            if (!v.rows.length) return res.status(404).json({ error: 'Venue not found' });
            venue = v.rows[0];
            // Mark as claimed
            await pool.query('UPDATE venues SET is_claimed=true, updated_at=NOW() WHERE id=$1', [venue.id]);
        } else {
            if (!name) return res.status(400).json({ error: 'name or existing_venue_id required' });
            const slug = slugify(name);
            const ins = await pool.query(
                `INSERT INTO venues
                 (slug, name, type, description, address, neighborhood, city, state,
                  phone, website, price_level, cover_image_url, image_url,
                  rating, review_count, is_active, is_claimed, created_at, updated_at)
                 VALUES
                 ($1,$2,$3,$4,$5,$6,COALESCE($7,'Boston'),'MA',
                  $8,$9,$10,$11,$12,
                  0,0,true,true,NOW(),NOW())
                 RETURNING *`,
                [slug, name, type || 'restaurant', description || null, address || null,
                 neighborhood || null, city || null, phone || null, website || null,
                 price_level || null, cover_image_url || null, image_url || null]
            );
            venue = ins.rows[0];
        }

        // Link via business_venues join table (idempotent)
        await pool.query(
            `INSERT INTO business_venues (business_user_id, venue_id, is_primary)
             VALUES ($1, $2, false)
             ON CONFLICT (business_user_id, venue_id) DO NOTHING`,
            [req.user.id, venue.id]
        );

        res.json({ ok: true, venue, message: 'Venue added to your account' });
    } catch (err) {
        console.error('[business/venues add]', err);
        res.status(500).json({ error: 'Failed to add venue', detail: err.message });
    }
});

// POST /api/business/venues/switch — change primary/active venue
router.post('/venues/switch', requireAuth, requireBusiness, async (req, res) => {
    try {
        const { venue_id } = req.body || {};
        if (!venue_id) return res.status(400).json({ error: 'venue_id required' });

        // Must own this venue
        const owned = await pool.query(
            `SELECT 1 FROM business_users WHERE id=$1 AND venue_id=$2
             UNION
             SELECT 1 FROM business_venues WHERE business_user_id=$1 AND venue_id=$2`,
            [req.user.id, venue_id]
        );
        if (!owned.rows.length) return res.status(403).json({ error: 'You do not own this venue' });

        // Set as primary on business_users (for /me, /venue, /analytics defaults)
        const v = await pool.query('SELECT name FROM venues WHERE id=$1', [venue_id]);
        await pool.query(
            'UPDATE business_users SET venue_id=$1, venue_name=$2 WHERE id=$3',
            [venue_id, v.rows[0]?.name || 'Venue', req.user.id]
        );
        // Update is_primary flags
        await pool.query('UPDATE business_venues SET is_primary=false WHERE business_user_id=$1', [req.user.id]);
        await pool.query(
            `INSERT INTO business_venues (business_user_id, venue_id, is_primary)
             VALUES ($1, $2, true)
             ON CONFLICT (business_user_id, venue_id) DO UPDATE SET is_primary=true`,
            [req.user.id, venue_id]
        );

        res.json({ ok: true, active_venue_id: venue_id });
    } catch (err) {
        console.error('[business/venues switch]', err);
        res.status(500).json({ error: 'Failed to switch venue' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// PHOTOS
// ═══════════════════════════════════════════════════════════════════

// GET /api/business/photos — list photos for active venue
router.get('/photos', requireAuth, requireBusiness, async (req, res) => {
    try {
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.json({ photos: [], linked: false });
        const r = await pool.query(
            `SELECT id, url, caption, sort_order, created_at
             FROM venue_photos WHERE venue_id=$1
             ORDER BY sort_order ASC, created_at DESC`,
            [venue_id]
        );
        res.json({ photos: r.rows, linked: true, venue_id });
    } catch (err) {
        console.error('[business/photos GET]', err);
        res.status(500).json({ error: 'Failed to load photos' });
    }
});

// POST /api/business/photos — add a photo (by URL)
router.post('/photos', requireAuth, requireBusiness, async (req, res) => {
    try {
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.status(404).json({ error: 'No linked venue' });
        const { url, caption } = req.body || {};
        if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });
        if (url.length > 2000) return res.status(400).json({ error: 'url too long' });

        // Determine next sort_order
        const s = await pool.query(
            `SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM venue_photos WHERE venue_id=$1`,
            [venue_id]
        );
        const sort_order = s.rows[0].n;

        const r = await pool.query(
            `INSERT INTO venue_photos (venue_id, url, caption, sort_order, uploaded_by)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [venue_id, url, caption || null, sort_order, req.user.id]
        );
        res.json({ ok: true, photo: r.rows[0] });
    } catch (err) {
        console.error('[business/photos POST]', err);
        res.status(500).json({ error: 'Failed to add photo', detail: err.message });
    }
});

// PATCH /api/business/photos/:id — update caption or sort_order
router.patch('/photos/:id', requireAuth, requireBusiness, async (req, res) => {
    try {
        const { id } = req.params;
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.status(404).json({ error: 'No linked venue' });
        // Verify ownership
        const own = await pool.query('SELECT 1 FROM venue_photos WHERE id=$1 AND venue_id=$2', [id, venue_id]);
        if (!own.rows.length) return res.status(403).json({ error: 'Photo not in your venue' });

        const allowed = ['caption', 'sort_order', 'url'];
        const updates = []; const values = []; let idx = 1;
        for (const k of allowed) {
            if (req.body[k] !== undefined) { updates.push(`${k}=$${idx++}`); values.push(req.body[k]); }
        }
        if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
        values.push(id);
        const r = await pool.query(
            `UPDATE venue_photos SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
            values
        );
        res.json({ ok: true, photo: r.rows[0] });
    } catch (err) {
        console.error('[business/photos PATCH]', err);
        res.status(500).json({ error: 'Failed to update photo' });
    }
});

// DELETE /api/business/photos/:id
router.delete('/photos/:id', requireAuth, requireBusiness, async (req, res) => {
    try {
        const { id } = req.params;
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.status(404).json({ error: 'No linked venue' });
        const r = await pool.query(
            'DELETE FROM venue_photos WHERE id=$1 AND venue_id=$2 RETURNING id',
            [id, venue_id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Photo not found' });
        res.json({ ok: true, deleted: r.rows[0].id });
    } catch (err) {
        console.error('[business/photos DELETE]', err);
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// PROMOTIONS
// ═══════════════════════════════════════════════════════════════════

// GET /api/business/promos — list promos for active venue
router.get('/promos', requireAuth, requireBusiness, async (req, res) => {
    try {
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.json({ promos: [], linked: false });
        const r = await pool.query(
            `SELECT * FROM venue_promos WHERE venue_id=$1 ORDER BY created_at DESC`,
            [venue_id]
        );
        res.json({ promos: r.rows, linked: true, venue_id });
    } catch (err) {
        console.error('[business/promos GET]', err);
        res.status(500).json({ error: 'Failed to load promotions' });
    }
});

// POST /api/business/promos
router.post('/promos', requireAuth, requireBusiness, async (req, res) => {
    try {
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.status(404).json({ error: 'No linked venue' });
        const { title, description, image_url, starts_at, ends_at, is_active } = req.body || {};
        if (!title) return res.status(400).json({ error: 'title required' });
        const r = await pool.query(
            `INSERT INTO venue_promos
             (venue_id, title, description, image_url, starts_at, ends_at, is_active, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [venue_id, title, description || null, image_url || null,
             starts_at || null, ends_at || null,
             is_active === undefined ? true : !!is_active,
             req.user.id]
        );
        res.json({ ok: true, promo: r.rows[0] });
    } catch (err) {
        console.error('[business/promos POST]', err);
        res.status(500).json({ error: 'Failed to create promotion', detail: err.message });
    }
});

// PATCH /api/business/promos/:id
router.patch('/promos/:id', requireAuth, requireBusiness, async (req, res) => {
    try {
        const { id } = req.params;
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.status(404).json({ error: 'No linked venue' });
        const own = await pool.query('SELECT 1 FROM venue_promos WHERE id=$1 AND venue_id=$2', [id, venue_id]);
        if (!own.rows.length) return res.status(403).json({ error: 'Promo not in your venue' });
        const allowed = ['title', 'description', 'image_url', 'starts_at', 'ends_at', 'is_active'];
        const updates = []; const values = []; let idx = 1;
        for (const k of allowed) {
            if (req.body[k] !== undefined) { updates.push(`${k}=$${idx++}`); values.push(req.body[k]); }
        }
        if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
        values.push(id);
        const r = await pool.query(
            `UPDATE venue_promos SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`,
            values
        );
        res.json({ ok: true, promo: r.rows[0] });
    } catch (err) {
        console.error('[business/promos PATCH]', err);
        res.status(500).json({ error: 'Failed to update promotion' });
    }
});

// DELETE /api/business/promos/:id
router.delete('/promos/:id', requireAuth, requireBusiness, async (req, res) => {
    try {
        const { id } = req.params;
        const venue_id = await resolveActiveVenueId(req);
        if (!venue_id) return res.status(404).json({ error: 'No linked venue' });
        const r = await pool.query(
            'DELETE FROM venue_promos WHERE id=$1 AND venue_id=$2 RETURNING id',
            [id, venue_id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Promo not found' });
        res.json({ ok: true, deleted: r.rows[0].id });
    } catch (err) {
        console.error('[business/promos DELETE]', err);
        res.status(500).json({ error: 'Failed to delete promotion' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD RESET (Business)
// ═══════════════════════════════════════════════════════════════════════════

// Phase 5D-C1: legacy bizEmailTransporter replaced with centralized mailer.
const mailer = require('../services/mailer');

async function sendBusinessResetEmail(toEmail, resetToken, venueName) {
    const appUrl = process.env.APP_BASE_URL || 'https://scenelink.app';
    const resetUrl = `${appUrl}/business.html?reset_token=${resetToken}`;
    const tpl = {
        subject: 'Reset your SceneLink business account password',
        html: `<div style="font-family:Inter,Helvetica,sans-serif;background:#000;padding:24px 0">
            <div style="max-width:560px;margin:0 auto;padding:32px 28px;background:#0d0d0d;color:#fff;border-radius:14px">
                <div style="text-align:center;margin-bottom:24px">
                    <span style="font-size:24px;font-weight:700;color:#D4AF37">SceneLink for Business</span>
                </div>
                <h2 style="color:#fff;font-size:22px;margin:0 0 12px">Reset your password</h2>
                <p style="color:#ccc;font-size:15px;line-height:1.7">You requested a password reset for your business account${venueName ? ` <strong style="color:#D4AF37">(${venueName})</strong>` : ''}.</p>
                <p style="color:#ccc;font-size:15px;line-height:1.7">Click the button below to set a new password. The link expires in 1 hour.</p>
                <div style="text-align:center;margin:32px 0">
                    <a href="${resetUrl}" style="background:#D4AF37;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">Reset password →</a>
                </div>
                <p style="color:#666;font-size:12px;text-align:center">If you didn't request this, you can safely ignore this email.</p>
                <hr style="border:0;border-top:1px solid #1a1a1a;margin:28px 0 20px"/>
                <div style="color:#666;font-size:11px;text-align:center">
                    <a href="${appUrl}/privacy.html" style="color:#888;text-decoration:none;margin:0 8px">Privacy</a>·
                    <a href="${appUrl}/terms.html" style="color:#888;text-decoration:none;margin:0 8px">Terms</a>·
                    <a href="${appUrl}/contact.html" style="color:#888;text-decoration:none;margin:0 8px">Contact</a>
                </div>
            </div>
        </div>`,
    };
    const r = await mailer.sendMail({ to: toEmail, ...tpl });
    if (!r.ok) {
        if (r.skipped) console.log(`[business/forgot-password] mailer disabled — reset link logged: ${resetUrl}`);
        else console.error(`[business/forgot-password] send failed: ${r.error}`);
        return false;
    }
    console.log(`[business/forgot-password] email queued → ${toEmail}`);
    return true;
}

// POST /api/business/forgot-password
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    try {
        await ensureBusinessTables();
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const result = await pool.query(
            'SELECT id, venue_name FROM business_users WHERE LOWER(email)=LOWER($1)',
            [email]
        );

        // Always return success to prevent email enumeration
        if (result.rows.length === 0) {
            return res.json({
                ok: true,
                message: 'If that email is registered, you will receive a reset link shortly.'
            });
        }

        const user = result.rows[0];
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await pool.query(
            'UPDATE business_users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3',
            [token, expires, user.id]
        );

        let emailSent = false;
        try {
            emailSent = await sendBusinessResetEmail(email, token, user.venue_name);
        } catch (emailErr) {
            console.error('[business/forgot-password] Email send failed:', emailErr.message);
        }

        const isDev = process.env.NODE_ENV !== 'production';
        res.json({
            ok: true,
            message: emailSent
                ? 'A password reset link has been sent to your email. Please check your inbox (and spam folder).'
                : "If that email is registered, a reset link will be sent. If you don't receive it within a few minutes, please contact support.",
            email_sent: emailSent,
            ...(isDev && !emailSent && {
                debug_token: token,
                debug_reset_url: `${process.env.APP_URL || 'https://scenelink.app'}/business.html?reset_token=${token}`
            })
        });
    } catch (err) {
        console.error('[business/forgot-password]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/business/reset-password
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
    try {
        await ensureBusinessTables();
        const { token, password } = req.body || {};
        if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

        const result = await pool.query(
            'SELECT id, email FROM business_users WHERE reset_token=$1 AND reset_token_expires > NOW()',
            [token]
        );
        const user = result.rows[0];
        if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

        const password_hash = await bcrypt.hash(password, 12);
        await pool.query(
            'UPDATE business_users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2',
            [password_hash, user.id]
        );

        res.json({ ok: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
        console.error('[business/reset-password]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 5D-C3 — VENUE SEARCH (for claim flow)
// GET /api/business/venues/search?q=name
// Public — used by the "Claim your venue" flow to find an existing listing.
// ══════════════════════════════════════════════════════════════════════════
router.get('/venues/search', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) return res.json({ venues: [] });
        const result = await pool.query(
            `SELECT v.id, v.slug, v.name, v.type, v.neighborhood, v.address,
                    EXISTS(SELECT 1 FROM business_users bu WHERE bu.venue_id=v.id AND bu.status='active') AS claimed
               FROM venues v
              WHERE v.name ILIKE $1
                 OR v.neighborhood ILIKE $1
              ORDER BY (v.name ILIKE $2) DESC, v.name ASC
              LIMIT 20`,
            [`%${q}%`, `${q}%`]
        );
        res.json({ venues: result.rows });
    } catch (err) {
        console.error('[business/venues/search]', err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 5D-C3 — UPGRADE INTEREST FORM
// POST /api/business/upgrade-interest
// No fake checkout. Captures a sales-interest message and forwards to info@.
// ══════════════════════════════════════════════════════════════════════════
router.post('/upgrade-interest', contactLimiter, async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS business_upgrade_interest (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                business_user_id UUID REFERENCES business_users(id) ON DELETE SET NULL,
                email VARCHAR(255) NOT NULL,
                venue_name VARCHAR(255),
                desired_tier VARCHAR(64),
                message TEXT,
                status VARCHAR(32) DEFAULT 'new',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `).catch(() => {});

        const { email, venue_name, desired_tier, message, business_user_id } = req.body || {};
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
            return res.status(400).json({ error: 'A valid email is required' });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const result = await pool.query(
            `INSERT INTO business_upgrade_interest (business_user_id, email, venue_name, desired_tier, message)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING id, created_at`,
            [
                business_user_id || null,
                cleanEmail,
                String(venue_name || '').trim().slice(0, 255) || null,
                String(desired_tier || '').trim().slice(0, 64) || null,
                String(message || '').trim().slice(0, 5000) || null,
            ]
        );

        // Forward to sales (info@scenelink.app) — non-blocking
        setImmediate(async () => {
            try {
                const mailer = require('../services/mailer');
                await mailer.sendMail({
                    to: mailer.CONTACT_FORWARD_TO,
                    replyTo: cleanEmail,
                    subject: `[Business Upgrade] ${venue_name || cleanEmail} → ${desired_tier || 'tier inquiry'}`,
                    html: `<div style="font-family:sans-serif;max-width:520px;padding:24px;background:#0d0d0d;color:#fff;border-radius:12px">
                        <h3 style="color:#D4AF37;margin:0 0 12px">New business upgrade interest</h3>
                        <table style="width:100%;color:#ccc;font-size:14px;border-collapse:collapse">
                          <tr><td style="padding:6px 0;color:#888">Email</td><td><a href="mailto:${cleanEmail}" style="color:#D4AF37">${cleanEmail}</a></td></tr>
                          <tr><td style="padding:6px 0;color:#888">Venue</td><td>${venue_name || '(not provided)'}</td></tr>
                          <tr><td style="padding:6px 0;color:#888">Desired tier</td><td>${desired_tier || '(not specified)'}</td></tr>
                        </table>
                        ${message ? `<div style="margin-top:16px;padding:14px;background:#111;border:1px solid #1a1a1a;border-radius:8px;color:#fff;line-height:1.6;white-space:pre-wrap">${String(message).replace(/[<>&]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>` : ''}
                      </div>`,
                });
                // Send acknowledgment to requester
                await mailer.sendMail({
                    to: cleanEmail,
                    subject: 'We got your SceneLink Business upgrade request',
                    html: `<div style="font-family:sans-serif;max-width:520px;padding:24px;background:#0d0d0d;color:#fff;border-radius:12px">
                        <h2 style="color:#D4AF37;margin:0 0 12px">Thanks — we'll be in touch.</h2>
                        <p style="color:#ccc;line-height:1.6">Our business team will review your request and reach out within 1–2 business days. In the meantime, you can keep using your current SceneLink Business account at <a href="https://scenelink.app/business.html" style="color:#D4AF37">scenelink.app/business.html</a>.</p>
                      </div>`,
                });
            } catch (e) {
                console.warn('[business/upgrade-interest] email failed:', e.message);
            }
        });

        res.json({
            ok: true,
            id: result.rows[0].id,
            message: "Thanks — our business team will review your request and reach out within 1–2 business days.",
        });
    } catch (err) {
        console.error('[business/upgrade-interest]', err);
        res.status(500).json({ error: 'Failed to submit upgrade request' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 5D-C3 — PER-LISTING ANALYTICS (owner-scoped, real events)
// GET /api/business/listings/:id/analytics
// Returns real event counts from analytics_events table for owned listing.
// Uses honest empty state when no events recorded yet.
// ══════════════════════════════════════════════════════════════════════════
router.get('/listings/:id/analytics', requireAuth, requireBusiness, async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_events (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID,
                venue_id UUID,
                event_type VARCHAR(64) NOT NULL,
                metadata JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `).catch(() => {});
        await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_venue_type ON analytics_events(venue_id, event_type)').catch(()=>{});

        // Verify ownership
        const venueId = req.params.id;
        const ownership = await pool.query(
            'SELECT 1 FROM business_users WHERE id=$1 AND venue_id=$2 AND status=\'active\'',
            [req.user.id, venueId]
        );
        if (!ownership.rows.length) {
            return res.status(403).json({ error: 'You do not own this listing' });
        }

        const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));
        const result = await pool.query(
            `SELECT event_type, COUNT(*)::int AS count
               FROM analytics_events
              WHERE venue_id=$1 AND created_at >= NOW() - ($2 || ' days')::interval
              GROUP BY event_type`,
            [venueId, String(days)]
        );

        // Fold into a known shape so the dashboard always has the keys it expects.
        const counts = { view: 0, save: 0, call_click: 0, website_click: 0, direction_click: 0, plan_add: 0 };
        for (const row of result.rows) {
            if (counts.hasOwnProperty(row.event_type)) counts[row.event_type] = row.count;
        }
        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        res.json({
            ok: true,
            venue_id: venueId,
            window_days: days,
            counts,
            total,
            empty_state: total === 0
                ? 'Analytics begin once your listing is approved and viewed.'
                : null,
        });
    } catch (err) {
        console.error('[business/listings/:id/analytics]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;