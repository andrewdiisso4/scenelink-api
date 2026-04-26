const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Ensure analytics table exists
async function ensureAnalyticsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS analytics_events (
            id BIGSERIAL PRIMARY KEY,
            event VARCHAR(64) NOT NULL,
            user_id VARCHAR(128),
            anon BOOLEAN DEFAULT TRUE,
            session_id VARCHAR(128),
            url TEXT,
            referrer TEXT,
            properties JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ae_event ON analytics_events(event);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ae_session ON analytics_events(session_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ae_user ON analytics_events(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ae_created ON analytics_events(created_at DESC);`);
}
ensureAnalyticsTable().catch(e => console.error('[analytics] table init:', e.message));

// POST /api/analytics/event — batch or single event
router.post('/event', optionalAuth, async (req, res) => {
    try {
        var events = req.body.events || (req.body.event ? [req.body] : []);
        if (!events.length) return res.json({ ok: true, inserted: 0 });

        // Cap to prevent abuse
        events = events.slice(0, 100);

        const authedUserId = req.user && req.user.id ? req.user.id : null;
        const values = [];
        const placeholders = [];
        let i = 1;
        events.forEach(function(e){
            if (!e.event) return;
            placeholders.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
            values.push(
                String(e.event).slice(0, 64),
                authedUserId || (e.user_id || null),
                authedUserId ? false : (e.anon !== false),
                e.session_id ? String(e.session_id).slice(0, 128) : null,
                e.url ? String(e.url).slice(0, 500) : null,
                e.referrer ? String(e.referrer).slice(0, 500) : null,
                JSON.stringify(stripMeta(e))
            );
        });

        if (!placeholders.length) return res.json({ ok: true, inserted: 0 });

        await pool.query(
            `INSERT INTO analytics_events (event, user_id, anon, session_id, url, referrer, properties)
             VALUES ${placeholders.join(',')}`,
            values
        );
        res.json({ ok: true, inserted: events.length });
    } catch (err) {
        console.error('[analytics/event]', err);
        // Never fail loudly — analytics should be best-effort
        res.json({ ok: false, error: 'failed' });
    }
});

function stripMeta(e){
    var skip = ['event','ts','session_id','user_id','anon','url','referrer'];
    var out = {};
    Object.keys(e).forEach(function(k){
        if (skip.indexOf(k) === -1) out[k] = e[k];
    });
    out.ts = e.ts || Date.now();
    return out;
}

// GET /api/analytics/summary — admin-only snapshot
router.get('/summary', async (req, res) => {
    const adminSecret = req.headers['x-admin-secret'] || req.query.admin_secret;
    if (adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const [total, byEvent, recent] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS n FROM analytics_events WHERE created_at > NOW() - INTERVAL '7 days'`),
            pool.query(`
                SELECT event, COUNT(*)::int AS n
                FROM analytics_events
                WHERE created_at > NOW() - INTERVAL '7 days'
                GROUP BY event
                ORDER BY n DESC
                LIMIT 20
            `),
            pool.query(`
                SELECT event, user_id, session_id, url, created_at
                FROM analytics_events
                ORDER BY created_at DESC
                LIMIT 50
            `)
        ]);
        res.json({
            last_7d_total: total.rows[0].n,
            by_event: byEvent.rows,
            recent: recent.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

module.exports = router;