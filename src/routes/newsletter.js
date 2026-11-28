'use strict';

const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const express = require('express');
const { contactLimiter, writeLimiter } = require('../middleware/rateLimits');

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const generic = { ok: true, message: 'If confirmation is needed, check your inbox for a link to join.' };
const unavailable = { error: 'Email signup is temporarily unavailable. Please try again later.' };

function createRouter({ pool, mailer, logger = console, sendTimeoutMs = 12000 }) {
    const router = express.Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.post('/subscribe', contactLimiter, async (req, res) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        if (email.length > 254 || !emailPattern.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
        // Backward-compatible endpoint for the legacy native waitlist modal.
        const waitlistPlatforms = {app_waitlist_ios:'ios',app_waitlist_android:'android',app_waitlist_web:'other',
          'app-waitlist':'other','ios-app-waitlist':'ios'};
        const requestedSource = req.body?.source;
        if (typeof requestedSource === 'string' && Object.hasOwn(waitlistPlatforms,requestedSource)) {
            try {
                await pool.query(`INSERT INTO app_launch_waitlist (email,platform) VALUES ($1,$2)
                    ON CONFLICT (email) DO NOTHING`, [email,waitlistPlatforms[requestedSource]]);
                return res.json({ok:true,message:'Your request for native app launch news was saved.'});
            } catch (_) { return res.status(503).json(unavailable); }
        }
        if (!(mailer.isReadyFor ? mailer.isReadyFor('newsletter-confirm') : mailer.isReady())) return res.status(503).json(unavailable);
        const source = 'footer';
        const token = randomBytes(32).toString('base64url');
        let timeout;
        try {
            const template = mailer.newsletterConfirmEmail(token);
            // Atomic claim across instances. An active, confirmed address is not
            // contacted again. An expired or opted-out address must reconfirm.
            const claimed = await pool.query(`
              INSERT INTO newsletter_subscribers (email,source,status,opt_in_hash,opt_in_requested_at)
              SELECT COALESCE((
                SELECT email FROM newsletter_subscribers WHERE LOWER(email)=$1
                ORDER BY (status='active' AND opt_in_confirmed_at IS NOT NULL) DESC NULLS LAST, (email=$1) DESC, id LIMIT 1
              ), $1),$2,'pending',$3,NOW()
              ON CONFLICT (email) DO UPDATE SET status='pending',source=EXCLUDED.source,
                opt_in_hash=EXCLUDED.opt_in_hash,opt_in_requested_at=NOW(),opt_in_confirmed_at=NULL
              WHERE (newsletter_subscribers.status IS DISTINCT FROM 'active' OR newsletter_subscribers.opt_in_confirmed_at IS NULL)
                AND (newsletter_subscribers.opt_in_requested_at IS NULL OR newsletter_subscribers.opt_in_requested_at < NOW()-INTERVAL '30 minutes')
              RETURNING id
            `, [email, source, tokenHash(token)]);
            if (!claimed.rows.length) return res.status(202).json(generic);
            const outcome = await Promise.race([
                mailer.sendMail({ to: {address:email}, ...template, retry:false, privateLog:true, purpose:'newsletter-confirm' }),
                new Promise(resolve => { timeout = setTimeout(() => resolve(null), sendTimeoutMs); }),
            ]);
            if (!outcome?.ok) {
                // Do not retry ambiguous sends automatically or claim delivery.
                logger.warn('[newsletter] confirmation not accepted or unknown');
                return res.status(503).json(unavailable);
            }
            return res.status(202).json(generic);
        } catch (_) {
            logger.warn('[newsletter] signup unavailable');
            return res.status(503).json(unavailable);
        } finally { clearTimeout(timeout); }
    });

    const tokenAction = action => async (req, res) => {
        const token = req.body?.token;
        if (typeof token !== 'string' || !tokenPattern.test(token)) return res.status(400).json({ error:'This link is invalid or has expired.' });
        const hash = tokenHash(token);
        try {
            if (action === 'confirm') {
                const result = await pool.query(`
                  UPDATE newsletter_subscribers SET status='active',opt_in_confirmed_at=NOW(),subscribed_at=NOW()
                  WHERE opt_in_hash=$1 AND status='pending' AND opt_in_requested_at >= NOW()-INTERVAL '24 hours'
                  RETURNING id`, [hash]);
                if (!result.rows.length) return res.status(400).json({ error:'This link is expired or already used. If needed, sign up again from the footer.' });
            } else {
                const result = await pool.query(`
                  UPDATE newsletter_subscribers SET status='unsubscribed'
                  WHERE opt_in_hash=$1 AND status IN ('pending','active','unsubscribed') RETURNING id`, [hash]);
                if (!result.rows.length) return res.status(400).json({ error:'This link is invalid or has been replaced.' });
            }
            return res.json({ ok:true });
        } catch (_) {
            logger.warn('[newsletter] token action unavailable');
            return res.status(503).json({ error:'Please try again later.' });
        }
    };
    router.post('/confirm', writeLimiter, tokenAction('confirm'));
    router.post('/unsubscribe', writeLimiter, tokenAction('unsubscribe'));

    router.get('/subscribers', async (req, res) => {
        const supplied = Buffer.from(req.get('x-admin-secret') || '');
        const expected = Buffer.from(process.env.ADMIN_SECRET || '');
        if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(403).json({ error:'Forbidden' });
        try {
            const limit = Math.max(1, Math.min(500, parseInt(req.query.limit,10) || 100));
            const result = await pool.query(`SELECT id,email,name,source,status,subscribed_at FROM newsletter_subscribers
              WHERE status='active' AND opt_in_confirmed_at IS NOT NULL ORDER BY subscribed_at DESC LIMIT $1`, [limit]);
            const count = await pool.query("SELECT COUNT(*)::int AS total FROM newsletter_subscribers WHERE status='active' AND opt_in_confirmed_at IS NOT NULL");
            return res.json({ subscribers:result.rows, total:count.rows[0].total });
        } catch (_) { return res.status(500).json({ error:'Unable to load subscribers.' }); }
    });
    return router;
}
module.exports = createRouter({pool:require('../config/database'),mailer:require('../services/mailer')});
module.exports.createRouter = createRouter;
