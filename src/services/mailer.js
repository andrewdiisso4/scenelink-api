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

const signupResend = require('./resend-signup').create();
let transport = null;
let transportReady = false;
let transportError = null;

// ── In-process mailer concurrency cap (Phase 5G) ──────────────────────────
// Microsoft 365 enforces a ~3-concurrent-connections cap per authenticated
// SMTP user (`432 4.3.2 Concurrent connections limit exceeded`). To stay
// safely under that limit we serialise outbound sends through a tiny
// async semaphore with a configurable concurrency cap (default: 2).
//
// All callers go through `sendMail()` which acquires before transport
// activity and releases in a `finally`. The cap NEVER blocks the HTTP
// request thread because routes already invoke the mailer from
// `setImmediate` / `await` continuations in the background.
//
// Override via env: MAILER_MAX_CONCURRENCY (integer, default "2").
const MAILER_MAX_CONCURRENCY = (() => {
  const n = parseInt(process.env.MAILER_MAX_CONCURRENCY || '2', 10);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 2;
})();

let _inflight = 0;
const _waiters = []; // FIFO queue of resolve()s

function _acquireSlot() {
  if (_inflight < MAILER_MAX_CONCURRENCY) {
    _inflight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _waiters.push(resolve));
}

function _releaseSlot() {
  if (_waiters.length > 0) {
    const next = _waiters.shift();
    // _inflight stays the same — we hand the slot directly to the next waiter
    next();
  } else {
    _inflight = Math.max(0, _inflight - 1);
  }
}

// Sleep helper for retry backoff.
function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Detect M365 "432 4.3.2 Concurrent connections limit exceeded" and similar
// transient SMTP errors that benefit from a short backoff + retry.
function _isTransientSmtp(err) {
  if (!err) return false;
  const msg = String(err.message || err.response || '').toLowerCase();
  if (err.responseCode === 432) return true;
  if (/4\.3\.2.*concurrent connections/i.test(err.response || '')) return true;
  if (msg.includes('concurrent connections limit')) return true;
  if (msg.includes('too many concurrent')) return true;
  // 421 4.7.x (server busy / try again) is also transient
  if (err.responseCode === 421) return true;
  return false;
}

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
    console.log(`[mailer] ready — provider=${process.env.EMAIL_PROVIDER || 'smtp'} host=${opts.host} port=${opts.port} secure=${opts.secure} user=${opts.auth.user} maxConcurrency=${MAILER_MAX_CONCURRENCY}`);
  } catch (e) {
    transportError = e.message;
    console.error('[mailer] init failed:', e.message);
  }
}
initTransport();

// ── Public API ──────────────────────────────────────────────────────────────
function isReady() { return transportReady && !!transport; }

function isReadyFor(purpose) {
  if (signupResend.selects(purpose)) return signupResend.ready(purpose);
  return isReady();
}

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
 *   @param {boolean} [opts.retry]          false disables transport retries
 *   @param {boolean} [opts.privateLog]     omit recipients, subjects and provider errors from send logs
 */
async function sendMail(opts) {
  if (signupResend.selects(opts.purpose)) {
    if (!signupResend.ready(opts.purpose)) return { ok: false, skipped: true, reason: 'mailer-not-ready' };
    await _acquireSlot();
    try { return await signupResend.send(opts); }
    finally { _releaseSlot(); }
  }
  if (!isReady()) {
    return { ok: false, skipped: true, reason: 'mailer-not-ready' };
  }
  const fromEmail = opts.from || FROM_EMAIL;
  const fromName  = opts.fromName || FROM_NAME;

  // Acquire concurrency slot (Phase 5G — caps M365 outbound parallelism).
  await _acquireSlot();

  // Up to 2 retries on transient 432 4.3.2 / 421 errors with exponential backoff.
  const maxAttempts = opts.retry === false ? 1 : 3;
  let lastErr = null;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const info = await transport.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
          text: opts.text || stripHtml(opts.html || ''),
          replyTo: opts.replyTo || undefined,
        });
        if (Array.isArray(info.accepted) && info.accepted.length === 0) {
          if (opts.privateLog) console.error('[mailer] transactional-email-not-accepted');
          return { ok: false, error: 'SMTP did not accept recipient', attempts: attempt };
        }
        // Don't log full message id stack; just confirm.
        if (opts.privateLog) console.log('[mailer] transactional-email-accepted');
        else console.log(`[mailer] sent → ${Array.isArray(opts.to) ? opts.to.join(',') : opts.to} subject="${opts.subject}"${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
        return { ok: true, messageId: info.messageId, attempts: attempt };
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts && _isTransientSmtp(e)) {
          // Backoff: 250ms, 750ms, 2.25s ...  (250 * 3^(attempt-1))
          const backoffMs = 250 * Math.pow(3, attempt - 1);
          if (opts.privateLog) console.warn('[mailer] transactional-email-retry');
          else console.warn(`[mailer] transient SMTP error (attempt ${attempt}/${maxAttempts}) — retry in ${backoffMs}ms: ${e.message}`);
          await _sleep(backoffMs);
          continue;
        }
        // Non-transient or out of attempts.
        if (opts.privateLog) console.error('[mailer] transactional-email-outcome-unknown');
        else console.error(`[mailer] send failed → ${opts.to}: ${e.message}`);
        return { ok: false, error: e.message, attempts: attempt };
      }
    }
    // Should never reach here, but be defensive.
    return { ok: false, error: lastErr ? lastErr.message : 'unknown', attempts: maxAttempts };
  } finally {
    _releaseSlot();
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
function welcomeEmail(user = {}) {
  const verified = user.email_verified === true;
  // Until the address is verified, never use any signup-supplied name.
  const name = verified ? String(user.display_name || '').trim().slice(0, 80) : '';
  const origin = new URL(APP_BASE_URL);
  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && origin.protocol === 'http:' && ['127.0.0.1','[::1]','localhost'].includes(origin.hostname)))) throw new Error('Welcome email origin is misconfigured');
  const url = path => new URL(path, origin).href;
  const exploreUrl = url('/explore.html');
  const profileUrl = url('/profile.html');
  const contactUrl = url('/contact.html');
  const privacyUrl = url('/privacy.html');
  const termsUrl = url('/terms.html');
  const logoUrl = url('/images/brand/welcome-scenelink-logo.png');

  const title = 'Welcome to SceneLink';
  const preheader = verified
    ? 'Explore Boston by neighborhood and make your profile yours.'
    : 'Explore Boston now. Verify your email when you’re ready to connect.';
  const intro = 'A new dinner spot, a favorite neighborhood, a place to go after the show. Start with the Boston directory and see what catches your eye.';
  const profileHeading = verified ? 'Make it yours' : 'One step before you connect';
  const profileCopy = verified
    ? 'Set up your profile with a name and bio, then choose how people can find and message you.'
    : 'You can browse now. To post, connect with friends or send messages, sign in and verify your email first. From the banner in your account, select “Resend verification email,” then use the separate verification message to confirm.';
  const profileAction = verified ? 'Set up your profile' : 'Open your profile';
  const notice = 'This is a welcome email, not a verification link.';
  const footer = 'You received this because a SceneLink account was created with your email address. If that wasn’t you, you can ignore this message.';
  const html = escapeHtml;
  const muted = '#c9c6be';
  const light = '#fff8e8';
  const gold = '#f2d17b';
  const linkStyle = `color:${gold};text-decoration:underline;font-weight:700`;

  return {
    subject: title,
    replyTo: SUPPORT_EMAIL,
    text: `${title}\n\n${name ? 'Hi ' + name + ',\n\n' : ''}${intro}\n\nExplore Boston: ${exploreUrl}\n\n${profileHeading}\n${profileCopy}\n${profileAction}: ${profileUrl}\n${verified ? '' : notice + '\n'}\nQuestions? Reply to ${SUPPORT_EMAIL} or visit ${contactUrl}.\n\nPrivacy: ${privacyUrl}\nTerms: ${termsUrl}\n\nSceneLink · Boston, MA\n${footer}`,
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${title}</title></head>
<body style="margin:0;padding:0;width:100%;background:#171713;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${html(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171713" style="width:100%;border-collapse:collapse">
    <tr><td align="center" style="padding:20px 12px">
      <!--[if mso]><table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#211f1a" style="width:100%;max-width:580px;border-collapse:separate;border-spacing:0;border:1px solid #494438;border-top:4px solid ${gold};border-radius:14px;color:${light}">
        <tr><td style="padding:16px 22px 12px;border-bottom:1px solid #494438">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            <tr>
              <td valign="middle" style="padding-right:10px">
                <p style="margin:0;color:${gold};font-size:25px;font-weight:700;line-height:29px">SceneLink</p>
                <p style="margin:2px 0 0;color:${muted};font-size:12px;line-height:18px">Eat. Drink. Discover.</p>
              </td>
              <td width="52" valign="middle" align="right"><img src="${html(logoUrl)}" width="52" height="52" alt="" role="presentation" aria-hidden="true" style="display:block;width:52px;height:52px;border:0;border-radius:6px"></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 22px 24px;overflow-wrap:anywhere;word-break:break-word">
          <p style="margin:0 0 8px;color:${gold};font-size:12px;font-weight:bold;letter-spacing:1.6px;line-height:18px;text-transform:uppercase">The Boston going-out guide</p>
          <h1 style="margin:0 0 10px;color:${light};font-size:30px;font-weight:700;line-height:1.17">${title}</h1>
          ${name ? `<p style="margin:0 0 8px;color:${light};font-size:16px;line-height:26px">Hi ${html(name)},</p>` : ''}<p style="margin:0;color:${muted};font-size:16px;line-height:26px">${intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:18px 0 0">
            <tr><td align="center" bgcolor="${gold}" style="border-radius:8px;mso-padding-alt:14px 23px"><a href="${html(exploreUrl)}" style="display:inline-block;padding:14px 23px;border:1px solid ${gold};border-radius:8px;color:#20180c;font-size:16px;font-weight:bold;line-height:20px;text-align:center;text-decoration:none;mso-padding-alt:0">Explore Boston</a></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 22px 22px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2b271e" style="width:100%;border-collapse:separate;border:1px solid #655638;border-radius:10px">
            <tr><td style="padding:16px 16px 14px">
              <h2 style="margin:0 0 6px;color:${light};font-size:18px;line-height:25px">${profileHeading}</h2>
              <p style="margin:0;color:${muted};font-size:15px;line-height:24px">${html(profileCopy)}</p>
              <a href="${html(profileUrl)}" style="display:inline-block;padding:12px 0;min-height:20px;font-size:15px;line-height:20px;${linkStyle}">${profileAction}</a>${verified ? '' : `<p style="margin:0;color:${muted};font-size:13px;line-height:20px">${notice}</p>`}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:17px 22px 20px;border-top:1px solid #494438;color:${muted};font-size:13px;line-height:21px">
          <p style="margin:0 0 8px"><strong style="color:${light}">Questions?</strong> Reply to this email or visit <a href="${html(contactUrl)}" style="${linkStyle}">SceneLink support</a>.</p>
          <p style="margin:0 0 8px">SceneLink · Boston, MA<br><a href="${html(privacyUrl)}" style="${linkStyle}">Privacy</a> &nbsp; <a href="${html(termsUrl)}" style="${linkStyle}">Terms</a></p>
          <p style="margin:0">${footer}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`,
  };
}

function newsletterConfirmEmail(token) {
  const origin = new URL(APP_BASE_URL);
  if (origin.username || origin.password || (origin.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && origin.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(origin.hostname))))
    throw new Error('Newsletter origin is misconfigured');
  const url = mode => {
    const link = new URL('/newsletter-email.html',origin);
    link.hash = new URLSearchParams({mode,token}).toString();
    return link.href;
  };
  const confirmUrl = url('confirm');
  const unsubscribeUrl = url('unsubscribe');
  return {
    subject:'Confirm your SceneLink newsletter signup',
    text:`Confirm within 24 hours: ${confirmUrl}

If you did not request this, ignore this email or cancel here: ${unsubscribeUrl}`,
    html:newsletterConfirmationLayout({ origin, confirmUrl, unsubscribeUrl }),
  };
}

// Inline styles and a font-color fallback keep Outlook from using its default
// blue on the dark background. The email does not depend on a stylesheet.
function newsletterConfirmationLayout({ origin, confirmUrl, unsubscribeUrl }) {
  const publicLink = (path, label) =>
    `<a href="${escapeHtml(new URL(path,origin).href)}" style="color:#F7D786;text-decoration:underline"><font color="#F7D786">${label}</font></a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Confirm your SceneLink newsletter signup</title></head>
<body style="margin:0;padding:0;background-color:#0B0B10">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0B0B10" style="background-color:#0B0B10;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#15151C" style="max-width:560px;background-color:#15151C;border:1px solid #34333E;border-radius:16px;text-align:left">
<tr><td style="padding:28px 24px 24px">
  <p style="margin:0 0 4px;color:#F7D786;font-size:23px;font-weight:700;line-height:1.2">SceneLink</p>
  <p style="margin:0 0 24px;color:#C9C6CF;font-size:12px;letter-spacing:1.1px;line-height:1.5">BOSTON NIGHTLIFE &amp; DINING</p>
  <h1 style="margin:0 0 12px;color:#FAF9FC;font-size:26px;font-weight:700;line-height:1.25">Confirm your newsletter signup</h1>
  <p style="margin:0 0 22px;color:#ECEAF0;font-size:16px;line-height:1.6">Get Boston venue picks and SceneLink updates. Your confirmation link expires in 24 hours.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
    <td bgcolor="#F7D786" style="background-color:#F7D786;border-radius:8px">
      <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;border:1px solid #F7D786;padding:13px 18px;border-radius:8px;color:#21170B;text-decoration:none;font-size:16px;font-weight:700;line-height:1.2"><font color="#21170B">Confirm newsletter signup</font></a>
    </td>
  </tr></table>
  <p style="margin:0;color:#D7D4DE;font-size:15px;line-height:1.6">Didn’t request this? You can ignore this email or <a href="${escapeHtml(unsubscribeUrl)}" style="color:#F7D786;text-decoration:underline;font-weight:700"><font color="#F7D786">cancel this signup or unsubscribe</font></a>.</p>
</td></tr>
<tr><td style="padding:16px 24px 20px;border-top:1px solid #34333E;color:#C9C6CF;font-size:13px;line-height:1.8">
  ${publicLink('/privacy.html','Privacy')} &nbsp;·&nbsp; ${publicLink('/terms.html','Terms')} &nbsp;·&nbsp; ${publicLink('/contact.html','Contact')}
  <br>SceneLink · Boston, MA
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
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
  isReady, isReadyFor, verify, sendMail,
  welcomeNotBefore: signupResend.welcomeNotBefore,
  // templates
  welcomeEmail, newsletterConfirmEmail,
  contactNotifyAdminEmail, contactAckEmail, passwordResetEmail,
  // constants
  APP_BASE_URL, FROM_EMAIL, FROM_NAME, SUPPORT_EMAIL, CONTACT_FORWARD_TO,
  // Phase 5G — observability for the in-process queue (no PII, no creds).
  queueStats: () => ({
    inflight: _inflight,
    waiting: _waiters.length,
    maxConcurrency: MAILER_MAX_CONCURRENCY,
  }),
};
