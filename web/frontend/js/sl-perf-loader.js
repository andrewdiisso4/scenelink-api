/**
 * sl-perf-loader.js — Phase 7A real perf fix
 *
 * Goals:
 *  1) Lazy-load Leaflet only when an element with [data-needs-leaflet]
 *     enters the viewport.
 *  2) Lazy-load FontAwesome by swapping its <link rel="preload" as="style">
 *     to rel="stylesheet" only after the page is interactive.
 *  3) Lazy-load AI Concierge JS+CSS only on first user interaction
 *     with [data-sl-concierge].
 *  4) Defer non-critical JS by 1500ms after `load`.
 *
 * This file is intentionally small and dependency-free.
 */
(function () {
  'use strict';

  // -- 1. Lazy Leaflet ----------------------------------------------------
  var leafletPromise = null;
  function loadLeaflet() {
    var css = document.querySelector('link[data-sl-leaflet]');
    var cssReady = css && (css.dataset.slLeafletState === 'ready' || css.sheet);
    if (window.L && window.L.map && cssReady) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      var script, settled = false, jsReady = !!(window.L && window.L.map);
      var timer = setTimeout(function () { finish(new Error('Map loading timed out.')); }, 12000);
      function finish(error) {
        if (settled || (!error && !(cssReady && jsReady))) return;
        settled = true; clearTimeout(timer);
        if (script) script.onload = script.onerror = null;
        if (css) css.onload = css.onerror = null;
        if (error) {
          if (script) script.remove();
          if (css) css.remove();
          leafletPromise = null; reject(error);
        } else resolve(window.L);
      }
      if (!css) {
        css = document.createElement('link');
        css.rel = 'stylesheet'; css.dataset.slLeaflet = 'true';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      }
      css.onload = function () { cssReady = true; css.dataset.slLeafletState = 'ready'; finish(); };
      css.onerror = function () { finish(new Error('Map stylesheet unavailable.')); };
      if (!css.isConnected) document.head.appendChild(css);
      if (!jsReady) {
        script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true; script.dataset.slLeaflet = 'true';
        script.onload = function () {
          jsReady = !!(window.L && window.L.map);
          finish(jsReady ? null : new Error('Map library unavailable.'));
        };
        script.onerror = function () { finish(new Error('Map loading failed.')); };
        document.head.appendChild(script);
      }
      finish();
    });
    return leafletPromise;
  }
  window.SLLeaflet = { load: loadLeaflet };
  function maybeBootLeafletObserver() {
    var targets = document.querySelectorAll('[data-needs-leaflet]');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) {
      // Full-screen discovery pages do not scroll. Load immediately without an observer.
      loadLeaflet().catch(function () {});
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          loadLeaflet().catch(function () {});
          io.disconnect();
          break;
        }
      }
    }, { rootMargin: '200px' });
    targets.forEach(function (t) { io.observe(t); });
  }

  // -- 2. Lazy FontAwesome ------------------------------------------------
  function activateLazyFA() {
    var lazyFA = document.querySelector('link[data-lazy-fa]');
    if (lazyFA) {
      lazyFA.rel = 'stylesheet';
      lazyFA.removeAttribute('data-lazy-fa');
    }
  }

  // -- 3. Lazy AI Concierge ----------------------------------------------
  var aiConciergeLoaded = false;
  function loadConcierge() {
    if (aiConciergeLoaded) return;
    aiConciergeLoaded = true;
    ['css/ai-concierge.css?v=connected-20261112-auth1', 'css/ai-concierge-v5.css?v=connected-20261112-auth1'].forEach(function (h) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = h;
      document.head.appendChild(l);
    });
    var s = document.createElement('script');
    s.src = 'js/ai-concierge-v5.js?v=connected-20261112-auth1';
    s.defer = true;
    document.head.appendChild(s);
  }
  function bindConciergeTriggers() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-sl-concierge]');
      if (t) loadConcierge();
    }, { passive: true });
  }

  // -- Boot ----------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      maybeBootLeafletObserver();
      bindConciergeTriggers();
    });
  } else {
    maybeBootLeafletObserver();
    bindConciergeTriggers();
  }

  // After main load, kick FA and yield to user
  if (document.readyState === 'complete') {
    setTimeout(activateLazyFA, 250);
  } else {
    window.addEventListener('load', function () {
      setTimeout(activateLazyFA, 250);
    });
  }
})();
