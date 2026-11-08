/*! =========================================================================
 *  sl-unread-poller.js  —  Phase 3
 *  Polls unread message count + notifications when logged in, updates nav badges.
 *  Safe against network errors; backs off on auth errors.
 * ========================================================================= */
(function () {
  if (window.__SLUnreadPoller) return;
  window.__SLUnreadPoller = true;

  var POLL_MS = 60000;          // 60s steady
  var FAST_POLL_MS = 15000;     // 15s right after user activity
  var MAX_BACKOFF_MS = 5 * 60 * 1000;
  var backoff = 0;
  var timer = null;

  function isLoggedIn() {
    try {
      if (window.SLAuth && typeof SLAuth.isLoggedIn === 'function') return !!SLAuth.isLoggedIn();
      return !!(localStorage.getItem('sl_auth_token') || localStorage.getItem('sl_jwt_token'));
    } catch (_) { return false; }
  }

  function setBadges(count) {
    var n = Math.max(0, parseInt(count, 10) || 0);
    var display = n > 99 ? '99+' : String(n);

    var menu = document.querySelector('[data-sl-unread-badge]');
    if (menu) {
      if (n > 0) { menu.textContent = display; menu.removeAttribute('hidden'); }
      else       { menu.textContent = '0';     menu.setAttribute('hidden', ''); }
    }
    var trig = document.querySelector('[data-sl-unread-trigger]');
    if (trig) {
      if (n > 0) { trig.textContent = display; trig.removeAttribute('hidden'); }
      else       { trig.textContent = '0';     trig.setAttribute('hidden', ''); }
    }

    try { window.SL_UNREAD_COUNT = n; } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('sl:unread-updated', { detail: { count: n } })); } catch (_) {}
  }

  async function fetchUnread() {
    if (!isLoggedIn() || !window.SLApi) return null;
    try {
      // Prefer the messages-specific count for the Messages badge.
      if (typeof SLApi.conversationsUnreadCount === 'function') {
        var r = await SLApi.conversationsUnreadCount();
        return (r && typeof r.unread === 'number') ? r.unread : 0;
      }
      // Fallback: direct fetch
      var base = (window.SL_API_BASE || '/api').replace(/\/$/, '');
      var token = localStorage.getItem('sl_auth_token') || localStorage.getItem('sl_jwt_token');
      if (!token) return null;
      var resp = await fetch(base + '/conversations/unread-count', {
        headers: { Authorization: 'Bearer ' + token },
        credentials: 'omit'
      });
      if (resp.status === 401) return 'unauth';
      if (!resp.ok) throw new Error('http ' + resp.status);
      var data = await resp.json();
      return (data && typeof data.unread === 'number') ? data.unread : 0;
    } catch (e) {
      return null;
    }
  }

  async function tick() {
    if (!isLoggedIn()) { setBadges(0); scheduleNext(); return; }
    var n = await fetchUnread();
    if (n === 'unauth') {
      // Token invalid — back off a lot
      backoff = Math.min((backoff || POLL_MS) * 2, MAX_BACKOFF_MS);
    } else if (n === null) {
      backoff = Math.min((backoff || POLL_MS) * 2, MAX_BACKOFF_MS);
    } else {
      backoff = 0;
      setBadges(n);
    }
    scheduleNext();
  }

  function scheduleNext(ms) {
    clearTimeout(timer);
    var wait = ms || backoff || POLL_MS;
    timer = setTimeout(tick, wait);
  }

  function start() {
    scheduleNext(1500); // first tick shortly after boot
    window.addEventListener('sl:login-success', function () { scheduleNext(800); });
    window.addEventListener('sl:auth-changed', function () { scheduleNext(800); });
    window.addEventListener('sl:logout', function () { setBadges(0); clearTimeout(timer); });
    window.addEventListener('focus', function () { scheduleNext(500); });
    // Speed up right after user sends/opens a message
    window.addEventListener('sl:message-sent', function () { scheduleNext(500); });
    window.addEventListener('sl:conversation-opened', function () { scheduleNext(500); });
    // Pause when tab hidden
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearTimeout(timer); }
      else { scheduleNext(500); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
