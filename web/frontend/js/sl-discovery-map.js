/* Shared async map lifecycle. Directory search and venue details never depend on a map. */
(function () {
  'use strict';
  window.SLDiscoveryMap = {
    mount: function (onReady) {
      var canvas = document.getElementById('slMapCanvas');
      if (!canvas) return;
      var map, tiles, loading = false;
      var controls = document.querySelectorAll('#slZoomIn,#slZoomOut,#slLocateBtn,#slSearchLoc,#slFitAll');
      var notice = document.createElement('div');
      notice.className = 'sl-map-status';
      notice.innerHTML = '<p role="status"></p><button type="button" data-map-list>Browse venue list</button> <button type="button" data-map-retry hidden>Retry map</button>';
      canvas.parentNode.appendChild(notice);
      var message = notice.querySelector('p'), retry = notice.querySelector('[data-map-retry]');
      function setEnabled(enabled) { controls.forEach(function (button) { button.disabled = !enabled; }); }
      notice.querySelector('[data-map-list]').onclick = function () {
        var button = document.querySelector('.sl-view-btn[data-view="list"]');
        if (button) button.click();
      };
      function load() {
        if (loading || map) return;
        loading = true; notice.hidden = false; retry.hidden = true; setEnabled(false);
        message.textContent = 'Loading map… Venue search and details are available in the list.';
        var library = window.SLLeaflet ? window.SLLeaflet.load() : Promise.reject(new Error('Map loader unavailable.'));
        library.then(function (L) {
          map = L.map(canvas, { center: [42.3555, -71.0655], zoom: 14, zoomControl: false, attributionControl: true });
          // Standard OSM is best-effort. Only request the visible viewport; no offline/prefetch cache.
          // Policy: https://operations.osmfoundation.org/policies/tiles/
          tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            updateWhenIdle: true,
            keepBuffer: 0,
            referrerPolicy: 'strict-origin-when-cross-origin',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }).addTo(map);
          if (tiles && tiles.on) tiles.on('tileerror', function () {
            message.textContent = 'Map tiles unavailable. Venue pins may lack a basemap. Browse the list or retry tiles.';
            retry.hidden = false; notice.hidden = false;
          });
          onReady(map);
          notice.hidden = true; setEnabled(true);
          setTimeout(function () { if (map) map.invalidateSize(); }, 0);
        }).catch(function () {
          if (map) { try { map.remove(); } catch (_) {} map = null; }
          message.textContent = 'Map unavailable. You can still search venues, open details and browse the list.';
          retry.hidden = false; notice.hidden = false; setEnabled(false);
        }).finally(function () { loading = false; });
      }
      retry.onclick = function () {
        if (map && tiles) {
          // Explicit retry only: no provider switching or retry/prefetch loop.
          notice.hidden = true;
          if (tiles.redraw) tiles.redraw();
        } else load();
      };
      load();
    }
  };
})();

/* Explicit viewport search. Pan/zoom never triggers network searches or location access. */
(function () {
  'use strict';
  function validBounds(value) {
    if (!value) return '';
    var parts = String(value).split(',');
    if (parts.length !== 4 || parts.some(function (p) { return !p.trim(); })) return '';
    var n = parts.map(Number);
    if (!n.every(Number.isFinite) || n[0] < -90 || n[2] > 90 || n[1] < -180 || n[3] > 180 || n[0] >= n[2] || n[1] >= n[3]) return '';
    return n.join(',');
  }
  window.SLDiscoveryArea = {
    create: function (search, restore) {
      var bbox = validBounds(new URLSearchParams(location.search).get('bbox')), map, observedSearch = location.search;
      var bar = document.createElement('div');
      bar.className = 'sl-area-search';
      bar.style.cssText = 'pointer-events:auto;padding:8px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#15151a;color:#fff;font-size:12px';
      bar.innerHTML = '<button type="button" class="sl-btn" data-area-search disabled>Search this area</button><button type="button" class="sl-btn" data-area-clear hidden>Clear area</button><span role="status" data-area-status></span>';
      var canvas = document.getElementById('slMapCanvas');
      var toolbar = document.querySelector('.sl-map-toolbar');
      if (toolbar) toolbar.appendChild(bar);
      else if (canvas) canvas.parentNode.insertBefore(bar, canvas);
      var button = bar.querySelector('[data-area-search]'), clear = bar.querySelector('[data-area-clear]'), status = bar.querySelector('[data-area-status]');
      function describe(moved) {
        clear.hidden = !bbox;
        status.textContent = (moved ? 'Map moved. Search this area to update results. ' : bbox ? 'Results limited to the searched area. ' : 'Directory results, not all visible places. ') + 'Pins use supplied coordinates; accuracy is not verified. Load more in the list for remaining matches.';
      }
      button.onclick = function () {
        if (!map || !map.getBounds) return;
        var b = map.getBounds();
        var next = validBounds([Math.max(-90,b.getSouth()),Math.max(-180,b.getWest()),Math.min(90,b.getNorth()),Math.min(180,b.getEast())].join(','));
        if (!next) { status.textContent = 'This map area crosses the world boundary. Move to a smaller area and retry.'; return; }
        bbox = next; describe(false); search();
      };
      clear.onclick = function () { bbox = ''; describe(false); search(); };
      describe(false);
      window.addEventListener('popstate', function () {
        if (location.search === observedSearch) return;
        observedSearch = location.search;
        var params = new URLSearchParams(location.search);
        bbox = validBounds(params.get('bbox'));
        if (bbox && map) { var b = bbox.split(',').map(Number); map.fitBounds([[b[0],b[1]],[b[2],b[3]]]); }
        describe(false);
        if (restore) restore(params);
      });
      return {
        bbox: function () { return bbox; },
        syncURL: function (params) {
          var url = new URL(location.href);
          ['q','search','cat','type','cuisine','vibe','neighborhood','price_level','bbox'].forEach(function (key) { url.searchParams.delete(key); });
          Object.keys(params).forEach(function (key) { if (params[key] && params[key] !== 'all') url.searchParams.set(key, params[key]); });
          if (bbox) url.searchParams.set('bbox', bbox);
          history.replaceState(history.state, '', url);
          observedSearch = location.search;
        },
        mount: function (ready) {
          map = ready; button.disabled = false;
          if (bbox) {
            var b = bbox.split(',').map(Number);
            map.fitBounds([[b[0],b[1]],[b[2],b[3]]]);
          }
          if (map.on) map.on('moveend', function () { describe(true); });
        }
      };
    }
  };
})();
