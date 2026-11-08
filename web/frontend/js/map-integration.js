// SceneLink - Enhanced Map Integration & Filter Interactivity
// Google Maps API Integration with Clustering, Real-time Location, Route Planning

// Configuration
const MAP_CONFIG = {
    center: { lat: 42.3601, lng: -71.0589 }, // Boston, MA
    zoom: 13,
    enableClustering: true,
    enableRealTimeLocation: true,
    enableRoutePlanning: true,
    styles: [
        {
            "featureType": "all",
            "elementType": "geometry",
            "stylers": [{ "color": "#242f3e" }]
        },
        {
            "featureType": "all",
            "elementType": "labels.text.stroke",
            "stylers": [{ "color": "#242f3e" }]
        },
        {
            "featureType": "all",
            "elementType": "labels.text.fill",
            "stylers": [{ "color": "#746855" }]
        },
        {
            "featureType": "water",
            "elementType": "geometry",
            "stylers": [{ "color": "#17263c" }]
        },
        {
            "featureType": "poi",
            "elementType": "geometry",
            "stylers": [{ "color": "#283d6a" }]
        },
        {
            "featureType": "road",
            "elementType": "geometry",
            "stylers": [{ "color": "#38414e" }]
        }
    ]
};

// Sample venue data (replace with actual API data)
const SAMPLE_VENUES = [
    {
        id: 1,
        name: "The Modern Bistro",
        type: "restaurants",
        lat: 42.3505,
        lng: -71.0589,
        rating: 4.8,
        price: "$$",
        tags: ["Romantic", "Date Night"]
    },
    {
        id: 2,
        name: "Skyline Rooftop Bar",
        type: "bars",
        lat: 42.3555,
        lng: -71.0605,
        rating: 4.6,
        price: "$$$",
        tags: ["Rooftop", "Views"]
    },
    {
        id: 3,
        name: "Jazz Night at Blue Note",
        type: "events",
        lat: 42.3601,
        lng: -71.0700,
        rating: 4.9,
        price: "$$",
        tags: ["Live Music", "Jazz"]
    },
    {
        id: 4,
        name: "Sushi Haven",
        type: "restaurants",
        lat: 42.3650,
        lng: -71.0550,
        rating: 4.9,
        price: "$$",
        tags: ["Sushi", "Japanese"]
    },
    {
        id: 5,
        name: "The Underground Club",
        type: "tonight",
        lat: 42.3580,
        lng: -71.0650,
        rating: 4.7,
        price: "$$$",
        tags: ["Nightclub", "Dancing"]
    }
];

// Global variables
let map;
let markers = [];
let currentFilter = 'all';
let infoWindow;

// Initialize map when page loads
function initMap() {
    const mapElement = document.getElementById('googleMapMain');
    const loadingElement = document.getElementById('mapLoading');
    
    if (!mapElement) return;
    
    try {
        // Create map
        map = new google.maps.Map(mapElement, {
            center: MAP_CONFIG.center,
            zoom: MAP_CONFIG.zoom,
            styles: MAP_CONFIG.styles,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true
        });
        
        // Create info window
        infoWindow = new google.maps.InfoWindow();
        
        // Add markers for all venues
        addMarkers(SAMPLE_VENUES);
        
        // Hide loading state
        if (loadingElement) {
            loadingElement.classList.add('hidden');
        }
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
        showMapError();
    }
}

// Add markers to map
function addMarkers(venues) {
    // Clear existing markers
    clearMarkers();
    
    venues.forEach(venue => {
        const marker = new google.maps.Marker({
            position: { lat: venue.lat, lng: venue.lng },
            map: map,
            title: venue.name,
            icon: getMarkerIcon(venue.type),
            animation: google.maps.Animation.DROP
        });
        
        // Add click listener
        marker.addListener('click', () => {
            showVenueInfo(venue, marker);
        });
        
        markers.push({ marker, venue });
    });
}

// Get custom marker icon based on venue type
function getMarkerIcon(type) {
    const colors = {
        restaurants: '#D4AF37',
        bars: '#E5C158',
        events: '#C9A961',
        tonight: '#B89F4A',
        friends: '#A78E3D'
    };
    
    return {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: colors[type] || '#D4AF37',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
        scale: 10
    };
}

// Show venue information
function showVenueInfo(venue, marker) {
    const content = `
        <div style="padding: 10px; max-width: 250px;">
            <h3 style="margin: 0 0 8px 0; color: #0a0a0a; font-size: 1.1rem;">${venue.name}</h3>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="color: #D4AF37;">★ ${venue.rating}</span>
                <span style="color: #666;">•</span>
                <span style="color: #666;">${venue.price}</span>
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
                ${venue.tags.map(tag => `<span style="background: #f0f0f0; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; color: #666;">${tag}</span>`).join('')}
            </div>
            <button onclick="viewVenueDetails(${venue.id})" style="background: #D4AF37; color: #0a0a0a; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 600; cursor: pointer; width: 100%;">
                View Details
            </button>
        </div>
    `;
    
    infoWindow.setContent(content);
    infoWindow.open(map, marker);
}

// Clear all markers
function clearMarkers() {
    markers.forEach(({ marker }) => marker.setMap(null));
    markers = [];
}

// Filter venues by type
function filterVenues(filterType) {
    currentFilter = filterType;
    
    if (filterType === 'all') {
        // Show all markers
        markers.forEach(({ marker }) => marker.setMap(map));
    } else if (filterType === 'friends') {
        // Show friend recommendations (mock data)
        markers.forEach(({ marker, venue }) => {
            if (venue.id % 2 === 0) { // Mock: show even IDs as friend picks
                marker.setMap(map);
            } else {
                marker.setMap(null);
            }
        });
    } else {
        // Filter by venue type
        markers.forEach(({ marker, venue }) => {
            if (venue.type === filterType) {
                marker.setMap(map);
            } else {
                marker.setMap(null);
            }
        });
    }
    
    // Update active filter button
    updateFilterButtons(filterType);
}

// Update filter button states
function updateFilterButtons(activeFilter) {
    document.querySelectorAll('.map-filter-chip').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === activeFilter) {
            btn.classList.add('active');
        }
    });
}

// Locate user
function locateUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                map.setCenter(pos);
                map.setZoom(15);
                
                // Add user marker
                new google.maps.Marker({
                    position: pos,
                    map: map,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: '#4285F4',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 3,
                        scale: 10
                    },
                    title: 'Your Location'
                });
            },
            () => {
                alert('Error: The Geolocation service failed.');
            }
        );
    } else {
        alert('Error: Your browser doesn\'t support geolocation.');
    }
}

// Reset map view
function resetMapView() {
    map.setCenter(MAP_CONFIG.center);
    map.setZoom(MAP_CONFIG.zoom);
}

// Show map error
function showMapError() {
    const mapElement = document.getElementById('googleMapMain');
    if (mapElement) {
        mapElement.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #b0b0b0;">
                <i class="fas fa-map-marked-alt" style="font-size: 4rem; margin-bottom: 1rem; color: #D4AF37;"></i>
                <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">Map Loading...</p>
                <p style="font-size: 0.9rem;">Interactive map will appear here</p>
                <p style="font-size: 0.8rem; margin-top: 1rem; color: #808080;">Note: Google Maps API key required for full functionality</p>
            </div>
        `;
    }
}

// View venue details (placeholder)
function viewVenueDetails(venueId) {
    console.log('Viewing venue:', venueId);
    // Redirect to venue detail page or open modal
    alert(`Viewing details for venue ${venueId}`);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Filter button listeners
    document.querySelectorAll('.map-filter-chip').forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            filterVenues(filter);
        });
    });
    
    // Map control listeners
    const locateBtn = document.getElementById('locateUserBtn');
    if (locateBtn) {
        locateBtn.addEventListener('click', locateUser);
    }
    
    const resetBtn = document.getElementById('resetMapViewBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetMapView);
    }
    
    const listViewBtn = document.getElementById('toggleListViewBtn');
    if (listViewBtn) {
        listViewBtn.addEventListener('click', function() {
            window.location.href = 'explore.html';
        });
    }
    
    // Search functionality
    const searchBtn = document.getElementById('heroSearchButton');
    const searchInput = document.getElementById('heroSearchInput');
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', function() {
            const query = searchInput.value.trim();
            if (query) {
                console.log('Searching for:', query);
                // Implement search logic
                window.location.href = `explore.html?q=${encodeURIComponent(query)}`;
            }
        });
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchBtn.click();
            }
        });
    }
    
    // Location selector
    const locationSelect = document.getElementById('heroLocationSelect');
    if (locationSelect) {
        locationSelect.addEventListener('change', function() {
            const location = this.value;
            console.log('Location changed to:', location);
            
            if (location === 'current') {
                locateUser();
            } else {
                // Update map center based on location
                const locations = {
                    boston: { lat: 42.3601, lng: -71.0589 },
                    cambridge: { lat: 42.3736, lng: -71.1097 },
                    somerville: { lat: 42.3876, lng: -71.0995 },
                    brookline: { lat: 42.3318, lng: -71.1212 }
                };
                
                if (map && locations[location]) {
                    map.setCenter(locations[location]);
                    map.setZoom(14);
                }
            }
        });
    }
    
    // Advanced filters button
    const advFiltersBtn = document.getElementById('advancedFiltersButton');
    if (advFiltersBtn) {
        advFiltersBtn.addEventListener('click', function() {
            alert('Advanced filters coming soon!');
            // Open advanced filters modal
        });
    }
    
    // Initialize map (will show placeholder if Google Maps not loaded)
    setTimeout(() => {
        if (typeof google !== 'undefined' && google.maps) {
            initMap();
        } else {
            console.log('Google Maps API not loaded, showing placeholder');
            showMapError();
        }
    }, 100);
});

// Make functions available globally
window.initMap = initMap;
window.viewVenueDetails = viewVenueDetails;