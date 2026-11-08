/* =========================================================================
   sl-nav-gate.js — v2
   Universal nav gating + logged-in user dropdown across ALL pages.
   - Hides Messages link(s) when logged out
   - Hides Login/Signup trigger(s) when logged in
   - Injects user dropdown when logged in
   - Works with ALL header variants in this codebase:
     * .header-enhanced / .nav-enhanced / .nav-right      (home, tonight, events, social, messages, profile, my-lists, plan-with-friends)
     * .sl-explore-header / .sl-header-nav               (explore, nightlife)
     * Any header with .sl-auth-trigger button
   - Re-applies on auth events and mutations.
   ========================================================================= */
(function () {
  if (window.__SLNavGate) return;
  window.__SLNavGate = true;

  var AUTH_LINKS = [
    'a[href="messages.html"]',
    'a[href="/messages"]',
    'a[href="messages"]',
    'a[data-page="messages"]'
  ];

  var LOGIN_TRIGGERS = [
    '.sl-auth-trigger',
    '.sl-login-btn',
    '#sl-login-btn',
    '[data-sl-login-btn]',
    '.login-signup-btn',
    'button.login-btn',
    '.btn-header-primary.sl-auth-trigger',
    '.sl-header-auth-btn'
  ];

  var DROPDOWN_ANCHORS = [
    '.nav-right',
    '.sl-header-cta',
    '.header-cta',
    '.user-menu'
  ];

  function isLoggedIn() {
    try {
      if (window.SLAuth && typeof SLAuth.isLoggedIn === 'function') return !!SLAuth.isLoggedIn();
      if (window.SLAuth && typeof SLAuth.getUser === 'function') return !!SLAuth.getUser();
      return !!(localStorage.getItem('sl_auth_token') || localStorage.getItem('sl_jwt_token'));
    } catch (_) { return false; }
  }

  function getUser() {
    try {
      if (window.SLAuth && typeof SLAuth.getUser === 'function') return SLAuth.getUser();
      var raw = localStorage.getItem('sl_user');
      if (raw) { var p = JSON.parse(raw); return p.user || p; }
    } catch (_) {}
    return null;
  }

  function displayNameFor(u) {
    return u.display_name || u.displayName || u.username || (u.email ? u.email.split('@')[0] : 'Account');
  }
  function avatarFor(u) {
    return u.avatar_url || u.avatarUrl ||
      window.SL_AVATAR.local(displayNameFor(u));
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function applyGate() {
    var loggedIn = isLoggedIn();
    var user = getUser();

    AUTH_LINKS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (a) {
        if (a.closest('#sl-user-dropdown')) return;
        var wrap = a.closest('li') || a;
        wrap.style.display = loggedIn ? '' : 'none';
      });
    });

    var loginSelector = LOGIN_TRIGGERS.join(',');
    document.querySelectorAll(loginSelector).forEach(function (btn) {
      if (btn.closest('#sl-user-dropdown')) return;
      var inHeader = btn.closest('header, .header-enhanced, .sl-explore-header, .nav-right, .sl-header-auth-btn-wrap');
      if (!inHeader) return;
      btn.style.display = loggedIn ? 'none' : '';
    });

    var existing = document.getElementById('sl-user-dropdown');
    if (loggedIn && user) {
      if (!existing) {
        injectDropdown(user);
      } else {
        var nm = existing.querySelector('.sl-ud-name');
        var nextName = displayNameFor(user);
        if (nm && nm.textContent !== nextName) nm.textContent = nextName;
        var av = existing.querySelector('.sl-ud-avatar');
        var nextAvatar = avatarFor(user);
        if (av && av.getAttribute('src') !== nextAvatar) av.setAttribute('src', nextAvatar);
        var adminLink = existing.querySelector('[data-sl-admin-link]');
        if (user.role === 'admin' && !adminLink) {
          existing.remove();
          injectDropdown(user);
        }
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function injectDropdown(user) {
    var anchor = null;
    for (var i = 0; i < DROPDOWN_ANCHORS.length; i++) {
      var cand = document.querySelector(DROPDOWN_ANCHORS[i]);
      if (cand) { anchor = cand; break; }
    }
    if (!anchor) {
      var trig = document.querySelector(LOGIN_TRIGGERS.join(','));
      if (trig) anchor = trig.parentNode;
    }
    if (!anchor) anchor = document.querySelector('header, .sl-explore-header') || document.body;

    var avatar = avatarFor(user);
    var name = displayNameFor(user);
    var isAdmin = user.role === 'admin';

    var wrap = document.createElement('div');
    wrap.id = 'sl-user-dropdown';
    wrap.innerHTML = [
      '<style>',
      '#sl-user-dropdown{position:relative;display:inline-block;margin-left:10px;z-index:99999;}',
      '#sl-user-dropdown .sl-ud-trigger{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;background:rgba(255,255,255,0.06);',
      'border:1px solid rgba(212,175,55,0.4);border-radius:999px;cursor:pointer;color:#fff;font:600 14px/1 "Inter",system-ui,-apple-system,sans-serif;transition:background .15s, border-color .15s;}',
      '#sl-user-dropdown .sl-ud-trigger:hover{background:rgba(212,175,55,0.15);border-color:#d4af37;}',
      '#sl-user-dropdown .sl-ud-avatar{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#222;flex:0 0 auto;}',
      '#sl-user-dropdown .sl-ud-name{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#sl-user-dropdown .sl-ud-caret{margin-left:4px;opacity:.65;font-size:10px;}',
      '#sl-user-dropdown .sl-ud-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:220px;background:#121212;',
      'border:1px solid rgba(212,175,55,0.4);border-radius:12px;padding:8px 0;box-shadow:0 12px 36px rgba(0,0,0,0.7);display:none;overflow:hidden;}',
      '#sl-user-dropdown.open .sl-ud-menu{display:block;animation:slud-in .12s ease-out;}',
      '@keyframes slud-in{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}',
      '#sl-user-dropdown .sl-ud-menu a{display:flex;align-items:center;gap:10px;padding:10px 18px;color:#eaeaea;text-decoration:none;font:500 14px/1.2 "Inter",system-ui,sans-serif;transition:background .12s, color .12s;}',
      '#sl-user-dropdown .sl-ud-menu a:hover{background:rgba(212,175,55,0.12);color:#d4af37;}',
      '#sl-user-dropdown .sl-ud-menu a i{width:16px;text-align:center;color:#d4af37;opacity:.85;}',
      '#sl-user-dropdown .sl-ud-menu hr{border:0;border-top:1px solid rgba(255,255,255,0.08);margin:6px 0;}',
      '#sl-user-dropdown .sl-ud-role{display:inline-block;padding:2px 7px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:#d4af37;color:#111;border-radius:4px;margin-left:6px;font-weight:800;}',
      '#sl-user-dropdown .sl-ud-badge{display:inline-block;min-width:18px;height:18px;padding:0 6px;font-size:11px;font-weight:700;line-height:18px;text-align:center;background:#e11d48;color:#fff;border-radius:9px;margin-left:auto;}',
      '#sl-user-dropdown .sl-ud-badge[hidden]{display:none;}',
      '#sl-user-dropdown .sl-ud-trigger-badge{position:absolute;top:2px;right:-2px;min-width:16px;height:16px;padding:0 4px;font-size:10px;font-weight:700;line-height:16px;text-align:center;background:#e11d48;color:#fff;border-radius:8px;border:2px solid #0a0a0a;}',
      '#sl-user-dropdown .sl-ud-trigger-badge[hidden]{display:none;}',
      '@media (max-width:720px){#sl-user-dropdown .sl-ud-name{max-width:80px;}#sl-user-dropdown .sl-ud-menu{min-width:200px;right:-10px;}}',
      '</style>',
      '<button class="sl-ud-trigger" type="button" aria-haspopup="true" aria-expanded="false" style="position:relative;">',
        '<img class="sl-ud-avatar" src="' + escapeHtml(avatar) + '" alt="">',
        '<span class="sl-ud-name">' + escapeHtml(name) + '</span>',
        (isAdmin ? '<span class="sl-ud-role">Admin</span>' : ''),
        '<span class="sl-ud-caret">&#9662;</span>',
        '<span class="sl-ud-trigger-badge" data-sl-unread-trigger hidden>0</span>',
      '</button>',
      '<div class="sl-ud-menu" role="menu">',
        '<a href="profile.html" role="menuitem"><i class="fas fa-user"></i> Profile</a>',
        '<a href="messages.html" role="menuitem" data-sl-messages-link><i class="fas fa-envelope"></i> Messages <span class="sl-ud-badge" data-sl-unread-badge hidden>0</span></a>',
        '<a href="my-lists.html" role="menuitem"><i class="fas fa-list-check"></i> My Lists</a>',
        '<a href="plan-with-friends.html" role="menuitem"><i class="fas fa-users"></i> My Plans</a>',
        '<a href="profile.html#saved" role="menuitem"><i class="fas fa-bookmark"></i> Saved Venues</a>',
        '<a href="profile.html#friends" role="menuitem"><i class="fas fa-user-friends"></i> Friends</a>',
        '<a href="social-feed.html" role="menuitem"><i class="fas fa-stream"></i> Social Feed</a>',
        (isAdmin ? '<hr><a href="admin.html" data-sl-admin-link role="menuitem"><i class="fas fa-shield-alt"></i> Admin Portal</a>' : ''),
        '<hr>',
        '<a href="#" data-sl-logout role="menuitem"><i class="fas fa-sign-out-alt"></i> Log out</a>',
      '</div>'
    ].join('');

    if (anchor.classList && (anchor.classList.contains('nav-right') || anchor.classList.contains('sl-header-cta'))) {
      anchor.appendChild(wrap);
    } else {
      if (anchor.parentNode && anchor.parentNode.insertBefore) {
        anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
      } else {
        anchor.appendChild(wrap);
      }
    }

    var trigger = wrap.querySelector('.sl-ud-trigger');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = wrap.classList.toggle('open');
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        wrap.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    wrap.querySelector('[data-sl-logout]').addEventListener('click', function (e) {
      e.preventDefault();
      var done = function () {
        try { window.dispatchEvent(new CustomEvent('sl:logout')); } catch (_) {}
        location.href = 'index.html';
      };
      if (window.SLAuth && typeof SLAuth.logout === 'function') {
        Promise.resolve(SLAuth.logout()).finally(done);
      } else {
        localStorage.removeItem('sl_auth_token');
        localStorage.removeItem('sl_jwt_token');
        localStorage.removeItem('sl_user');
        done();
      }
    });
  }

  // Mutation callbacks must yield and must never rewrite their own unchanged text.
  var gateTimer = null;
  function scheduleGate() {
    if (gateTimer !== null) return;
    gateTimer = setTimeout(function () { gateTimer = null; applyGate(); }, 0);
  }

  function init() {
    applyGate();
    window.addEventListener('sl:auth-changed', scheduleGate);
    window.addEventListener('sl-auth-changed', scheduleGate);
    window.addEventListener('sl-auth-ready', scheduleGate);
    window.addEventListener('sl:login-success', applyGate);
    window.addEventListener('sl:logout', applyGate);
    window.addEventListener('storage', function (e) {
      if (e.key && /sl_(auth_token|jwt_token|user)/.test(e.key)) applyGate();
    });
    try {
      var mo = new MutationObserver(function (records) {
        // Ignore our own dropdown text/markup updates. Auth events handle user changes.
        var externalChange = records.some(function (record) {
          var target = record.target;
          if (target && target.nodeType !== 1) target = target.parentElement;
          return !target || !target.closest || !target.closest('#sl-user-dropdown');
        });
        if (externalChange) scheduleGate();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 30000);
    } catch (_) {}
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      applyGate();
      if (tries > 20) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();