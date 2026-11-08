/**
 * SceneLink Explore Page - Enhanced User Experience
 * Optimized for intuitive navigation and seamless interactions
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION & STATE
    // ============================================
    
    const state = {
        venues: [],
        filteredVenues: [],
        currentFilters: {
            search: '',
            categories: [],
            priceRange: [1, 4],
            features: [],
            rating: 0,
            distance: 10
        },
        currentSort: 'relevance',
        currentView: 'grid',
        mapMarkers: [],
        userLocation: null
    };

    // Mock venue data for demonstration
    const mockVenues = [
        {
            id: 1,
            name: "Toro",
            category: "Spanish Tapas",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.8,
            reviewCount: 1247,
            price: 3,
            distance: 0.8,
            address: "1704 Washington St, Boston",
            tags: ["Outdoor Seating", "Reservations", "Wine Bar"],
            description: "Authentic Spanish tapas in a vibrant atmosphere",
            isSaved: false,
            isTrending: true,
            friendsLiked: 12
        },
        {
            id: 2,
            name: "Neptune Oyster",
            category: "Seafood",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.9,
            reviewCount: 2156,
            price: 4,
            distance: 1.2,
            address: "63 Salem St, Boston",
            tags: ["Fresh Seafood", "Raw Bar", "Reservations"],
            description: "Intimate seafood spot with exceptional oysters",
            isSaved: true,
            isTrending: true,
            friendsLiked: 8
        },
        {
            id: 3,
            name: "Myers + Chang",
            category: "Asian Fusion",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.6,
            reviewCount: 892,
            price: 2,
            distance: 1.5,
            address: "1145 Washington St, Boston",
            tags: ["Casual", "Group Friendly", "Vegetarian Options"],
            description: "Creative Asian fusion in a lively setting",
            isSaved: false,
            isTrending: false,
            friendsLiked: 5
        },
        {
            id: 4,
            name: "The Salty Pig",
            category: "Italian",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.7,
            reviewCount: 1543,
            price: 3,
            distance: 0.5,
            address: "130 Dartmouth St, Boston",
            tags: ["Pizza", "Craft Beer", "Charcuterie"],
            description: "Artisanal pizza and charcuterie with craft beers",
            isSaved: false,
            isTrending: true,
            friendsLiked: 15
        },
        {
            id: 5,
            name: "Oleana",
            category: "Mediterranean",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.8,
            reviewCount: 1876,
            price: 4,
            distance: 2.3,
            address: "134 Hampshire St, Cambridge",
            tags: ["Romantic", "Outdoor Seating", "Wine List"],
            description: "Exquisite Mediterranean cuisine with seasonal ingredients",
            isSaved: true,
            isTrending: false,
            friendsLiked: 6
        },
        {
            id: 6,
            name: "Alden & Harlow",
            category: "American",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.7,
            reviewCount: 1234,
            price: 3,
            distance: 2.1,
            address: "40 Brattle St, Cambridge",
            tags: ["Craft Cocktails", "Brunch", "Local Ingredients"],
            description: "Modern American with creative cocktails",
            isSaved: false,
            isTrending: true,
            friendsLiked: 9
        }
    ];

    // ============================================
    // INITIALIZATION
    // ============================================
    
    function init() {
        console.log('🚀 Initializing Enhanced Explore Page...');
        
        // Initialize state
        state.venues = mockVenues;
        state.filteredVenues = mockVenues;
        
        // Setup event listeners
        setupSearchListeners();
        setupFilterListeners();
        setupSortListeners();
        setupViewToggle();
        setupMapControls();
        setupMapLegend();
        
        // Get user location
        getUserLocation();
        
        // Render initial content
        renderVenues();
        initializeMap();
        
        // Add scroll animations
        setupScrollAnimations();
        
        console.log('✅ Explore page initialized successfully');
    }

    // ============================================
    // SEARCH FUNCTIONALITY
    // ============================================
    
    function setupSearchListeners() {
        const searchInput = document.querySelector('.search-input');
        const searchBtn = document.querySelector('.search-btn');
        
        if (searchInput) {
            // Real-time search with debouncing
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    state.currentFilters.search = e.target.value.toLowerCase();
                    applyFilters();
                }, 300);
            });
            
            // Search on Enter key
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    state.currentFilters.search = e.target.value.toLowerCase();
                    applyFilters();
                }
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                if (searchInput) {
                    state.currentFilters.search = searchInput.value.toLowerCase();
                    applyFilters();
                }
            });
        }
        
        // Quick filter pills
        const filterPills = document.querySelectorAll('.filter-pill');
        filterPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Toggle active state
                filterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                
                // Apply category filter
                const category = pill.textContent.trim();
                if (category === 'All') {
                    state.currentFilters.categories = [];
                } else {
                    state.currentFilters.categories = [category];
                }
                
                applyFilters();
            });
        });
    }

    // ============================================
    // FILTER FUNCTIONALITY
    // ============================================
    
    function setupFilterListeners() {
        // Category checkboxes
        const categoryCheckboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
        categoryCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                updateCategoryFilters();
                applyFilters();
            });
        });
        
        // Price range slider
        const priceSlider = document.querySelector('.price-slider');
        if (priceSlider) {
            priceSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                state.currentFilters.priceRange = [1, value];
                updatePriceDisplay(value);
                applyFilters();
            });
        }
        
        // Clear filters button
        const clearBtn = document.querySelector('.clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                clearAllFilters();
            });
        }
    }
    
    function updateCategoryFilters() {
        const checkboxes = document.querySelectorAll('.filter-option input[type="checkbox"]:checked');
        state.currentFilters.categories = Array.from(checkboxes).map(cb => cb.value);
    }
    
    function updatePriceDisplay(value) {
        const labels = document.querySelectorAll('.price-range-labels span');
        if (labels.length > 1) {
            labels[1].textContent = '$'.repeat(value);
        }
    }
    
    function clearAllFilters() {
        // Reset state
        state.currentFilters = {
            search: '',
            categories: [],
            priceRange: [1, 4],
            features: [],
            rating: 0,
            distance: 10
        };
        
        // Reset UI
        document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        const searchInput = document.querySelector('.search-input');
        if (searchInput) searchInput.value = '';
        
        const priceSlider = document.querySelector('.price-slider');
        if (priceSlider) priceSlider.value = 4;
        
        // Reapply
        applyFilters();
    }

    // ============================================
    // SORTING & VIEW TOGGLE
    // ============================================
    
    function setupSortListeners() {
        const sortDropdown = document.querySelector('.sort-dropdown');
        if (sortDropdown) {
            sortDropdown.addEventListener('change', (e) => {
                state.currentSort = e.target.value;
                sortVenues();
                renderVenues();
            });
        }
    }
    
    function setupViewToggle() {
        const viewBtns = document.querySelectorAll('.view-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const view = btn.dataset.view;
                state.currentView = view;
                
                if (view === 'map') {
                    showMapView();
                } else {
                    showGridView();
                }
            });
        });
    }
    
    function sortVenues() {
        switch(state.currentSort) {
            case 'rating':
                state.filteredVenues.sort((a, b) => b.rating - a.rating);
                break;
            case 'distance':
                state.filteredVenues.sort((a, b) => a.distance - b.distance);
                break;
            case 'price-low':
                state.filteredVenues.sort((a, b) => a.price - b.price);
                break;
            case 'price-high':
                state.filteredVenues.sort((a, b) => b.price - a.price);
                break;
            default: // relevance
                state.filteredVenues.sort((a, b) => {
                    const scoreA = (a.rating * 0.4) + (a.reviewCount * 0.0001) + (a.isTrending ? 1 : 0);
                    const scoreB = (b.rating * 0.4) + (b.reviewCount * 0.0001) + (b.isTrending ? 1 : 0);
                    return scoreB - scoreA;
                });
        }
    }

    // ============================================
    // FILTER APPLICATION
    // ============================================
    
    function applyFilters() {
        showLoadingState();
        
        setTimeout(() => {
            state.filteredVenues = state.venues.filter(venue => {
                // Search filter
                if (state.currentFilters.search) {
                    const searchTerm = state.currentFilters.search;
                    const matchesSearch = 
                        venue.name.toLowerCase().includes(searchTerm) ||
                        venue.category.toLowerCase().includes(searchTerm) ||
                        venue.description.toLowerCase().includes(searchTerm);
                    
                    if (!matchesSearch) return false;
                }
                
                // Category filter
                if (state.currentFilters.categories.length > 0) {
                    if (!state.currentFilters.categories.includes(venue.category)) {
                        return false;
                    }
                }
                
                // Price filter
                if (venue.price > state.currentFilters.priceRange[1]) {
                    return false;
                }
                
                return true;
            });
            
            sortVenues();
            renderVenues();
            updateResultsCount();
            hideLoadingState();
        }, 300);
    }

    // ============================================
    // VENUE RENDERING
    // ============================================
    
    function renderVenues() {
        const grid = document.querySelector('.venues-grid');
        if (!grid) return;
        
        if (state.filteredVenues.length === 0) {
            showEmptyState();
            return;
        }
        
        grid.innerHTML = state.filteredVenues.map(venue => createVenueCard(venue)).join('');
        
        // Add event listeners to venue cards
        setupVenueCardListeners();
    }
    
    function createVenueCard(venue) {
        const stars = generateStarRating(venue.rating);
        const priceSymbols = '$'.repeat(venue.price);
        const badges = venue.isTrending ? '<span class="venue-badge">🔥 Trending</span>' : '';
        const savedIcon = venue.isSaved ? 'fas' : 'far';
        
        return `
            <div class="venue-card-enhanced" data-venue-id="${venue.id}">
                <div class="venue-image-container">
                    <img src="${venue.image}" alt="${venue.name}" class="venue-image">
                    ${badges}
                    <div class="venue-actions-overlay">
                        <button class="venue-action-btn save-btn" data-venue-id="${venue.id}" title="Save">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${venue.isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                        <button class="venue-action-btn share-btn" data-venue-id="${venue.id}" title="Share">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="venue-info">
                    <h3 class="venue-name">${venue.name}</h3>
                    <div class="venue-category">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        </svg>
                        ${venue.category}
                    </div>
                    <div class="venue-rating-container">
                        <div class="star-rating">${stars}</div>
                        <span class="rating-number">${venue.rating}</span>
                        <span class="review-count">(${venue.reviewCount} reviews)</span>
                    </div>
                    <div class="venue-details">
                        <div class="venue-detail">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="10" r="3"></circle>
                                <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"></path>
                            </svg>
                            ${venue.distance} mi
                        </div>
                        <div class="venue-detail">
                            <span>${priceSymbols}</span>
                        </div>
                        ${venue.friendsLiked > 0 ? `
                        <div class="venue-detail">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            ${venue.friendsLiked} friends
                        </div>
                        ` : ''}
                    </div>
                    <div class="venue-tags">
                        ${venue.tags.map(tag => `<span class="venue-tag">${tag}</span>`).join('')}
                    </div>
                    <div class="venue-footer">
                        <button class="venue-btn venue-btn-primary book-btn" data-venue-id="${venue.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            Book Now
                        </button>
                        <button class="venue-btn venue-btn-secondary details-btn" data-venue-id="${venue.id}">
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    function generateStarRating(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        let stars = '';
        for (let i = 0; i < fullStars; i++) {
            stars += '<span class="star">★</span>';
        }
        if (hasHalfStar) {
            stars += '<span class="star">★</span>';
        }
        for (let i = 0; i < emptyStars; i++) {
            stars += '<span class="star empty">★</span>';
        }
        
        return stars;
    }

    // ============================================
    // VENUE CARD INTERACTIONS
    // ============================================
    
    function setupVenueCardListeners() {
        // Save buttons
        document.querySelectorAll('.save-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = parseInt(btn.dataset.venueId);
                toggleSaveVenue(venueId, btn);
            });
        });
        
        // Share buttons
        document.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = parseInt(btn.dataset.venueId);
                shareVenue(venueId);
            });
        });
        
        // Book buttons
        document.querySelectorAll('.book-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = parseInt(btn.dataset.venueId);
                bookVenue(venueId);
            });
        });
        
        // Details buttons
        document.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = parseInt(btn.dataset.venueId);
                showVenueDetails(venueId);
            });
        });
    }
    
    function toggleSaveVenue(venueId, btn) {
        const venue = state.venues.find(v => v.id === venueId);
        if (venue) {
            venue.isSaved = !venue.isSaved;
            
            const svg = btn.querySelector('svg');
            if (venue.isSaved) {
                svg.setAttribute('fill', 'currentColor');
                showNotification('✓ Saved to your lists');
            } else {
                svg.setAttribute('fill', 'none');
                showNotification('Removed from lists');
            }
        }
    }
    
    function shareVenue(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (venue) {
            if (navigator.share) {
                navigator.share({
                    title: venue.name,
                    text: `Check out ${venue.name} on SceneLink!`,
                    url: window.location.href
                });
            } else {
                // Fallback: copy to clipboard
                navigator.clipboard.writeText(window.location.href);
                showNotification('Link copied to clipboard!');
            }
        }
    }
    
    function bookVenue(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (venue) {
            showNotification(`Opening booking for ${venue.name}...`);
            // In production, this would open a booking modal or redirect
        }
    }
    
    function showVenueDetails(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (venue) {
            showNotification(`Loading details for ${venue.name}...`);
            // In production, this would open a details modal
        }
    }

    // ============================================
    // MAP FUNCTIONALITY
    // ============================================
    
    function initializeMap() {
        const mapElement = document.getElementById('explore-map');
        if (!mapElement) return;
        
        // In production, initialize Google Maps here
        mapElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #808080;">
                <div style="text-align: center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 20px;">
                        <circle cx="12" cy="10" r="3"></circle>
                        <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"></path>
                    </svg>
                    <p>Interactive map will load here</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">Showing ${state.filteredVenues.length} venues</p>
                </div>
            </div>
        `;
    }
    
    function setupMapControls() {
        const controls = document.querySelectorAll('.map-control-btn');
        controls.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                handleMapControl(action);
            });
        });
    }
    
    function handleMapControl(action) {
        switch(action) {
            case 'zoom-in':
                showNotification('Zooming in...');
                break;
            case 'zoom-out':
                showNotification('Zooming out...');
                break;
            case 'locate':
                getUserLocation();
                showNotification('Finding your location...');
                break;
            case 'fullscreen':
                toggleFullscreen();
                break;
        }
    }
    
    function setupMapLegend() {
        const legendCheckboxes = document.querySelectorAll('.legend-checkbox');
        legendCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const markerType = e.target.dataset.markerType;
                toggleMapMarkers(markerType, e.target.checked);
            });
        });
    }
    
    function toggleMapMarkers(type, show) {
        console.log(`${show ? 'Showing' : 'Hiding'} ${type} markers`);
        // In production, toggle marker visibility on map
    }
    
    function toggleFullscreen() {
        const mapContainer = document.querySelector('.map-container-enhanced');
        if (!document.fullscreenElement) {
            mapContainer.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    // ============================================
    // USER LOCATION
    // ============================================
    
    function getUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    state.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    console.log('User location obtained:', state.userLocation);
                    updateDistances();
                },
                (error) => {
                    console.log('Location access denied or unavailable');
                }
            );
        }
    }
    
    function updateDistances() {
        // In production, calculate real distances from user location
        // For now, distances are already in mock data
        renderVenues();
    }

    // ============================================
    // UI HELPERS
    // ============================================
    
    function updateResultsCount() {
        const countElement = document.querySelector('.results-count strong');
        if (countElement) {
            countElement.textContent = state.filteredVenues.length;
        }
    }
    
    function showLoadingState() {
        const grid = document.querySelector('.venues-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="loading-state" style="grid-column: 1 / -1;">
                    <div class="loading-spinner"></div>
                    <p class="loading-text">Finding the best venues for you...</p>
                </div>
            `;
        }
    }
    
    function hideLoadingState() {
        // Loading state is replaced by renderVenues()
    }
    
    function showEmptyState() {
        const grid = document.querySelector('.venues-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                    </div>
                    <h3 class="empty-state-title">No venues found</h3>
                    <p class="empty-state-description">
                        Try adjusting your filters or search terms to find more results.
                    </p>
                    <button class="empty-state-action" onclick="document.querySelector('.clear-filters-btn').click()">
                        Clear All Filters
                    </button>
                </div>
            `;
        }
    }
    
    function showGridView() {
        const grid = document.querySelector('.venues-grid');
        const mapSection = document.querySelector('.explore-map-section');
        
        if (grid) grid.style.display = 'grid';
        if (mapSection) mapSection.style.display = 'none';
    }
    
    function showMapView() {
        const grid = document.querySelector('.venues-grid');
        const mapSection = document.querySelector('.explore-map-section');
        
        if (grid) grid.style.display = 'none';
        if (mapSection) mapSection.style.display = 'block';
    }
    
    function showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'notification-toast';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: rgba(212, 175, 55, 0.95);
            color: #0a0a0a;
            padding: 15px 25px;
            border-radius: 12px;
            font-weight: 600;
            z-index: 10000;
            animation: slideInUp 0.3s ease-out;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutDown 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ============================================
    // SCROLL ANIMATIONS
    // ============================================
    
    function setupScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);
        
        // Observe venue cards
        document.querySelectorAll('.venue-card-enhanced').forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            card.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
            observer.observe(card);
        });
    }

    // ============================================
    // START APPLICATION
    // ============================================
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();