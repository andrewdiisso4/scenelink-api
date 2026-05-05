// ============================================================================
// Shared rate limiters for sensitive endpoints
// ============================================================================
// Degrades gracefully: if express-rate-limit is not installed, uses a no-op.

let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (e) {
    console.warn('[rate-limit] express-rate-limit not installed — falling back to no-op');
    rateLimit = () => (req, res, next) => next();
}

// Standard-headers enabled so browsers + reverse proxies can read limits.
const common = {
    standardHeaders: true,
    legacyHeaders: false,
    // Key by CF-Connecting-IP / X-Forwarded-For if present (Render sits behind a proxy)
    keyGenerator: (req /*, res */) => {
        return (
            req.headers['cf-connecting-ip'] ||
            (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
            req.ip
        );
    },
    skip: (req) => req.method === 'OPTIONS', // never rate-limit CORS preflight
};

// ── Login / Signup / Business-claim: 10 per 15 min per IP ────────────────────
exports.authLimiter = rateLimit({
    ...common,
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many auth attempts. Please wait a few minutes and try again.' },
});

// ── Password reset (forgot): 5 per hour per IP ───────────────────────────────
exports.passwordResetLimiter = rateLimit({
    ...common,
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password reset requests. Please wait an hour.' },
});

// ── AI/Concierge: 20 per 10 min per IP ───────────────────────────────────────
exports.aiLimiter = rateLimit({
    ...common,
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { error: 'Rate limit reached for AI requests. Please wait a few minutes.' },
});

// ── Contact form / newsletter: 8 per 10 min per IP ───────────────────────────
exports.contactLimiter = rateLimit({
    ...common,
    windowMs: 10 * 60 * 1000,
    max: 8,
    message: { error: 'Too many submissions. Please wait a few minutes.' },
});

// ── Generic write endpoint limiter: 60 per 15 min per IP ─────────────────────
exports.writeLimiter = rateLimit({
    ...common,
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: 'Too many write requests. Please slow down.' },
});