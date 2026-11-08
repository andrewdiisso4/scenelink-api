/**
 * SL PWA Boot — service worker registration + update prompt
 * Registers /sw.js, listens for updates, shows a non-intrusive "Update available" toast.
 */
(function () {
  if (window.__SL_PWA_BOOT__) return;
  window.__SL_PWA_BOOT__ = true;

  if (!('serviceWorker' in navigator)) return;
  // Skip in Capacitor native — it uses its own asset serving
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;

  function showUpdateToast(registration) {
    if (document.getElementById('sl-pwa-update-toast')) return;
    var t = document.createElement('div');
    t.id = 'sl-pwa-update-toast';
    t.style.cssText = [
      'position:fixed;left:50%;transform:translateX(-50%);z-index:999999;',
      'background:#0d0d0d;color:#fff;border:1px solid #D4AF37;border-radius:12px;',
      'padding:12px 18px;box-shadow:0 8px 28px rgba(0,0,0,0.5);',
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'display:flex;align-items:center;gap:12px;max-width:420px;',
      'bottom:calc(80px + env(safe-area-inset-bottom, 0px));'
    ].join('');
    t.innerHTML =
      '<span style="flex:1;">A new version of SceneLink is available.</span>' +
      '<button id="sl-pwa-refresh" style="background:#D4AF37;color:#000;border:none;padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;">Refresh</button>' +
      '<button id="sl-pwa-dismiss" style="background:transparent;color:rgba(255,255,255,0.55);border:none;padding:8px;cursor:pointer;font-size:18px;">×</button>';
    document.body.appendChild(t);
    document.getElementById('sl-pwa-refresh').addEventListener('click', function () {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      location.reload();
    });
    document.getElementById('sl-pwa-dismiss').addEventListener('click', function () {
      try { t.remove(); } catch(_){}
    });
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      // When a new SW is waiting, prompt
      if (reg.waiting) showUpdateToast(reg);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(reg);
          }
        });
      });
    }).catch(function (e) {
      console.warn('[pwa] SW register failed', e.message);
    });

    // Reload when controller changes (after skipWaiting)
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  });

  // ── Install prompt (Add to Home Screen) ─────────────────────────────
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    // Expose programmatic install
    window.SLInstallPrompt = {
      available: true,
      show: function () {
        if (!deferredPrompt) return Promise.resolve('unavailable');
        deferredPrompt.prompt();
        return deferredPrompt.userChoice.then(function (r) {
          deferredPrompt = null;
          window.SLInstallPrompt.available = false;
          return r.outcome;
        });
      }
    };
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (window.SLInstallPrompt) window.SLInstallPrompt.available = false;
    console.log('[pwa] installed');
  });
})();