/**
 * SceneLink OAuth Routes
 * POST /api/auth/google   — verify Google ID token, return SceneLink JWT
 * POST /api/auth/apple    — verify Apple identity token, return SceneLink JWT
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimits');
const { verified } = require('../launch/verification');
const { noStore } = require('../launch/shared');
router.use(noStore, authLimiter);

// ── Google OAuth ──────────────────────────────────────────────────────────────
// Frontend sends: { id_token: "<google id token>" }
// Backend verifies with Google, upserts user, returns SceneLink JWT
router.post('/google', async (req, res) => {
    try {
        const { id_token, credential } = req.body;
        const token = id_token || credential;
        if (!token) return res.status(400).json({ error: 'id_token is required' });

        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        if (!GOOGLE_CLIENT_ID) {
            return res.status(503).json({ error: 'Google OAuth not configured on this server' });
        }

        // Verify the Google ID token
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        const { sub: googleId, email, name, picture } = payload;
        if (!email || payload.email_verified !== true) return res.status(401).json({ error: 'A verified Google email is required' });

        // Upsert user
        const user = await upsertOAuthUser({
            email,
            display_name: name || email.split('@')[0],
            avatar_url: picture || null,
            oauth_provider: 'google',
            oauth_id: googleId,
        });

        const slToken = generateToken(user);
        delete user.auth_version; delete user.is_active; delete user.is_suspended;
        res.json({ token: slToken, user, is_new: user._is_new });
    } catch (err) {
        if(err.status===409)return res.status(409).json({error:err.message,code:'ACCOUNT_LINK_VERIFICATION_REQUIRED'});
        console.error('[oauth/google]', err.message);
        if (err.message && err.message.includes('Invalid token signature')) {
            return res.status(401).json({ error: 'Invalid Google token' });
        }
        res.status(500).json({ error: 'Google sign-in failed. Please try again.' });
    }
});

// ── Apple Sign In ─────────────────────────────────────────────────────────────
// Frontend sends: { id_token, user: { name: { firstName, lastName }, email } }
// id_token is a JWT signed by Apple — we verify with Apple's public keys via jwks-rsa
router.post('/apple', async (req, res) => {
    try {
        const { id_token, user: appleUser } = req.body;
        if (!id_token) return res.status(400).json({ error: 'id_token is required' });

        const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID;
        if (!APPLE_CLIENT_ID) {
            return res.status(503).json({ error: 'Apple Sign In not configured on this server' });
        }

        // Decode Apple JWT header to get kid
        const jwt = require('jsonwebtoken');
        const jwksClient = require('jwks-rsa');

        const decoded = jwt.decode(id_token, { complete: true });
        if (!decoded || !decoded.header) {
            return res.status(401).json({ error: 'Invalid Apple token format' });
        }

        // Fetch Apple public keys
        const client = jwksClient({
            jwksUri: 'https://appleid.apple.com/auth/keys',
            cache: true,
            cacheMaxEntries: 5,
            cacheMaxAge: 600000, // 10 min
        });

        const key = await new Promise((resolve, reject) => {
            client.getSigningKey(decoded.header.kid, (err, k) => {
                if (err) reject(err);
                else resolve(k.getPublicKey());
            });
        });

        const verified = jwt.verify(id_token, key, {
            algorithms: ['RS256'],
            issuer: 'https://appleid.apple.com',
            audience: APPLE_CLIENT_ID,
        });

        const appleId = verified.sub;
        // Apple only provides email on first sign-in
        const email = verified.email;
        if (!email || ![true, 'true'].includes(verified.email_verified)) return res.status(401).json({error:'A verified Apple email is required'});
        const firstName = (appleUser && appleUser.name && appleUser.name.firstName) || '';
        const lastName = (appleUser && appleUser.name && appleUser.name.lastName) || '';
        const displayName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];

        const user = await upsertOAuthUser({
            email,
            display_name: displayName,
            avatar_url: null,
            oauth_provider: 'apple',
            oauth_id: appleId,
        });

        const slToken = generateToken(user);
        delete user.auth_version; delete user.is_active; delete user.is_suspended;
        res.json({ token: slToken, user, is_new: user._is_new });
    } catch (err) {
        if(err.status===409)return res.status(409).json({error:err.message,code:'ACCOUNT_LINK_VERIFICATION_REQUIRED'});
        console.error('[oauth/apple]', err.message);
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired Apple token' });
        }
        res.status(500).json({ error: 'Apple sign-in failed. Please try again.' });
    }
});

// ── Shared upsert helper ──────────────────────────────────────────────────────
async function upsertOAuthUser({ email, display_name, avatar_url, oauth_provider, oauth_id }) {
    // 1. Try find by oauth_provider + oauth_id
    let result = await pool.query(
        'SELECT id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at, auth_version, is_active, is_suspended, email_verified_at, verified_email FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
        [oauth_provider, oauth_id]
    );

    if (result.rows.length > 0) {
        const user = result.rows[0];
        if (!user.is_active || user.is_suspended) throw new Error('Account unavailable');
        if (user.email.toLowerCase() !== email.toLowerCase()) throw new Error('Provider email does not match account');
        await pool.query('UPDATE users SET email_verified_at=NOW(),verified_email=lower(email) WHERE id=$1',[user.id]);
        user.email_verified=true;
        user._is_new = false;
        // Update avatar if changed
        if (avatar_url) {
            await pool.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatar_url, user.id]);
            user.avatar_url = avatar_url;
        }
        return user;
    }

    // 2. Try find by email (link existing account)
    result = await pool.query(
        'SELECT id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at, auth_version, is_active, is_suspended, email_verified_at, verified_email FROM users WHERE lower(email) = lower($1)',
        [email]
    );

    if (result.rows.length > 0) {
        const user = result.rows[0];
        if (!user.is_active || user.is_suspended) throw new Error('Account unavailable');
        // Never promote a pre-created unverified password account by email match.
        if (!verified(user)) { const e=new Error('Verify your existing account email before linking this sign-in provider.');e.status=409;throw e; }
        user.email_verified=true;
        // Link OAuth to existing account
        await pool.query(
            'UPDATE users SET oauth_provider = $1, oauth_id = $2, avatar_url = COALESCE($3, avatar_url), updated_at = NOW() WHERE id = $4',
            [oauth_provider, oauth_id, avatar_url, user.id]
        );
        user.oauth_provider = oauth_provider;
        user._is_new = false;
        return user;
    }

    // 3. Create new user
    const username = generateUsername(email);
    const avatarFallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(display_name || email)}`;

    const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, display_name, username, avatar_url, bio, neighborhood, oauth_provider, oauth_id, email_verified_at, verified_email)
         VALUES ($1::text, NULL, $2, $3, $4, '', 'Back Bay', $5, $6, NOW(), lower($1::text))
         RETURNING id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at, auth_version, is_active, is_suspended`,
        [email, display_name, username, avatar_url || avatarFallback, oauth_provider, oauth_id]
    );

    const newUser = insertResult.rows[0];
    newUser.email_verified = true;
    newUser._is_new = true;
    return newUser;
}

function generateUsername(email) {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_');
    return base + '_' + Math.random().toString(36).substr(2, 4);
}

module.exports = router;
