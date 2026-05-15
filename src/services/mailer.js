'use strict';

/**
 * SceneLink centralized mailer (Phase 5D-C1)
 *
 * Replaces ad-hoc Gmail/SendGrid setups in auth.js, contact.js, newsletter.js
 * with a single GoDaddy-compatible nodemailer transport.
 *
 * Configuration via env (NEVER hardcode):
 *   EMAIL_PROVIDER       godaddy | godaddy-m365 | smtp | disabled (default: smtp)
 *   SMTP_HOST            smtpout.secureserver.net | smtp.office365.com | etc.
 *   SMTP_PORT            465 | 587
 *   SMTP_SECURE          true (port 465) | false (port 587 STARTTLS)
 *   SMTP_USER            info@scenelink.app
 *   SMTP_PASS            (Render env only, never committed)
 *   FROM_EMAIL           info@scenelink.app
 *   FROM_NAME            SceneLink
 *   SUPPORT_EMAIL        info@scenelink.app
 *   CONTACT_FORWARD_TO   info@scenelink.app
 *   APP_BASE_URL         https://scenelink.app
 *
 * EMAIL_PROVIDER=godaddy preset (Professional Email / Titan via GoDaddy):
 *   SMTP_HOST=smtpout.secureserver.net SMTP_PORT=465 SMTP_SECURE=true
 *
 * EMAIL_PROVIDER=godaddy-m365 preset (Microsoft 365 from GoDaddy):
 *   SMTP_HOST=smtp.office365.com SMTP_PORT=587 SMTP_SECURE=false (STARTTLS)
 *   Requires "SMTP Authentication" enabled in GoDaddy Email & Office dashboard.
 */

let nodemailer;
try { nodemailer = require('nodemailer'); }
catch (e) { console.warn('[mailer] nodemailer not installed:', e.message); }

const APP_BASE_URL = process.env.APP_BASE_URL || 'https://scenelink.app';
const FROM_EMAIL   = process.env.FROM_EMAIL   || process.env.SMTP_USER || 'info@scenelink.app';
const FROM_NAME    = process.env.FROM_NAME    || 'SceneLink';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'info@scenelink.app';
const CONTACT_FORWARD_TO = process.env.CONTACT_FORWARD_TO || SUPPORT_EMAIL;

// ── Transport selection (preset-aware) ──────────────────────────────────────
function buildTransportOptions() {
  const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

  // Apply provider presets (allow individual SMTP_* env vars to override).
  if (provider === 'godaddy') {
    return {
      host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_SECURE != null ? process.env.SMTP_SECURE === 'true' : true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    };
  }
  if (provider === 'godaddy-m365' || provider === 'office365' || provider === 'm365') {
    return {
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // STARTTLS, leave secure=false
      requireTLS: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { ciphers: 'TLSv1.2' },
    };
  }
  if (provider === 'disabled') return null;

  // Generic SMTP (works for any vendor; defaults port 587 STARTTLS).
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  };
}

let transport = null;
let transportReady = false;
let transportError = null;

function initTransport() {
  if (!nodemailer) return;
  const opts = buildTransportOptions();
  if (!opts) {
    console.log('[mailer] disabled — no SMTP env configured (signup will still work; emails skipped).');
    return;
  }
  if (!opts.auth || !opts.auth.user || !opts.auth.pass) {
    console.log('[mailer] disabled — SMTP_USER / SMTP_PASS missing.');
    return;
  }
  try {
    transport = nodemailer.createTransport(opts);
    transportReady = true;
    // NEVER log SMTP_PASS. Log host/port/user only.
    console.log(`[mailer] ready — provider=${process.env.EMAIL_PROVIDER || 'smtp'} host=${opts.host} port=${opts.port} secure=${opts.secure} user=${opts.auth.user}`);
  } catch (e) {
    transportError = e.message;
    console.error('[mailer] init failed:', e.message);
  }
}
initTransport();

// ── Public API ──────────────────────────────────────────────────────────────
function isReady() { return transportReady && !!transport; }

async function verify() {
  if (!transport) return { ok: false, error: 'transport not initialized' };
  try { await transport.verify(); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Send an email. Never throws upstream — returns {ok, error}.
 * @param {object} opts
 *   @param {string|string[]} opts.to
 *   @param {string} opts.subject
 *   @param {string} [opts.html]
 *   @param {string} [opts.text]
 *   @param {string} [opts.replyTo]
 *   @param {string} [opts.from]            override from address (rarely needed)
 *   @param {string} [opts.fromName]        override display name
 */
async function sendMail(opts) {
  if (!isReady()) {
    return { ok: false, skipped: true, reason: 'mailer-not-ready' };
  }
  const fromEmail = opts.from || FROM_EMAIL;
  const fromName  = opts.fromName || FROM_NAME;
  try {
    const info = await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || stripHtml(opts.html || ''),
      replyTo: opts.replyTo || undefined,
    });
    // Don't log full message id stack; just confirm.
    console.log(`[mailer] sent → ${Array.isArray(opts.to) ? opts.to.join(',') : opts.to} subject="${opts.subject}"`);
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error(`[mailer] send failed → ${opts.to}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

function stripHtml(s) {
  return String(s || '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ── Branded layout used by all SceneLink emails ─────────────────────────────
function brandedLayout({ title, bodyHtml, ctaUrl, ctaLabel }) {
  const cta = ctaUrl
    ? `<div style="text-align:center;margin:32px 0">
         <a href="${ctaUrl}" style="background:#D4AF37;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">${ctaLabel || 'Open SceneLink'} →</a>
       </div>` : '';
  return `<div style="font-family:Inter,Helvetica,Arial,sans-serif;background:#000;padding:24px 0">
    <div style="max-width:560px;margin:0 auto;padding:32px 28px;background:#0d0d0d;color:#fff;border-radius:14px;border:1px solid #1a1a1a">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:24px;font-weight:700;color:#D4AF37;letter-spacing:0.5px">SceneLink</span>
        <div style="color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-top:2px">Eat · Drink · Discover</div>
      </div>
      ${title ? `<h2 style="color:#fff;font-size:22px;margin:0 0 12px;font-weight:700">${title}</h2>` : ''}
      <div style="color:#ccc;font-size:15px;line-height:1.7">${bodyHtml}</div>
      ${cta}
      <hr style="border:0;border-top:1px solid #1a1a1a;margin:28px 0 20px"/>
      <div style="color:#666;font-size:11px;text-align:center;line-height:1.7">
        <a href="${APP_BASE_URL}/privacy.html" style="color:#888;text-decoration:none;margin:0 8px">Privacy</a>·
        <a href="${APP_BASE_URL}/terms.html" style="color:#888;text-decoration:none;margin:0 8px">Terms</a>·
        <a href="${APP_BASE_URL}/contact.html" style="color:#888;text-decoration:none;margin:0 8px">Contact</a>
        <div style="margin-top:8px">SceneLink · Boston, MA · <a href="mailto:${SUPPORT_EMAIL}" style="color:#888;text-decoration:none">${SUPPORT_EMAIL}</a></div>
      </div>
    </div>
  </div>`;
}

// ── Templates ───────────────────────────────────────────────────────────────
function welcomeEmail(user) {
  const name = user.display_name || (user.email || '').split('@')[0] || 'friend';
  return {
    subject: 'Welcome to SceneLink — Boston nightlife, your way',
    html: brandedLayout({
      title: `Welcome, ${escapeHtml(name)}.`,
      bodyHtml: `
        <p>You're now part of SceneLink — Boston's smartest guide to dining, drinks, and nightlife.</p>
        <ul style="color:#ccc;line-height:2;padding-left:20px;margin:12px 0">
          <li><strong style="color:#fff">Explore</strong> 1,600+ venues across Boston</li>
          <li><strong style="color:#fff">Save</strong> favorites &amp; build curated lists</li>
          <li><strong style="color:#fff">Plan</strong> nights out with friends</li>
          <li><strong style="color:#fff">Ask</strong> the AI Concierge for tonight's pick</li>
        </ul>
        <p style="color:#888;font-size:13px;margin-top:18px">Questions? Just reply to this email — it goes straight to our team.</p>`,
      ctaUrl: `${APP_BASE_URL}/explore.html`,
      ctaLabel: 'Start exploring',
    }),
  };
}

function newsletterConfirmEmail(email) {
  return {
    subject: "You're on the list — SceneLink",
    html: brandedLayout({
      title: "You're on the list.",
      bodyHtml: `
        <p>Thanks for joining the SceneLink newsletter.</p>
        <p>You'll get a short, curated email when we drop something worth your night out — new venues, picks for the weekend, AI-powered guides, and the occasional invite.</p>
        <p style="color:#888;font-size:13px">No spam, ever. Unsubscribe by replying to any email.</p>`,
      ctaUrl: APP_BASE_URL,
      ctaLabel: 'Visit SceneLink',
    }),
  };
}

function contactNotifyAdminEmail({ name, email, message, subject }) {
  const safeName = escapeHtml(name || 'Anonymous');
  const safeEmail = escapeHtml(email || '');
  const safeSubject = escapeHtml(subject || 'New contact form submission');
  const safeMessage = escapeHtml(message || '').replace(/\n/g, '<br>');
  return {
    subject: `[Contact] ${safeSubject}`,
    html: brandedLayout({
      title: 'New contact form submission',
      bodyHtml: `
        <table style="width:100%;color:#ccc;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#888;width:90px">From</td><td><strong style="color:#fff">${safeName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#888">Email</td><td><a href="mailto:${safeEmail}" style="color:#D4AF37;text-decoration:none">${safeEmail}</a></td></tr>
          <tr><td style="padding:6px 0;color:#888;vertical-align:top">Subject</td><td>${safeSubject}</td></tr>
        </table>
        <hr style="border:0;border-top:1px solid #1a1a1a;margin:18px 0"/>
        <div style="color:#fff;font-size:14px;line-height:1.7;white-space:pre-wrap">${safeMessage}</div>`,
    }),
  };
}

function contactAckEmail({ name }) {
  const safeName = escapeHtml(name || 'friend');
  return {
    subject: "We got your message — SceneLink",
    html: brandedLayout({
      title: `Thanks, ${safeName}.`,
      bodyHtml: `
        <p>Your message landed in our inbox at <a href="mailto:${SUPPORT_EMAIL}" style="color:#D4AF37">${SUPPORT_EMAIL}</a>. A real human on the SceneLink team will get back to you shortly — usually within 1–2 business days.</p>
        <p style="color:#888;font-size:13px">In the meantime, you can keep exploring Boston's best at <a href="${APP_BASE_URL}" style="color:#D4AF37">scenelink.app</a>.</p>`,
    }),
  };
}

function passwordResetEmail({ name, resetUrl }) {
  const safeName = escapeHtml(name || 'friend');
  return {
    subject: 'Reset your SceneLink password',
    html: brandedLayout({
      title: 'Reset your password',
      bodyHtml: `
        <p>Hi ${safeName}, you (or someone) requested a password reset for your SceneLink account.</p>
        <p>Click the button below to set a new password. The link expires in 1 hour.</p>
        <p style="color:#666;font-size:12px;margin-top:18px">If you didn't request this, you can safely ignore this email.</p>`,
      ctaUrl: resetUrl,
      ctaLabel: 'Reset password',
    }),
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = {
  isReady, verify, sendMail,
  // templates
  welcomeEmail, newsletterConfirmEmail,
  contactNotifyAdminEmail, contactAckEmail, passwordResetEmail,
  // constants
  APP_BASE_URL, FROM_EMAIL, FROM_NAME, SUPPORT_EMAIL, CONTACT_FORWARD_TO,
};
