// Complete Google Maps Integration - Advanced Features
// Real-time location, route planning, venue markers, friend overlays, multiple views

class MapsManager {
    constructor() {
        this.map = null;
        this.markers = [];
        this.userMarker = null;
        this.friendMarkers = [];
        this.venueMarkers = [];
        this.markerClusterer = null;
        this.currentView = 'all'; // all, friends, trending, events, saved
        this.userLocation = null;
        this.directionsService = null;
        this.directionsRenderer = null;
        this.infoWindow = null;
        this.venues = [];
        this.friends = [];
        this.init();
    }

    async init() {
        await this.loadGoogleMaps();
        this.setupMapControls();
        this.loadVenues();
        this.loadFriends();
        this.setupEventListeners();
    }

    async loadGoogleMaps() {
        // Check if Google Maps is already loaded
        if (typeof google !== 'undefined' && google.maps) {
            this.initializeMap();
            return;
        }

        // Load Google Maps API
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API_KEY}&libraries=places,geometry&callback=initMap`;
        script.async = true;
        script.defer = true;
        
        window.initMap = () => {
            this.initializeMap();
        };
        
        document.head.appendChild(script);
    }

    initializeMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.warn('Map container not found');
            return;
        }

        // Default center (Boston)
        const defaultCenter = { lat: 42.3601, lng: -71.0589 };

        // Map options with dark theme
        const mapOptions = {
            center: defaultCenter,
            zoom: 13,
            styles: this.getDarkMapStyles(),
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
                position: google.maps.ControlPosition.TOP_RIGHT
            },
            streetViewControl: true,
            streetViewControlOptions: {
                position: google.maps.ControlPosition.RIGHT_BOTTOM
            },
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
            },
            fullscreenControl: true,
            fullscreenControlOptions: {
                position: google.maps.ControlPosition.RIGHT_TOP
            }
        };

        this.map = new google.maps.Map(mapContainer, mapOptions);
        
        // Initialize services
        this.directionsService = new google.maps.DirectionsService();
        this.directionsRenderer = new google.maps.DirectionsRenderer({
            map: this.map,
            suppressMarkers: false,
            polylineOptions: {
                strokeColor: '#D4AF37',
                strokeWeight: 4
            }
        });
        
        this.infoWindow = new google.maps.InfoWindow();

        // Get user location
        this.getUserLocation();
        
        // Load markers
        this.loadAllMarkers();
    }

    getDarkMapStyles() {
        return [
            { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#b0b0b0" }] },
            {
                featureType: "administrative.locality",
                elementType: "labels.text.fill",
                stylers: [{ color: "#D4AF37" }]
            },
            {
                featureType: "poi",
                elementType: "labels.text.fill",
                stylers: [{ color: "#b0b0b0" }]
            },
            {
                featureType: "poi.park",
                elementType: "geometry",
                stylers: [{ color: "#263c3f" }]
            },
            {
                featureType: "poi.park",
                elementType: "labels.text.fill",
                stylers: [{ color: "#6b9a76" }]
            },
            {
                featureType: "road",
                elementType: "geometry",
                stylers: [{ color: "#2a2a2a" }]
            },
            {
                featureType: "road",
                elementType: "geometry.stroke",
                stylers: [{ color: "#1a1a1a" }]
            },
            {
                featureType: "road",
                elementType: "labels.text.fill",
                stylers: [{ color: "#8a8a8a" }]
            },
            {
                featureType: "road.highway",
                elementType: "geometry",
                stylers: [{ color: "#3a3a3a" }]
            },
            {
                featureType: "road.highway",
                elementType: "geometry.stroke",
                stylers: [{ color: "#1f2833" }]
            },
            {
                featureType: "road.highway",
                elementType: "labels.text.fill",
                stylers: [{ color: "#D4AF37" }]
            },
            {
                featureType: "transit",
                elementType: "geometry",
                stylers: [{ color: "#2f3948" }]
            },
            {
                featureType: "transit.station",
                elementType: "labels.text.fill",
                stylers: [{ color: "#b0b0b0" }]
            },
            {
                featureType: "water",
                elementType: "geometry",
                stylers: [{ color: "#0f1419" }]
            },
            {
                featureType: "water",
                elementType: "labels.text.fill",
                stylers: [{ color: "#4e6d70" }]
            }
        ];
    }

    getUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    // Center map on user location
                    this.map.setCenter(this.userLocation);
                    
                    // Add user marker
                    this.addUserMarker();
                    
                    // Notify success
                    this.showNotification('Location found!', 'success');
                },
                (error) => {
                    console.warn('Geolocation error:', error);
                    this.showNotification('Could not get your location', 'info');
                }
            );
        }
    }

    addUserMarker() {
        if (!this.userLocation) return;

        // Remove existing user marker
        if (this.userMarker) {
            this.userMarker.setMap(null);
        }

        // Create custom user marker
        this.userMarker = new google.maps.Marker({
            position: this.userLocation,
            map: this.map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3
            },
            title: 'Your Location',
            zIndex: 1000
        });

        // Add accuracy circle
        new google.maps.Circle({
            map: this.map,
            center: this.userLocation,
            radius: 100,
            fillColor: '#4285F4',
            fillOpacity: 0.1,
            strokeColor: '#4285F4',
            strokeOpacity: 0.3,
            strokeWeight: 1
        });
    }

    loadVenues() {
        // In production, fetch from API
        this.venues = this.generateSampleVenues();
    }

    generateSampleVenues() {
        const venues = [];
        const types = ['restaurant', 'bar', 'nightclub', 'event'];
        const names = [
            'Trattoria Toscana', 'The Sushi Bar', 'Taco Fiesta', 'Le Bistro',
            'The Burger Joint', 'Cocktail Lounge', 'Jazz Club', 'Dance Floor',
            'Wine Bar', 'Rooftop Terrace', 'Sports Bar', 'Live Music Venue'
        ];

        // Boston area coordinates
        const baseLatLng = { lat: 42.3601, lng: -71.0589 };

        for (let i = 0; i < 50; i++) {
            venues.push({
                id: i + 1,
                name: names[i % names.length] + ' ' + (Math.floor(i / names.length) + 1),
                type: types[i % types.length],
                position: {
                    lat: baseLatLng.lat + (Math.random() - 0.5) * 0.05,
                    lng: baseLatLng.lng + (Math.random() - 0.5) * 0.05
                },
                rating: (4 + Math.random()).toFixed(1),
                price: ['$', '$$', '$$$'][Math.floor(Math.random() * 3)],
                image: '/assets/img/placeholder-venue.svg',
                trending: Math.random() > 0.7,
                saved: Math.random() > 0.8
            });
        }

        return venues;
    }

    loadFriends() {
        // In production, fetch from API
        this.friends = [
            {
                id: 1,
                name: 'Sarah Chen',
                avatar: 'https://i.pravatar.cc/150?img=2',
                position: { lat: 42.3651, lng: -71.0589 },
                status: 'At Trattoria Toscana',
                online: true
            },
            {
                id: 2,
                name: 'Mike Johnson',
                avatar: 'https://i.pravatar.cc/150?img=3',
                position: { lat: 42.3551, lng: -71.0639 },
                status: 'At The Sushi Bar',
                online: true
            },
            {
                id: 3,
                name: 'Emily Davis',
                avatar: 'https://i.pravatar.cc/150?img=4',
                position: { lat: 42.3601, lng: -71.0539 },
                status: 'At Jazz Club',
                online: true
            }
        ];
    }

    loadAllMarkers() {
        this.clearMarkers();
        
        switch(this.currentView) {
            case 'all':
                this.loadVenueMarkers();
                this.loadFriendMarkers();
                break;
            case 'friends':
                this.loadFriendMarkers();
                break;
            case 'trending':
                this.loadTrendingMarkers();
                break;
            case 'events':
                this.loadEventMarkers();
                break;
            case 'saved':
                this.loadSavedMarkers();
                break;
        }
    }

    loadVenueMarkers() {
        this.venues.forEach(venue => {
            const marker = this.createVenueMarker(venue);
            this.venueMarkers.push(marker);
        });

        // Add marker clustering
        if (this.markerClusterer) {
            this.markerClusterer.clearMarkers();
        }
        
        this.markerClusterer = new markerClusterer.MarkerClusterer({
            map: this.map,
            markers: this.venueMarkers,
            algorithm: new markerClusterer.SuperClusterAlgorithm({ radius: 100 })
        });
    }

    createVenueMarker(venue) {
        const icon = this.getVenueIcon(venue.type);
        
        const marker = new google.maps.Marker({
            position: venue.position,
            map: this.map,
            icon: icon,
            title: venue.name,
            animation: google.maps.Animation.DROP
        });

        // Add click listener
        marker.addListener('click', () => {
            this.showVenueInfo(venue, marker);
        });

        return marker;
    }

    getVenueIcon(type) {
        const icons = {
            restaurant: '🍽️',
            bar: '🍸',
            nightclub: '🎵',
            event: '🎉'
        };

        return {
            url: `data:image/svg+xml,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="#D4AF37" opacity="0.9"/>
                    <text x="20" y="28" font-size="20" text-anchor="middle">${icons[type] || '📍'}</text>
                </svg>
            `)}`,
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 40)
        };
    }

    showVenueInfo(venue, marker) {
        const content = `
            <div class="map-info-window">
                <img src="${venue.image}" alt="${venue.name}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; margin-bottom: 12px;">
                <h3 style="margin: 0 0 8px 0; color: #ffffff;">${venue.name}</h3>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <span style="color: #D4AF37;">⭐ ${venue.rating}</span>
                    <span style="color: #b0b0b0;">${venue.price}</span>
                    ${venue.trending ? '<span style="color: #ff6b6b;">🔥 Trending</span>' : ''}
                </div>
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button onclick="mapsManager.getDirections(${venue.position.lat}, ${venue.position.lng})" 
                            style="flex: 1; padding: 8px; background: #D4AF37; color: #0a0a0a; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Directions
                    </button>
                    <button onclick="window.location.href='venue.html?id=${venue.id}'" 
                            style="flex: 1; padding: 8px; background: rgba(255,255,255,0.1); color: #ffffff; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer;">
                        View Details
                    </button>
                </div>
            </div>
        `;

        this.infoWindow.setContent(content);
        this.infoWindow.open(this.map, marker);
    }

    loadFriendMarkers() {
        this.friends.forEach(friend => {
            if (friend.online) {
                const marker = this.createFriendMarker(friend);
                this.friendMarkers.push(marker);
            }
        });
    }

    createFriendMarker(friend) {
        const marker = new google.maps.Marker({
            position: friend.position,
            map: this.map,
            icon: {
                url: friend.avatar,
                scaledSize: new google.maps.Size(40, 40),
                anchor: new google.maps.Point(20, 40)
            },
            title: friend.name,
            zIndex: 999
        });

        marker.addListener('click', () => {
            this.showFriendInfo(friend, marker);
        });

        return marker;
    }

    showFriendInfo(friend, marker) {
        const content = `
            <div class="map-info-window">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <img src="${friend.avatar}" alt="${friend.name}" 
                         style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid #D4AF37;">
                    <div>
                        <h3 style="margin: 0; color: #ffffff;">${friend.name}</h3>
                        <p style="margin: 4px 0 0 0; color: #b0b0b0; font-size: 0.875rem;">${friend.status}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.location.href='profile.html?id=${friend.id}'" 
                            style="flex: 1; padding: 8px; background: #D4AF37; color: #0a0a0a; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        View Profile
                    </button>
                    <button onclick="alert('Message feature coming soon!')" 
                            style="flex: 1; padding: 8px; background: rgba(255,255,255,0.1); color: #ffffff; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer;">
                        Message
                    </button>
                </div>
            </div>
        `;

        this.infoWindow.setContent(content);
        this.infoWindow.open(this.map, marker);
    }

    loadTrendingMarkers() {
        const trending = this.venues.filter(v => v.trending);
        trending.forEach(venue => {
            const marker = this.createVenueMarker(venue);
            this.venueMarkers.push(marker);
        });
    }

    loadEventMarkers() {
        const events = this.venues.filter(v => v.type === 'event');
        events.forEach(venue => {
            const marker = this.createVenueMarker(venue);
            this.venueMarkers.push(marker);
        });
    }

    loadSavedMarkers() {
        const saved = this.venues.filter(v => v.saved);
        saved.forEach(venue => {
            const marker = this.createVenueMarker(venue);
            this.venueMarkers.push(marker);
        });
    }

    clearMarkers() {
        // Clear venue markers
        this.venueMarkers.forEach(marker => marker.setMap(null));
        this.venueMarkers = [];
        
        // Clear friend markers
        this.friendMarkers.forEach(marker => marker.setMap(null));
        this.friendMarkers = [];
        
        // Clear clusterer
        if (this.markerClusterer) {
            this.markerClusterer.clearMarkers();
        }
    }

    getDirections(destLat, destLng) {
        if (!this.userLocation) {
            this.showNotification('Please enable location services', 'error');
            return;
        }

        const request = {
            origin: this.userLocation,
            destination: { lat: destLat, lng: destLng },
            travelMode: google.maps.TravelMode.DRIVING
        };

        this.directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                this.directionsRenderer.setDirections(result);
                
                // Show route info
                const route = result.routes[0].legs[0];
                this.showNotification(
                    `Distance: ${route.distance.text}, Duration: ${route.duration.text}`,
                    'success'
                );
            } else {
                this.showNotification('Could not calculate route', 'error');
            }
        });
    }

    clearDirections() {
        this.directionsRenderer.setDirections({ routes: [] });
    }

    switchView(view) {
        this.currentView = view;
        this.loadAllMarkers();
        
        // Update active button
        document.querySelectorAll('.map-view-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            }
        });
    }

    setupMapControls() {
        // This will be called after map is initialized
        // Controls are set up in HTML
    }

    setupEventListeners() {
        // View switcher buttons
        document.querySelectorAll('.map-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });

        // Locate button
        const locateBtn = document.getElementById('locateBtn');
        if (locateBtn) {
            locateBtn.addEventListener('click', () => {
                this.getUserLocation();
            });
        }

        // Reset button
        const resetBtn = document.getElementById('resetMapBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.clearDirections();
                if (this.userLocation) {
                    this.map.setCenter(this.userLocation);
                    this.map.setZoom(13);
                }
            });
        }

        // List view toggle
        const listViewBtn = document.getElementById('listViewBtn');
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => {
                this.toggleListView();
            });
        }
    }

    toggleListView() {
        const listContainer = document.getElementById('venueListContainer');
        if (listContainer) {
            listContainer.classList.toggle('active');
            this.renderVenueList();
        }
    }

    renderVenueList() {
        const container = document.getElementById('venueListContainer');
        if (!container) return;

        const venues = this.getVisibleVenues();
        
        container.innerHTML = `
            <div class="venue-list-header">
                <h3>Nearby Venues (${venues.length})</h3>
                <button onclick="mapsManager.toggleListView()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="venue-list-items">
                ${venues.map(venue => `
                    <div class="venue-list-item" onclick="mapsManager.focusVenue(${venue.id})">
                        <img src="${venue.image}" alt="${venue.name}">
                        <div class="venue-list-info">
                            <h4>${venue.name}</h4>
                            <div class="venue-list-meta">
                                <span>⭐ ${venue.rating}</span>
                                <span>${venue.price}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getVisibleVenues() {
        // Return venues based on current view
        switch(this.currentView) {
            case 'trending':
                return this.venues.filter(v => v.trending);
            case 'events':
                return this.venues.filter(v => v.type === 'event');
            case 'saved':
                return this.venues.filter(v => v.saved);
            default:
                return this.venues;
        }
    }

    focusVenue(venueId) {
        const venue = this.venues.find(v => v.id === venueId);
        if (venue) {
            this.map.setCenter(venue.position);
            this.map.setZoom(16);
            
            // Find and click the marker
            const marker = this.venueMarkers.find(m => m.getTitle() === venue.name);
            if (marker) {
                google.maps.event.trigger(marker, 'click');
            }
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `map-notification map-notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize when DOM is ready
let mapsManager;
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on a page with a map
    if (document.getElementById('map')) {
        mapsManager = new MapsManager();
    }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapsManager;
}