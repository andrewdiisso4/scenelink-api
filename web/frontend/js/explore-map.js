// js/explore-map.js
// SceneLink Explore Map Integration
// Targets: <div id="googleMapExplore" class="google-map-container"></div>
// Optional controls (auto-detected if present):
//   <input id="exploreSearch" ...>          // Google Places Autocomplete
//   <button id="exploreGeolocate">...</button>
//   <select id="exploreCategoryFilter">...</select> // category filter; expects data-category on cards
//   <input id="exploreOpenNow" type="checkbox">     // "open-status" filter; expects data-open="true|false"
//
// Venue cards expected structure (flexible), add data attributes anywhere on the card root:
//   <div class="venue-card" data-lat="42.35" data-lng="-71.06" data-name="The Broadway" data-category="bar" data-open="true" id="venue-123"></div>
//
// API key handling:
// - If window.GOOGLE_MAPS_API_KEY is set, we use that.
// - Otherwise we fall back to the embedded key constant below.
//
// ***** Replace this fallback key if you need to hardcode *****
// (Your key was provided earlier; keeping a fallback to match your request)
const FALLBACK_API_KEY = ""; // Phase 2C C1: legacy inline Google Maps JS key removed.
// Production maps render via Leaflet/OSM (see unified-map.js + sl-map-popup-premium.js).
// If this loader is ever re-enabled, set window.__SL_GMAPS_KEY via env.js.

(function(){
  const MAP_EL_ID = "googleMapExplore";
  const API_KEY = (window.__SL_GMAPS_KEY || window.GOOGLE_MAPS_API_KEY || FALLBACK_API_KEY);
  if (!API_KEY) {
    console.warn('[explore-map] Google Maps JS key not configured. This loader is a no-op on the current deploy (Leaflet/OSM is used). Set window.__SL_GMAPS_KEY via env.js to re-enable.');
    return;
  }
  const API_URL = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places`;

  let map, markerById = new Map(), infoWindow, allCards = [], bounds;

  function loadScript(src){
    return new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(s);
    });
  }

  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

  function parseCard(card){
    const lat = parseFloat(card.dataset.lat || "");
    const lng = parseFloat(card.dataset.lng || "");
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    const name = card.dataset.name || card.getAttribute("data-name") || card.textContent.trim().slice(0,60) || "Venue";
    const id = card.id || card.getAttribute("data-id") || Math.random().toString(36).slice(2);
    const category = card.dataset.category || "";
    const isOpen = (card.dataset.open || "").toString().toLowerCase() === "true";
    return { id, lat, lng, name, category, isOpen, el: card };
  }

  function buildMarker(venue){
    const pos = { lat: venue.lat, lng: venue.lng };
    const m = new google.maps.Marker({
      position: pos, map, title: venue.name
    });
    markerById.set(venue.id, m);
    m.addListener("click", ()=>{
      if (infoWindow) infoWindow.close();
      infoWindow = new google.maps.InfoWindow({ content: `<strong>${venue.name}</strong>` });
      infoWindow.open({ map, anchor: m });
      // Scroll card into view
      if (venue.el && typeof venue.el.scrollIntoView === "function"){
        venue.el.scrollIntoView({ behavior:"smooth", block:"center" });
        venue.el.classList.add("sl-card-focus");
        setTimeout(()=>venue.el && venue.el.classList.remove("sl-card-focus"), 1200);
      }
    });
    return m;
  }

  function plotAll(){
    markerById.forEach(m => m.setMap(null));
    markerById.clear();
    bounds = new google.maps.LatLngBounds();

    const openOnly = !!($("#exploreOpenNow") && $("#exploreOpenNow").checked);
    const chosenCat = ($("#exploreCategoryFilter") && $("#exploreCategoryFilter").value) || "";

    const visible = [];
    for (const v of allCards){
      let keep = true;
      if (openOnly && !v.isOpen) keep = false;
      if (chosenCat && chosenCat !== "all" && v.category && v.category !== chosenCat) keep = false;
      v.el.style.display = keep ? "" : "none";
      if (keep){
        const m = buildMarker(v);
        bounds.extend(m.getPosition());
        visible.push(v);
      }
    }
    if (visible.length){
      if (visible.length === 1){
        map.setCenter({lat: visible[0].lat, lng: visible[0].lng});
        map.setZoom(15);
      }else{
        map.fitBounds(bounds);
      }
    }
  }

  function attachHoverSync(){
    // Hover card -> bounce/raise marker
    $all(".venue-card").forEach(card => {
      card.addEventListener("mouseenter", () => {
        const id = card.id || card.getAttribute("data-id");
        const m = id ? markerById.get(id) : null;
        if (m){
          m.setAnimation(google.maps.Animation.BOUNCE);
          setTimeout(()=>m.setAnimation(null), 450);
        }
      });
    });
  }

  function attachFilters(){
    const catSel = $("#exploreCategoryFilter");
    const openCb = $("#exploreOpenNow");
    if (catSel) catSel.addEventListener("change", plotAll);
    if (openCb) openCb.addEventListener("change", plotAll);
  }

  function attachSearch(){
    const input = $("#exploreSearch");
    if (!input) return;
    const ac = new google.maps.places.Autocomplete(input, { types:["establishment", "geocode"] });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry || !place.geometry.location) return;
      map.setCenter(place.geometry.location);
      map.setZoom(14);
    });
  }

  async function init(){
    const el = document.getElementById(MAP_EL_ID);
    if (!el) return;
    await loadScript(API_URL);

    // Build map with a safe default
    const defaultCenter = { lat: 42.3601, lng: -71.0589 };
    map = new google.maps.Map(el, {
      center: defaultCenter, zoom: 12,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      styles: [{"featureType":"poi","stylers":[{"visibility":"off"}]}]
    });

    // Parse venue cards
    allCards = $all(".venue-card").map(parseCard).filter(Boolean);

    // Initial plot + bindings
    plotAll();
    attachFilters();
    attachSearch();
    attachHoverSync();

    // Resize handling
    let lastCenter = map.getCenter();
    map.addListener("center_changed", () => { lastCenter = map.getCenter(); });
    window.addEventListener("resize", () => {
      google.maps.event.trigger(map, "resize");
      map.setCenter(lastCenter);
    });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
