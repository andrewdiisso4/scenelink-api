// Nightlife Page Enhanced Functionality
// Complete modal, map, filter, and legend integration

class NightlifeEnhanced {
    constructor() {
        this.init();
        this.venues = this.getVenueData();
        this.activeFilters = {
            type: 'all',
            vibe: 'all',
            price: 'all'
        };
        this.mapInstance = null;
        this.markers = [];
    }

    init() {
        this.setupModalClose();
        this.setupMapControls();
        this.setupLegend();
        this.setupFilters();
        this.setupSearch();
        this.fixHeaderLinks();
        this.initializeMap();
        this.loadVenues();
    }

    // 1. Enhanced Modal Close Functionality
    setupModalClose() {
        document.addEventListener('click', (e) => {
            // Close modal with X button
            if (e.target.closest('.modal-close')) {
                e.preventDefault();
                this.closeAllModals();
            }
            
            // Close modal by clicking outside
            if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('venue-details-modal')) {
                this.closeAllModals();
            }
            
            // Close with Escape key
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Add X icon to existing modals that don't have it
        this.addCloseIconToModals();
    }

    addCloseIconToModals() {
        const modals = document.querySelectorAll('.venue-details-modal, .nightlife-modal, .modal');
        modals.forEach(modal => {
            if (!modal.querySelector('.modal-close')) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'modal-close';
                closeBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                `;
                closeBtn.setAttribute('aria-label', 'Close modal');
                modal.appendChild(closeBtn);
            }
        });
    }

    closeAllModals() {
        const modals = document.querySelectorAll('.venue-details-modal, .nightlife-modal, .modal');
        modals.forEach(modal => {
            modal.style.display = 'none';
            modal.classList.remove('show');
        });
        document.body.style.overflow = '';
    }

    // 2. Map Control Placement Fix
    setupMapControls() {
        // Wait for map to load
        setTimeout(() => {
            this.repositionMapControls();
            this.addResetControl();
        }, 1000);
    }

    repositionMapControls() {
        const zoomControl = document.querySelector('.leaflet-control-zoom');
        if (zoomControl) {
            zoomControl.style.cssText = `
                top: 20px !important;
                right: 20px !important;
                margin-bottom: 60px !important;
                z-index: 1000 !important;
            `;
        }
    }

    addResetControl() {
        const mapContainer = document.getElementById('nightlifeMap');
        if (mapContainer && !mapContainer.querySelector('.map-reset-control')) {
            const resetBtn = document.createElement('button');
            resetBtn.className = 'map-reset-control';
            resetBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 4v6h6"></path>
                    <path d="M23 20v-6h-6"></path>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                </svg>
                <span>Reset View</span>
            `;
            resetBtn.addEventListener('click', () => this.resetMapView());
            mapContainer.appendChild(resetBtn);
        }
    }

    resetMapView() {
        if (this.mapInstance) {
            this.mapInstance.setView([42.3601, -71.0589], 13); // Boston coordinates
        } else {
            // Fallback for non-Leaflet maps
            window.location.reload();
        }
    }

    // 3. Legend Functionality
    setupLegend() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.legend-item')) {
                const item = e.target.closest('.legend-item');
                const type = item.dataset.type;
                
                // Toggle active state
                item.classList.toggle('active');
                
                // Update filters
                this.activeFilters.type = item.classList.contains('active') ? type : 'all';
                
                // Filter venues and map markers
                this.filterVenues();
                this.updateMapMarkers();
            }
        });
    }

    // 4. Enhanced Filter and Map Integration
    setupFilters() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-option')) {
                const option = e.target;
                const filterGroup = option.closest('.filter-group');
                const filterType = filterGroup.dataset.filter;
                
                // Update active state
                filterGroup.querySelectorAll('.filter-option').forEach(opt => {
                    opt.classList.remove('active');
                });
                option.classList.add('active');
                
                // Update filter
                this.activeFilters[filterType] = option.dataset.value;
                
                // Apply filters
                this.filterVenues();
                this.updateMapMarkers();
            }
        });
    }

    filterVenues() {
        const filteredVenues = this.venues.filter(venue => {
            if (this.activeFilters.type !== 'all' && venue.type !== this.activeFilters.type) {
                return false;
            }
            if (this.activeFilters.vibe !== 'all' && !venue.vibes.includes(this.activeFilters.vibe)) {
                return false;
            }
            if (this.activeFilters.price !== 'all' && venue.price !== this.activeFilters.price) {
                return false;
            }
            return true;
        });

        this.displayFilteredVenues(filteredVenues);
    }

    displayFilteredVenues(venues) {
        const container = document.querySelector('.nightlife-venue-listings');
        if (container) {
            container.innerHTML = venues.map(venue => `
                <div class="venue-listing-card" data-venue-id="${venue.id}" data-type="${venue.type}">
                    <div class="venue-type-indicator ${venue.type}"></div>
                    <div class="venue-image">
                        <img src="${venue.image}" alt="${venue.name}">
                    </div>
                    <div class="venue-info">
                        <h3>${venue.name}</h3>
                        <p class="venue-type">${venue.type.charAt(0).toUpperCase() + venue.type.slice(1)}</p>
                        <p class="venue-price">${'$'.repeat(venue.priceLevel)}</p>
                        <div class="venue-vibes">
                            ${venue.vibes.map(vibe => `<span class="vibe-tag">${vibe}</span>`).join('')}
                        </div>
                    </div>
                    <div class="venue-actions">
                        <button class="view-venue-btn" data-venue-id="${venue.id}">View Details</button>
                        <button class="directions-btn" data-venue="${venue.name}">Directions</button>
                    </div>
                </div>
            `).join('');

            // Add venue click handlers
            container.querySelectorAll('.view-venue-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const venueId = e.target.dataset.venueId;
                    this.showVenueDetails(venueId);
                });
            });
        }
    }

    updateMapMarkers() {
        // Remove existing markers
        this.markers.forEach(marker => {
            if (marker.remove) {
                marker.remove();
            }
        });
        this.markers = [];

        // Add filtered markers
        const filteredVenues = this.venues.filter(venue => {
            if (this.activeFilters.type !== 'all' && venue.type !== this.activeFilters.type) {
                return false;
            }
            return true;
        });

        filteredVenues.forEach(venue => {
            this.addMapMarker(venue);
        });
    }

    addMapMarker(venue) {
        // This would integrate with your map library (Leaflet, Google Maps, etc.)
        // For now, we'll create a placeholder marker system
        const marker = {
            id: venue.id,
            position: venue.coordinates,
            type: venue.type,
            venue: venue,
            remove: () => {
                // Remove marker from map
                const element = document.querySelector(`[data-marker-id="${venue.id}"]`);
                if (element) element.remove();
            }
        };

        this.markers.push(marker);
    }

    // 5. Search Venue Bar Enhancement
    setupSearch() {
        const searchInput = document.querySelector('.search-venue-input');
        const searchBtn = document.querySelector('.search-venue-btn');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                this.searchVenues(query);
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch();
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.performSearch();
            });
        }
    }

    searchVenues(query) {
        if (!query) {
            this.filterVenues();
            return;
        }

        const searchResults = this.venues.filter(venue => 
            venue.name.toLowerCase().includes(query) ||
            venue.type.toLowerCase().includes(query) ||
            venue.vibes.some(vibe => vibe.toLowerCase().includes(query))
        );

        this.displayFilteredVenues(searchResults);
    }

    performSearch() {
        const searchInput = document.querySelector('.search-venue-input');
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        
        if (query) {
            this.searchVenues(query);
            this.showNotification(`Searching for "${query}"...`, 'info');
        }
    }

    // 6. Header Link Fix
    fixHeaderLinks() {
        const nightlifeLink = document.querySelector('a[href="nightlife.html"]');
        const tonightPicksLink = document.querySelector('a[href="tonight.html"]');

        if (nightlifeLink) {
            nightlifeLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'nightlife.html';
            });
        }

        if (tonightPicksLink) {
            tonightPicksLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'tonight.html';
            });
        }
    }

    // Helper Methods
    getVenueData() {
        return [
            {
                id: 1,
                name: 'The Library',
                type: 'bar',
                priceLevel: 2,
                vibes: ['cocktail', 'upscale', 'quiet'],
                coordinates: [42.3601, -71.0589],
                image: 'https://picsum.photos/seed/library/400/300.jpg',
                address: '15 Commonwealth Ave, Boston'
            },
            {
                id: 2,
                name: 'Venue 560',
                type: 'nightclub',
                priceLevel: 3,
                vibes: ['dance', 'loud', 'crowded'],
                coordinates: [42.3505, -71.1054],
                image: 'https://picsum.photos/seed/venue560/400/300.jpg',
                address: '560 Tremont St, Boston'
            },
            {
                id: 3,
                name: 'The Grand',
                type: 'lounge',
                priceLevel: 4,
                vibes: ['luxury', 'chill', 'music'],
                coordinates: [42.3490, -71.0781],
                image: 'https://picsum.photos/seed/grand/400/300.jpg',
                address: '496 Washington St, Boston'
            }
        ];
    }

    loadVenues() {
        this.displayFilteredVenues(this.venues);
        this.updateMapMarkers();
    }

    showVenueDetails(venueId) {
        const venue = this.venues.find(v => v.id === venueId);
        if (venue) {
            // Create and show venue details modal
            this.showNotification(`Loading details for ${venue.name}...`, 'info');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            this.removeNotification(notification);
        }, 3000);
    }

    removeNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }

    initializeMap() {
        // Initialize map with Boston coordinates
        // This would integrate with your actual map library
        setTimeout(() => {
            this.repositionMapControls();
        }, 2000);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new NightlifeEnhanced();
});