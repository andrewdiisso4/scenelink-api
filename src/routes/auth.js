const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken, requireAuth } = require('../middleware/auth');

// ── Email transporter (optional — only sends if SMTP env vars are configured) ──
let emailTransporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('[email] SMTP transporter configured via SMTP_HOST');
  } else if (process.env.SENDGRID_API_KEY) {
    // SendGrid via nodemailer-sendgrid (or plain SMTP relay)
    emailTransporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
    console.log('[email] SendGrid transporter configured');
  } else {
    console.log('[email] No SMTP config found — password reset emails will be logged only');
  }
} catch (e) {
  console.warn('[email] nodemailer not available:', e.message);
}

async function sendPasswordResetEmail(toEmail, resetToken) {
  const appUrl = process.env.APP_URL || 'https://scenelink-v2.netlify.app';
  const resetUrl = `${appUrl}/profile.html?reset_token=${resetToken}`;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@scenelink.app';

  const subject = 'Reset your SceneLink password';
  const text = `Hi,\n\nYou requested a password reset for your SceneLink account.\n\nClick the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\n— The SceneLink Team`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#fff;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:22px;font-weight:700;color:#D4AF37">🎵 SceneLink</span>
      </div>
      <h2 style="color:#fff;font-size:20px;margin-bottom:12px">Reset your password</h2>
      <p style="color:#aaa;font-size:14px;line-height:1.6">You requested a password reset. Click the button below to choose a new password. This link expires in 1 hour.</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="background:#D4AF37;color:#000;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">Reset Password</a>
      </div>
      <p style="color:#666;font-size:12px;text-align:center">If you didn't request this, ignore this email. Your password won't change.</p>
    </div>`;

  if (emailTransporter) {
    await emailTransporter.sendMail({ from: fromEmail, to: toEmail, subject, text, html });
    console.log(`[email] Password reset email sent to ${toEmail}`);
    return true;
  } else {
    // No email configured — log the reset link so admins can retrieve it
    console.log(`[forgot-password] RESET LINK (no email configured): ${resetUrl}`);
    return false;
  }
}

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
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

    // ── Send welcome email + admin notification (non-blocking) ──────────────
    setImmediate(async () => {
      try {
        const appUrl = process.env.APP_URL || 'https://scenelink.app';
        const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@scenelink.app';
        const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;

        if (emailTransporter) {
          // 1) Welcome email to new user
          await emailTransporter.sendMail({
            from: fromEmail,
            to: user.email,
            subject: '🎵 Welcome to SceneLink — Your Boston nightlife guide',
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#fff;border-radius:12px">
                <div style="text-align:center;margin-bottom:28px">
                  <span style="font-size:26px;font-weight:700;color:#D4AF37">🎵 SceneLink</span>
                </div>
                <h2 style="color:#fff;font-size:22px;margin-bottom:12px">Welcome, ${user.display_name}! 🎉</h2>
                <p style="color:#ccc;font-size:15px;line-height:1.7">You're now part of SceneLink — Boston's smartest guide to dining, nightlife, and events.</p>
                <ul style="color:#ccc;font-size:14px;line-height:2;padding-left:20px">
                  <li>🔍 <strong>Explore</strong> 100+ venues across Boston neighborhoods</li>
                  <li>❤️ <strong>Save favorites</strong> and build custom lists</li>
                  <li>📅 <strong>Plan nights out</strong> with friends</li>
                  <li>🤖 <strong>Ask the AI Concierge</strong> for personalized picks</li>
                  <li>📍 <strong>Check in</strong> to venues and leave reviews</li>
                </ul>
                <div style="text-align:center;margin:32px 0">
                  <a href="${appUrl}/explore.html" style="background:#D4AF37;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">Start Exploring →</a>
                </div>
                <p style="color:#555;font-size:12px;text-align:center">Questions? Reply to this email or visit <a href="${appUrl}/contact.html" style="color:#D4AF37">scenelink.app/contact</a></p>
              </div>`,
            text: `Welcome to SceneLink, ${user.display_name}!\n\nYou're now part of Boston's smartest nightlife guide.\n\nExplore venues: ${appUrl}/explore.html\n\n— The SceneLink Team`,
          }).catch(e => console.error('[email] welcome email failed:', e.message));

          // 2) Admin notification of new signup
          if (adminEmail) {
            await emailTransporter.sendMail({
              from: fromEmail,
              to: adminEmail,
              subject: `[SceneLink] New signup: ${user.display_name} (${user.email})`,
              html: `
                <div style="font-family:sans-serif;max-width:480px;padding:24px;background:#111;color:#fff;border-radius:8px">
                  <h3 style="color:#D4AF37;margin-top:0">🆕 New User Signup</h3>
                  <table style="width:100%;font-size:14px;color:#ccc;border-collapse:collapse">
                    <tr><td style="padding:6px 0;color:#888">Name</td><td><strong style="color:#fff">${user.display_name}</strong></td></tr>
                    <tr><td style="padding:6px 0;color:#888">Email</td><td><a href="mailto:${user.email}" style="color:#D4AF37">${user.email}</a></td></tr>
                    <tr><td style="padding:6px 0;color:#888">Username</td><td>@${user.username}</td></tr>
                    <tr><td style="padding:6px 0;color:#888">User ID</td><td style="font-size:11px">${user.id}</td></tr>
                    <tr><td style="padding:6px 0;color:#888">Joined</td><td>${new Date(user.created_at).toLocaleString()}</td></tr>
                  </table>
                  <div style="margin-top:20px">
                    <a href="${appUrl}/admin.html" style="background:#D4AF37;color:#000;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px;display:inline-block">View Admin Dashboard</a>
                  </div>
                </div>`,
              text: `New signup: ${user.display_name} (${user.email}) — ID: ${user.id}`,
            }).catch(e => console.error('[email] admin notify failed:', e.message));
          }
        } else {
          // No SMTP — log to Render console so you can see signups
          console.log(`[signup] NEW USER: ${user.display_name} <${user.email}> | ID: ${user.id} | ${new Date(user.created_at).toISOString()}`);
        }
      } catch (emailErr) {
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
router.post('/login', async (req, res) => {
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
router.post('/forgot-password', async (req, res) => {
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

    console.log(`[forgot-password] Reset requested for ${email}, token: ${token}`);

    // Attempt to send email
    let emailSent = false;
    try {
      emailSent = await sendPasswordResetEmail(email, token);
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
router.post('/reset-password', async (req, res) => {
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
      'SELECT id, email, display_name, username, avatar_url, bio, neighborhood, city, role, created_at FROM users WHERE id = $1',
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

module.exports = router;