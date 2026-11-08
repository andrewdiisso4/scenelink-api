/* ============================================
   UNIFIED MAP MODULE - SceneLink
   Leaflet/OpenStreetMap for all pages
   ============================================ */

const SceneLinkMap = (function () {
    'use strict';

    // Boston center coordinates
    const BOSTON_CENTER = [42.3601, -71.0589];
    const DEFAULT_ZOOM = 13;

    // Dark tile layer
    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

    // Marker category colors
    const COLORS = {
        restaurant: '#FF6B6B',
        bar: '#D4AF37',
        event: '#6C5CE7',
        nightclub: '#E040FB',
        lounge: '#00BCD4',
        live: '#22c55e',
        upcoming: '#6C5CE7',
        tonight: '#D4AF37',
        default: '#D4AF37'
    };

    const ICONS = {
        restaurant: '🍽️',
        bar: '🍸',
        event: '🎵',
        nightclub: '🎶',
        lounge: '🛋️',
        live: '🔴',
        upcoming: '📅',
        tonight: '⭐',
        default: '📍'
    };

    // Sample venue data for Boston
    // Phase 5D-B: SAMPLE_VENUES emptied. Was hardcoded fake venues including
    // "Boston Jazz Festival", "Royale", "Bijou", "Yvonne's", "Lolita Cocina",
    // "Trattoria Milano", "Skyline Rooftop" etc. Map now loads from /api/venues.
    const SAMPLE_VENUES = { restaurants: [], bars: [], events: [], nightlife: [] };

    // Live loader: fetch real venues from /api/venues and populate categories.
    async function loadLiveVenues() {
        try {
            // Phase 5K perf: cap initial fetch at 50 venues to reduce first-paint
            // image weight. Map remains pannable; if user needs more, page-level UI
            // can re-fetch on demand.
            const r = await fetch('/api/venues?limit=50');
            if (!r.ok) return;
            const data = await r.json();
            const all = data.venues || [];
            const cat = { restaurants: [], bars: [], events: [], nightlife: [] };
            all.forEach(v => {
                if (!v.lat || !v.lng) return;
                const t = (v.type || v.category || '').toLowerCase();
                const entry = {
                    name: v.name,
                    lat: parseFloat(v.lat),
                    lng: parseFloat(v.lng),
                    type: t,
                    rating: v.rating,
                    price: v.price_label || '',
                    neighborhood: v.neighborhood || '',
                    slug: v.slug,
                    id: v.id,
                };
                if (t === 'bar' || t === 'lounge') cat.bars.push(entry);
                else if (t === 'nightlife' || t === 'club' || t === 'nightclub') cat.nightlife.push(entry);
                else cat.restaurants.push(entry);
            });
            SAMPLE_VENUES.restaurants = cat.restaurants;
            SAMPLE_VENUES.bars = cat.bars;
            SAMPLE_VENUES.nightlife = cat.nightlife;
            // events stays empty; events page has its own loader
        } catch (_) { /* network error: leave maps empty */ }
    }
    // Kick off load immediately so init() (which may run later) finds populated arrays
    var __slMapVenuesLoading = loadLiveVenues();


    /**
     * Initialize a map instance
     * @param {string} containerId - The DOM element ID for the map
     * @param {Object} options - Configuration options
     * @returns {Object} Map API object
     */
    function init(containerId, options = {}) {
        const defaults = {
            center: BOSTON_CENTER,
            zoom: DEFAULT_ZOOM,
            categories: ['restaurants', 'bars', 'events', 'nightlife'],
            showLegend: true,
            showControls: true,
            legendItems: null, // auto from categories
            height: null, // uses CSS class
            onMarkerClick: null,
        };

        const config = { ...defaults, ...options };
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`SceneLinkMap: container #${containerId} not found`);
            return null;
        }

        // Create map
        const map = L.map(containerId, {
            center: config.center,
            zoom: config.zoom,
            zoomControl: false,
            attributionControl: false,
        });

        // Add tile layer
        L.tileLayer(TILE_URL, {
            attribution: TILE_ATTR,
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(map);

        // Store markers by category
        const markerGroups = {};
        const allMarkers = [];

        // Add markers for requested categories
        // Phase 5D-B: wait for live venue load before placing markers; if it
        // hasn't resolved yet, place markers asynchronously when ready.
        function placeMarkers() {
            config.categories.forEach(cat => {
                const venues = SAMPLE_VENUES[cat] || [];
                markerGroups[cat] = markerGroups[cat] || [];
                venues.forEach(venue => {
                    const marker = createMarker(map, venue, config.onMarkerClick);
                    markerGroups[cat].push(marker);
                    allMarkers.push({ marker, venue, category: cat });
                });
            });
        }
        if (typeof __slMapVenuesLoading !== 'undefined' && __slMapVenuesLoading && typeof __slMapVenuesLoading.then === 'function') {
            __slMapVenuesLoading.then(placeMarkers).catch(placeMarkers);
        } else {
            placeMarkers();
        }

        // Remove loading overlay if present
        const wrapper = container.closest('.sl-map-wrapper');
        if (wrapper) {
            const loading = wrapper.querySelector('.sl-map-loading');
            if (loading) {
                setTimeout(() => loading.classList.add('hidden'), 600);
            }
        }

        // Fix map tiles on delayed render
        setTimeout(() => map.invalidateSize(), 200);
        setTimeout(() => map.invalidateSize(), 800);

        // Return public API
        return {
            map,
            markerGroups,
            allMarkers,
            filterByCategory(category) {
                allMarkers.forEach(({ marker, category: cat }) => {
                    if (category === 'all' || cat === category) {
                        marker.setOpacity(1);
                    } else {
                        marker.setOpacity(0.15);
                    }
                });
            },
            showOnly(categories) {
                const cats = Array.isArray(categories) ? categories : [categories];
                allMarkers.forEach(({ marker, category: cat }) => {
                    if (cats.includes(cat) || cats.includes('all')) {
                        marker.setOpacity(1);
                    } else {
                        marker.setOpacity(0);
                    }
                });
            },
            resetView() {
                map.setView(config.center, config.zoom);
                allMarkers.forEach(({ marker }) => marker.setOpacity(1));
            },
            locateUser() {
                map.locate({ setView: true, maxZoom: 15 });
            },
            resize() {
                setTimeout(() => map.invalidateSize(), 100);
            }
        };
    }

    /**
     * Create a styled marker
     */
    function createMarker(map, venue, onClick) {
        const color = COLORS[venue.type] || COLORS.default;
        const emoji = ICONS[venue.type] || ICONS.default;

        const icon = L.divIcon({
            className: 'sl-marker-wrapper',
            html: `<div class="sl-marker" style="background:${color}"><span class="sl-marker-icon">${emoji}</span></div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -40],
        });

        const marker = L.marker([venue.lat, venue.lng], { icon }).addTo(map);

        // Build popup
        const extraInfo = venue.time ? `<br><span style="color:#D4AF37">${venue.time}</span>` : '';
        const dateInfo = venue.date ? ` · ${venue.date}` : '';
        const hoursInfo = venue.hours ? `<br><span style="color:rgba(255,255,255,0.5)">${venue.hours}</span>` : '';

        marker.bindPopup(`
            <div class="sl-popup">
                <div class="sl-popup-title">${venue.name}</div>
                <div class="sl-popup-meta">${venue.neighborhood} · ${venue.price}${dateInfo}${extraInfo}${hoursInfo}</div>
                <button class="sl-popup-btn" onclick="void(0)">View Details</button>
            </div>
        `);

        if (onClick) {
            marker.on('click', () => onClick(venue));
        }

        // Entrance animation
        marker.setOpacity(0);
        setTimeout(() => {
            marker.setOpacity(1);
        }, Math.random() * 600 + 200);

        return marker;
    }

    return { init, SAMPLE_VENUES, COLORS };
})();