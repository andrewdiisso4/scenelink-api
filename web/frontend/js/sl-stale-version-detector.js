/**
 * SceneLink — Phase 7A stale-version detector + auto-recover
 *
 * Purpose:
 *   - Runs early on every page.
 *   - Fetches /version.json with `cache: 'no-store'` so the request bypasses
 *     any service-worker runtime cache and goes straight to Netlify.
 *   - Compares server's reported `sw_version` against the SW that's actually
 *     controlling this page.
 *   - If they differ, the page is being served by a stale SW. Show a small
 *     non-blocking "A newer version is available — Refresh" banner.
 *   - Also tells the new (waiting) SW to skipWaiting() so the next reload
 *     activates Phase 7A immediately.
 *
 * Conservatively designed:
 *   - Never auto-reloads (could break a user mid-task).
 *   - Banner is dismissible and remembered for that tab session only.
 *   - All logic guarded with try/catch.
 */
(function(){
  'use strict';

  // The SW version that THIS deploy ships with. Updated each phase.
  var EXPECTED_SW = (window.SCENELINK_VERSION && window.SCENELINK_VERSION.sw_version) ||
                    'sl-v1.20.0-phase9a-social';

  // Don't run on the kill-SW path or in iframes
  try {
    if (location.search.indexOf('sl-kill-sw=1') !== -1) return;
    if (window.top !== window.self) return;
  } catch(_){}

  // Ask any waiting SW to take over now (no-op if none waiting).
  function nudgeWaitingSW(){
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function(regs){
      regs.forEach(function(reg){
        try {
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          // also explicitly call update() to force a /sw.js re-fetch
          if (reg.update) reg.update().catch(function(){});
        } catch(_){}
      });
    }).catch(function(){});
  }

  function showBanner(serverPhase, serverSw){
    if (document.getElementById('sl-stale-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'sl-stale-banner';
    bar.setAttribute('role', 'status');
    bar.style.cssText = [
      'position:fixed','left:0','right:0','bottom:0','z-index:2147483646',
      'background:#0b0c10','color:#fff','padding:12px 16px',
      'font:600 14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
      'display:flex','align-items:center','justify-content:space-between',
      'gap:12px','box-shadow:0 -2px 12px rgba(0,0,0,.25)',
      'border-top:2px solid #ffd166','flex-wrap:wrap'
    ].join(';');
    bar.innerHTML = ''
      + '<span style="flex:1 1 auto">A newer version of SceneLink is available '
      + '<span style="opacity:.65;font-weight:500">(' + (serverPhase || 'newer') + ')</span>. '
      + 'Refresh to load the latest.</span>'
      + '<span style="display:flex;gap:8px;flex:0 0 auto">'
      + '  <button id="sl-stale-refresh" style="background:#ffd166;color:#0b0c10;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">Refresh now</button>'
      + '  <button id="sl-stale-dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer">Later</button>'
      + '</span>';
    document.body.appendChild(bar);

    document.getElementById('sl-stale-refresh').addEventListener('click', function(){
      try {
        var u = new URL(location.href);
        u.searchParams.set('sl-kill-sw', '1');
        location.replace(u.toString());
      } catch(_) {
        location.reload();
      }
    });
    document.getElementById('sl-stale-dismiss').addEventListener('click', function(){
      try { sessionStorage.setItem('sl-stale-dismissed', '1'); } catch(_){}
      bar.remove();
    });
  }

  function check(){
    try {
      if (sessionStorage.getItem('sl-stale-dismissed') === '1') return;
    } catch(_){}

    fetch('/version.json', { cache: 'no-store', credentials: 'omit' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(v){
        if (!v) return;
        var serverSw = v.sw_version || '';
        var serverPhase = v.phase || '';

        // If server is on a newer phase than what this page was loaded with,
        // the page itself is stale.
        if (serverSw && EXPECTED_SW && serverSw !== EXPECTED_SW) {
          // Also wait briefly for any waiting SW to claim, then re-check
          nudgeWaitingSW();
          showBanner(serverPhase, serverSw);
        }
      })
      .catch(function(){});
  }

  // Run after DOM is interactive so we can append the banner safely.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check, { once: true });
  } else {
    // Slight delay so it runs after sl-version-marker.js sets EXPECTED_SW.
    setTimeout(check, 100);
  }

  // Also nudge any waiting SW immediately on first paint.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    nudgeWaitingSW();
  }
})();
