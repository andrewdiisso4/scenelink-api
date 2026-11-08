// js/maps-core.js
// Core loader + UI for SceneLink maps across pages.
// Injects a gold-accented toolbar (search + geolocate), supports click-to-drop marker, resize handling,
// and plots markers from ".venue-card" / ".event-card" with data-lat/data-lng.
// Will use window.GOOGLE_MAPS_API_KEY if set; otherwise falls back to the embedded key below.

const FALLBACK_API_KEY = ""; // Phase 2C C1: legacy inline Google Maps JS key removed.
// Production maps render via Leaflet/OSM. If this loader is ever re-enabled,
// set window.__SL_GMAPS_KEY via env.js (scoped to scenelink.app referrer in GCP console).

let mapsLoaded = false;
let loadPromise = null;

export function loadGoogleMaps() {
  if (mapsLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  const API_KEY = (window.__SL_GMAPS_KEY || window.GOOGLE_MAPS_API_KEY || FALLBACK_API_KEY);
  if (!API_KEY) {
    const e = new Error('[maps-core] Google Maps JS key not configured. Set window.__SL_GMAPS_KEY via env.js.');
    console.warn(e.message);
    return Promise.reject(e);
  }
  const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places`;
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.onload = () => { mapsLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

function createToolbar(container, options) {
  // Wrap the map to allow absolute-position toolbar
  let wrapper = container.closest(".sl-map-wrap");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "sl-map-wrap";
    container.parentNode.insertBefore(wrapper, container);
    wrapper.appendChild(container);
  }

  const bar = document.createElement("div");
  bar.className = "sl-map-toolbar";
  bar.innerHTML = `
    <div class="sl-map-toolbar-inner">
      <input id="${options.ids.search}" class="sl-map-search" placeholder="${options.searchPlaceholder || "Search venues or neighborhoods..."}">
      <button id="${options.ids.geo}" class="sl-map-geo">Use my location</button>
      <button id="${options.ids.toggle}" class="sl-map-toggle" title="Toggle map/list">Toggle map</button>
    </div>
  `;
  wrapper.appendChild(bar);
  return bar;
}

export async function initSceneLinkMap({
  containerId,
  cardsSelector = ".venue-card,.event-card",
  nameAttr = "data-name",
  latAttr = "data-lat",
  lngAttr = "data-lng",
  categoryAttr = "data-category",
  openAttr = "data-open",
  defaultCenter = { lat: 42.3601, lng: -71.0589 },
  defaultZoom = 12,
  listContainerSelector = ".venue-list,.events-list,.nightlife-list" // used for toggle if present
} = {}) {
  await loadGoogleMaps();

  const el = document.getElementById(containerId);
  if (!el) return { ok:false, reason:`#${containerId} not found` };

  // Ensure relative to position toolbar
  el.style.position = el.style.position || "relative";

  // Build the map
  const map = new google.maps.Map(el, {
    center: defaultCenter, zoom: defaultZoom,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    styles: [{"featureType":"poi","stylers":[{"visibility":"off"}]}]
  });

  // Inject toolbar
  const ids = {
    search: `${containerId}-search`,
    geo: `${containerId}-geo`,
    toggle: `${containerId}-toggle`
  };
  createToolbar(el, { ids });

  const searchInput = document.getElementById(ids.search);
  const geoBtn = document.getElementById(ids.geo);
  const toggleBtn = document.getElementById(ids.toggle);

  // Places Autocomplete
  if (google.maps.places && searchInput) {
    const ac = new google.maps.places.Autocomplete(searchInput, { types: ["establishment","geocode"] });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (place?.geometry?.location) {
        map.setCenter(place.geometry.location);
        map.setZoom(14);
        // move the user marker
        if (userMarker) userMarker.setMap(null);
        userMarker = new google.maps.Marker({ map, position: place.geometry.location });
      }
    });
  }

  // Click to drop/move user marker
  let userMarker = new google.maps.Marker({ map, position: defaultCenter });
  map.addListener("click", (e) => {
    if (userMarker) userMarker.setMap(null);
    userMarker = new google.maps.Marker({ map, position: e.latLng });
  });

  // Resize handling
  let lastCenter = map.getCenter();
  map.addListener("center_changed", () => { lastCenter = map.getCenter(); });
  window.addEventListener("resize", () => {
    google.maps.event.trigger(map, "resize");
    map.setCenter(lastCenter);
  });

  // Markers from cards
  const cards = Array.from(document.querySelectorAll(cardsSelector)).map(card => {
    const lat = parseFloat(card.getAttribute(latAttr) || "");
    const lng = parseFloat(card.getAttribute(lngAttr) || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const id = card.id || card.getAttribute("data-id") || Math.random().toString(36).slice(2);
    const name = card.getAttribute(nameAttr) || card.textContent.trim().slice(0,60) || "Venue";
    const category = card.getAttribute(categoryAttr) || "";
    const isOpen = (card.getAttribute(openAttr) || "").toLowerCase() === "true";
    return { id, lat, lng, name, category, isOpen, el: card };
  }).filter(Boolean);

  const info = new google.maps.InfoWindow();
  const markerById = new Map();
  const bounds = new google.maps.LatLngBounds();

  function addMarker(v) {
    const m = new google.maps.Marker({ map, position: { lat: v.lat, lng: v.lng }, title: v.name });
    markerById.set(v.id, m);
    bounds.extend(m.getPosition());
    m.addListener("click", () => {
      info.setContent(`<strong>${v.name}</strong>`);
      info.open({ map, anchor: m });
      if (v.el?.scrollIntoView) {
        v.el.scrollIntoView({ behavior: "smooth", block: "center" });
        v.el.classList.add("sl-card-focus");
        setTimeout(() => v.el && v.el.classList.remove("sl-card-focus"), 1200);
      }
    });
  }

  cards.forEach(addMarker);
  if (cards.length > 1) map.fitBounds(bounds);
  else if (cards.length === 1) map.setZoom(15);

  // Card hover -> marker bounce
  cards.forEach(v => {
    v.el?.addEventListener("mouseenter", () => {
      const m = markerById.get(v.id);
      if (!m) return;
      m.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(() => m.setAnimation(null), 450);
    });
  });

  // Geolocate
  if (geoBtn && "geolocation" in navigator) {
    geoBtn.addEventListener("click", () => {
      navigator.geolocation.getCurrentPosition(pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setCenter(loc);
        map.setZoom(14);
        if (userMarker) userMarker.setMap(null);
        userMarker = new google.maps.Marker({ map, position: loc });
      });
    });
  }

  // View toggle (map/list)
  const listContainer = document.querySelector(listContainerSelector);
  if (toggleBtn && (el || listContainer)) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = el.style.display === "none";
      el.style.display = isHidden ? "" : "none";
      if (listContainer) listContainer.style.display = isHidden ? "none" : "";
    });
  }

  return { ok:true, map };
}
