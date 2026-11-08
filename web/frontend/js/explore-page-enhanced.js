// Enhanced Explore Page - AI-Powered Search with Social Integration
// Complete venue discovery experience with maps, filters, and social features

class EnhancedExplorePage {
    constructor() {
        this.venues = [];
        this.filteredVenues = [];
        this.currentView = 'grid'; // grid or list
        this.sortBy = 'relevance'; // relevance, rating, distance, price
        this.userLocation = null;
        this.init();
    }

    init() {
        this.getUserLocation();
        this.setupSearchInterface();
        this.setupViewToggles();
        this.setupSortOptions();
        this.loadVenues();
        this.setupInfiniteScroll();
        this.integrateWithFilters();
        this.setupSocialFeatures();
    }

    // ============================================
    // ENHANCED SEARCH INTERFACE
    // ============================================

    setupSearchInterface() {
        const searchHTML = `
            <div class="explore-search-enhanced">
                <div class="search-container-main">
                    <div class="search-input-wrapper">
                        <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <input 
                            type="text" 
                            class="search-input-main" 
                            id="exploreSearchInput"
                            placeholder="Try: 'romantic Italian restaurant with outdoor seating'"
                        >
                        <button class="search-clear" id="searchClearBtn" style="display: none;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="search-suggestions-examples">
                        <span class="suggestion-label">Try:</span>
                        <button class="suggestion-chip" onclick="explorePage.searchExample('best sushi near me')">
                            🍱 Best sushi near me
                        </button>
                        <button class="suggestion-chip" onclick="explorePage.searchExample('romantic date spots')">
                            💕 Romantic date spots
                        </button>
                        <button class="suggestion-chip" onclick="explorePage.searchExample('rooftop bars')">
                            🏙️ Rooftop bars
                        </button>
                        <button class="suggestion-chip" onclick="explorePage.searchExample('brunch with friends')">
                            🥞 Brunch spots
                        </button>
                    </div>
                </div>

                <div class="search-actions">
                    <button class="btn-near-me" id="nearMeBtn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="10" r="3"></circle>
                            <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path>
                        </svg>
                        Near Me
                    </button>
                    
                    <button class="btn-advanced-filters" id="advancedFiltersBtn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                        Filters
                        <span class="filter-badge" id="filterBadgeCount">0</span>
                    </button>
                </div>
            </div>

            <div class="explore-toolbar">
                <div class="toolbar-left">
                    <span class="results-count" id="resultsCount">Loading venues...</span>
                    
                    <div class="social-filters">
                        <button class="social-filter-btn" data-filter="all">
                            All Venues
                        </button>
                        <button class="social-filter-btn" data-filter="friends">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            Friends' Favorites
                        </button>
                        <button class="social-filter-btn" data-filter="trending">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                                <polyline points="17 6 23 6 23 12"></polyline>
                            </svg>
                            Trending
                        </button>
                        <button class="social-filter-btn" data-filter="saved">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                            My Saved
                        </button>
                    </div>
                </div>

                <div class="toolbar-right">
                    <div class="sort-dropdown">
                        <select class="sort-select" id="sortSelect">
                            <option value="relevance">Most Relevant</option>
                            <option value="rating">Highest Rated</option>
                            <option value="distance">Nearest</option>
                            <option value="price-low">Price: Low to High</option>
                            <option value="price-high">Price: High to Low</option>
                        </select>
                    </div>

                    <div class="view-toggle">
                        <button class="view-btn active" data-view="grid" title="Grid View">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                            </svg>
                        </button>
                        <button class="view-btn" data-view="list" title="List View">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="8" y1="6" x2="21" y2="6"></line>
                                <line x1="8" y1="12" x2="21" y2="12"></line>
                                <line x1="8" y1="18" x2="21" y2="18"></line>
                                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                <line x1="3" y1="18" x2="3.01" y2="18"></line>
                            </svg>
                        </button>
                        <button class="view-btn" data-view="map" title="Map View">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                                <line x1="8" y1="2" x2="8" y2="18"></line>
                                <line x1="16" y1="6" x2="16" y2="22"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const container = document.querySelector('.explore-hero') || document.querySelector('.explore-content');
        if (container) {
            container.insertAdjacentHTML('afterbegin', searchHTML);
            this.setupSearchListeners();
        }
    }

    setupSearchListeners() {
        const searchInput = document.getElementById('exploreSearchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        const nearMeBtn = document.getElementById('nearMeBtn');

        searchInput?.addEventListener('input', (e) => {
            clearBtn.style.display = e.target.value ? 'block' : 'none';
            this.handleSearch(e.target.value);
        });

        clearBtn?.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            this.resetSearch();
        });

        nearMeBtn?.addEventListener('click', () => {
            this.searchNearMe();
        });

        // Social filter buttons
        document.querySelectorAll('.social-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.social-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.applySocialFilter(btn.dataset.filter);
            });
        });
    }

    searchExample(query) {
        const searchInput = document.getElementById('exploreSearchInput');
        if (searchInput) {
            searchInput.value = query;
            this.handleSearch(query);
        }
    }

    handleSearch(query) {
        if (query.length < 2) {
            this.filteredVenues = [...this.venues];
            this.displayVenues();
            return;
        }

        // Use AI search if available
        if (window.aiSearch) {
            const parsedQuery = window.aiSearch.parseNaturalLanguage(query);
            this.applyAISearch(parsedQuery);
        } else {
            this.applyBasicSearch(query);
        }
    }

    applyAISearch(parsedQuery) {
        // Filter venues based on AI-parsed query
        this.filteredVenues = this.venues.filter(venue => {
            // Match cuisine
            if (parsedQuery.entities.cuisine && venue.cuisine !== parsedQuery.entities.cuisine.toLowerCase()) {
                return false;
            }

            // Match vibe
            if (parsedQuery.entities.atmosphere && !venue.vibes?.includes(parsedQuery.entities.atmosphere)) {
                return false;
            }

            // Match features
            if (parsedQuery.entities.features.length > 0) {
                if (!parsedQuery.entities.features.every(f => venue.features?.includes(f))) {
                    return false;
                }
            }

            return true;
        });

        this.displayVenues();
    }

    applyBasicSearch(query) {
        const lowerQuery = query.toLowerCase();
        this.filteredVenues = this.venues.filter(venue => 
            venue.name.toLowerCase().includes(lowerQuery) ||
            venue.cuisine?.toLowerCase().includes(lowerQuery) ||
            venue.description?.toLowerCase().includes(lowerQuery)
        );
        this.displayVenues();
    }

    resetSearch() {
        this.filteredVenues = [...this.venues];
        this.displayVenues();
    }

    // ============================================
    // SOCIAL FEATURES INTEGRATION
    // ============================================

    setupSocialFeatures() {
        // Add friends' favorites indicator
        this.loadFriendsFavorites();
        
        // Add trending indicator
        this.loadTrendingVenues();
        
        // Add saved venues
        this.loadSavedVenues();
    }

    loadFriendsFavorites() {
        // Simulate loading friends' favorites
        // In production, this would fetch from API
        const friendsFavorites = [1, 3, 5, 7]; // venue IDs
        
        this.venues.forEach(venue => {
            if (friendsFavorites.includes(venue.id)) {
                venue.friendsFavorite = true;
                venue.friendsCount = Math.floor(Math.random() * 10) + 1;
            }
        });
    }

    loadTrendingVenues() {
        // Mark trending venues
        const trendingIds = [2, 4, 6, 8];
        
        this.venues.forEach(venue => {
            if (trendingIds.includes(venue.id)) {
                venue.trending = true;
            }
        });
    }

    loadSavedVenues() {
        const saved = JSON.parse(localStorage.getItem('savedVenues') || '[]');
        this.venues.forEach(venue => {
            venue.saved = saved.includes(venue.id);
        });
    }

    applySocialFilter(filter) {
        switch(filter) {
            case 'friends':
                this.filteredVenues = this.venues.filter(v => v.friendsFavorite);
                break;
            case 'trending':
                this.filteredVenues = this.venues.filter(v => v.trending);
                break;
            case 'saved':
                this.filteredVenues = this.venues.filter(v => v.saved);
                break;
            default:
                this.filteredVenues = [...this.venues];
        }
        this.displayVenues();
    }

    // ============================================
    // VIEW MANAGEMENT
    // ============================================

    setupViewToggles() {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentView = btn.dataset.view;
                this.displayVenues();
            });
        });
    }

    setupSortOptions() {
        const sortSelect = document.getElementById('sortSelect');
        sortSelect?.addEventListener('change', (e) => {
            this.sortBy = e.target.value;
            this.sortVenues();
            this.displayVenues();
        });
    }

    sortVenues() {
        switch(this.sortBy) {
            case 'rating':
                this.filteredVenues.sort((a, b) => b.rating - a.rating);
                break;
            case 'distance':
                if (this.userLocation) {
                    this.filteredVenues.sort((a, b) => a.distance - b.distance);
                }
                break;
            case 'price-low':
                this.filteredVenues.sort((a, b) => a.priceLevel - b.priceLevel);
                break;
            case 'price-high':
                this.filteredVenues.sort((a, b) => b.priceLevel - a.priceLevel);
                break;
            default:
                // relevance - keep current order
                break;
        }
    }

    // ============================================
    // VENUE DISPLAY
    // ============================================

    displayVenues() {
        const container = document.getElementById('venuesContainer');
        if (!container) return;

        // Update results count
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${this.filteredVenues.length} venues found`;
        }

        // Clear container
        container.innerHTML = '';
        container.className = `venues-container view-${this.currentView}`;

        // Display venues based on view
        if (this.currentView === 'map') {
            this.displayMapView();
        } else {
            this.filteredVenues.forEach(venue => {
                const card = this.createVenueCard(venue, this.currentView);
                container.appendChild(card);
            });
        }

        // Refresh scroll animations
        if (window.scrollAnimations) {
            window.scrollAnimations.refresh();
        }
    }

    createVenueCard(venue, view) {
        const card = document.createElement('div');
        card.className = `venue-card ${view}-view scroll-reveal`;
        card.dataset.venueId = venue.id;

        const socialBadges = this.createSocialBadges(venue);
        const starRating = window.googlePlaces ? 
            window.googlePlaces.createStarRating(venue.rating, venue.reviewCount) :
            `<span class="rating">${venue.rating} ⭐ (${venue.reviewCount})</span>`;

        card.innerHTML = `
            ${socialBadges}
            <div class="venue-image">
                <img src="${venue.image || '/assets/img/placeholder-venue.svg'}" 
                     alt="${venue.name}"
                     loading="lazy">
                <button class="btn-save-venue ${venue.saved ? 'saved' : ''}" 
                        onclick="explorePage.toggleSave(${venue.id})">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="${venue.saved ? 'currentColor' : 'none'}" 
                         stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>
            </div>
            <div class="venue-content">
                <h3 class="venue-name">${venue.name}</h3>
                <p class="venue-cuisine">${venue.cuisine} • ${this.getPriceDisplay(venue.priceLevel)}</p>
                ${starRating}
                <p class="venue-description">${venue.description || ''}</p>
                <div class="venue-tags">
                    ${venue.features?.slice(0, 3).map(f => `<span class="tag">${f}</span>`).join('') || ''}
                </div>
                <div class="venue-actions">
                    <button class="btn-view-details" onclick="explorePage.viewDetails(${venue.id})">
                        View Details
                    </button>
                    ${window.googlePlaces ? window.googlePlaces.createBookingButton(venue) : ''}
                </div>
            </div>
        `;

        return card;
    }

    createSocialBadges(venue) {
        let badges = '';
        
        if (venue.friendsFavorite) {
            badges += `
                <div class="social-badge friends-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                    </svg>
                    ${venue.friendsCount} friends
                </div>
            `;
        }
        
        if (venue.trending) {
            badges += `
                <div class="social-badge trending-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                    </svg>
                    Trending
                </div>
            `;
        }
        
        return badges ? `<div class="social-badges">${badges}</div>` : '';
    }

    getPriceDisplay(level) {
        return '$'.repeat(level || 2);
    }

    // ============================================
    // VENUE ACTIONS
    // ============================================

    toggleSave(venueId) {
        const venue = this.venues.find(v => v.id === venueId);
        if (!venue) return;

        venue.saved = !venue.saved;
        
        // Update localStorage
        let saved = JSON.parse(localStorage.getItem('savedVenues') || '[]');
        if (venue.saved) {
            saved.push(venueId);
        } else {
            saved = saved.filter(id => id !== venueId);
        }
        localStorage.setItem('savedVenues', JSON.stringify(saved));

        // Update UI
        this.displayVenues();
        
        if (typeof showNotification === 'function') {
            showNotification(
                'success',
                venue.saved ? 'Saved!' : 'Removed',
                venue.saved ? `${venue.name} added to your saved venues` : `${venue.name} removed from saved venues`
            );
        }
    }

    viewDetails(venueId) {
        // Navigate to venue details or open modal
        window.location.href = `venue-details.html?id=${venueId}`;
    }

    // ============================================
    // LOCATION & MAP
    // ============================================

    getUserLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    this.calculateDistances();
                },
                (error) => {
                    console.log('Location access denied');
                }
            );
        }
    }

    calculateDistances() {
        if (!this.userLocation) return;

        this.venues.forEach(venue => {
            if (venue.location) {
                venue.distance = this.getDistance(
                    this.userLocation.lat,
                    this.userLocation.lng,
                    venue.location.lat,
                    venue.location.lng
                );
            }
        });
    }

    getDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(1);
    }

    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    searchNearMe() {
        if (!this.userLocation) {
            if (typeof showNotification === 'function') {
                showNotification('info', 'Location Required', 'Please enable location access to use this feature');
            }
            this.getUserLocation();
            return;
        }

        // Sort by distance
        this.sortBy = 'distance';
        this.sortVenues();
        this.displayVenues();
        
        if (typeof showNotification === 'function') {
            showNotification('success', 'Showing Nearby', 'Venues sorted by distance from your location');
        }
    }

    displayMapView() {
        // Integrate with map system
        if (window.realtimeFeatures) {
            window.realtimeFeatures.switchMapView('all');
        }
    }

    // ============================================
    // INFINITE SCROLL
    // ============================================

    setupInfiniteScroll() {
        let loading = false;
        
        window.addEventListener('scroll', () => {
            if (loading) return;
            
            const scrollPosition = window.innerHeight + window.scrollY;
            const threshold = document.documentElement.scrollHeight - 500;
            
            if (scrollPosition >= threshold) {
                loading = true;
                this.loadMoreVenues().then(() => {
                    loading = false;
                });
            }
        });
    }

    async loadMoreVenues() {
        // Simulate loading more venues
        // In production, this would fetch from API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Add more venues to the list
        const moreVenues = this.generateMockVenues(10);
        this.venues.push(...moreVenues);
        this.filteredVenues.push(...moreVenues);
        
        // Append to display
        const container = document.getElementById('venuesContainer');
        if (container && this.currentView !== 'map') {
            moreVenues.forEach(venue => {
                const card = this.createVenueCard(venue, this.currentView);
                container.appendChild(card);
            });
        }
    }

    // ============================================
    // FILTER INTEGRATION
    // ============================================

    integrateWithFilters() {
        // Listen for filter events from smart filtering system
        document.addEventListener('filtersApplied', (e) => {
            this.filteredVenues = e.detail.venues;
            this.displayVenues();
        });
    }

    // ============================================
    // DATA LOADING
    // ============================================

    loadVenues() {
        // In production, fetch from API
        this.venues = this.generateMockVenues(50);
        this.filteredVenues = [...this.venues];
        this.displayVenues();
    }

    generateMockVenues(count) {
        const cuisines = ['Italian', 'Japanese', 'Mexican', 'Thai', 'American', 'French', 'Chinese', 'Indian'];
        const names = ['Bella Vista', 'Sakura', 'El Mariachi', 'Thai Basil', 'The Grill', 'Chez Pierre', 'Golden Dragon', 'Spice Route'];
        
        return Array.from({ length: count }, (_, i) => ({
            id: Date.now() + i,
            name: names[i % names.length] + ' ' + (Math.floor(i / names.length) + 1),
            cuisine: cuisines[i % cuisines.length],
            rating: 3.5 + Math.random() * 1.5,
            reviewCount: Math.floor(Math.random() * 500) + 50,
            priceLevel: Math.floor(Math.random() * 4) + 1,
            description: 'A wonderful dining experience with excellent food and atmosphere.',
            features: ['outdoor-seating', 'reservations', 'happy-hour'].slice(0, Math.floor(Math.random() * 3) + 1),
            vibes: ['casual', 'romantic', 'upscale'].slice(0, Math.floor(Math.random() * 2) + 1),
            location: {
                lat: 42.3601 + (Math.random() - 0.5) * 0.1,
                lng: -71.0589 + (Math.random() - 0.5) * 0.1
            },
            image: '/assets/img/placeholder-venue.svg'
        }));
    }
}

// Initialize Enhanced Explore Page
let explorePage;
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.explore-page') || document.getElementById('venuesContainer')) {
        explorePage = new EnhancedExplorePage();
        console.log('Enhanced Explore Page initialized');
    }
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.explorePage = explorePage;
}