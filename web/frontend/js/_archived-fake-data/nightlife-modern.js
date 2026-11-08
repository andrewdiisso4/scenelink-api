// SceneLink - Modern Nightlife Page JavaScript

let nightlifeMap;
let allVenues = [];
let filteredVenues = [];
let markers = [];

// Nightlife venues data
const nightlifeVenues = [
    {
        id: 1,
        name: "Royale Nightclub",
        type: "nightclub",
        vibe: "energetic",
        neighborhood: "downtown",
        lat: 42.3505,
        lng: -71.0621,
        rating: 4.5,
        image: "/assets/img/placeholder-venue.svg",
        hours: "10:00 PM - 2:00 AM",
        priceRange: "$$$",
        tags: ["Dancing", "DJ", "Bottle Service"],
        description: "Premier nightclub with world-class DJs and VIP experience",
        isOpen: true
    },
    {
        id: 2,
        name: "Drink",
        type: "cocktail-lounge",
        vibe: "upscale",
        neighborhood: "seaport",
        lat: 42.3520,
        lng: -71.0502,
        rating: 4.8,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 1:00 AM",
        priceRange: "$$$$",
        tags: ["Craft Cocktails", "Intimate", "Award-Winning"],
        description: "Craft cocktail bar with custom drinks and expert mixologists",
        isOpen: true
    },
    {
        id: 3,
        name: "The Grand",
        type: "nightclub",
        vibe: "upscale",
        neighborhood: "seaport",
        lat: 42.3505,
        lng: -71.0621,
        rating: 4.6,
        image: "/assets/img/placeholder-venue.svg",
        hours: "9:00 PM - 2:00 AM",
        priceRange: "$$$",
        tags: ["Live DJ", "Dancing", "VIP Tables"],
        description: "Upscale nightclub with stunning waterfront views",
        isOpen: true
    },
    {
        id: 4,
        name: "Yvonne's",
        type: "cocktail-lounge",
        vibe: "romantic",
        neighborhood: "downtown",
        lat: 42.3559,
        lng: -71.0550,
        rating: 4.7,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 1:00 AM",
        priceRange: "$$$",
        tags: ["Cocktails", "Romantic", "Library Bar"],
        description: "Sophisticated cocktail lounge in a historic library setting",
        isOpen: true
    },
    {
        id: 5,
        name: "The Lansdowne Pub",
        type: "sports-bar",
        vibe: "casual",
        neighborhood: "back-bay",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.3,
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:00 AM - 2:00 AM",
        priceRange: "$$",
        tags: ["Sports", "Beer", "Casual"],
        description: "Classic sports bar near Fenway Park",
        isOpen: true
    },
    {
        id: 6,
        name: "Tunnel",
        type: "nightclub",
        vibe: "energetic",
        neighborhood: "downtown",
        lat: 42.3505,
        lng: -71.0621,
        rating: 4.4,
        image: "/assets/img/placeholder-venue.svg",
        hours: "10:00 PM - 2:00 AM",
        priceRange: "$$$",
        tags: ["EDM", "Dancing", "Light Show"],
        description: "Underground nightclub with cutting-edge sound system",
        isOpen: false
    },
    {
        id: 7,
        name: "Lookout Rooftop",
        type: "rooftop",
        vibe: "upscale",
        neighborhood: "seaport",
        lat: 42.3520,
        lng: -71.0502,
        rating: 4.6,
        image: "/assets/img/placeholder-venue.svg",
        hours: "4:00 PM - 12:00 AM",
        priceRange: "$$$",
        tags: ["Rooftop", "Views", "Cocktails"],
        description: "Stunning rooftop bar with panoramic city views",
        isOpen: true
    },
    {
        id: 8,
        name: "The Beehive",
        type: "bar",
        vibe: "chill",
        neighborhood: "south-end",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.5,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 1:00 AM",
        priceRange: "$$",
        tags: ["Live Music", "Bohemian", "Jazz"],
        description: "Bohemian bar with live jazz and eclectic atmosphere",
        isOpen: true
    },
    {
        id: 9,
        name: "Howl at the Moon",
        type: "bar",
        vibe: "energetic",
        neighborhood: "downtown",
        lat: 42.3505,
        lng: -71.0621,
        rating: 4.2,
        image: "/assets/img/placeholder-venue.svg",
        hours: "7:00 PM - 2:00 AM",
        priceRange: "$$",
        tags: ["Dueling Pianos", "Interactive", "Fun"],
        description: "High-energy dueling piano bar",
        isOpen: true
    },
    {
        id: 10,
        name: "Capo",
        type: "cocktail-lounge",
        vibe: "upscale",
        neighborhood: "south-end",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.7,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 1:00 AM",
        priceRange: "$$$$",
        tags: ["Italian", "Wine", "Supper Club"],
        description: "Upscale Italian supper club with live entertainment",
        isOpen: true
    },
    {
        id: 11,
        name: "The Sinclair",
        type: "bar",
        vibe: "casual",
        neighborhood: "back-bay",
        lat: 42.3736,
        lng: -71.1097,
        rating: 4.4,
        image: "/assets/img/placeholder-venue.svg",
        hours: "6:00 PM - 1:00 AM",
        priceRange: "$$",
        tags: ["Live Music", "Craft Beer", "Indie"],
        description: "Music venue and bar featuring indie artists",
        isOpen: true
    },
    {
        id: 12,
        name: "Bijou Nightclub",
        type: "nightclub",
        vibe: "upscale",
        neighborhood: "downtown",
        lat: 42.3505,
        lng: -71.0621,
        rating: 4.3,
        image: "/assets/img/placeholder-venue.svg",
        hours: "10:00 PM - 2:00 AM",
        priceRange: "$$$",
        tags: ["Upscale", "DJ", "Bottle Service"],
        description: "Elegant nightclub with sophisticated atmosphere",
        isOpen: false
    },
    {
        id: 13,
        name: "Lolita Cocina",
        type: "bar",
        vibe: "casual",
        neighborhood: "back-bay",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.5,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 12:00 AM",
        priceRange: "$$",
        tags: ["Tequila", "Mexican", "Margaritas"],
        description: "Vibrant tequila bar with extensive selection",
        isOpen: true
    },
    {
        id: 14,
        name: "The Tam",
        type: "bar",
        vibe: "casual",
        neighborhood: "downtown",
        lat: 42.3559,
        lng: -71.0550,
        rating: 4.1,
        image: "/assets/img/placeholder-venue.svg",
        hours: "12:00 PM - 2:00 AM",
        priceRange: "$",
        tags: ["Dive Bar", "Cheap Drinks", "Local"],
        description: "Classic dive bar with character and cheap drinks",
        isOpen: true
    },
    {
        id: 15,
        name: "Scorpion Bar",
        type: "bar",
        vibe: "casual",
        neighborhood: "back-bay",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.2,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 1:00 AM",
        priceRange: "$$",
        tags: ["Tiki", "Tropical", "Fun"],
        description: "Tropical tiki bar with exotic cocktails",
        isOpen: true
    },
    {
        id: 16,
        name: "Whiskey Priest",
        type: "bar",
        vibe: "casual",
        neighborhood: "seaport",
        lat: 42.3520,
        lng: -71.0502,
        rating: 4.3,
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:00 AM - 1:00 AM",
        priceRange: "$$",
        tags: ["Waterfront", "Sports", "Patio"],
        description: "Waterfront bar with outdoor seating",
        isOpen: true
    },
    {
        id: 17,
        name: "The Greatest Bar",
        type: "sports-bar",
        vibe: "casual",
        neighborhood: "north-end",
        lat: 42.3647,
        lng: -71.0542,
        rating: 4.4,
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:00 AM - 2:00 AM",
        priceRange: "$$",
        tags: ["Sports", "Beer", "TVs"],
        description: "Sports bar with tons of TVs and game day atmosphere",
        isOpen: true
    },
    {
        id: 18,
        name: "Wink & Nod",
        type: "cocktail-lounge",
        vibe: "chill",
        neighborhood: "south-end",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.6,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 1:00 AM",
        priceRange: "$$$",
        tags: ["Speakeasy", "Craft Cocktails", "Intimate"],
        description: "Hidden speakeasy with creative cocktails",
        isOpen: true
    },
    {
        id: 19,
        name: "Venu",
        type: "nightclub",
        vibe: "upscale",
        neighborhood: "downtown",
        lat: 42.3505,
        lng: -71.0621,
        rating: 4.2,
        image: "/assets/img/placeholder-venue.svg",
        hours: "10:00 PM - 2:00 AM",
        priceRange: "$$$",
        tags: ["Nightclub", "DJ", "Dancing"],
        description: "Multi-level nightclub with diverse music",
        isOpen: false
    },
    {
        id: 20,
        name: "Citrus & Salt",
        type: "bar",
        vibe: "casual",
        neighborhood: "back-bay",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.4,
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 1:00 AM",
        priceRange: "$$",
        tags: ["Tequila", "Tacos", "Casual"],
        description: "Tequila bar with great tacos and margaritas",
        isOpen: true
    }
];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Skip original map init if unified map script will handle it
    if (typeof SceneLinkMap === 'undefined') {
        initNightlifeMap();
    }
    loadVenues();
    initEventListeners();
});

function initNightlifeMap() {
    // Initialize Leaflet map
    nightlifeMap = L.map('nightlifeMap').setView([42.3601, -71.0589], 13);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(nightlifeMap);
    
    // Add markers for all venues
    updateMapMarkers(nightlifeVenues);
}

function updateMapMarkers(venues) {
    // Clear existing markers
    markers.forEach(marker => nightlifeMap.removeLayer(marker));
    markers = [];
    
    // Add new markers
    venues.forEach(venue => {
        let markerColor;
        switch(venue.type) {
            case 'nightclub':
                markerColor = '#E91E63'; // Pink
                break;
            case 'cocktail-lounge':
                markerColor = '#9C27B0'; // Purple
                break;
            case 'bar':
                markerColor = '#D4AF37'; // Gold
                break;
            case 'sports-bar':
                markerColor = '#4A90E2'; // Blue
                break;
            case 'rooftop':
                markerColor = '#FF9800'; // Orange
                break;
            default:
                markerColor = '#D4AF37';
        }
        
        const icon = L.divIcon({
            className: 'custom-nightlife-marker',
            html: `<div style="background: ${markerColor}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        
        const marker = L.marker([venue.lat, venue.lng], { icon: icon })
            .addTo(nightlifeMap)
            .bindPopup(createMarkerPopup(venue));
        
        markers.push(marker);
    });
}

function createMarkerPopup(venue) {
    const statusText = venue.isOpen ? 'Open Now' : 'Closed';
    const statusColor = venue.isOpen ? '#4CAF50' : '#F44336';
    
    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 8px; min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; color: #D4AF37; font-size: 16px;">${venue.name}</h3>
            <p style="margin: 0 0 8px 0; color: #666; font-size: 12px; text-transform: capitalize;">${venue.type.replace('-', ' ')}</p>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                <span style="color: ${statusColor}; font-weight: 600; font-size: 12px;">● ${statusText}</span>
            </div>
            <div style="margin-bottom: 8px;">
                <span style="color: #D4AF37; font-size: 14px;">★ ${venue.rating}</span>
                <span style="color: #999; font-size: 12px; margin-left: 8px;">${venue.priceRange}</span>
            </div>
            <button onclick="window.location.href='restaurant-detail.html'" style="width: 100%; padding: 8px; background: #D4AF37; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">View Details</button>
        </div>
    `;
}

function loadVenues() {
    allVenues = [...nightlifeVenues];
    filteredVenues = [...allVenues];
    renderVenues();
    updateResultsCount();
}

function renderVenues() {
    const venuesGrid = document.getElementById('venuesGrid');
    if (!venuesGrid) return;
    venuesGrid.innerHTML = '';
    
    if (filteredVenues.length === 0) {
        venuesGrid.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <h3>No Venues Found</h3>
                <p>Try adjusting your filters to see more venues</p>
            </div>
        `;
        return;
    }
    
    filteredVenues.forEach(venue => {
        const venueCard = createVenueCard(venue);
        venuesGrid.appendChild(venueCard);
    });
}

function createVenueCard(venue) {
    const card = document.createElement('div');
    card.className = 'venue-card';
    card.onclick = () => window.location.href = 'restaurant-detail.html';
    
    const statusClass = venue.isOpen ? '' : 'closed';
    const statusText = venue.isOpen ? 'Open Now' : 'Closed';
    
    const tagsHTML = venue.tags.map(tag => `<span class="venue-tag">${tag}</span>`).join('');
    
    card.innerHTML = `
        <img src="${venue.image}" alt="${venue.name}" class="venue-image">
        <div class="venue-content">
            <div class="venue-header">
                <div>
                    <h3 class="venue-title">${venue.name}</h3>
                    <div class="venue-type">${venue.type.replace('-', ' ').toUpperCase()}</div>
                </div>
                <div class="venue-rating">
                    <span>★</span>
                    <span>${venue.rating}</span>
                </div>
            </div>
            
            <div class="venue-status ${statusClass}">
                <span class="status-dot"></span>
                <span>${statusText}</span>
            </div>
            
            <div class="venue-details">
                <div class="venue-detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>${venue.hours}</span>
                </div>
                <div class="venue-detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>${venue.neighborhood.replace('-', ' ').toUpperCase()}</span>
                </div>
                <div class="venue-detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    <span>${venue.priceRange}</span>
                </div>
            </div>
            
            <div class="venue-tags">
                ${tagsHTML}
            </div>
            
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: var(--spacing-lg);">
                ${venue.description}
            </p>
            
            <div class="venue-actions">
                <button class="venue-action-btn primary" onclick="event.stopPropagation();">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    Directions
                </button>
                <button class="venue-action-btn" onclick="event.stopPropagation(); window.location.href='plan-with-friends.html?venue=' + encodeURIComponent('${venue.name}');" title="Add to Plan">
                    <i class="fas fa-users" style="font-size:14px"></i>
                    Plan
                </button>
                <button class="venue-action-btn" onclick="event.stopPropagation();">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    Save
                </button>
            </div>
        </div>
    `;
    
    return card;
}

function initEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', debounce(applyFilters, 300));
    
    // Filter selects
    var vtf = document.getElementById('venueTypeFilter');
    var vf = document.getElementById('vibeFilter');
    var nf = document.getElementById('neighborhoodFilter');
    var onf = document.getElementById('openNowFilter');
    if (vtf) vtf.addEventListener('change', applyFilters);
    if (vf) vf.addEventListener('change', applyFilters);
    if (nf) nf.addEventListener('change', applyFilters);
    if (onf) onf.addEventListener('change', applyFilters);
    
    // Sort select
    var ss = document.getElementById('sortSelect');
    if (ss) ss.addEventListener('change', applySorting);
    
    // Map controls
    var locBtn = document.getElementById('locateBtn') || document.getElementById('nlLocateBtn');
    var rstBtn = document.getElementById('resetMapBtn') || document.getElementById('nlResetBtn');
    if (locBtn) locBtn.addEventListener('click', locateUser);
    if (rstBtn) rstBtn.addEventListener('click', resetMap);
}

function applyFilters() {
    let filtered = [...allVenues];
    
    // Search filter
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(venue => 
            venue.name.toLowerCase().includes(searchTerm) ||
            venue.description.toLowerCase().includes(searchTerm) ||
            venue.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }
    
    // Venue type filter
    const venueType = document.getElementById('venueTypeFilter').value;
    if (venueType !== 'all') {
        filtered = filtered.filter(venue => venue.type === venueType);
    }
    
    // Vibe filter
    const vibe = document.getElementById('vibeFilter').value;
    if (vibe !== 'all') {
        filtered = filtered.filter(venue => venue.vibe === vibe);
    }
    
    // Neighborhood filter
    const neighborhood = document.getElementById('neighborhoodFilter').value;
    if (neighborhood !== 'all') {
        filtered = filtered.filter(venue => venue.neighborhood === neighborhood);
    }
    
    // Open now filter
    const openNow = document.getElementById('openNowFilter').checked;
    if (openNow) {
        filtered = filtered.filter(venue => venue.isOpen);
    }
    
    filteredVenues = filtered;
    updateActiveFilters();
    updateMapMarkers(filteredVenues);
    renderVenues();
    updateResultsCount();
}

function updateActiveFilters() {
    const activeFiltersContainer = document.getElementById('activeFilters');
    activeFiltersContainer.innerHTML = '';
    
    const filters = [];
    
    const searchTerm = document.getElementById('searchInput').value;
    if (searchTerm) {
        filters.push({ label: `Search: ${searchTerm}`, clear: () => {
            document.getElementById('searchInput').value = '';
            applyFilters();
        }});
    }
    
    const venueType = document.getElementById('venueTypeFilter');
    if (venueType.value !== 'all') {
        filters.push({ label: venueType.options[venueType.selectedIndex].text, clear: () => {
            venueType.value = 'all';
            applyFilters();
        }});
    }
    
    const vibe = document.getElementById('vibeFilter');
    if (vibe.value !== 'all') {
        filters.push({ label: vibe.options[vibe.selectedIndex].text, clear: () => {
            vibe.value = 'all';
            applyFilters();
        }});
    }
    
    const neighborhood = document.getElementById('neighborhoodFilter');
    if (neighborhood.value !== 'all') {
        filters.push({ label: neighborhood.options[neighborhood.selectedIndex].text, clear: () => {
            neighborhood.value = 'all';
            applyFilters();
        }});
    }
    
    if (document.getElementById('openNowFilter').checked) {
        filters.push({ label: 'Open Now', clear: () => {
            document.getElementById('openNowFilter').checked = false;
            applyFilters();
        }});
    }
    
    filters.forEach(filter => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        tag.innerHTML = `
            <span>${filter.label}</span>
            <button onclick="this.parentElement.remove()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        tag.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            filter.clear();
        });
        activeFiltersContainer.appendChild(tag);
    });
}

function applySorting() {
    const sortBy = document.getElementById('sortSelect').value;
    
    switch(sortBy) {
        case 'rating':
            filteredVenues.sort((a, b) => b.rating - a.rating);
            break;
        case 'name':
            filteredVenues.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'distance':
            // In a real app, this would sort by actual distance
            filteredVenues.sort((a, b) => a.id - b.id);
            break;
        default:
            // Recommended - keep original order
            break;
    }
    
    renderVenues();
}

function updateResultsCount() {
    const count = filteredVenues.length;
    document.getElementById('resultsCount').textContent = `Showing ${count} venue${count !== 1 ? 's' : ''}`;
}

function locateUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                nightlifeMap.setView([latitude, longitude], 15);
                
                // Add user location marker
                const userIcon = L.divIcon({
                    className: 'user-location-marker',
                    html: '<div style="background: #4A90E2; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 10px rgba(74, 144, 226, 0.5);"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                
                L.marker([latitude, longitude], { icon: userIcon })
                    .addTo(nightlifeMap)
                    .bindPopup('You are here')
                    .openPopup();
            },
            (error) => {
                alert('Unable to get your location. Please enable location services.');
            }
        );
    } else {
        alert('Geolocation is not supported by your browser.');
    }
}

function resetMap() {
    nightlifeMap.setView([42.3601, -71.0589], 13);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}