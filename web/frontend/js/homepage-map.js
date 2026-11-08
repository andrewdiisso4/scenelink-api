// js/homepage-map.js
// Minimal loader: binds Google Maps to #googleMapMain only (no extra UI injected).
(function() {
  const MAP_CONTAINER_ID = "googleMapMain";
  // Phase 2C C1: legacy inline Google Maps JS key removed.
  // Production home map uses Leaflet/OSM via unified-map.js. This loader is a no-op
  // unless window.__SL_GMAPS_KEY is provided through env.js.
  const API_KEY = (window.__SL_GMAPS_KEY || window.GOOGLE_MAPS_API_KEY || "");
  const API_URL = API_KEY
    ? "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(API_KEY) + "&libraries=places"
    : null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = () => reject(new Error('Google Maps failed to load'));
      document.head.appendChild(s);
    });
  }
  async function init() {
    const el = document.getElementById(MAP_CONTAINER_ID);
    if (!el) return;
    if (!API_URL) {
      console.warn('[homepage-map] Google Maps JS key not configured; loader is a no-op. (Production home map uses Leaflet/OSM.)');
      return;
    }
    await loadScript(API_URL);
    const defaultCenter = { lat: 42.3601, lng: -71.0589 }; // Boston as a safe default
    const map = new google.maps.Map(el, {
      center: defaultCenter, zoom: 12,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      styles: [{"featureType":"poi","stylers":[{"visibility":"off"}]}]
    });
    // keep a single marker reflecting current center/interaction
    let marker = new google.maps.Marker({ map, position: defaultCenter });
    map.addListener('click', (e) => {
      if (marker) marker.setMap(null);
      marker = new google.maps.Marker({ map, position: e.latLng });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
