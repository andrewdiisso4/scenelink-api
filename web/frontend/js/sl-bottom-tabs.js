/**
 * SL Bottom Tabs — mobile-only bottom nav (iOS/Android-style).
 * - Auto-injects on screens ≤ 860 px
 * - 5 tabs: Home, Explore, Concierge, Plans, Profile
 * - Respects safe-area insets
 * - Active-state inferred from pathname
 */
(function () {
  if (window.__SL_BOTTOM_TABS__) return;
  window.__SL_BOTTOM_TABS__ = true;

  var TABS = [
    { href: '/',                      icon: 'home',          label: 'Home',      match: ['/', '/index.html'] },
    { href: '/tonight.html',          icon: 'fire',          label: 'Tonight',   match: ['/tonight.html','/tonight-v2.html'] },
    { href: '/explore.html',          icon: 'compass',       label: 'Explore',   match: ['/explore.html','/nightlife.html','/events.html'] },
    { href: '/plan-with-friends.html',icon: 'calendar-alt',  label: 'Plans',     match: ['/plan-with-friends.html','/my-lists.html'] },
    { href: '/profile.html',          icon: 'user',          label: 'You',       match: ['/profile.html','/social-feed.html','/messages.html'] }
  ];

  function injectStyle() {
    if (document.getElementById('sl-bt-style')) return;
    var s = document.createElement('style');
    s.id = 'sl-bt-style';
    s.textContent = [
      /* Only visible on mobile */
      '@media (max-width: 860px) {',
      '  body { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }',
      '  .sl-bottom-tabs {',
      '    position: fixed; left: 0; right: 0; bottom: 0;',
      '    background: rgba(10,10,10,0.92);',
      '    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);',
      '    border-top: 1px solid rgba(255,255,255,0.08);',
      '    display: flex; justify-content: space-around; align-items: stretch;',
      '    padding-bottom: env(safe-area-inset-bottom, 0px);',
      '    z-index: 9998;',
      '    height: calc(64px + env(safe-area-inset-bottom, 0px));',
      '  }',
      '  .sl-bottom-tabs a {',
      '    flex: 1; display: flex; flex-direction: column; align-items: center;',
      '    justify-content: center; gap: 3px;',
      '    color: rgba(255,255,255,0.55); text-decoration: none;',
      '    font-size: 10px; font-weight: 500;',
      '    transition: color 0.15s;',
      '    -webkit-tap-highlight-color: transparent;',
      '    padding: 6px 2px 4px;',
      '  }',
      '  .sl-bottom-tabs a i { font-size: 20px; margin-bottom: 1px; }',
      '  .sl-bottom-tabs a.active { color: #D4AF37; }',
      '  .sl-bottom-tabs a.active i {',
      '    transform: scale(1.12); filter: drop-shadow(0 0 8px rgba(212,175,55,0.5));',
      '  }',
      '  .sl-bottom-tabs a:active { background: rgba(212,175,55,0.08); }',
      /* Hide desktop footer on mobile when bottom tabs present (cleaner) */
      '  body.sl-has-tabs footer { padding-bottom: 80px; }',
      '}',
      '@media (min-width: 861px) { .sl-bottom-tabs { display: none !important; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function inject() {
    if (document.getElementById('slBottomTabs')) return;

    // Never in Capacitor if using native nav later — but it's still useful, so keep for now
    // Only skip on auth page / embedded flows
    var path = (location.pathname || '/').toLowerCase();
    if (path.endsWith('/auth.html')) return;

    injectStyle();

    var nav = document.createElement('nav');
    nav.className = 'sl-bottom-tabs';
    nav.id = 'slBottomTabs';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');

    var currentPath = path;
    nav.innerHTML = TABS.map(function (t) {
      var active = t.match.some(function (m) {
        if (m === '/' || m === '/index.html') return currentPath === '/' || currentPath === '/index.html';
        return currentPath === m.toLowerCase() || currentPath.endsWith(m.toLowerCase());
      });
      return '<a href="' + t.href + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' +
        '<i class="fas fa-' + t.icon + '"></i>' +
        '<span>' + t.label + '</span>' +
      '</a>';
    }).join('');

    document.body.appendChild(nav);
    document.body.classList.add('sl-has-tabs');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();