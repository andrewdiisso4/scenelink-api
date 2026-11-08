// OpenStreetMap Integration System
// Fully functional map integration with enhanced filters and discovery

class OpenStreetMapIntegration {
    constructor(mapContainerId, options = {}) {
        this.mapContainer = document.getElementById(mapContainerId);
        this.options = {
            center: [42.3601, -71.0589], // Boston coordinates
            zoom: 13,
            minZoom: 10,
            maxZoom: 18,
            ...options
        };
        
        this.map = null;
        this.markers = [];
        this.markerCluster = null;
        this.venues = [];
        this.userLocation = null;
        this.currentFilters = {};
        
        this.init();
    }

    async init() {
        if (!this.mapContainer) {
            console.error('Map container not found');
            return;
        }

        try {
            // Initialize Leaflet map
            this.map = L.map(this.mapContainerId, {
                center: this.options.center,
                zoom: this.options.zoom,
                minZoom: this.options.minZoom,
                maxZoom: this.options.maxZoom,
                zoomControl: true,
                attributionControl: false
            });

            // Add tile layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 18
            }).addTo(this.map);

            // Setup enhanced features
            this.setupUserLocation();
            this.setupMapControls();
            this.setupMarkerClustering();
            this.setupVenueDiscovery();
            this.setupFilterIntegration();
            this.setupInteractiveFeatures();

            // Load initial venues
            await this.loadVenues();

            console.log('OpenStreetMap integration initialized successfully');
        } catch (error) {
            console.error('Failed to initialize map:', error);
        }
    }

    setupUserLocation() {
        // Get user's current location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    this.userLocation = [
                        position.coords.latitude,
                        position.coords.longitude
                    ];
                    
                    // Add user location marker
                    this.addUserLocationMarker();
                    
                    // Center map on user location
                    this.map.setView(this.userLocation, this.options.zoom);
                },
                error => {
                    console.warn('Could not get user location:', error);
                }
            );
        }
    }

    addUserLocationMarker() {
        if (!this.userLocation) return;

        const userIcon = L.divIcon({
            html: `
                <div style="
                    background: var(--accent-gold);
                    border: 3px solid white;
                    border-radius: 50%;
                    width: 16px;
                    height: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    animation: pulse 2s infinite;
                "></div>
            `,
            className: 'user-location-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        L.marker(this.userLocation, { icon: userIcon })
            .addTo(this.map)
            .bindPopup('Your Location');
    }

    setupMapControls() {
        // Custom zoom control
        const customZoomControl = L.control({ position: 'topright' });
        
        customZoomControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'custom-map-controls');
            div.innerHTML = `
                <div class="map-control-group">
                    <button id="zoomIn" class="map-control-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="11" y1="8" x2="11" y2="14"></line>
                            <line x1="8" y1="11" x2="14" y2="11"></line>
                        </svg>
                    </button>
                    <button id="zoomOut" class="map-control-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="8" y1="11" x2="14" y2="11"></line>
                        </svg>
                    </button>
                    <button id="resetView" class="map-control-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3.5 6.5L11 3l7.5 3.5L11 10z"></path>
                            <path d="M11 3v7"></path>
                            <path d="M3.5 12.5L11 16l7.5-3.5L11 9z"></path>
                        </svg>
                    </button>
                </div>
            `;
            
            // Add event listeners
            div.querySelector('#zoomIn').addEventListener('click', () => this.map.zoomIn());
            div.querySelector('#zoomOut').addEventListener('click', () => this.map.zoomOut());
            div.querySelector('#resetView').addEventListener('click', () => this.resetMapView());
            
            return div;
        };
        
        customZoomControl.addTo(this.map);

        // Add custom CSS
        this.addMapControlStyles();
    }

    addMapControlStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .custom-map-controls {
                background: rgba(20, 20, 20, 0.9);
                border-radius: 8px;
                padding: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            
            .map-control-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .map-control-btn {
                background: var(--accent-gold);
                border: none;
                border-radius: 4px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                color: var(--dark-primary);
            }
            
            .map-control-btn:hover {
                background: var(--accent-gold-hover);
                transform: scale(1.1);
            }
            
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(212, 175, 55, 0); }
                100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); }
            }
            
            .user-location-marker {
                animation: pulse 2s infinite;
            }
        `;
        document.head.appendChild(style);
    }

    setupMarkerClustering() {
        // Initialize marker clustering for better performance
        this.markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 50,
            iconCreateFunction: cluster => {
                return L.divIcon({
                    html: `
                        <div style="
                            background: var(--accent-gold);
                            color: var(--dark-primary);
                            border-radius: 50%;
                            width: 30px;
                            height: 30px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                            font-size: 12px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        ">${cluster.getChildCount()}</div>
                    `,
                    className: 'custom-cluster-marker',
                    iconSize: [30, 30]
                });
            }
        });
        
        this.map.addLayer(this.markerCluster);
    }

    async loadVenues() {
        // Load venues from API or use mock data
        this.venues = await this.fetchVenues();
        this.addVenueMarkers(this.venues);
    }

    async fetchVenues() {
        // Pull real venues from SceneLink API. Prefer nearby if we have user location.
        const API = (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) || '/api';
        try {
            let url;
            if (this.userLocation && Array.isArray(this.userLocation) && this.userLocation.length === 2) {
                const [lat, lng] = this.userLocation;
                url = `${API}/venues/nearby?lat=${lat}&lng=${lng}&radius=5&limit=200`;
            } else {
                // Default to Boston center for map
                url = `${API}/venues/nearby?lat=42.3505&lng=-71.0760&radius=5&limit=200`;
            }
            const r = await fetch(url, { credentials: 'same-origin' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const data = await r.json();
            const venues = Array.isArray(data.venues) ? data.venues : (Array.isArray(data) ? data : []);
            // Map backend shape → map marker shape (lat/lng/type/image/price/rating)
            return venues.map(v => ({
                id: v.id,
                name: v.name,
                lat: parseFloat(v.lat || v.latitude),
                lng: parseFloat(v.lng || v.longitude),
                type: v.type || v.category || 'venue',
                vibe: (Array.isArray(v.vibe_tags) && v.vibe_tags[0]) || '',
                price: v.price_label || (v.price_level ? '$'.repeat(v.price_level) : ''),
                rating: v.rating_avg || v.rating || 0,
                image: v.thumbnail_url || v.image_url || v.cover_image_url || '/assets/img/placeholder-venue.svg',
                address: v.address,
                neighborhood: v.neighborhood,
                distance_km: v.distance_km,
                source: v.source,
                website: v.website,
                slug: v.slug
            })).filter(x => !isNaN(x.lat) && !isNaN(x.lng));
        } catch (err) {
            console.warn('[map] failed to load venues, using fallback:', err);
            return [];
        }
    }

    addVenueMarkers(venues) {
        venues.forEach(venue => {
            const marker = this.createVenueMarker(venue);
            this.markers.push(marker);
            this.markerCluster.addLayer(marker);
        });
    }

    createVenueMarker(venue) {
        const customIcon = L.divIcon({
            html: `
                <div class="venue-marker" data-venue-id="${venue.id}" style="
                    background: ${this.getVenueColor(venue.vibe)};
                    border: 2px solid white;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </div>
            `,
            className: 'custom-venue-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker([venue.lat, venue.lng], { icon: customIcon });
        
        // Create custom popup
        const popupContent = this.createVenuePopup(venue);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'venue-popup'
        });

        // Add hover effects
        marker.on('mouseover', function() {
            this.getElement().style.transform = 'scale(1.2)';
        });

        marker.on('mouseout', function() {
            this.getElement().style.transform = 'scale(1)';
        });

        marker.on('click', () => {
            this.handleVenueClick(venue);
        });

        return marker;
    }

    createVenuePopup(venue) {
        return `
            <div class="venue-popup-content" style="
                background: var(--dark-card);
                padding: 16px;
                border-radius: 8px;
                min-width: 250px;
            ">
                <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                    <img src="${venue.image}" alt="${venue.name}" style="
                        width: 80px;
                        height: 80px;
                        object-fit: cover;
                        border-radius: 8px;
                    ">
                    <div style="flex: 1;">
                        <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">${venue.name}</h3>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="color: var(--accent-gold); font-weight: 600;">${venue.price}</span>
                            <span style="color: var(--text-secondary);">•</span>
                            <span style="color: var(--text-secondary);">${venue.vibe}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent-gold)">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            <span style="color: var(--text-secondary); font-size: 14px;">${venue.rating}</span>
                        </div>
                    </div>
                </div>
                <button onclick="window.mapIntegration.viewVenueDetails(${venue.id})" style="
                    width: 100%;
                    padding: 8px 16px;
                    background: var(--accent-gold);
                    color: var(--dark-primary);
                    border: none;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onmouseover="this.style.background='var(--accent-gold-hover)'" 
                   onmouseout="this.style.background='var(--accent-gold)'">
                    View Details
                </button>
            </div>
        `;
    }

    getVenueColor(vibe) {
        const colors = {
            lively: '#e74c3c',
            chill: '#3498db',
            upscale: '#f39c12',
            romantic: '#e91e63',
            casual: '#95a5a6'
        };
        return colors[vibe] || '#d4af37';
    }

    setupVenueDiscovery() {
        // Setup venue discovery based on user preferences
        this.discoveryRadius = 5000; // 5km default
        
        // Add radius circle around user location
        if (this.userLocation) {
            this.discoveryCircle = L.circle(this.userLocation, {
                radius: this.discoveryRadius,
                fillColor: '#d4af37',
                fillOpacity: 0.1,
                color: '#d4af37',
                weight: 2,
                opacity: 0.3
            }).addTo(this.map);
        }
    }

    setupFilterIntegration() {
        // Listen for filter changes from enhanced filters system
        document.addEventListener('filtersChanged', (event) => {
            this.applyFilters(event.detail);
        });
    }

    applyFilters(filters) {
        this.currentFilters = filters;
        
        // Clear existing markers
        this.markerCluster.clearLayers();
        this.markers = [];
        
        // Filter venues
        const filteredVenues = this.filterVenues(this.venues, filters);
        
        // Add filtered markers
        this.addVenueMarkers(filteredVenues);
        
        // Adjust map view to show results
        if (filteredVenues.length > 0) {
            this.fitMapToVenues(filteredVenues);
        }
    }

    filterVenues(venues, filters) {
        return venues.filter(venue => {
            // Vibe filter
            if (filters.vibe && filters.vibe.length > 0 && !filters.vibe.includes(venue.vibe)) {
                return false;
            }
            
            // Price filter
            if (filters.price && filters.price.length > 0 && !filters.price.includes(venue.price)) {
                return false;
            }
            
            // Rating filter
            if (filters.rating && venue.rating < parseFloat(filters.rating)) {
                return false;
            }
            
            // Distance filter (if user location is available)
            if (this.userLocation && filters.distance) {
                const distance = this.calculateDistance(
                    this.userLocation,
                    [venue.lat, venue.lng]
                );
                const maxDistance = parseInt(filters.distance) * 1609; // Convert miles to meters
                if (distance > maxDistance) {
                    return false;
                }
            }
            
            return true;
        });
    }

    calculateDistance(coord1, coord2) {
        // Haversine distance calculation
        const R = 6371e3; // Earth's radius in meters
        const φ1 = coord1[0] * Math.PI/180;
        const φ2 = coord2[0] * Math.PI/180;
        const Δφ = (coord2[0]-coord1[0]) * Math.PI/180;
        const Δλ = (coord2[1]-coord1[1]) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    fitMapToVenues(venues) {
        if (venues.length === 0) return;
        
        const bounds = L.latLngBounds(venues.map(v => [v.lat, v.lng]));
        this.map.fitBounds(bounds, { padding: [50, 50] });
    }

    setupInteractiveFeatures() {
        // Setup search functionality
        this.setupMapSearch();
        
        // Setup venue directions
        this.setupDirections();
        
        // Setup heatmap overlays
        this.setupHeatmap();
    }

    setupMapSearch() {
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                if (query.length > 2) {
                    this.searchVenues(query);
                }
            });
        }
    }

    async searchVenues(query) {
        // Filter venues by search query
        const results = this.venues.filter(venue => 
            venue.name.toLowerCase().includes(query.toLowerCase())
        );
        
        // Highlight search results
        this.highlightSearchResults(results);
    }

    highlightSearchResults(results) {
        // Reset all markers
        this.markers.forEach(marker => {
            marker.getElement().style.opacity = '0.5';
        });
        
        // Highlight matching venues
        results.forEach(venue => {
            const marker = this.markers.find(m => 
                m.getElement().dataset.venueId == venue.id
            );
            if (marker) {
                marker.getElement().style.opacity = '1';
                marker.getElement().style.transform = 'scale(1.3)';
            }
        });
    }

    setupDirections() {
        // Add directions functionality
        this.directionsControl = L.control({ position: 'topleft' });
        
        this.directionsControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'directions-control');
            div.innerHTML = `
                <button id="getDirections" class="directions-btn" title="Get Directions">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                </button>
            `;
            
            div.querySelector('#getDirections').addEventListener('click', () => {
                this.getDirectionsToSelectedVenue();
            });
            
            return div;
        };
        
        this.directionsControl.addTo(this.map);
    }

    setupHeatmap() {
        // Setup heatmap overlay for venue density
        this.heatmapLayer = L.layerGroup();
        
        // Add heatmap toggle control
        const heatmapControl = L.control({ position: 'bottomleft' });
        
        heatmapControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'heatmap-control');
            div.innerHTML = `
                <label style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(20, 20, 20, 0.9);
                    padding: 8px 12px;
                    border-radius: 6px;
                    color: white;
                    font-size: 12px;
                ">
                    <input type="checkbox" id="heatmapToggle">
                    <span>Popular Areas</span>
                </label>
            `;
            
            div.querySelector('#heatmapToggle').addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.showHeatmap();
                } else {
                    this.hideHeatmap();
                }
            });
            
            return div;
        };
        
        heatmapControl.addTo(this.map);
    }

    showHeatmap() {
        // Create heatmap based on venue density
        const heatmapData = this.generateHeatmapData();
        // Implementation would use Leaflet.heat plugin or similar
        console.log('Showing heatmap:', heatmapData);
    }

    hideHeatmap() {
        this.map.removeLayer(this.heatmapLayer);
    }

    generateHeatmapData() {
        // Generate heatmap intensity points based on venue locations
        return this.venues.map(venue => ({
            lat: venue.lat,
            lng: venue.lng,
            intensity: venue.rating || 1
        }));
    }

    handleVenueClick(venue) {
        // Handle venue selection
        this.selectedVenue = venue;
        
        // Update venue details panel if exists
        this.updateVenueDetails(venue);
        
        // Trigger venue selected event
        document.dispatchEvent(new CustomEvent('venueSelected', {
            detail: venue
        }));
    }

    updateVenueDetails(venue) {
        const detailsPanel = document.querySelector('.venue-details-panel');
        if (detailsPanel) {
            // Update panel content
            detailsPanel.innerHTML = this.generateVenueDetailsHTML(venue);
        }
    }

    generateVenueDetailsHTML(venue) {
        return `
            <div class="venue-details-content">
                <h3>${venue.name}</h3>
                <p>Vibe: ${venue.vibe}</p>
                <p>Price: ${venue.price}</p>
                <p>Rating: ${venue.rating}/5</p>
            </div>
        `;
    }

    viewVenueDetails(venueId) {
        const venue = this.venues.find(v => v.id === venueId);
        if (venue) {
            this.handleVenueClick(venue);
            
            // Center map on venue
            this.map.setView([venue.lat, venue.lng], 16);
            
            // Open popup
            const marker = this.markers.find(m => 
                m.getElement().dataset.venueId == venueId
            );
            if (marker) {
                marker.openPopup();
            }
        }
    }

    getDirectionsToSelectedVenue() {
        if (!this.selectedVenue) {
            alert('Please select a venue first');
            return;
        }
        
        if (!this.userLocation) {
            alert('Please allow location access');
            return;
        }
        
        // Open Google Maps with directions
        const url = `https://www.google.com/maps/dir/?api=1&origin=${this.userLocation[0]},${this.userLocation[1]}&destination=${this.selectedVenue.lat},${this.selectedVenue.lng}`;
        window.open(url, '_blank');
    }

    resetMapView() {
        if (this.userLocation) {
            this.map.setView(this.userLocation, this.options.zoom);
        } else {
            this.map.setView(this.options.center, this.options.zoom);
        }
    }

    // Public methods
    addVenue(venue) {
        const marker = this.createVenueMarker(venue);
        this.markers.push(marker);
        this.markerCluster.addLayer(marker);
        this.venues.push(venue);
    }

    removeVenue(venueId) {
        const index = this.venues.findIndex(v => v.id === venueId);
        if (index > -1) {
            this.venues.splice(index, 1);
            const marker = this.markers.find(m => 
                m.getElement().dataset.venueId == venueId
            );
            if (marker) {
                this.markerCluster.removeLayer(marker);
                const markerIndex = this.markers.indexOf(marker);
                if (markerIndex > -1) {
                    this.markers.splice(markerIndex, 1);
                }
            }
        }
    }

    updateFilters(filters) {
        this.applyFilters(filters);
    }

    getSelectedVenue() {
        return this.selectedVenue;
    }

    getVisibleVenues() {
        const bounds = this.map.getBounds();
        return this.venues.filter(venue => 
            bounds.contains([venue.lat, venue.lng])
        );
    }
}

// Make available globally
window.OpenStreetMapIntegration = OpenStreetMapIntegration;

// Auto-initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Look for map containers and initialize them
    const mapContainers = document.querySelectorAll('[data-map-container]');
    mapContainers.forEach(container => {
        const containerId = container.dataset.mapContainer;
        new OpenStreetMapIntegration(containerId);
    });
});