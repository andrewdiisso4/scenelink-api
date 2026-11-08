// Enhanced Explore Features - Advanced Filtering, Real-time Updates, Smart Sorting
// Handles venue discovery, filtering, map integration, and personalized recommendations

class ExploreManager {
    constructor() {
        this.venues = [];
        this.filteredVenues = [];
        this.activeFilters = this.loadFilters();
        this.viewMode = 'grid'; // grid or list
        this.sortBy = 'recommended';
        this.mapView = false;
        this.init();
    }

    init() {
        this.loadVenues();
        this.setupEventListeners();
        this.parseURLParams();
        this.applyFilters();
        this.setupInfiniteScroll();
    }

    setupEventListeners() {
        // View mode toggle
        const viewButtons = document.querySelectorAll('.view-mode-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.view;
                this.setViewMode(mode);
            });
        });

        // Sort dropdown
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.setSortBy(e.target.value);
            });
        }

        // Quick filters
        const quickFilters = document.querySelectorAll('.quick-filter');
        quickFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                const filterType = e.currentTarget.dataset.filter;
                this.toggleQuickFilter(filterType);
            });
        });

        // Advanced filters button
        const advancedBtn = document.getElementById('advancedFiltersBtn');
        if (advancedBtn) {
            advancedBtn.addEventListener('click', () => this.openAdvancedFilters());
        }

        // Map toggle
        const mapToggle = document.getElementById('mapToggle');
        if (mapToggle) {
            mapToggle.addEventListener('click', () => this.toggleMapView());
        }

        // Filter chips (remove)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.filter-chip-remove')) {
                const chip = e.target.closest('.filter-chip');
                const filterType = chip.dataset.filterType;
                const filterValue = chip.dataset.filterValue;
                this.removeFilter(filterType, filterValue);
            }
        });

        // Clear all filters
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearAllFilters());
        }

        // Save search button
        const saveSearchBtn = document.getElementById('saveSearchBtn');
        if (saveSearchBtn) {
            saveSearchBtn.addEventListener('click', () => this.saveCurrentSearch());
        }
    }

    parseURLParams() {
        const params = new URLSearchParams(window.location.search);
        
        // Search query
        const query = params.get('q');
        if (query) {
            const searchInput = document.getElementById('exploreSearch');
            if (searchInput) searchInput.value = query;
            this.activeFilters.query = query;
        }

        // Cuisine
        const cuisine = params.get('cuisine');
        if (cuisine) {
            this.activeFilters.cuisine = cuisine;
        }

        // Price range
        const price = params.get('price');
        if (price) {
            this.activeFilters.price = price;
        }

        // Atmosphere
        const atmosphere = params.get('atmosphere');
        if (atmosphere) {
            this.activeFilters.atmosphere = atmosphere;
        }

        // Location
        const location = params.get('location');
        if (location) {
            this.activeFilters.location = location;
        }

        // Dietary
        const dietary = params.get('dietary');
        if (dietary) {
            this.activeFilters.dietary = dietary;
        }

        // Open filters panel if requested
        if (params.get('filters') === 'open') {
            setTimeout(() => this.openAdvancedFilters(), 500);
        }
    }

    loadVenues() {
        // In a real app, this would fetch from an API
        // For now, load sample venues
        this.venues = this.generateSampleVenues();
        this.filteredVenues = [...this.venues];
    }

    generateSampleVenues() {
        const cuisines = ['Italian', 'Japanese', 'Mexican', 'French', 'American', 'Thai', 'Indian', 'Chinese'];
        const atmospheres = ['Romantic', 'Casual', 'Lively', 'Upscale', 'Trendy'];
        const neighborhoods = ['Back Bay', 'South End', 'North End', 'Seaport', 'Cambridge'];
        
        const venues = [];
        
        for (let i = 1; i <= 50; i++) {
            const cuisine = cuisines[Math.floor(Math.random() * cuisines.length)];
            const atmosphere = atmospheres[Math.floor(Math.random() * atmospheres.length)];
            const neighborhood = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];
            const price = ['$', '$$', '$$$'][Math.floor(Math.random() * 3)];
            const rating = (4 + Math.random()).toFixed(1);
            
            venues.push({
                id: i,
                name: `${cuisine} Restaurant ${i}`,
                cuisine: cuisine,
                atmosphere: atmosphere,
                neighborhood: neighborhood,
                price: price,
                rating: parseFloat(rating),
                reviewCount: Math.floor(Math.random() * 500) + 50,
                distance: (Math.random() * 3).toFixed(1),
                image: '/assets/img/placeholder-venue.svg',
                tags: this.generateTags(cuisine, atmosphere),
                openNow: Math.random() > 0.3,
                hasReservations: Math.random() > 0.4,
                dietary: this.generateDietary(),
                popularDishes: this.generatePopularDishes(cuisine)
            });
        }
        
        return venues;
    }

    generateTags(cuisine, atmosphere) {
        const tags = [cuisine, atmosphere];
        const additionalTags = ['Outdoor Seating', 'Live Music', 'Happy Hour', 'Brunch', 'Late Night'];
        
        // Add 1-3 random additional tags
        const numTags = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numTags; i++) {
            const tag = additionalTags[Math.floor(Math.random() * additionalTags.length)];
            if (!tags.includes(tag)) tags.push(tag);
        }
        
        return tags;
    }

    generateDietary() {
        const options = ['Vegetarian Options', 'Vegan Options', 'Gluten-Free Options'];
        const dietary = [];
        
        options.forEach(option => {
            if (Math.random() > 0.5) dietary.push(option);
        });
        
        return dietary;
    }

    generatePopularDishes(cuisine) {
        const dishes = {
            'Italian': ['Pasta Carbonara', 'Margherita Pizza', 'Risotto'],
            'Japanese': ['Sushi Platter', 'Ramen', 'Tempura'],
            'Mexican': ['Tacos', 'Enchiladas', 'Guacamole'],
            'French': ['Coq au Vin', 'Croissant', 'Crème Brûlée'],
            'American': ['Burger', 'Mac & Cheese', 'BBQ Ribs'],
            'Thai': ['Pad Thai', 'Green Curry', 'Tom Yum Soup'],
            'Indian': ['Butter Chicken', 'Biryani', 'Naan'],
            'Chinese': ['Kung Pao Chicken', 'Dumplings', 'Fried Rice']
        };
        
        return dishes[cuisine] || ['House Special', 'Chef\'s Choice'];
    }

    applyFilters() {
        let filtered = [...this.venues];

        // Text search
        if (this.activeFilters.query) {
            const query = this.activeFilters.query.toLowerCase();
            filtered = filtered.filter(venue => 
                venue.name.toLowerCase().includes(query) ||
                venue.cuisine.toLowerCase().includes(query) ||
                venue.tags.some(tag => tag.toLowerCase().includes(query))
            );
        }

        // Cuisine filter
        if (this.activeFilters.cuisine) {
            filtered = filtered.filter(venue => 
                venue.cuisine.toLowerCase() === this.activeFilters.cuisine.toLowerCase()
            );
        }

        // Price filter
        if (this.activeFilters.price) {
            filtered = filtered.filter(venue => venue.price === this.activeFilters.price);
        }

        // Atmosphere filter
        if (this.activeFilters.atmosphere) {
            filtered = filtered.filter(venue => 
                venue.atmosphere.toLowerCase() === this.activeFilters.atmosphere.toLowerCase()
            );
        }

        // Location filter
        if (this.activeFilters.location) {
            filtered = filtered.filter(venue => 
                venue.neighborhood.toLowerCase().includes(this.activeFilters.location.toLowerCase())
            );
        }

        // Dietary filter
        if (this.activeFilters.dietary) {
            filtered = filtered.filter(venue => 
                venue.dietary.some(d => d.toLowerCase().includes(this.activeFilters.dietary.toLowerCase()))
            );
        }

        // Open now filter
        if (this.activeFilters.openNow) {
            filtered = filtered.filter(venue => venue.openNow);
        }

        // Has reservations filter
        if (this.activeFilters.hasReservations) {
            filtered = filtered.filter(venue => venue.hasReservations);
        }

        // Rating filter
        if (this.activeFilters.minRating) {
            filtered = filtered.filter(venue => venue.rating >= this.activeFilters.minRating);
        }

        // Distance filter
        if (this.activeFilters.maxDistance) {
            filtered = filtered.filter(venue => parseFloat(venue.distance) <= this.activeFilters.maxDistance);
        }

        this.filteredVenues = filtered;
        this.sortVenues();
        this.renderVenues();
        this.updateFilterChips();
        this.updateResultsCount();
    }

    sortVenues() {
        switch(this.sortBy) {
            case 'rating':
                this.filteredVenues.sort((a, b) => b.rating - a.rating);
                break;
            case 'distance':
                this.filteredVenues.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
                break;
            case 'price-low':
                this.filteredVenues.sort((a, b) => a.price.length - b.price.length);
                break;
            case 'price-high':
                this.filteredVenues.sort((a, b) => b.price.length - a.price.length);
                break;
            case 'reviews':
                this.filteredVenues.sort((a, b) => b.reviewCount - a.reviewCount);
                break;
            case 'recommended':
            default:
                // Keep original order (could implement recommendation algorithm)
                break;
        }
    }

    renderVenues() {
        const container = document.getElementById('venuesContainer');
        if (!container) return;

        if (this.filteredVenues.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No venues found</h3>
                    <p>Try adjusting your filters or search criteria</p>
                    <button class="btn-primary" onclick="exploreManager.clearAllFilters()">
                        Clear Filters
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.filteredVenues
            .slice(0, 20) // Show first 20, load more on scroll
            .map(venue => this.renderVenueCard(venue))
            .join('');

        this.attachVenueCardListeners();
    }

    renderVenueCard(venue) {
        return `
            <div class="venue-card" data-venue-id="${venue.id}">
                <div class="venue-image">
                    <img src="${venue.image}" alt="${venue.name}" loading="lazy">
                    <button class="save-btn" onclick="exploreManager.toggleSave(${venue.id})">
                        <i class="far fa-heart"></i>
                    </button>
                    ${venue.openNow ? '<span class="open-badge">Open Now</span>' : ''}
                </div>
                
                <div class="venue-content">
                    <div class="venue-header">
                        <h3>${venue.name}</h3>
                        <span class="price-badge">${venue.price}</span>
                    </div>
                    
                    <div class="venue-meta">
                        <div class="rating">
                            <i class="fas fa-star"></i>
                            <span>${venue.rating}</span>
                            <span class="review-count">(${venue.reviewCount})</span>
                        </div>
                        <span class="distance">
                            <i class="fas fa-map-marker-alt"></i>
                            ${venue.distance} mi
                        </span>
                    </div>
                    
                    <p class="venue-info">${venue.cuisine} • ${venue.neighborhood}</p>
                    
                    <div class="venue-tags">
                        ${venue.tags.slice(0, 3).map(tag => `
                            <span class="tag">${tag}</span>
                        `).join('')}
                    </div>
                    
                    <div class="venue-actions">
                        <button class="btn-secondary" onclick="exploreManager.viewVenue(${venue.id})">
                            View Details
                        </button>
                        ${venue.hasReservations ? `
                            <button class="btn-primary" onclick="exploreManager.makeReservation(${venue.id})">
                                Reserve
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    attachVenueCardListeners() {
        // Additional listeners for venue cards if needed
    }

    setViewMode(mode) {
        this.viewMode = mode;
        
        // Update active button
        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.view === mode) {
                btn.classList.add('active');
            }
        });
        
        // Update container class
        const container = document.getElementById('venuesContainer');
        if (container) {
            container.className = `venues-${mode}`;
        }
    }

    setSortBy(sortBy) {
        this.sortBy = sortBy;
        this.sortVenues();
        this.renderVenues();
    }

    toggleQuickFilter(filterType) {
        const button = document.querySelector(`[data-filter="${filterType}"]`);
        
        if (this.activeFilters[filterType]) {
            delete this.activeFilters[filterType];
            if (button) button.classList.remove('active');
        } else {
            this.activeFilters[filterType] = true;
            if (button) button.classList.add('active');
        }
        
        this.applyFilters();
        this.saveFilters();
    }

    removeFilter(filterType, filterValue) {
        if (filterValue) {
            if (Array.isArray(this.activeFilters[filterType])) {
                this.activeFilters[filterType] = this.activeFilters[filterType]
                    .filter(v => v !== filterValue);
                if (this.activeFilters[filterType].length === 0) {
                    delete this.activeFilters[filterType];
                }
            } else {
                delete this.activeFilters[filterType];
            }
        } else {
            delete this.activeFilters[filterType];
        }
        
        this.applyFilters();
        this.saveFilters();
    }

    clearAllFilters() {
        this.activeFilters = {};
        
        // Clear quick filter buttons
        document.querySelectorAll('.quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Clear search input
        const searchInput = document.getElementById('exploreSearch');
        if (searchInput) searchInput.value = '';
        
        this.applyFilters();
        this.saveFilters();
    }

    updateFilterChips() {
        const container = document.getElementById('activeFiltersContainer');
        if (!container) return;

        const chips = [];
        
        for (const [key, value] of Object.entries(this.activeFilters)) {
            if (key === 'query') continue; // Skip query, shown in search bar
            
            let label = key.charAt(0).toUpperCase() + key.slice(1);
            let displayValue = value === true ? '' : `: ${value}`;
            
            chips.push(`
                <div class="filter-chip" data-filter-type="${key}" data-filter-value="${value}">
                    <span>${label}${displayValue}</span>
                    <button class="filter-chip-remove">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `);
        }
        
        if (chips.length > 0) {
            container.innerHTML = chips.join('') + `
                <button class="clear-all-btn" id="clearFiltersBtn">
                    Clear All
                </button>
            `;
            container.style.display = 'flex';
        } else {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    }

    updateResultsCount() {
        const countElement = document.getElementById('resultsCount');
        if (countElement) {
            countElement.textContent = `${this.filteredVenues.length} venues found`;
        }
    }

    toggleMapView() {
        this.mapView = !this.mapView;
        
        const mapContainer = document.getElementById('mapContainer');
        const venuesContainer = document.getElementById('venuesContainer');
        const mapToggle = document.getElementById('mapToggle');
        
        if (this.mapView) {
            if (mapContainer) mapContainer.classList.add('active');
            if (venuesContainer) venuesContainer.classList.add('split-view');
            if (mapToggle) mapToggle.innerHTML = '<i class="fas fa-list"></i> List View';
        } else {
            if (mapContainer) mapContainer.classList.remove('active');
            if (venuesContainer) venuesContainer.classList.remove('split-view');
            if (mapToggle) mapToggle.innerHTML = '<i class="fas fa-map"></i> Map View';
        }
    }

    openAdvancedFilters() {
        // Create and show advanced filters modal
        let modal = document.getElementById('advancedFiltersModal');
        
        if (!modal) {
            modal = this.createAdvancedFiltersModal();
            document.body.appendChild(modal);
        }
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    createAdvancedFiltersModal() {
        const modal = document.createElement('div');
        modal.id = 'advancedFiltersModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content advanced-filters-modal">
                <div class="modal-header">
                    <h2>Advanced Filters</h2>
                    <button class="close-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body">
                    <div class="filter-group">
                        <h3>Cuisine Type</h3>
                        <div class="filter-options">
                            ${['Italian', 'Japanese', 'Mexican', 'French', 'American', 'Thai', 'Indian', 'Chinese']
                                .map(cuisine => `
                                    <label class="filter-checkbox">
                                        <input type="checkbox" value="${cuisine}">
                                        <span>${cuisine}</span>
                                    </label>
                                `).join('')}
                        </div>
                    </div>
                    
                    <div class="filter-group">
                        <h3>Price Range</h3>
                        <div class="filter-options">
                            ${['$', '$$', '$$$', '$$$$'].map(price => `
                                <label class="filter-radio">
                                    <input type="radio" name="price" value="${price}">
                                    <span>${price}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="filter-group">
                        <h3>Rating</h3>
                        <div class="rating-slider">
                            <input type="range" min="0" max="5" step="0.5" value="0" id="ratingSlider">
                            <span id="ratingValue">Any</span>
                        </div>
                    </div>
                    
                    <div class="filter-group">
                        <h3>Distance</h3>
                        <div class="distance-slider">
                            <input type="range" min="0" max="10" step="0.5" value="10" id="distanceSlider">
                            <span id="distanceValue">10 mi</span>
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="exploreManager.clearAllFilters()">
                        Clear All
                    </button>
                    <button class="btn-primary" onclick="exploreManager.applyAdvancedFilters()">
                        Apply Filters
                    </button>
                </div>
            </div>
        `;
        
        // Close button
        modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        });
        
        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
        
        return modal;
    }

    applyAdvancedFilters() {
        // Get values from modal and apply
        const modal = document.getElementById('advancedFiltersModal');
        if (!modal) return;
        
        // Close modal
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Apply filters
        this.applyFilters();
        this.saveFilters();
    }

    setupInfiniteScroll() {
        const container = document.getElementById('venuesContainer');
        if (!container) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadMoreVenues();
                }
            });
        }, { threshold: 0.5 });

        // Observe a sentinel element at the bottom
        const sentinel = document.createElement('div');
        sentinel.id = 'scrollSentinel';
        container.parentElement.appendChild(sentinel);
        observer.observe(sentinel);
    }

    loadMoreVenues() {
        // Load more venues (pagination)
        console.log('Loading more venues...');
    }

    toggleSave(venueId) {
        console.log('Toggle save venue:', venueId);
        // Implement save/unsave functionality
    }

    viewVenue(venueId) {
        window.location.href = `venue.html?id=${venueId}`;
    }

    makeReservation(venueId) {
        window.location.href = `booking.html?venue=${venueId}`;
    }

    saveCurrentSearch() {
        const searchName = prompt('Name this search:');
        if (!searchName) return;
        
        const savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
        savedSearches.push({
            name: searchName,
            filters: { ...this.activeFilters },
            timestamp: new Date().toISOString()
        });
        
        localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
        alert('Search saved successfully!');
    }

    loadFilters() {
        const stored = localStorage.getItem('exploreFilters');
        return stored ? JSON.parse(stored) : {};
    }

    saveFilters() {
        localStorage.setItem('exploreFilters', JSON.stringify(this.activeFilters));
    }
}

// Initialize when DOM is ready
let exploreManager;
document.addEventListener('DOMContentLoaded', () => {
    exploreManager = new ExploreManager();
});