/**
 * SceneLink production version marker (Phase 7A real)
 *
 * Purpose:
 *   - Expose window.SCENELINK_VERSION at runtime so owner / debugging can
 *     instantly see which deploy is active.
 *   - Inject <meta name="sl-deploy"> into <head> so view-source confirms it.
 *   - Provide a one-shot SW self-destruct: append ?sl-kill-sw=1 to any URL
 *     to force-unregister all service workers and clear all sl-* caches,
 *     then reload. Safe escape hatch if SW ever serves a bad shell.
 *   - Provide window.SLDebug.* helpers for owner instructions.
 *
 * This file is loaded synchronously (small) at the very top of <head>
 * via a tiny inline script that sets the window var, and the rest is
 * loaded deferred for the meta tag injection and helpers.
 */
(function(){
  'use strict';
  var V = {
    phase: 'integrated-design-lists',
    sw_version: 'sl-connected-20261110-3',
    deploy: 'connected-20261110-3',
    built: '2026-11-10T10:35:37.020242+00:00',
    backend_change: 'private-list-invitations-016'
  };
  // Always-available global
  try { window.SCENELINK_VERSION = V; } catch(_){}

  function injectMeta(){
    try {
      if (document.querySelector('meta[name="sl-deploy"]')) return;
      var m = document.createElement('meta');
      m.name = 'sl-deploy';
      m.content = V.phase + '|' + V.sw_version + '|' + V.deploy;
      (document.head || document.documentElement).appendChild(m);
    } catch(_){}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectMeta, { once: true });
  } else {
    injectMeta();
  }

  // SW kill-switch via ?sl-kill-sw=1
  function maybeKillSW(){
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('sl-kill-sw') !== '1') return;
      console.warn('[SL] sl-kill-sw=1 detected — purging service workers + caches');
      var doneCount = 0, expected = 2;
      function maybeReload(){
        doneCount++;
        if (doneCount >= expected) {
          u.searchParams.delete('sl-kill-sw');
          // Belt-and-suspenders: hard reload
          setTimeout(function(){ location.replace(u.toString()); }, 200);
        }
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then(function(regs){
            return Promise.all(regs.map(function(r){ return r.unregister(); }));
          })
          .catch(function(){})
          .finally(maybeReload);
      } else {
        maybeReload();
      }
      if (window.caches && caches.keys) {
        caches.keys()
          .then(function(keys){
            return Promise.all(keys.filter(function(k){ return k.indexOf('sl-')===0; })
                                  .map(function(k){ return caches.delete(k); }));
          })
          .catch(function(){})
          .finally(maybeReload);
      } else {
        maybeReload();
      }
    } catch(_){}
  }
  maybeKillSW();

  // Owner debug helpers
  window.SLDebug = {
    version: function(){ return V; },
    swStatus: function(){
      if (!('serviceWorker' in navigator)) return Promise.resolve({supported:false});
      return navigator.serviceWorker.getRegistrations().then(function(regs){
        return {
          controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL || null,
          registrations: regs.map(function(r){
            return {
              scope: r.scope,
              active: r.active && r.active.scriptURL || null,
              state: r.active && r.active.state || null
            };
          })
        };
      });
    },
    cacheNames: function(){
      if (!window.caches) return Promise.resolve([]);
      return caches.keys();
    },
    killSW: function(){
      var u = new URL(location.href);
      u.searchParams.set('sl-kill-sw', '1');
      location.href = u.toString();
    },
    apiPing: function(){
      var t0 = performance.now();
      return fetch('/api/health', { cache: 'no-store' })
        .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, ms: Math.round(performance.now()-t0), body:j }; }); })
        .catch(function(e){ return { ok:false, ms: Math.round(performance.now()-t0), error: String(e) }; });
    }
  };
})();
