/* Phase 7D — Premium polish runtime hooks
 * - Top loading bar during navigation
 * - Heart-pop animation when favoriting (hooks into existing favorite buttons)
 * - AI Concierge typing-dots polisher
 * - Image lazy-load fade-in
 *
 * Runs after DCL. Idempotent.
 */
(function () {
  'use strict';
  if (window.__sl_polish_loaded) return;
  window.__sl_polish_loaded = true;

  // ── Top loading bar ───────────────────────────────────────────────
  function ensureLoaderEl() {
    var el = document.getElementById('sl-top-loader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sl-top-loader';
      el.className = 'sl-top-loader';
      document.body && document.body.appendChild(el);
    }
    return el;
  }
  function showLoader() {
    var el = ensureLoaderEl();
    if (el) el.classList.add('active');
  }
  function hideLoader() {
    var el = document.getElementById('sl-top-loader');
    if (el) el.classList.remove('active');
  }
  // Fire on link click that navigates within site
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (a.target === '_blank') return;
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search) return;
    } catch (_) { return; }
    showLoader();
  }, true);
  window.addEventListener('pageshow', hideLoader);
  window.addEventListener('beforeunload', showLoader);

  // ── Heart pop when favorite button is clicked ─────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-fav-btn], .sl-fav-btn, .sl-venue-save-btn, .fav-btn, [data-action="favorite"]');
    if (!btn) return;
    var icon = btn.querySelector('i.fa-heart, .fa-heart, .fas');
    if (icon) {
      icon.classList.remove('sl-heart-pop');
      // restart animation
      void icon.offsetWidth;
      icon.classList.add('sl-heart-pop');
      setTimeout(function () { icon.classList.remove('sl-heart-pop'); }, 500);
    }
  });

  // ── Image fade-in on load ─────────────────────────────────────────
  function markLoaded(img) {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('sl-img-loaded');
    } else {
      img.addEventListener('load', function () { img.classList.add('sl-img-loaded'); }, { once: true });
      img.addEventListener('error', function () { img.classList.add('sl-img-loaded'); }, { once: true });
    }
  }
  function markAll() {
    document.querySelectorAll('img[loading="lazy"]:not(.sl-img-loaded)').forEach(markLoaded);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markAll);
  } else {
    markAll();
  }
  // Watch for newly inserted images (venue cards, etc.)
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function (records) {
      for (var r of records) {
        for (var n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('img[loading="lazy"]')) markLoaded(n);
          if (n.querySelectorAll) n.querySelectorAll('img[loading="lazy"]').forEach(markLoaded);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── AI Concierge typing indicator helper ─────────────────────────
  // Public API: window.SLPolish.showTyping(container) returns the typing element.
  // Concierge can call SLPolish.showTyping(panel) → polished dots, .hideTyping() to remove.
  window.SLPolish = window.SLPolish || {};
  window.SLPolish.showTyping = function (container) {
    if (!container) return null;
    var existing = container.querySelector('.sl-typing-dots');
    if (existing) return existing;
    var d = document.createElement('div');
    d.className = 'sl-typing-dots';
    d.setAttribute('aria-label', 'Thinking…');
    d.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(d);
    return d;
  };
  window.SLPolish.hideTyping = function (container) {
    if (!container) return;
    var d = container.querySelector('.sl-typing-dots');
    if (d) d.remove();
  };
  window.SLPolish.showLoader = showLoader;
  window.SLPolish.hideLoader = hideLoader;
})();
