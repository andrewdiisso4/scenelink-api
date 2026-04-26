const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ═════════════════════════════════════════════════════════════
// Ensure business_users + venue_claims tables exist (idempotent)
// ═════════════════════════════════════════════════════════════
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

// ═════════════════════════════════════════════════════════════
// POST /api/business/claim
// Create a business account + link to venue (by name match, best effort)
// ═════════════════════════════════════════════════════════════
router.post('/claim', async (req, res) => {
    try {
        const { venue_name, email, password, tier, phone, website } = req.body || {};
        if (!venue_name || !email || !password) {
            return res.status(400).json({ error: 'venue_name, email, and password are required' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if email already claimed
        const existing = await pool.query('SELECT id FROM business_users WHERE email=$1', [email]);
        if (existing.rows.length) {
            return res.status(409).json({ error: 'This email is already registered. Please sign in instead.' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        // Best-effort: match to existing venue by name (case-insensitive ilike)
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

// ═════════════════════════════════════════════════════════════
// POST /api/business/login
// ═════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await pool.query(
            `SELECT id, email, password_hash, venue_name, venue_id, tier, status FROM business_users WHERE email=$1`,
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

        // Update last_login
        pool.query('UPDATE business_users SET last_login=NOW() WHERE id=$1', [user.id]).catch(()=>{});

        // Fetch venue details if linked
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

// ═════════════════════════════════════════════════════════════
// GET /api/business/me — get current business user + venue details
// ═════════════════════════════════════════════════════════════
router.get('/me', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'business') {
            return res.status(403).json({ error: 'Business account required' });
        }
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

// ═════════════════════════════════════════════════════════════
// PATCH /api/business/venue — update linked venue listing
// ═════════════════════════════════════════════════════════════
router.patch('/venue', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'business') {
            return res.status(403).json({ error: 'Business account required' });
        }
        const bu = await pool.query('SELECT venue_id FROM business_users WHERE id=$1', [req.user.id]);
        if (!bu.rows.length || !bu.rows[0].venue_id) {
            return res.status(404).json({ error: 'No linked venue. Please complete claim verification.' });
        }
        const venue_id = bu.rows[0].venue_id;

        const allowed = ['name', 'description', 'address', 'neighborhood', 'phone', 'website_url', 'cover_image_url'];
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
        res.json({ ok: true, venue: result.rows[0] });
    } catch (err) {
        console.error('[business/venue PATCH]', err);
        res.status(500).json({ error: 'Failed to update venue' });
    }
});

// ═════════════════════════════════════════════════════════════
// GET /api/business/analytics — real analytics for linked venue
// ═════════════════════════════════════════════════════════════
router.get('/analytics', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'business') {
            return res.status(403).json({ error: 'Business account required' });
        }
        const bu = await pool.query('SELECT venue_id FROM business_users WHERE id=$1', [req.user.id]);
        if (!bu.rows.length || !bu.rows[0].venue_id) {
            return res.json({
                views: 0, saves: 0, checkins: 0, engagement: 0,
                linked: false,
                message: 'Link a venue to see analytics'
            });
        }
        const venue_id = bu.rows[0].venue_id;

        // Real counts
        const [saves, checkins, plans] = await Promise.all([
            pool.query('SELECT COUNT(*)::int AS n FROM favorites WHERE venue_id=$1', [venue_id]).catch(()=>({rows:[{n:0}]})),
            pool.query("SELECT COUNT(*)::int AS n FROM checkins WHERE venue_id=$1 AND created_at > NOW() - INTERVAL '1 day'", [venue_id]).catch(()=>({rows:[{n:0}]})),
            pool.query("SELECT COUNT(*)::int AS n FROM plan_venues WHERE venue_id=$1", [venue_id]).catch(()=>({rows:[{n:0}]}))
        ]);

        const savesN = saves.rows[0].n;
        const checkinsN = checkins.rows[0].n;
        const plansN = plans.rows[0].n;
        // Views is derived (not tracked separately) — estimate from saves*8
        const viewsN = savesN * 8 + checkinsN * 3 + plansN * 4;
        const engagement = viewsN ? Math.round((savesN + checkinsN) / viewsN * 1000) / 10 : 0;

        res.json({
            views: viewsN,
            saves: savesN,
            checkins: checkinsN,
            plans: plansN,
            engagement,
            linked: true
        });
    } catch (err) {
        console.error('[business/analytics]', err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

module.exports = router;