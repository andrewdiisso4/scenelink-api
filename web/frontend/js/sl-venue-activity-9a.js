/* ============================================================================
 * SceneLink Phase 9A — Venue Detail Social Activity Widget
 * ----------------------------------------------------------------------------
 * Injects a "Who's been here" / friends-activity section into the canonical
 * venue detail panel (#sl-venue-detail, rendered by SLVenueDetail.open).
 *
 * Rules (Phase 9A hard rules):
 *  - Only real data from GET /venues/:id/activity. NO fake check-ins/counts.
 *  - Only renders for logged-in users. Logged-out: renders nothing (no spinner).
 *  - Never throws, never blocks the detail panel, clears its own loader on
 *    success / empty / error / timeout.
 *  - Idempotent: never double-injects for the same render.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__slVenueActivity9a) return;
  window.__slVenueActivity9a = true;

  var PANEL_ID = 'sl-venue-detail';
  var SECTION_ID = 'sl-vd-social-activity';
  var lastVenueId = null;

  function social() {
    return (window.SL && window.SL.social) ? window.SL.social : null;
  }

  function isLoggedIn() {
    try {
      if (window.SLAuth && typeof window.SLAuth.isLoggedIn === 'function') return !!window.SLAuth.isLoggedIn();
      var t = (window.SLAuth && window.SLAuth.getToken && window.SLAuth.getToken())
        || (window.SLApi && window.SLApi.getToken && window.SLApi.getToken())
        || localStorage.getItem('sl_jwt_token')
        || localStorage.getItem('sl_auth_token');
      return !!t;
    } catch (_) { return false; }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeAgo(iso) {
    try {
      var d = new Date(iso).getTime();
      if (!d) return '';
      var s = Math.max(0, Math.floor((Date.now() - d) / 1000));
      if (s < 60) return 'just now';
      var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
      var dd = Math.floor(h / 24); if (dd < 7) return dd + 'd ago';
      return new Date(iso).toLocaleDateString();
    } catch (_) { return ''; }
  }

  function avatarHtml(name, url) {
    var initials = (String(name || '?').trim().charAt(0) || '?').toUpperCase();
    if (url) {
      return '<img class="sl-vda-avatar" src="' + esc(url) + '" alt="' + esc(name) + '" ' +
        'onerror="this.outerHTML=\'<span class=&quot;sl-vda-avatar sl-vda-ph&quot;>' + esc(initials) + '</span>\'">';
    }
    return '<span class="sl-vda-avatar sl-vda-ph">' + esc(initials) + '</span>';
  }

  function injectStyles() {
    if (document.getElementById('sl-vda-styles')) return;
    var st = document.createElement('style');
    st.id = 'sl-vda-styles';
    st.textContent = [
      '#' + SECTION_ID + '{margin-top:24px;padding:18px 20px;border-radius:14px;',
      'background:rgba(255,255,255,0.03);border:1px solid rgba(212,175,55,0.18);}',
      '#' + SECTION_ID + ' .sl-vda-head{display:flex;align-items:center;gap:8px;',
      'font-weight:700;font-size:14px;color:#D4AF37;margin-bottom:14px;letter-spacing:.3px;}',
      '#' + SECTION_ID + ' .sl-vda-head i{font-size:13px;}',
      '#' + SECTION_ID + ' .sl-vda-row{display:flex;align-items:center;gap:12px;padding:9px 0;',
      'border-top:1px solid rgba(255,255,255,0.05);}',
      '#' + SECTION_ID + ' .sl-vda-row:first-of-type{border-top:none;}',
      '.sl-vda-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;flex:0 0 auto;',
      'background:#222;display:inline-flex;align-items:center;justify-content:center;}',
      '.sl-vda-ph{color:#D4AF37;font-weight:700;font-size:15px;border:1px solid rgba(212,175,55,0.3);}',
      '#' + SECTION_ID + ' .sl-vda-info{flex:1;min-width:0;}',
      '#' + SECTION_ID + ' .sl-vda-name{color:#fff;font-weight:600;font-size:14px;cursor:pointer;}',
      '#' + SECTION_ID + ' .sl-vda-name:hover{color:#D4AF37;}',
      '#' + SECTION_ID + ' .sl-vda-sub{color:rgba(255,255,255,0.5);font-size:12px;margin-top:1px;}',
      '#' + SECTION_ID + ' .sl-vda-time{color:rgba(255,255,255,0.4);font-size:12px;flex:0 0 auto;}',
      '#' + SECTION_ID + ' .sl-vda-empty{color:rgba(255,255,255,0.45);font-size:13px;padding:4px 0;}',
      '#' + SECTION_ID + ' .sl-vda-loading{color:rgba(255,255,255,0.4);font-size:13px;padding:4px 0;}',
      '#' + SECTION_ID + ' .sl-vda-summary{color:rgba(255,255,255,0.6);font-size:12px;margin-bottom:10px;}'
    ].join('');
    document.head.appendChild(st);
  }

  function buildSection() {
    var sec = document.createElement('div');
    sec.id = SECTION_ID;
    sec.innerHTML =
      '<div class="sl-vda-head"><i class="fas fa-user-friends"></i> Who\'s been here</div>' +
      '<div class="sl-vda-loading" data-vda-loading>Loading activity…</div>';
    return sec;
  }

  function renderActivity(sec, data) {
    var checkins = (data && (data.checkins || data.activity || data.items)) || [];
    var friends = (data && data.friends) || [];
    var friendCount = (data && (data.friend_checkin_count != null ? data.friend_checkin_count
      : (data.friends_count != null ? data.friends_count : null)));
    var totalCount = (data && (data.checkin_count != null ? data.checkin_count
      : (data.total != null ? data.total : null)));

    // Prefer a combined recent list; fall back to friends list
    var rows = [];
    var src = checkins.length ? checkins : friends;
    src.forEach(function (c) {
      var u = c.user || c;
      var name = u.display_name || u.username || c.display_name || c.username || 'Someone';
      rows.push({
        name: name,
        username: u.username || c.username || '',
        userId: u.id || c.user_id || c.id || '',
        avatar: u.avatar_url || c.avatar_url || '',
        note: c.note || c.body || '',
        isFriend: (c.is_friend != null ? c.is_friend : (u.is_friend != null ? u.is_friend : false)),
        time: c.created_at || c.checked_in_at || c.time || ''
      });
    });

    var html = '<div class="sl-vda-head"><i class="fas fa-user-friends"></i> Who\'s been here</div>';

    var summaryBits = [];
    if (friendCount != null && friendCount > 0) summaryBits.push(friendCount + ' friend' + (friendCount === 1 ? '' : 's'));
    if (totalCount != null && totalCount > 0) summaryBits.push(totalCount + ' check-in' + (totalCount === 1 ? '' : 's'));
    if (summaryBits.length) {
      html += '<div class="sl-vda-summary">' + esc(summaryBits.join(' · ')) + '</div>';
    }

    if (!rows.length) {
      html += '<div class="sl-vda-empty">No check-ins yet. Be the first — tap “Check In” above.</div>';
      sec.innerHTML = html;
      return;
    }

    rows.slice(0, 8).forEach(function (r) {
      var profHref = r.username ? ('profile.html?u=' + encodeURIComponent(r.username))
        : (r.userId ? ('profile.html?u=' + encodeURIComponent(r.userId)) : '');
      var sub = r.note ? esc(r.note) : (r.isFriend ? 'Friend' : 'Checked in');
      html += '<div class="sl-vda-row">' +
        avatarHtml(r.name, r.avatar) +
        '<div class="sl-vda-info">' +
        '<div class="sl-vda-name"' + (profHref ? ' onclick="window.location.href=\'' + esc(profHref) + '\'"' : '') + '>' + esc(r.name) + '</div>' +
        '<div class="sl-vda-sub">' + sub + '</div>' +
        '</div>' +
        (r.time ? '<div class="sl-vda-time">' + esc(timeAgo(r.time)) + '</div>' : '') +
        '</div>';
    });

    sec.innerHTML = html;
  }

  function renderError(sec) {
    // Soft-fail: just remove the loader so nothing dangles
    sec.innerHTML = '<div class="sl-vda-head"><i class="fas fa-user-friends"></i> Who\'s been here</div>' +
      '<div class="sl-vda-empty">Activity unavailable right now.</div>';
  }

  function loadFor(venueId, sec) {
    var s = social();
    if (!s || typeof s.getVenueActivity !== 'function') { renderError(sec); return; }
    var done = false;
    var guard = setTimeout(function () { if (!done) { done = true; renderError(sec); } }, 13000);
    try {
      s.getVenueActivity(venueId).then(function (res) {
        if (done) return; done = true; clearTimeout(guard);
        if (res && res.loggedOut) { sec.remove(); return; }
        if (res && res.ok) { renderActivity(sec, res.data || {}); }
        else { renderError(sec); }
      }).catch(function () {
        if (done) return; done = true; clearTimeout(guard);
        renderError(sec);
      });
    } catch (_) {
      done = true; clearTimeout(guard); renderError(sec);
    }
  }

  function tryInject(panel) {
    if (!isLoggedIn()) return; // logged-out: render nothing
    var body = panel.querySelector('.sl-vd-body');
    if (!body) return;
    // Find the venue id from a rendered button
    var idEl = body.querySelector('.sl-vd-checkin-btn[data-venue-id], [data-venue-id]');
    var venueId = idEl ? (idEl.getAttribute('data-venue-id') || '') : '';
    if (!venueId) return;

    var existing = body.querySelector('#' + SECTION_ID);
    if (existing && existing.getAttribute('data-vid') === venueId) return; // already done for this venue
    if (existing) existing.remove();

    injectStyles();
    var sec = buildSection();
    sec.setAttribute('data-vid', venueId);

    // Insert after the stats block (or after actions) for a natural placement
    var anchor = body.querySelector('.sl-vd-stats') || body.querySelector('.sl-vd-actions');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    } else {
      body.appendChild(sec);
    }
    lastVenueId = venueId;
    loadFor(venueId, sec);
  }

  function watch() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    var obs = new MutationObserver(function () {
      // Debounce a touch — wait for body to settle
      clearTimeout(watch._t);
      watch._t = setTimeout(function () {
        var p = document.getElementById(PANEL_ID);
        if (p && (p.classList.contains('open') || p.style.display !== 'none')) {
          tryInject(p);
        }
      }, 120);
    });
    obs.observe(panel, { childList: true, subtree: true });
  }

  function boot() {
    // Panel is created lazily by SLVenueDetail; poll briefly for it.
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (document.getElementById(PANEL_ID)) {
        clearInterval(iv);
        watch();
      } else if (tries > 80) { // ~40s; panel may simply never open on this page
        clearInterval(iv);
        // Fallback: observe body for the panel being added later
        var bodyObs = new MutationObserver(function () {
          if (document.getElementById(PANEL_ID)) { bodyObs.disconnect(); watch(); }
        });
        bodyObs.observe(document.body, { childList: true, subtree: true });
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
