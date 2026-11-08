/* Shared async map lifecycle. Directory search and venue details never depend on a map. */
(function () {
  'use strict';
  window.SLDiscoveryMap = {
    mount: function (onReady) {
      var canvas = document.getElementById('slMapCanvas');
      if (!canvas) return;
      var map, loading = false;
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
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            updateWhenIdle: true,
            keepBuffer: 0,
            referrerPolicy: 'strict-origin-when-cross-origin',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }).addTo(map);
          onReady(map);
          notice.hidden = true; setEnabled(true);
          setTimeout(function () { if (map) map.invalidateSize(); }, 0);
        }).catch(function () {
          if (map) { try { map.remove(); } catch (_) {} map = null; }
          message.textContent = 'Map unavailable. You can still search venues, open details and browse the list.';
          retry.hidden = false; notice.hidden = false; setEnabled(false);
        }).finally(function () { loading = false; });
      }
      retry.onclick = load;
      load();
    }
  };
})();
