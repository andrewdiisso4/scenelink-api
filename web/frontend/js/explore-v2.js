// SceneLink - Explore Page JavaScript

let exploreMap;
let allRestaurants = [];
let filteredRestaurants = [];
let markers = [];

// Boston coordinates
const bostonCenter = { lat: 42.3601, lng: -71.0589 };

// Restaurant data
const restaurants = [
    {
        id: 1,
        name: "Mamma Maria",
        cuisine: "italian",
        neighborhood: "north-end",
        lat: 42.3647,
        lng: -71.0542,
        rating: 4.8,
        priceRange: "$$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 10:00 PM",
        tags: ["Fine Dining", "Romantic", "Wine Bar"],
        dietary: ["vegetarian", "gluten-free"],
        features: ["reservations", "outdoor-seating"],
        description: "Elegant Italian dining in a historic North End townhouse",
        isOpen: true
    },
    {
        id: 2,
        name: "Neptune Oyster",
        cuisine: "seafood",
        neighborhood: "north-end",
        lat: 42.3651,
        lng: -71.0537,
        rating: 4.9,
        priceRange: "$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:30 AM - 9:30 PM",
        tags: ["Seafood", "Oysters", "Fresh"],
        dietary: ["gluten-free"],
        features: ["reservations"],
        description: "Intimate seafood spot known for lobster rolls and oysters",
        isOpen: true
    },
    {
        id: 3,
        name: "Toro",
        cuisine: "mexican",
        neighborhood: "south-end",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.7,
        priceRange: "$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 11:00 PM",
        tags: ["Spanish", "Tapas", "Lively"],
        dietary: ["vegetarian", "vegan"],
        features: ["outdoor-seating"],
        description: "Spanish tapas bar with vibrant atmosphere",
        isOpen: true
    },
    {
        id: 4,
        name: "O Ya",
        cuisine: "asian",
        neighborhood: "downtown",
        lat: 42.3559,
        lng: -71.0550,
        rating: 4.9,
        priceRange: "$$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 10:00 PM",
        tags: ["Sushi", "Omakase", "Upscale"],
        dietary: ["gluten-free"],
        features: ["reservations"],
        description: "Contemporary Japanese cuisine and sushi bar",
        isOpen: true
    },
    {
        id: 5,
        name: "Myers + Chang",
        cuisine: "asian",
        neighborhood: "south-end",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.6,
        priceRange: "$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:30 AM - 10:00 PM",
        tags: ["Asian Fusion", "Casual", "Creative"],
        dietary: ["vegetarian", "vegan", "gluten-free"],
        features: ["delivery", "outdoor-seating"],
        description: "Creative Asian-inspired dishes in a casual setting",
        isOpen: true
    },
    {
        id: 6,
        name: "Bistro du Midi",
        cuisine: "french",
        neighborhood: "back-bay",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.5,
        priceRange: "$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:30 AM - 10:00 PM",
        tags: ["French", "Bistro", "Wine"],
        dietary: ["vegetarian"],
        features: ["reservations", "outdoor-seating"],
        description: "Classic French bistro overlooking the Public Garden",
        isOpen: true
    },
    {
        id: 7,
        name: "Row 34",
        cuisine: "seafood",
        neighborhood: "seaport",
        lat: 42.3520,
        lng: -71.0502,
        rating: 4.7,
        priceRange: "$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:30 AM - 11:00 PM",
        tags: ["Seafood", "Oysters", "Beer"],
        dietary: ["gluten-free"],
        features: ["reservations"],
        description: "Working-man's oyster bar with craft beer selection",
        isOpen: true
    },
    {
        id: 8,
        name: "Oleana",
        cuisine: "mediterranean",
        neighborhood: "cambridge",
        lat: 42.3736,
        lng: -71.1097,
        rating: 4.8,
        priceRange: "$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "5:00 PM - 10:00 PM",
        tags: ["Mediterranean", "Seasonal", "Patio"],
        dietary: ["vegetarian", "vegan"],
        features: ["reservations", "outdoor-seating"],
        description: "Mediterranean cuisine with seasonal ingredients",
        isOpen: true
    },
    {
        id: 9,
        name: "The Capital Grille",
        cuisine: "american",
        neighborhood: "back-bay",
        lat: 42.3467,
        lng: -71.0707,
        rating: 4.6,
        priceRange: "$$$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "11:30 AM - 10:00 PM",
        tags: ["Steakhouse", "Upscale", "Wine"],
        dietary: ["gluten-free"],
        features: ["reservations"],
        description: "Upscale steakhouse with extensive wine list",
        isOpen: true
    },
    {
        id: 10,
        name: "Giacomo's Ristorante",
        cuisine: "italian",
        neighborhood: "north-end",
        lat: 42.3647,
        lng: -71.0542,
        rating: 4.5,
        priceRange: "$$",
        image: "/assets/img/placeholder-venue.svg",
        hours: "4:30 PM - 10:00 PM",
        tags: ["Italian", "Casual", "No Reservations"],
        dietary: ["vegetarian"],
        features: [],
        description: "Classic Italian-American fare, cash only",
        isOpen: true
    }
];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initExploreMap();
    loadRestaurants();
    initEventListeners();
});

function initExploreMap() {
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        displayMapFallback();
        return;
    }

    exploreMap = new google.maps.Map(document.getElementById('exploreMap'), {
        center: bostonCenter,
        zoom: 13,
        styles: getDarkMapStyle(),
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
    });

    updateMapMarkers(restaurants);
}

function updateMapMarkers(venues) {
    markers.forEach(marker => marker.setMap(null));
    markers = [];

    venues.forEach(venue => {
        const marker = new google.maps.Marker({
            position: { lat: venue.lat, lng: venue.lng },
            map: exploreMap,
            title: venue.name,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#D4AF37',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: 10
            }
        });

        const infoWindow = new google.maps.InfoWindow({
            content: createMarkerPopup(venue)
        });

        marker.addListener('click', () => {
            infoWindow.open(exploreMap, marker);
        });

        markers.push(marker);
    });
}

function createMarkerPopup(venue) {
    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 12px; min-width: 220px;">
            <h3 style="margin: 0 0 8px 0; color: #D4AF37; font-size: 18px;">${venue.name}</h3>
            <p style="margin: 0 0 8px 0; color: #666; font-size: 14px; text-transform: capitalize;">${venue.cuisine}</p>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span style="color: #D4AF37;">★ ${venue.rating}</span>
                <span style="color: #999;">${venue.priceRange}</span>
            </div>
            <button onclick="booking.open(${JSON.stringify(venue).replace(/"/g, '&quot;')})" style="width: 100%; padding: 10px; background: #D4AF37; color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; margin-bottom: 6px;">Book Now</button>
            <button onclick="window.location.href='restaurant-detail.html'" style="width: 100%; padding: 10px; background: transparent; color: #D4AF37; border: 1px solid #D4AF37; border-radius: 8px; cursor: pointer; font-weight: 600;">View Details</button>
        </div>
    `;
}

function getDarkMapStyle() {
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
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#2d2d2d" }]
        },
        {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#0a0a0a" }]
        }
    ];
}

function displayMapFallback() {
    document.getElementById('exploreMap').innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: var(--dark-lighter); color: var(--text-secondary);">
            <div style="text-align: center; padding: 40px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; opacity: 0.5;">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <h3>Map Loading...</h3>
                <p>Add Google Maps API key to enable interactive map</p>
            </div>
        </div>
    `;
}

function loadRestaurants() {
    allRestaurants = [...restaurants];
    filteredRestaurants = [...allRestaurants];
    renderRestaurants();
    updateResultsCount();
}

function renderRestaurants() {
    const grid = document.getElementById('restaurantsGrid');
    grid.innerHTML = '';

    if (filteredRestaurants.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <h3>No Restaurants Found</h3>
                <p>Try adjusting your filters to see more results</p>
            </div>
        `;
        return;
    }

    filteredRestaurants.forEach(restaurant => {
        const card = createRestaurantCard(restaurant);
        grid.appendChild(card);
    });
}

function createRestaurantCard(restaurant) {
    const card = document.createElement('div');
    card.className = 'restaurant-card';
    card.onclick = () => window.location.href = 'restaurant-detail.html';

    const tagsHTML = restaurant.tags.map(tag => `<span class="restaurant-tag">${tag}</span>`).join('');

    card.innerHTML = `
        <img src="${restaurant.image}" alt="${restaurant.name}" class="restaurant-image">
        <div class="restaurant-content">
            <div class="restaurant-header">
                <div>
                    <h3 class="restaurant-title">${restaurant.name}</h3>
                    <div class="restaurant-cuisine">${restaurant.cuisine.toUpperCase()}</div>
                </div>
                <div class="restaurant-rating">
                    <span>★</span>
                    <span>${restaurant.rating}</span>
                </div>
            </div>
            
            <div class="restaurant-details">
                <div class="restaurant-detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>${restaurant.hours}</span>
                </div>
                <div class="restaurant-detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>${restaurant.neighborhood.replace('-', ' ').toUpperCase()}</span>
                </div>
                <div class="restaurant-detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    <span>${restaurant.priceRange}</span>
                </div>
            </div>
            
            <div class="restaurant-tags">
                ${tagsHTML}
            </div>
            
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: var(--spacing-lg);">
                ${restaurant.description}
            </p>
            
            <div class="restaurant-actions">
                <button class="restaurant-action-btn primary" onclick="event.stopPropagation(); booking.open(${JSON.stringify(restaurant).replace(/"/g, '&quot;')})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    Book Now
                </button>
                <button class="restaurant-action-btn" onclick="event.stopPropagation();">
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
    // Search
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', debounce(() => {
        clearSearch.style.display = searchInput.value ? 'flex' : 'none';
        applyFilters();
    }, 300));
    
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        clearSearch.style.display = 'none';
        applyFilters();
    });

    // Category tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            applyFilters();
        });
    });

    // Price buttons
    document.querySelectorAll('.price-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.price-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            applyFilters();
        });
    });

    // Checkboxes
    document.querySelectorAll('.checkbox-label input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', applyFilters);
    });

    // Selects
    document.getElementById('neighborhoodFilter').addEventListener('change', applyFilters);
    document.getElementById('sortSelect').addEventListener('change', applySorting);
    document.getElementById('openNowToggle').addEventListener('change', applyFilters);

    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const grid = document.getElementById('restaurantsGrid');
            if (this.dataset.view === 'list') {
                grid.classList.add('list-view');
            } else {
                grid.classList.remove('list-view');
            }
        });
    });

    // Map controls
    document.getElementById('locateBtn')?.addEventListener('click', locateUser);
    document.getElementById('resetMapBtn')?.addEventListener('click', () => {
        if (exploreMap) exploreMap.setCenter(bostonCenter);
    });
}

function applyFilters() {
    let filtered = [...allRestaurants];

    // Search
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(r =>
            r.name.toLowerCase().includes(searchTerm) ||
            r.cuisine.toLowerCase().includes(searchTerm) ||
            r.description.toLowerCase().includes(searchTerm) ||
            r.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }

    // Category
    const activeCategory = document.querySelector('.category-tab.active').dataset.category;
    if (activeCategory !== 'all') {
        filtered = filtered.filter(r => r.cuisine === activeCategory);
    }

    // Price
    const activePrice = document.querySelector('.price-btn.active').dataset.price;
    if (activePrice !== 'all') {
        filtered = filtered.filter(r => r.priceRange === activePrice);
    }

    // Dietary
    const selectedDietary = Array.from(document.querySelectorAll('.checkbox-group input[value^="veg"]:checked, .checkbox-group input[value="gluten-free"]:checked'))
        .map(cb => cb.value);
    if (selectedDietary.length > 0) {
        filtered = filtered.filter(r => 
            selectedDietary.some(diet => r.dietary.includes(diet))
        );
    }

    // Features
    const selectedFeatures = Array.from(document.querySelectorAll('.checkbox-group input[value$="-seating"]:checked, .checkbox-group input[value="reservations"]:checked, .checkbox-group input[value="delivery"]:checked'))
        .map(cb => cb.value);
    if (selectedFeatures.length > 0) {
        filtered = filtered.filter(r =>
            selectedFeatures.some(feature => r.features.includes(feature))
        );
    }

    // Neighborhood
    const neighborhood = document.getElementById('neighborhoodFilter').value;
    if (neighborhood !== 'all') {
        filtered = filtered.filter(r => r.neighborhood === neighborhood);
    }

    // Open now
    if (document.getElementById('openNowToggle').checked) {
        filtered = filtered.filter(r => r.isOpen);
    }

    filteredRestaurants = filtered;
    updateActiveFilters();
    updateMapMarkers(filteredRestaurants);
    renderRestaurants();
    updateResultsCount();
}

function applySorting() {
    const sortBy = document.getElementById('sortSelect').value;

    switch(sortBy) {
        case 'rating':
            filteredRestaurants.sort((a, b) => b.rating - a.rating);
            break;
        case 'price-low':
            filteredRestaurants.sort((a, b) => a.priceRange.length - b.priceRange.length);
            break;
        case 'price-high':
            filteredRestaurants.sort((a, b) => b.priceRange.length - a.priceRange.length);
            break;
        case 'name':
            filteredRestaurants.sort((a, b) => a.name.localeCompare(b.name));
            break;
    }

    renderRestaurants();
}

function updateActiveFilters() {
    const container = document.getElementById('activeFilters');
    container.innerHTML = '';

    const filters = [];

    const searchTerm = document.getElementById('searchInput').value;
    if (searchTerm) {
        filters.push({ label: `Search: ${searchTerm}`, clear: () => {
            document.getElementById('searchInput').value = '';
            document.getElementById('clearSearch').style.display = 'none';
            applyFilters();
        }});
    }

    const activeCategory = document.querySelector('.category-tab.active');
    if (activeCategory.dataset.category !== 'all') {
        filters.push({ label: activeCategory.textContent.trim(), clear: () => {
            document.querySelector('.category-tab[data-category="all"]').click();
        }});
    }

    filters.forEach(filter => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        tag.innerHTML = `
            <span>${filter.label}</span>
            <button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        tag.querySelector('button').addEventListener('click', filter.clear);
        container.appendChild(tag);
    });
}

function updateResultsCount() {
    const count = filteredRestaurants.length;
    document.getElementById('resultsCount').textContent = `Showing ${count} restaurant${count !== 1 ? 's' : ''}`;
}

function locateUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                if (exploreMap) {
                    exploreMap.setCenter({ lat: latitude, lng: longitude });
                    exploreMap.setZoom(15);
                }
                notify.success('Location Found', 'Showing restaurants near you');
            },
            () => {
                notify.error('Location Error', 'Unable to get your location');
            }
        );
    }
}