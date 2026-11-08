// ============================================================================
// Shared rate limiters for sensitive endpoints
// ============================================================================
// Required dependency: never silently disable abuse controls.
const rateLimit = require('express-rate-limit');

// Standard-headers enabled so browsers + reverse proxies can read limits.
const common = {
    standardHeaders: true,
    legacyHeaders: false,
    // Express derives the client IP using the configured trusted proxy hop.
    // Do not let arbitrary CF/XFF header values select a fresh rate bucket.
    keyGenerator: req => req.ip,
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
