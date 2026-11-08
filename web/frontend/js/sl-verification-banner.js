/* Candidate-only helper; deploy only with the paired verification backend release.
   Only an explicit false email_verified flag plus an existing auth token qualifies. */
(function () {
  'use strict';
  var banner, button, status, busy = false, cooldownUntil = 0, timer;
  function user() { return (window.SLAuth && typeof window.SLAuth.user === 'function' ? window.SLAuth.user() : null) || window.SL_USER; }
  function token() {
    if (window.SLAuth && typeof window.SLAuth.getToken === 'function') return window.SLAuth.getToken();
    if (window.SLApi && typeof window.SLApi.getToken === 'function') return window.SLApi.getToken();
    return '';
  }
  function eligible() { var current = user(); return !!(current && current.email_verified === false && token()); }
  function message(text) { if (status) status.textContent = text; }
  function countdown() {
    if (!banner) return;
    var seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    button.disabled = busy || seconds > 0;
    button.textContent = seconds > 0 ? 'Resend available in ' + seconds + 's' : 'Resend verification email';
    if (seconds > 0) timer = setTimeout(countdown, 1000);
  }
  function cooldown(response) {
    var raw = response.headers && response.headers.get('Retry-After');
    var seconds = raw && /^\d+$/.test(raw) ? Number(raw) : 60;
    seconds = Math.max(1, Math.min(seconds, 3600));
    cooldownUntil = Date.now() + seconds * 1000;
  }
  async function resend() {
    if (busy || Date.now() < cooldownUntil || !eligible()) return;
    busy = true; button.disabled = true; message('Requesting a verification email…');
    try {
      var response = await fetch('/api/auth/verification/request', {
        method: 'POST', mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: '{}'
      });
      if (response.status === 202) { message('If verification is needed, an email has been requested. Check your inbox and spam folder; delivery is not confirmed.'); cooldown(response); }
      else if (response.status === 429) { message('Too many requests. Please wait before requesting another email.'); cooldown(response); }
      else if (response.status === 401) message('Your session has expired. Sign in again to request verification.');
      else if (response.status === 503) message('Verification email is temporarily unavailable. Please try again later.');
      else if (response.ok) message('The request completed. Refresh your account to check verification status.');
      else message('The verification email could not be requested. Please try again later.');
    } catch (_) { message('Unable to reach the email service. Your request was not confirmed. Please try again.'); }
    finally { busy = false; countdown(); }
  }
  function refresh() {
    if (!document.body) return;
    if (!eligible()) {
      if (banner) banner.remove(); banner = button = status = null;
      if (timer) clearTimeout(timer);
      return;
    }
    if (banner) return;
    banner = document.createElement('aside');
    banner.id = 'slVerificationBanner'; banner.setAttribute('aria-label', 'Email verification');
    banner.style.cssText = 'padding:16px;background:#18150d;color:#f5f5f5;border-bottom:1px solid #d4af37;font:14px/1.5 system-ui';
    var title = document.createElement('p'); title.textContent = 'Please verify your email address. Until verified, you can browse but cannot post, connect, or send messages.';
    status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    button = document.createElement('button'); button.type = 'button'; button.textContent = 'Resend verification email';
    button.style.cssText = 'padding:10px 16px;background:#d4af37;color:#111;border:1px solid #d4af37;border-radius:6px;font:inherit;cursor:pointer';
    button.addEventListener('click', resend);
    banner.appendChild(title); banner.appendChild(status); banner.appendChild(button); document.body.prepend(banner);
    countdown();
  }
  window.addEventListener('sl-auth-ready', refresh);
  window.addEventListener('sl-auth-changed', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
})();
