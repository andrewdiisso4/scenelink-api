/**
 * SceneLink Explore - Live Interactive Map
 * Full-featured map discovery that syncs with venue listings
 */
(function() {
    'use strict';

    // ============ VENUE DATA WITH COORDINATES ============
    var mapVenues = [
        {
            id: 1, name: "Toro", type: "Spanish Tapas", category: "restaurants",
            neighborhood: "South End", price: 3, rating: 4.8, reviews: 1247,
            people: 67, distance: 0.4, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3425, lng: -71.0695,
            tags: ["Romantic", "Great for groups"]
        },
        {
            id: 2, name: "Neptune Oyster", type: "Seafood", category: "restaurants",
            neighborhood: "North End", price: 4, rating: 4.9, reviews: 2156,
            people: 42, distance: 0.8, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3636, lng: -71.0544,
            tags: ["Fresh seafood", "Raw bar"]
        },
        {
            id: 3, name: "Drink", type: "Cocktail Bar", category: "bars",
            neighborhood: "Seaport", price: 3, rating: 4.7, reviews: 1893,
            people: 89, distance: 1.2, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3489, lng: -71.0465,
            tags: ["Craft cocktails", "Upscale"]
        },
        {
            id: 4, name: "The Salty Pig", type: "Italian", category: "restaurants",
            neighborhood: "Back Bay", price: 2, rating: 4.6, reviews: 1543,
            people: 34, distance: 0.5, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3475, lng: -71.0785,
            tags: ["Pizza", "Craft beer"]
        },
        {
            id: 5, name: "House of Blues", type: "Live Music Venue", category: "nightlife",
            neighborhood: "Fenway", price: 3, rating: 4.5, reviews: 3421,
            people: 156, distance: 1.8, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3467, lng: -71.0972,
            tags: ["Live music", "Concerts"]
        },
        {
            id: 6, name: "The Velvet Lounge", type: "Speakeasy", category: "bars",
            neighborhood: "Downtown", price: 3, rating: 4.8, reviews: 987,
            people: 89, distance: 0.3, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3555, lng: -71.0605,
            tags: ["Speakeasy", "Craft cocktails"]
        },
        {
            id: 7, name: "Skyline Rooftop", type: "Rooftop Bar", category: "bars",
            neighborhood: "Back Bay", price: 3, rating: 4.8, reviews: 1678,
            people: 112, distance: 0.6, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3510, lng: -71.0730,
            tags: ["Rooftop", "Skyline views"]
        },
        {
            id: 8, name: "Jazz at the Blue Note", type: "Live Jazz", category: "events",
            neighborhood: "Cambridge", price: 2, rating: 4.6, reviews: 765,
            people: 56, distance: 2.1, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3736, lng: -71.1097,
            tags: ["Live jazz", "Tonight 8PM"]
        },
        {
            id: 9, name: "Trattoria Milano", type: "Italian", category: "restaurants",
            neighborhood: "North End", price: 3, rating: 4.9, reviews: 2089,
            people: 38, distance: 0.7, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3648, lng: -71.0530,
            tags: ["Authentic Italian", "Date night"]
        },
        {
            id: 10, name: "Neon Nights", type: "Dance Club", category: "nightlife",
            neighborhood: "Theater District", price: 3, rating: 4.4, reviews: 1234,
            people: 203, distance: 0.4, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3520, lng: -71.0635,
            tags: ["DJ sets", "Dancing"]
        },
        {
            id: 11, name: "Summer Food Fest", type: "Food Festival", category: "events",
            neighborhood: "Seaport", price: 2, rating: 4.7, reviews: 432,
            people: 340, distance: 1.3, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3505, lng: -71.0420,
            tags: ["Food trucks", "Live music"]
        },
        {
            id: 12, name: "Whiskey Saigon", type: "Nightclub", category: "nightlife",
            neighborhood: "Back Bay", price: 3, rating: 4.3, reviews: 876,
            people: 178, distance: 0.5, status: "open",
            image: "/assets/img/placeholder-venue.svg",
            lat: 42.3485, lng: -71.0760,
            tags: ["VIP tables", "Bottle service"]
        }
    ];

    // ============ STATE ============
    var map = null;
    var markers = [];
    var activeFilter = 'all';
    var activeVenueId = null;
    var searchQuery = '';

    // ============ ICON CONFIGS ============
    var categoryIcons = {
        restaurants: { icon: 'fa-utensils', class: 'cat-restaurants' },
        bars:        { icon: 'fa-cocktail', class: 'cat-bars' },
        events:      { icon: 'fa-calendar-alt', class: 'cat-events' },
        nightlife:   { icon: 'fa-moon', class: 'cat-nightlife' }
    };

    // ============ INIT ============
    function init() {
        var canvas = document.getElementById('exploreMapCanvas');
        if (!canvas) return;

        // Initialize Leaflet map with dark theme
        map = L.map('exploreMapCanvas', {
            center: [42.3555, -71.0655],
            zoom: 14,
            zoomControl: false,
            attributionControl: false
        });

        // Dark map tiles (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: ''
        }).addTo(map);

        // Render all markers
        renderMarkers(mapVenues);

        // Setup controls
        setupFilterChips();
        setupSearch();
        setupZoomControls();
        setupLocationButton();
        setupListingSync();

        // Small delay to fix Leaflet rendering
        setTimeout(function() {
            map.invalidateSize();
        }, 300);
    }

    // ============ MARKERS ============
    function renderMarkers(venues) {
        // Clear existing
        markers.forEach(function(m) { map.removeLayer(m.marker); });
        markers = [];

        venues.forEach(function(venue) {
            var catConfig = categoryIcons[venue.category] || categoryIcons.restaurants;

            // Create custom HTML marker
            var iconHtml = '<div class="sl-map-marker ' + catConfig.class + '" data-venue-id="' + venue.id + '">' +
                '<div class="sl-map-marker-pulse"></div>' +
                '<div class="sl-map-marker-icon"><i class="fas ' + catConfig.icon + '"></i></div>' +
                '</div>';

            var customIcon = L.divIcon({
                html: iconHtml,
                className: 'sl-marker-wrapper',
                iconSize: [36, 42],
                iconAnchor: [18, 42],
                popupAnchor: [0, -44]
            });

            var marker = L.marker([venue.lat, venue.lng], { icon: customIcon }).addTo(map);

            marker.on('click', function() {
                selectVenue(venue);
            });

            markers.push({ marker: marker, venue: venue });
        });
    }

    // ============ SELECT VENUE ============
    function selectVenue(venue) {
        activeVenueId = venue.id;

        // Update preview card
        var preview = document.getElementById('mapVenuePreview');
        document.getElementById('previewImg').src = venue.image;
        document.getElementById('previewName').textContent = venue.name;
        document.getElementById('previewRating').textContent = '★ ' + venue.rating;
        document.getElementById('previewPeople').textContent = venue.people;
        document.getElementById('previewDist').textContent = venue.distance + ' mi';
        document.getElementById('previewType').textContent = venue.type + ' · ' + venue.neighborhood;

        // Show card with animation
        preview.classList.add('visible');

        // Highlight marker
        document.querySelectorAll('.sl-map-marker').forEach(function(el) {
            el.classList.remove('active');
        });
        var activeMarkerEl = document.querySelector('.sl-map-marker[data-venue-id="' + venue.id + '"]');
        if (activeMarkerEl) {
            activeMarkerEl.classList.add('active');
        }

        // Pan map to venue
        map.panTo([venue.lat, venue.lng], { animate: true, duration: 0.5 });

        // Highlight corresponding listing
        highlightListing(venue.id);

        // View button handler
        document.getElementById('previewViewBtn').onclick = function() {
            openVenueDetail(venue);
        };
    }

    // ============ HIGHLIGHT LISTING ============
    function highlightListing(venueId) {
        // Remove all highlights
        document.querySelectorAll('.venue-card').forEach(function(card) {
            card.classList.remove('map-highlighted');
        });

        // Find and highlight the matching card
        var cards = document.querySelectorAll('.venue-card');
        cards.forEach(function(card) {
            var name = card.querySelector('.venue-name, h3, h4');
            if (name) {
                var venue = mapVenues.find(function(v) { return v.id === venueId; });
                if (venue && name.textContent.trim() === venue.name) {
                    card.classList.add('map-highlighted');
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        });
    }

    // ============ OPEN VENUE DETAIL ============
    function openVenueDetail(venue) {
        var modal = document.getElementById('venueDetailsModal');
        if (!modal) return;

        var priceStr = '';
        for (var i = 0; i < venue.price; i++) priceStr += '$';

        modal.innerHTML = '<div style="background:#1a1a1a; border-radius:16px; max-width:600px; width:100%; max-height:90vh; overflow-y:auto; position:relative; border:1px solid rgba(212,175,55,0.2); box-shadow:0 25px 60px rgba(0,0,0,0.5); margin:auto;">' +
            '<button onclick="this.parentElement.parentElement.style.display=\'none\'" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.5);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;z-index:10;font-size:18px;">×</button>' +
            '<div style="width:100%;height:250px;overflow:hidden;border-radius:16px 16px 0 0;">' +
                '<img src="' + venue.image + '" style="width:100%;height:100%;object-fit:cover;" alt="' + venue.name + '">' +
            '</div>' +
            '<div style="padding:24px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
                    '<h2 style="color:#fff;font-size:24px;margin:0;">' + venue.name + '</h2>' +
                    '<span style="color:#D4AF37;font-size:14px;font-weight:600;">' + priceStr + '</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;color:rgba(255,255,255,0.6);font-size:14px;">' +
                    '<span style="color:#D4AF37;">★ ' + venue.rating + '</span>' +
                    '<span>(' + venue.reviews + ' reviews)</span>' +
                    '<span>·</span>' +
                    '<span>' + venue.type + '</span>' +
                '</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">' +
                    venue.tags.map(function(t) { return '<span style="background:rgba(212,175,55,0.1);color:#D4AF37;border:1px solid rgba(212,175,55,0.2);padding:4px 12px;border-radius:20px;font-size:12px;">' + t + '</span>'; }).join('') +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:12px;background:rgba(255,255,255,0.04);border-radius:12px;">' +
                    '<div style="text-align:center;flex:1;">' +
                        '<div style="color:#ef4444;font-size:20px;font-weight:700;">' + venue.people + '</div>' +
                        '<div style="color:rgba(255,255,255,0.5);font-size:11px;">people here</div>' +
                    '</div>' +
                    '<div style="width:1px;height:30px;background:rgba(255,255,255,0.1);"></div>' +
                    '<div style="text-align:center;flex:1;">' +
                        '<div style="color:#fff;font-size:20px;font-weight:700;">' + venue.distance + ' mi</div>' +
                        '<div style="color:rgba(255,255,255,0.5);font-size:11px;">distance</div>' +
                    '</div>' +
                    '<div style="width:1px;height:30px;background:rgba(255,255,255,0.1);"></div>' +
                    '<div style="text-align:center;flex:1;">' +
                        '<div style="color:#22c55e;font-size:14px;font-weight:700;">Open Now</div>' +
                        '<div style="color:rgba(255,255,255,0.5);font-size:11px;">' + venue.neighborhood + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:10px;">' +
                    '<button style="flex:1;background:linear-gradient(135deg,#D4AF37,#c5a028);color:#0a0a0a;border:none;padding:14px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Reserve Now</button>' +
                    '<button style="width:48px;height:48px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.2);color:#D4AF37;border-radius:12px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-heart"></i></button>' +
                    '<button style="width:48px;height:48px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.2);color:#D4AF37;border-radius:12px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-share-alt"></i></button>' +
                '</div>' +
            '</div>' +
        '</div>';

        modal.style.display = 'flex';
        modal.onclick = function(e) {
            if (e.target === modal) modal.style.display = 'none';
        };
    }

    // ============ FILTER CHIPS ============
    function setupFilterChips() {
        var chips = document.querySelectorAll('#mapFilterChips .explore-map-chip');
        chips.forEach(function(chip) {
            chip.addEventListener('click', function() {
                chips.forEach(function(c) { c.classList.remove('active'); });
                chip.classList.add('active');
                activeFilter = chip.getAttribute('data-filter');
                applyFilters();
                updateResultsHeading();

                // Also sync the category chips below
                syncCategoryChips(activeFilter);
            });
        });
    }

    function syncCategoryChips(filter) {
        var categoryChips = document.querySelectorAll('.category-chip');
        categoryChips.forEach(function(chip) {
            chip.classList.remove('active');
            if (chip.getAttribute('data-category') === filter) {
                chip.classList.add('active');
            }
        });
    }

    function applyFilters() {
        var filtered = mapVenues.filter(function(v) {
            var matchCategory = (activeFilter === 'all') || (v.category === activeFilter);
            var matchSearch = !searchQuery || 
                v.name.toLowerCase().indexOf(searchQuery) !== -1 ||
                v.type.toLowerCase().indexOf(searchQuery) !== -1 ||
                v.neighborhood.toLowerCase().indexOf(searchQuery) !== -1 ||
                v.tags.some(function(t) { return t.toLowerCase().indexOf(searchQuery) !== -1; });
            return matchCategory && matchSearch;
        });

        renderMarkers(filtered);

        // Update count
        var countEl = document.getElementById('exploreResultsCount');
        if (countEl) {
            countEl.textContent = filtered.length + ' places · Tonight';
        }

        // Hide preview if active venue no longer visible
        if (activeVenueId) {
            var stillVisible = filtered.some(function(v) { return v.id === activeVenueId; });
            if (!stillVisible) {
                document.getElementById('mapVenuePreview').classList.remove('visible');
                activeVenueId = null;
            }
        }

        // Fit bounds if we have markers
        if (filtered.length > 0) {
            var bounds = L.latLngBounds(filtered.map(function(v) { return [v.lat, v.lng]; }));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }

    function updateResultsHeading() {
        var titleEl = document.getElementById('exploreResultsTitle');
        if (!titleEl) return;

        var titles = {
            all: 'All Spots Near You',
            restaurants: 'Restaurants Near You',
            bars: 'Bars & Lounges Near You',
            events: 'Events Happening Now',
            nightlife: 'Nightlife Near You'
        };
        titleEl.textContent = titles[activeFilter] || 'All Spots Near You';
    }

    // ============ SEARCH ============
    function setupSearch() {
        var input = document.getElementById('mapSearchInput');
        var btn = document.getElementById('mapSearchBtn');
        if (!input) return;

        var timeout;
        input.addEventListener('input', function() {
            clearTimeout(timeout);
            timeout = setTimeout(function() {
                searchQuery = input.value.trim().toLowerCase();
                applyFilters();
            }, 300);
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                searchQuery = input.value.trim().toLowerCase();
                applyFilters();
            }
        });

        if (btn) {
            btn.addEventListener('click', function() {
                searchQuery = input.value.trim().toLowerCase();
                applyFilters();
            });
        }
    }

    // ============ ZOOM ============
    function setupZoomControls() {
        var zoomIn = document.getElementById('mapZoomIn');
        var zoomOut = document.getElementById('mapZoomOut');
        if (zoomIn) zoomIn.addEventListener('click', function() { map.zoomIn(); });
        if (zoomOut) zoomOut.addEventListener('click', function() { map.zoomOut(); });
    }

    // ============ LOCATION ============
    function setupLocationButton() {
        var btn = document.getElementById('mapLocateBtn');
        if (!btn) return;

        btn.addEventListener('click', function() {
            if (navigator.geolocation) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                navigator.geolocation.getCurrentPosition(
                    function(pos) {
                        map.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: true });
                        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
                    },
                    function() {
                        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
                        // Default to Boston center
                        map.setView([42.3555, -71.0655], 14, { animate: true });
                    }
                );
            }
        });
    }

    // ============ LISTING SYNC ============
    function setupListingSync() {
        // Listen for clicks on venue cards in the listing
        document.addEventListener('click', function(e) {
            var card = e.target.closest('.venue-card');
            if (!card) return;

            var name = card.querySelector('.venue-name, h3, h4');
            if (!name) return;

            var venue = mapVenues.find(function(v) {
                return v.name === name.textContent.trim();
            });

            if (venue && map) {
                selectVenue(venue);
                // Scroll map into view
                var mapEl = document.getElementById('exploreDiscoveryMap');
                if (mapEl) {
                    mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });

        // Also sync the existing category chips with the map
        document.querySelectorAll('.category-chip').forEach(function(chip) {
            chip.addEventListener('click', function() {
                var cat = chip.getAttribute('data-category');
                activeFilter = cat;

                // Update map chips
                document.querySelectorAll('#mapFilterChips .explore-map-chip').forEach(function(mc) {
                    mc.classList.remove('active');
                    if (mc.getAttribute('data-filter') === cat) {
                        mc.classList.add('active');
                    }
                });

                applyFilters();
                updateResultsHeading();
            });
        });
    }

    // ============ DISMISS PREVIEW ============
    document.addEventListener('click', function(e) {
        var preview = document.getElementById('mapVenuePreview');
        if (!preview) return;

        // Don't dismiss if clicking inside preview
        if (preview.contains(e.target)) return;
        // Don't dismiss if clicking on a marker
        if (e.target.closest('.sl-map-marker')) return;
        // Don't dismiss if clicking on map controls
        if (e.target.closest('.explore-map-controls-overlay') || 
            e.target.closest('.explore-map-zoom') ||
            e.target.closest('.explore-map-locate')) return;

        // Dismiss if clicking on the map itself
        if (e.target.closest('#exploreMapCanvas')) {
            preview.classList.remove('visible');
            activeVenueId = null;
            document.querySelectorAll('.sl-map-marker').forEach(function(el) {
                el.classList.remove('active');
            });
            document.querySelectorAll('.venue-card').forEach(function(card) {
                card.classList.remove('map-highlighted');
            });
        }
    });

    // ============ BOOT ============
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();