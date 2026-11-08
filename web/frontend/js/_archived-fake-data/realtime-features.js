// Real-time Features System
// Implements live venue availability, friend locations, and dynamic map views

class RealTimeFeatures {
    constructor() {
        this.updateInterval = 30000; // 30 seconds
        this.friendLocations = new Map();
        this.venueAvailability = new Map();
        this.activeView = 'all';
        this.init();
    }

    init() {
        this.setupRealtimeUpdates();
        this.setupMapViews();
        this.setupFriendLocationTracking();
        this.setupVenueAvailability();
        this.createMapLegend();
    }

    // ============================================
    // REAL-TIME VENUE AVAILABILITY
    // ============================================

    setupVenueAvailability() {
        // Start polling for venue availability
        this.updateVenueAvailability();
        setInterval(() => this.updateVenueAvailability(), this.updateInterval);
    }

    async updateVenueAvailability() {
        // In production, this would fetch from API
        // Simulating real-time availability data
        const venues = document.querySelectorAll('.venue-card');
        
        venues.forEach(venueCard => {
            const venueId = venueCard.dataset.venueId;
            const availability = this.generateAvailability();
            
            this.venueAvailability.set(venueId, availability);
            this.updateVenueAvailabilityUI(venueCard, availability);
        });
    }

    generateAvailability() {
        const statuses = ['available', 'limited', 'busy', 'full'];
        const weights = [0.3, 0.3, 0.25, 0.15]; // Probability distribution
        
        const random = Math.random();
        let cumulative = 0;
        
        for (let i = 0; i < statuses.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) {
                return {
                    status: statuses[i],
                    waitTime: this.calculateWaitTime(statuses[i]),
                    lastUpdated: new Date().toISOString(),
                    tablesAvailable: this.calculateTablesAvailable(statuses[i])
                };
            }
        }
        
        return { status: 'available', waitTime: 0, tablesAvailable: 5 };
    }

    calculateWaitTime(status) {
        const waitTimes = {
            'available': 0,
            'limited': Math.floor(Math.random() * 15) + 5,
            'busy': Math.floor(Math.random() * 30) + 15,
            'full': Math.floor(Math.random() * 45) + 30
        };
        return waitTimes[status] || 0;
    }

    calculateTablesAvailable(status) {
        const tables = {
            'available': Math.floor(Math.random() * 5) + 5,
            'limited': Math.floor(Math.random() * 3) + 2,
            'busy': Math.floor(Math.random() * 2) + 1,
            'full': 0
        };
        return tables[status] || 0;
    }

    updateVenueAvailabilityUI(venueCard, availability) {
        // Remove existing availability badge
        const existingBadge = venueCard.querySelector('.availability-badge');
        if (existingBadge) existingBadge.remove();

        // Create new availability badge
        const badge = document.createElement('div');
        badge.className = `availability-badge ${availability.status}`;
        
        const statusText = {
            'available': 'Available Now',
            'limited': `${availability.waitTime} min wait`,
            'busy': `${availability.waitTime} min wait`,
            'full': 'Fully Booked'
        };

        const statusIcons = {
            'available': '✓',
            'limited': '⏱',
            'busy': '⏱',
            'full': '✕'
        };

        badge.innerHTML = `
            <span class="status-icon">${statusIcons[availability.status]}</span>
            <span class="status-text">${statusText[availability.status]}</span>
        `;

        // Add to venue card
        const venueHeader = venueCard.querySelector('.venue-header') || venueCard;
        venueHeader.appendChild(badge);

        // Add detailed availability info
        this.addAvailabilityDetails(venueCard, availability);
    }

    addAvailabilityDetails(venueCard, availability) {
        let detailsContainer = venueCard.querySelector('.availability-details');
        
        if (!detailsContainer) {
            detailsContainer = document.createElement('div');
            detailsContainer.className = 'availability-details';
            venueCard.appendChild(detailsContainer);
        }

        detailsContainer.innerHTML = `
            <div class="availability-info">
                <div class="info-item">
                    <i class="fas fa-clock"></i>
                    <span>Wait: ${availability.waitTime === 0 ? 'None' : availability.waitTime + ' min'}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-chair"></i>
                    <span>${availability.tablesAvailable} tables available</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-sync"></i>
                    <span>Updated ${this.getTimeAgo(availability.lastUpdated)}</span>
                </div>
            </div>
        `;
    }

    // ============================================
    // FRIEND LOCATION TRACKING
    // ============================================

    setupFriendLocationTracking() {
        // Request user's location permission
        this.requestLocationPermission();
        
        // Start tracking friend locations
        this.updateFriendLocations();
        setInterval(() => this.updateFriendLocations(), this.updateInterval);
    }

    requestLocationPermission() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    this.updateUserLocationOnMap();
                },
                (error) => {
                    console.log('Location permission denied:', error);
                }
            );
        }
    }

    async updateFriendLocations() {
        // In production, this would fetch from API
        // Simulating friend location data
        const friends = this.generateFriendLocations();
        
        friends.forEach(friend => {
            this.friendLocations.set(friend.id, friend);
        });

        this.updateFriendMarkersOnMap();
    }

    generateFriendLocations() {
        // Simulate friend locations around Boston
        const bostonCenter = { lat: 42.3601, lng: -71.0589 };
        const friends = [];

        const friendNames = [
            'Sarah Chen', 'Mike Johnson', 'Emma Davis', 'Alex Rodriguez',
            'Lisa Wang', 'Tom Brown', 'Jessica Lee', 'David Kim'
        ];

        friendNames.forEach((name, index) => {
            // Random location within ~5 miles of Boston center
            const latOffset = (Math.random() - 0.5) * 0.1;
            const lngOffset = (Math.random() - 0.5) * 0.1;

            friends.push({
                id: index + 1,
                name: name,
                location: {
                    lat: bostonCenter.lat + latOffset,
                    lng: bostonCenter.lng + lngOffset
                },
                venue: this.getRandomVenue(),
                status: Math.random() > 0.5 ? 'at-venue' : 'nearby',
                lastUpdated: new Date().toISOString(),
                sharingLocation: Math.random() > 0.3 // 70% share location
            });
        });

        return friends;
    }

    getRandomVenue() {
        const venues = [
            'Skyline Rooftop Bar',
            'The Underground Club',
            'Bella Vista',
            'Harbor Lights',
            'Urban Kitchen',
            'Jazz Corner',
            'The Garden Bistro',
            'Sunset Lounge'
        ];
        return venues[Math.floor(Math.random() * venues.length)];
    }

    updateFriendMarkersOnMap() {
        if (!window.map) return;

        // Clear existing friend markers
        if (this.friendMarkers) {
            this.friendMarkers.forEach(marker => marker.setMap(null));
        }
        this.friendMarkers = [];

        // Add friend markers if in friends view
        if (this.activeView === 'friends' || this.activeView === 'all') {
            this.friendLocations.forEach(friend => {
                if (friend.sharingLocation) {
                    const marker = this.createFriendMarker(friend);
                    this.friendMarkers.push(marker);
                }
            });
        }
    }

    createFriendMarker(friend) {
        // Create custom friend marker
        const marker = new google.maps.Marker({
            position: friend.location,
            map: window.map,
            title: friend.name,
            icon: {
                url: `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.name)}&size=40&background=D4AF37&color=0a0a0a`,
                scaledSize: new google.maps.Size(40, 40)
            }
        });

        // Add info window
        const infoWindow = new google.maps.InfoWindow({
            content: this.createFriendInfoWindow(friend)
        });

        marker.addListener('click', () => {
            infoWindow.open(window.map, marker);
        });

        return marker;
    }

    createFriendInfoWindow(friend) {
        return `
            <div class="friend-info-window">
                <h4>${friend.name}</h4>
                <p class="friend-status">
                    <i class="fas fa-map-marker-alt"></i>
                    ${friend.status === 'at-venue' ? `At ${friend.venue}` : 'Nearby'}
                </p>
                <p class="friend-time">
                    <i class="fas fa-clock"></i>
                    ${this.getTimeAgo(friend.lastUpdated)}
                </p>
                <button class="btn-invite-friend" onclick="realtimeFeatures.inviteFriend(${friend.id})">
                    <i class="fas fa-user-plus"></i> Invite
                </button>
            </div>
        `;
    }

    updateUserLocationOnMap() {
        if (!window.map || !this.userLocation) return;

        // Add user location marker
        if (this.userMarker) {
            this.userMarker.setMap(null);
        }

        this.userMarker = new google.maps.Marker({
            position: this.userLocation,
            map: window.map,
            title: 'Your Location',
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
            }
        });

        // Center map on user location
        window.map.setCenter(this.userLocation);
    }

    // ============================================
    // MULTIPLE MAP VIEWS
    // ============================================

    setupMapViews() {
        this.views = {
            'all': this.showAllVenues.bind(this),
            'friends': this.showFriendsView.bind(this),
            'trending': this.showTrendingView.bind(this),
            'events': this.showEventsView.bind(this),
            'saved': this.showSavedView.bind(this)
        };
    }

    switchMapView(viewName) {
        if (!this.views[viewName]) return;

        this.activeView = viewName;
        this.views[viewName]();
        this.updateMapViewUI(viewName);
    }

    showAllVenues() {
        // Show all venue markers
        if (this.venueMarkers) {
            this.venueMarkers.forEach(marker => marker.setMap(window.map));
        }
        if (this.friendMarkers) {
            this.friendMarkers.forEach(marker => marker.setMap(window.map));
        }
    }

    showFriendsView() {
        // Show only friend locations and venues they're at
        if (this.venueMarkers) {
            this.venueMarkers.forEach(marker => marker.setMap(null));
        }
        this.updateFriendMarkersOnMap();
    }

    showTrendingView() {
        // Show only trending venues
        if (this.venueMarkers) {
            this.venueMarkers.forEach(marker => {
                const isTrending = marker.venue && marker.venue.trending;
                marker.setMap(isTrending ? window.map : null);
            });
        }
    }

    showEventsView() {
        // Show only venues with events tonight
        if (this.venueMarkers) {
            this.venueMarkers.forEach(marker => {
                const hasEvent = marker.venue && marker.venue.hasEvent;
                marker.setMap(hasEvent ? window.map : null);
            });
        }
    }

    showSavedView() {
        // Show only saved/favorited venues
        const savedVenues = this.getSavedVenues();
        if (this.venueMarkers) {
            this.venueMarkers.forEach(marker => {
                const isSaved = savedVenues.includes(marker.venue?.id);
                marker.setMap(isSaved ? window.map : null);
            });
        }
    }

    updateMapViewUI(viewName) {
        // Update view selector buttons
        document.querySelectorAll('.map-view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });
    }

    // ============================================
    // MAP LEGEND & CONTROLS
    // ============================================

    createMapLegend() {
        const legendHTML = `
            <div class="map-legend" id="mapLegend">
                <div class="legend-header">
                    <h4>Map Legend</h4>
                    <button class="legend-toggle" onclick="realtimeFeatures.toggleLegend()">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                </div>
                <div class="legend-content">
                    <div class="legend-section">
                        <h5>Venues</h5>
                        <div class="legend-item">
                            <span class="legend-marker restaurant"></span>
                            <span>Restaurant</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-marker bar"></span>
                            <span>Bar/Lounge</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-marker event"></span>
                            <span>Event Venue</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-marker nightlife"></span>
                            <span>Nightclub</span>
                        </div>
                    </div>
                    
                    <div class="legend-section">
                        <h5>Availability</h5>
                        <div class="legend-item">
                            <span class="legend-status available"></span>
                            <span>Available Now</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-status limited"></span>
                            <span>Limited Availability</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-status busy"></span>
                            <span>Busy</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-status full"></span>
                            <span>Fully Booked</span>
                        </div>
                    </div>
                    
                    <div class="legend-section">
                        <h5>Social</h5>
                        <div class="legend-item">
                            <span class="legend-marker friend"></span>
                            <span>Friend Location</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-marker user"></span>
                            <span>Your Location</span>
                        </div>
                    </div>
                    
                    <div class="legend-section">
                        <h5>Map Views</h5>
                        <div class="map-view-buttons">
                            <button class="map-view-btn active" data-view="all" onclick="realtimeFeatures.switchMapView('all')">
                                All
                            </button>
                            <button class="map-view-btn" data-view="friends" onclick="realtimeFeatures.switchMapView('friends')">
                                Friends
                            </button>
                            <button class="map-view-btn" data-view="trending" onclick="realtimeFeatures.switchMapView('trending')">
                                Trending
                            </button>
                            <button class="map-view-btn" data-view="events" onclick="realtimeFeatures.switchMapView('events')">
                                Events
                            </button>
                            <button class="map-view-btn" data-view="saved" onclick="realtimeFeatures.switchMapView('saved')">
                                Saved
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add legend to map container
        const mapContainer = document.querySelector('.map-container');
        if (mapContainer) {
            const legendDiv = document.createElement('div');
            legendDiv.innerHTML = legendHTML;
            mapContainer.appendChild(legendDiv.firstElementChild);
        }
    }

    toggleLegend() {
        const legend = document.getElementById('mapLegend');
        if (legend) {
            legend.classList.toggle('collapsed');
            const icon = legend.querySelector('.legend-toggle i');
            if (icon) {
                icon.className = legend.classList.contains('collapsed') 
                    ? 'fas fa-chevron-down' 
                    : 'fas fa-chevron-up';
            }
        }
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    setupRealtimeUpdates() {
        // WebSocket connection would go here in production
        console.log('Real-time updates initialized');
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    getSavedVenues() {
        const saved = localStorage.getItem('savedVenues');
        return saved ? JSON.parse(saved) : [];
    }

    inviteFriend(friendId) {
        const friend = this.friendLocations.get(friendId);
        if (friend) {
            if (typeof showNotification === 'function') {
                showNotification('success', 'Invitation Sent', `Invitation sent to ${friend.name}`);
            }
        }
    }
}

// Initialize Real-time Features
let realtimeFeatures;
document.addEventListener('DOMContentLoaded', () => {
    realtimeFeatures = new RealTimeFeatures();
    console.log('Real-time Features initialized');
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.realtimeFeatures = realtimeFeatures;
}