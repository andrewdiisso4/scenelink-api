const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken, requireAuth } = require('../middleware/auth');
const mailer = require('../services/mailer');

// Phase 5D-C1: ad-hoc Gmail/SendGrid SMTP setup removed in favor of
// /services/mailer.js — single GoDaddy-compatible transport using
// EMAIL_PROVIDER + SMTP_* env vars. Sender is now info@scenelink.app.

async function sendPasswordResetEmail(toEmail, resetToken, displayName) {
  const appUrl = process.env.APP_BASE_URL || 'https://scenelink.app';
  const resetUrl = `${appUrl}/profile.html?reset_token=${resetToken}`;
  const tpl = mailer.passwordResetEmail({ name: displayName, resetUrl });
  const r = await mailer.sendMail({ to: toEmail, ...tpl });
  if (!r.ok) {
    // Never expose the reset URL in API logs as a credential — but admins
    // running Render console need a fallback when SMTP is unconfigured.
    if (r.skipped) console.log(`[forgot-password] mailer disabled — reset link logged: ${resetUrl}`);
    else console.error(`[forgot-password] send failed: ${r.error}`);
    return false;
  }
  console.log(`[forgot-password] email queued → ${toEmail}`);
  return true;
}

const router = express.Router();

// Rate limiters
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimits');

// POST /api/auth/signup
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_');

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, username, avatar_url, bio, neighborhood)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at`,
      [
        email,
        password_hash,
        display_name || email.split('@')[0],
        username,
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(display_name || email)}`,
        '',
        'Back Bay',
      ]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    // ── Send welcome email + admin notification (non-blocking, Phase 5D-C1) ──
    setImmediate(async () => {
      try {
        const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || mailer.SUPPORT_EMAIL;

        // 1) Welcome email to new user (from info@scenelink.app via mailer)
        const welcome = mailer.welcomeEmail(user);
        const r = await mailer.sendMail({ to: user.email, ...welcome });
        if (r.skipped) {
          console.log(`[signup] mailer disabled — NEW USER: ${user.display_name} <${user.email}> | ID: ${user.id}`);
        }

        // 2) Admin notification of new signup
        if (adminEmail) {
          await mailer.sendMail({
            to: adminEmail,
            subject: `[SceneLink] New signup: ${user.display_name} (${user.email})`,
            html: `<div style="font-family:sans-serif;max-width:480px;padding:24px;background:#111;color:#fff;border-radius:8px">
                <h3 style="color:#D4AF37;margin-top:0">New User Signup</h3>
                <table style="width:100%;font-size:14px;color:#ccc;border-collapse:collapse">
                  <tr><td style="padding:6px 0;color:#888">Name</td><td><strong style="color:#fff">${user.display_name}</strong></td></tr>
                  <tr><td style="padding:6px 0;color:#888">Email</td><td><a href="mailto:${user.email}" style="color:#D4AF37">${user.email}</a></td></tr>
                  <tr><td style="padding:6px 0;color:#888">Username</td><td>@${user.username}</td></tr>
                  <tr><td style="padding:6px 0;color:#888">User ID</td><td style="font-size:11px">${user.id}</td></tr>
                  <tr><td style="padding:6px 0;color:#888">Joined</td><td>${new Date(user.created_at).toLocaleString()}</td></tr>
                </table>
              </div>`,
          });
        }
      } catch (emailErr) {
        // Email failure must not break signup.
        console.error('[signup] email error (non-fatal):', emailErr.message);
      }
    });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, display_name, username, avatar_url, bio, neighborhood, city, role, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({ message: 'If that email is registered, you will receive a reset link shortly.' });
    }

    // Generate a reset token (in production this would send an email)
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    // Store token in DB (requires password_reset_tokens table or users.reset_token column)
    // For now we use a simple approach: store in users table if column exists
    try {
      await pool.query(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
        [token, expires, email]
      );
    } catch(colErr) {
      // Column may not exist yet — log but don't fail the request
      console.log('[forgot-password] reset_token column not available, skipping token store');
    }

    console.log(`[forgot-password] Reset requested for ${email}`);

    // Attempt to send email (display_name from user lookup if available)
    let emailSent = false;
    try {
      let displayName = '';
      try {
        const u = await pool.query('SELECT display_name FROM users WHERE email=$1', [email]);
        displayName = u.rows[0]?.display_name || '';
      } catch(_) {}
      emailSent = await sendPasswordResetEmail(email, token, displayName);
    } catch (emailErr) {
      console.error('[forgot-password] Email send failed:', emailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
      message: emailSent
        ? 'A password reset link has been sent to your email. Please check your inbox (and spam folder).'
        : 'If that email is registered, a reset link will be sent. If you don\'t receive it within a few minutes, please contact support.',
      email_sent: emailSent,
      ...(isDev && !emailSent && { debug_token: token, debug_reset_url: `${process.env.APP_URL || 'https://scenelink-v2.netlify.app'}/profile.html?reset_token=${token}` })
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    let user;
    try {
      const result = await pool.query(
        'SELECT id, email FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
        [token]
      );
      user = result.rows[0];
    } catch(colErr) {
      return res.status(400).json({ error: 'Password reset is not available at this time.' });
    }

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const password_hash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [password_hash, user.id]
    );

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at, oauth_provider FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { display_name, bio, neighborhood, avatar_url } = req.body;
    const result = await pool.query(
      `UPDATE users SET display_name = COALESCE($1, display_name), bio = COALESCE($2, bio),
       neighborhood = COALESCE($3, neighborhood), avatar_url = COALESCE($4, avatar_url),
       updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at`,
      [display_name, bio, neighborhood, avatar_url, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/account  — Phase 6C, Apple App Store Guideline 5.1.1(v)
// In-app self-service account deletion. Hard-delete with audit row.
//
// Body: { password?: string, reason?: string }
//   - Password-auth users  : password is REQUIRED and re-verified.
//   - OAuth-only users     : password is NOT required (no password_hash on row);
//                            valid Bearer JWT is sufficient.
//
// Behavior:
//   - 200 { ok:true, deleted:true }            on success
//   - 200 { ok:true, deleted:true, already_deleted:true } if the user row is
//                                              already gone (idempotent)
//   - 400 { error:'Password is required' }     password-auth user, no password
//   - 401 { error:'Password incorrect' }       password-auth user, wrong pw
//   - 401 { error:'Authentication required' }  via requireAuth (no/bad JWT)
//   - 500 on internal error (rolls back)
//
// FK cascades from migration history handle owned content:
//   CASCADE: activities, checkins, conversation_participants, favorites,
//            friendships (a/b/requester), lists, messages.sender_id,
//            notifications.user_id, plan_invites, plan_members, plans,
//            post_comments, post_likes, posts, push_tokens, reviews,
//            content_reports.reporter_id
//   SET NULL: contact_messages.user_id, conversations.created_by,
//            content_reports.reviewed_by, newsletter_subscribers.user_id,
//            notifications.actor_id, venue_imports.admin_user_id
//
// Audit: writes user_deletions(user_id, email_hash sha256, deletion_reason,
// ip_address, deleted_at). Table created in migration 003_compliance_push.sql.
// ────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
router.delete('/account', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { password, reason } = req.body || {};

    // Fetch the row to determine OAuth vs password-auth
    const u = await client.query(
      'SELECT id, email, password_hash, oauth_provider FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!u.rows.length) {
      // Idempotent: token is valid but the user row was already deleted in a
      // race or earlier call. Return clean success so retries are safe.
      return res.json({ ok: true, deleted: true, already_deleted: true });
    }
    const row = u.rows[0];
    const isOAuthOnly = !row.password_hash;

    if (!isOAuthOnly) {
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Password is required to confirm deletion' });
      }
      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) {
        return res.status(401).json({ error: 'Password incorrect' });
      }
    }

    const userId = row.id;
    const emailHash = crypto.createHash('sha256')
      .update(String(row.email).toLowerCase()).digest('hex');
    const ip = (req.headers['x-forwarded-for'] || req.ip || '')
      .toString().split(',')[0].trim();

    await client.query('BEGIN');
    // Audit FIRST (no FK to users) so we always have a record even if delete
    // fails partway through. Truncate reason to 500 chars to bound payload.
    await client.query(
      `INSERT INTO user_deletions (user_id, email_hash, deletion_reason, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId, emailHash, (reason || '').toString().slice(0, 500), ip]
    );
    // Defensive cleanup of session-y tables that may not cascade in older
    // schemas. Most user-owned content cascades via FK; this is belt-and-suspenders.
    await client.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]).catch(() => {});

    // Hard-delete the user row. All CASCADE FKs propagate (favorites, lists,
    // plans, messages, posts, etc.). All SET NULL FKs anonymize content the
    // user touched but doesn't exclusively own (contact_messages,
    // conversations.created_by, notifications.actor_id, etc.).
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');

    return res.json({
      ok: true,
      deleted: true,
      auth_method: isOAuthOnly ? 'oauth' : 'password',
      message: 'Account deleted. We are sorry to see you go.',
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[auth] account deletion error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;