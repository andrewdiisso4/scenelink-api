/**
 * SceneLink — Notifications Bell (site-wide)
 * Auto-injects into every page's header when user is logged in.
 * Polls /api/notifications/unread-count every 30s; dropdown shows recent.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    tryInject();
    // Re-try after auth settles (sl-auth.js toggles UI)
    window.addEventListener('sl-auth-ready', tryInject);
    setTimeout(tryInject, 1500);
    setTimeout(tryInject, 4000);
  });

  function injectStyles() {
    if (document.getElementById('sl-bell-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-bell-style';
    st.textContent = `
      .sl-bell-wrap { position: relative; display: inline-block; margin-right: 10px; vertical-align: middle; }
      .sl-bell-btn {
        background: transparent; border: 1px solid rgba(255,255,255,0.14);
        color: #fff; width: 40px; height: 40px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        cursor: pointer; position: relative; transition: all 0.2s;
      }
      .sl-bell-btn:hover { border-color: #D4AF37; color: #D4AF37; }
      .sl-bell-btn .sl-bell-badge {
        position: absolute; top: -3px; right: -3px;
        background: #e11d48; color: #fff; min-width: 18px; height: 18px;
        border-radius: 9px; font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        padding: 0 4px; border: 2px solid #0a0a0a;
      }
      .sl-bell-dropdown {
        position: absolute; top: 48px; right: 0;
        width: 360px; max-width: 92vw; max-height: 70vh; overflow-y: auto;
        background: #141414; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px; padding: 8px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        display: none; z-index: 99990;
      }
      .sl-bell-dropdown.open { display: block; }
      .sl-bell-dropdown .sl-bell-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 12px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .sl-bell-dropdown .sl-bell-header strong { color: #fff; font-size: 14px; }
      .sl-bell-dropdown .sl-bell-header button {
        background: transparent; border: 0; color: #D4AF37;
        font-size: 12px; cursor: pointer;
      }
      .sl-notif-item {
        display: flex; gap: 10px; padding: 10px 12px; border-radius: 8px;
        text-decoration: none; color: #fff; cursor: pointer;
      }
      .sl-notif-item:hover { background: rgba(255,255,255,0.04); }
      .sl-notif-item.unread { background: rgba(212,175,55,0.06); }
      .sl-notif-item img {
        width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      }
      .sl-notif-item .sl-notif-body {
        flex: 1; min-width: 0; font-size: 13px; line-height: 1.4;
      }
      .sl-notif-item .sl-notif-body small {
        display: block; color: rgba(255,255,255,0.4); font-size: 11px; margin-top: 2px;
      }
      .sl-notif-empty {
        text-align: center; padding: 32px 12px; color: rgba(255,255,255,0.4);
        font-size: 13px;
      }
    `;
    document.head.appendChild(st);
  }

  function tryInject() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) {
      // Remove bell if user logged out
      var existing = document.querySelector('.sl-bell-wrap');
      if (existing) existing.remove();
      return;
    }
    if (document.querySelector('.sl-bell-wrap')) {
      refreshCount();
      return;
    }

    // Find header anchor — try nav-right or the auth-trigger button's parent
    var trigger = document.querySelector('.nav-right .sl-auth-trigger') ||
                  document.querySelector('.nav-right button') ||
                  document.querySelector('header .sl-auth-trigger');
    if (!trigger || !trigger.parentElement) return;

    var wrap = document.createElement('div');
    wrap.className = 'sl-bell-wrap';
    wrap.innerHTML =
      '<button class="sl-bell-btn" id="slBellBtn" aria-label="Notifications">' +
      '  <i class="fas fa-bell"></i>' +
      '  <span class="sl-bell-badge" style="display:none;" id="slBellBadge">0</span>' +
      '</button>' +
      '<div class="sl-bell-dropdown" id="slBellDropdown">' +
      '  <div class="sl-bell-header">' +
      '    <strong>Notifications</strong>' +
      '    <button id="slBellMarkAll">Mark all read</button>' +
      '  </div>' +
      '  <div id="slBellList"><div class="sl-notif-empty"><i class="fas fa-spinner fa-spin"></i></div></div>' +
      '</div>';

    trigger.parentElement.insertBefore(wrap, trigger);

    document.getElementById('slBellBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });
    document.getElementById('slBellMarkAll').addEventListener('click', function (e) {
      e.stopPropagation();
      window.SLApi.markAllRead().then(function () {
        refreshCount();
        loadList();
      }).catch(function () {});
    });
    // Close on outside click
    document.addEventListener('click', function (e) {
      var dd = document.getElementById('slBellDropdown');
      var wrap = document.querySelector('.sl-bell-wrap');
      if (dd && dd.classList.contains('open') && wrap && !wrap.contains(e.target)) {
        dd.classList.remove('open');
      }
    });

    refreshCount();
    // Poll every 30s
    setInterval(refreshCount, 30000);
  }

  function toggleDropdown() {
    var dd = document.getElementById('slBellDropdown');
    if (!dd) return;
    if (dd.classList.contains('open')) {
      dd.classList.remove('open');
    } else {
      dd.classList.add('open');
      loadList();
    }
  }

  function refreshCount() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return;
    window.SLApi.unreadCount().then(function (r) {
      var n = (r && (r.unread !== undefined ? r.unread : r.count)) || 0;
      var badge = document.getElementById('slBellBadge');
      if (!badge) return;
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }).catch(function () {});
  }

  function loadList() {
    var list = document.getElementById('slBellList');
    if (!list) return;
    list.innerHTML = '<div class="sl-notif-empty"><i class="fas fa-spinner fa-spin"></i></div>';
    window.SLApi.notifications().then(function (r) {
      var items = (r && r.notifications) || [];
      if (items.length === 0) {
        list.innerHTML = '<div class="sl-notif-empty">No notifications yet</div>';
        return;
      }
      list.innerHTML = items.slice(0, 20).map(renderNotif).join('');
      list.querySelectorAll('[data-notif-id]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          var id = this.dataset.notifId;
          var href = this.dataset.href;
          window.SLApi.markNotificationRead(id).catch(function () {});
          if (href) window.location.href = href;
        });
      });
    }).catch(function () {
      list.innerHTML = '<div class="sl-notif-empty" style="color:#e57373;">Could not load</div>';
    });
  }

  function renderNotif(n) {
    var actor = n.actor_display_name || n.actor_username || 'Someone';
    var avatar = n.actor_avatar_url ||
      (window.SL_AVATAR ? SL_AVATAR(actor) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(actor) +
      '&size=40&background=D4AF37&color=0a0a0a');
    var unreadCls = n.read_at ? '' : 'unread';
    var text = '';
    var href = '#';
    switch (n.type) {
      case 'friend_request':
        text = '<b>' + esc(actor) + '</b> sent you a friend request';
        href = '/profile.html';
        break;
      case 'friend_accept':
        text = '<b>' + esc(actor) + '</b> accepted your friend request';
        href = '/profile.html';
        break;
      case 'new_message':
        text = '<b>' + esc(actor) + '</b> sent you a message';
        href = '/messages.html';
        break;
      case 'post_like':
        text = '<b>' + esc(actor) + '</b> liked your post';
        href = '/social-feed.html';
        break;
      case 'post_comment':
        text = '<b>' + esc(actor) + '</b> commented on your post';
        href = '/social-feed.html';
        break;
      case 'plan_invite':
        text = '<b>' + esc(actor) + '</b> invited you to a plan';
        href = '/plan-with-friends.html';
        break;
      case 'plan_accept':
        text = '<b>' + esc(actor) + '</b> joined your plan';
        href = '/plan-with-friends.html';
        break;
      default:
        text = '<b>' + esc(actor) + '</b> — ' + esc(n.type);
    }
    return (
      '<a class="sl-notif-item ' + unreadCls + '" data-notif-id="' + esc(n.id) + '" data-href="' + esc(href) + '" href="' + esc(href) + '">' +
      '  <img src="' + esc(avatar) + '" alt="">' +
      '  <div class="sl-notif-body">' +
      text +
      '<small>' + esc(relTime(n.created_at)) + '</small>' +
      '  </div>' +
      '</a>'
    );
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function relTime(iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso).getTime();
    var s = Math.floor(ms / 1000);
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
    return new Date(iso).toLocaleDateString();
  }
})();