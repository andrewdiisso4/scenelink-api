/**
 * SceneLink — Enhanced Search (Tier 4D)
 * Attaches an autocomplete dropdown to any search input on the page.
 * Remembers recent searches in localStorage.
 * Hooks: .header-search-input, #searchInput, [data-sl-search], .sl-search-input
 */
(function () {
  'use strict';

  var RECENT_KEY = 'sl_recent_searches';
  var MAX_RECENT = 6;
  var DEBOUNCE_MS = 220;

  function apiBase() {
    return (window.SLConfig && (window.SLConfig.API_URL || window.SLConfig.API_BASE_URL)) ||
           (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) ||
           '/api';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadRecents() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
  }

  function saveRecent(q) {
    q = String(q || '').trim();
    if (!q) return;
    var list = loadRecents().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
    list.unshift(q);
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById('sl-search-enhanced-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-search-enhanced-style';
    st.textContent =
      '.sl-search-wrapper { position: relative; }' +
      '.sl-search-dropdown {' +
        'position: absolute; top: calc(100% + 6px); left: 0; right: 0;' +
        'background: #111; border: 1px solid rgba(212,175,55,0.2); border-radius: 12px;' +
        'box-shadow: 0 20px 60px rgba(0,0,0,0.6); z-index: 9998;' +
        'max-height: 440px; overflow-y: auto; display: none;' +
      '}' +
      '.sl-search-dropdown.open { display: block; }' +
      '.sl-search-section { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }' +
      '.sl-search-section:last-child { border-bottom: none; }' +
      '.sl-search-section-title {' +
        'font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4);' +
        'text-transform: uppercase; letter-spacing: 0.08em; padding: 0 14px 6px;' +
      '}' +
      '.sl-search-item {' +
        'display: flex; align-items: center; gap: 10px; padding: 8px 14px;' +
        'cursor: pointer; transition: background 0.12s; color: #f5f5f5; font-size: 0.88rem;' +
      '}' +
      '.sl-search-item:hover, .sl-search-item.active { background: rgba(212,175,55,0.08); }' +
      '.sl-search-item-img { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; background: #222; flex-shrink: 0; }' +
      '.sl-search-item-body { flex: 1; min-width: 0; }' +
      '.sl-search-item-name { font-weight: 600; color: #f5f5f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
      '.sl-search-item-meta { font-size: 0.74rem; color: rgba(255,255,255,0.5); margin-top: 2px; }' +
      '.sl-search-item-icon { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(212,175,55,0.1); color: #D4AF37; flex-shrink: 0; }' +
      '.sl-search-empty { padding: 18px 14px; text-align: center; color: rgba(255,255,255,0.45); font-size: 0.85rem; }' +
      '.sl-search-loading { padding: 16px 14px; text-align: center; color: rgba(255,255,255,0.5); font-size: 0.85rem; }' +
      '.sl-search-recent-clear { font-size: 0.7rem; color: rgba(255,255,255,0.4); cursor: pointer; float: right; padding-right: 14px; }' +
      '.sl-search-recent-clear:hover { color: #D4AF37; }';
    document.head.appendChild(st);
  }

  function buildDropdown(input) {
    // Wrap input in a positioned container if not already
    var parent = input.parentElement;
    if (!parent.classList.contains('sl-search-wrapper')) {
      var wrap = document.createElement('div');
      wrap.className = 'sl-search-wrapper';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      parent = wrap;
    }
    var dd = parent.querySelector(':scope > .sl-search-dropdown');
    if (dd) return dd;
    dd = document.createElement('div');
    dd.className = 'sl-search-dropdown';
    parent.appendChild(dd);
    return dd;
  }

  function renderRecents(dd) {
    var recents = loadRecents();
    if (!recents.length) {
      dd.innerHTML = '<div class="sl-search-empty">Start typing to search venues, cuisines, or neighborhoods</div>';
      return;
    }
    dd.innerHTML =
      '<div class="sl-search-section">' +
        '<div class="sl-search-section-title">Recent <span class="sl-search-recent-clear" data-action="clear-recents">Clear</span></div>' +
        recents.map(function (q) {
          return '<div class="sl-search-item" data-query="' + escapeHtml(q) + '">' +
            '<div class="sl-search-item-icon"><i class="fas fa-clock-rotate-left"></i></div>' +
            '<div class="sl-search-item-body"><div class="sl-search-item-name">' + escapeHtml(q) + '</div></div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  function renderResults(dd, venues, query) {
    if (!venues.length) {
      dd.innerHTML = '<div class="sl-search-empty">No venues match “' + escapeHtml(query) + '”</div>';
      return;
    }
    dd.innerHTML =
      '<div class="sl-search-section">' +
        '<div class="sl-search-section-title">Venues</div>' +
        venues.slice(0, 8).map(function (v) {
          var img = v.image_url || '/assets/img/placeholder-venue.svg';
          var meta = [v.category || v.type, v.neighborhood, v.price_label].filter(Boolean).join(' · ');
          return '<div class="sl-search-item" data-venue-slug="' + escapeHtml(v.slug || '') + '" data-venue-id="' + escapeHtml(v.id || '') + '">' +
            '<img src="' + escapeHtml(img) + '" class="sl-search-item-img" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<div class="sl-search-item-body">' +
              '<div class="sl-search-item-name">' + escapeHtml(v.name || '') + '</div>' +
              '<div class="sl-search-item-meta">' + escapeHtml(meta) + '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  function attach(input) {
    if (input.__slSearchAttached) return;
    input.__slSearchAttached = true;
    ensureStyles();

    var dd = buildDropdown(input);
    var timer = null;
    var abortCtrl = null;

    function open() { dd.classList.add('open'); }
    function close() { dd.classList.remove('open'); }

    function navigateToVenue(slug, id) {
      if (slug) window.location.href = 'venue-details.html?slug=' + encodeURIComponent(slug);
      else if (id) window.location.href = 'venue-details.html?id=' + encodeURIComponent(id);
    }

    input.addEventListener('focus', function () {
      if (!input.value.trim()) renderRecents(dd);
      open();
    });

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (abortCtrl) { try { abortCtrl.abort(); } catch (_) {} }
      if (!q) {
        renderRecents(dd);
        open();
        return;
      }
      dd.innerHTML = '<div class="sl-search-loading"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
      open();
      timer = setTimeout(function () {
        abortCtrl = new AbortController();
        fetch(apiBase() + '/venues/search?q=' + encodeURIComponent(q) + '&limit=10', { signal: abortCtrl.signal })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var venues = (data && (data.venues || data.results)) || [];
            renderResults(dd, venues, q);
          })
          .catch(function (err) {
            if (err && err.name === 'AbortError') return;
            dd.innerHTML = '<div class="sl-search-empty">Could not search right now</div>';
          });
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = input.value.trim();
        if (q) saveRecent(q);
        // First item dispatch
        var first = dd.querySelector('.sl-search-item');
        if (first) {
          var slug = first.getAttribute('data-venue-slug');
          var id = first.getAttribute('data-venue-id');
          var query = first.getAttribute('data-query');
          if (slug || id) { navigateToVenue(slug, id); return; }
          if (query) { input.value = query; input.dispatchEvent(new Event('input')); return; }
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });

    dd.addEventListener('click', function (e) {
      var item = e.target.closest('.sl-search-item');
      var clearBtn = e.target.closest('[data-action="clear-recents"]');
      if (clearBtn) {
        e.stopPropagation();
        try { localStorage.removeItem(RECENT_KEY); } catch (_) {}
        renderRecents(dd);
        return;
      }
      if (!item) return;
      var slug = item.getAttribute('data-venue-slug');
      var id = item.getAttribute('data-venue-id');
      var query = item.getAttribute('data-query');
      if (slug || id) {
        saveRecent(input.value.trim() || item.querySelector('.sl-search-item-name').textContent);
        navigateToVenue(slug, id);
      } else if (query) {
        input.value = query;
        input.dispatchEvent(new Event('input'));
        input.focus();
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!dd.contains(e.target) && e.target !== input) close();
    });
  }

  function init() {
    var selectors = [
      '.header-search-input',
      '#searchInput',
      '[data-sl-search]',
      '.sl-search-input',
      'input[type="search"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(function (inp) {
      if (inp.tagName !== 'INPUT') return;
      attach(inp);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-scan for late-added search inputs
  setTimeout(init, 1000);
  setTimeout(init, 3000);

  window.SLSearchEnhanced = { init: init, attach: attach };
})();