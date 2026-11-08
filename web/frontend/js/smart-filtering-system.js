// Smart Filtering System - Advanced Venue Filtering
// 4 Categories: Cuisine, Vibe, Price, Features

class SmartFilteringSystem {
    constructor() {
        this.activeFilters = {
            cuisine: [],
            vibe: [],
            price: [],
            features: []
        };
        
        this.filterDefinitions = this.initializeFilters();
        this.venues = [];
        this.filteredVenues = [];
        
        this.init();
    }

    init() {
        this.createFilterUI();
        this.setupEventListeners();
        this.loadVenues();
    }

    // ============================================
    // FILTER DEFINITIONS
    // ============================================

    initializeFilters() {
        return {
            cuisine: [
                { id: 'italian', label: 'Italian', icon: '🍝' },
                { id: 'japanese', label: 'Japanese', icon: '🍱' },
                { id: 'chinese', label: 'Chinese', icon: '🥢' },
                { id: 'mexican', label: 'Mexican', icon: '🌮' },
                { id: 'thai', label: 'Thai', icon: '🍜' },
                { id: 'indian', label: 'Indian', icon: '🍛' },
                { id: 'french', label: 'French', icon: '🥐' },
                { id: 'american', label: 'American', icon: '🍔' },
                { id: 'mediterranean', label: 'Mediterranean', icon: '🥗' },
                { id: 'korean', label: 'Korean', icon: '🍲' },
                { id: 'vietnamese', label: 'Vietnamese', icon: '🍲' },
                { id: 'greek', label: 'Greek', icon: '🥙' },
                { id: 'spanish', label: 'Spanish', icon: '🥘' },
                { id: 'seafood', label: 'Seafood', icon: '🦞' },
                { id: 'steakhouse', label: 'Steakhouse', icon: '🥩' }
            ],
            vibe: [
                { id: 'romantic', label: 'Romantic', icon: '💕', description: 'Perfect for dates' },
                { id: 'casual', label: 'Casual', icon: '😊', description: 'Relaxed atmosphere' },
                { id: 'upscale', label: 'Upscale', icon: '✨', description: 'Fine dining' },
                { id: 'lively', label: 'Lively', icon: '🎉', description: 'Energetic vibe' },
                { id: 'cozy', label: 'Cozy', icon: '🕯️', description: 'Intimate setting' },
                { id: 'trendy', label: 'Trendy', icon: '🌟', description: 'Hip & modern' },
                { id: 'family', label: 'Family-Friendly', icon: '👨‍👩‍👧', description: 'Great for kids' },
                { id: 'quiet', label: 'Quiet', icon: '🤫', description: 'Peaceful dining' }
            ],
            price: [
                { id: 'budget', label: '$', description: 'Under $15 per person', range: [0, 15] },
                { id: 'moderate', label: '$$', description: '$15-30 per person', range: [15, 30] },
                { id: 'expensive', label: '$$$', description: '$30-60 per person', range: [30, 60] },
                { id: 'luxury', label: '$$$$', description: '$60+ per person', range: [60, 999] }
            ],
            features: [
                { id: 'outdoor', label: 'Outdoor Seating', icon: '☀️' },
                { id: 'rooftop', label: 'Rooftop', icon: '🏙️' },
                { id: 'live-music', label: 'Live Music', icon: '🎵' },
                { id: 'happy-hour', label: 'Happy Hour', icon: '🍻' },
                { id: 'brunch', label: 'Brunch', icon: '🥞' },
                { id: 'late-night', label: 'Late Night', icon: '🌙' },
                { id: 'vegan', label: 'Vegan Options', icon: '🌱' },
                { id: 'gluten-free', label: 'Gluten-Free', icon: '🌾' },
                { id: 'parking', label: 'Parking', icon: '🅿️' },
                { id: 'reservations', label: 'Reservations', icon: '📅' },
                { id: 'delivery', label: 'Delivery', icon: '🚗' },
                { id: 'wifi', label: 'Free WiFi', icon: '📶' },
                { id: 'pet-friendly', label: 'Pet-Friendly', icon: '🐕' },
                { id: 'private-dining', label: 'Private Dining', icon: '🚪' }
            ]
        };
    }

    // ============================================
    // UI CREATION
    // ============================================

    createFilterUI() {
        const filterHTML = `
            <div class="smart-filter-panel" id="smartFilterPanel">
                <div class="filter-panel-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                        Smart Filters
                    </h3>
                    <div class="filter-actions">
                        <span class="filter-count" id="filterCount">0 active</span>
                        <button class="filter-reset" id="filterResetBtn">Clear All</button>
                    </div>
                </div>

                <div class="filter-categories">
                    <!-- Cuisine Filter -->
                    <div class="filter-category">
                        <button class="filter-category-header" data-category="cuisine">
                            <span class="category-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                                    <line x1="6" y1="1" x2="6" y2="4"></line>
                                    <line x1="10" y1="1" x2="10" y2="4"></line>
                                    <line x1="14" y1="1" x2="14" y2="4"></line>
                                </svg>
                                Cuisine
                            </span>
                            <span class="category-badge" id="cuisineBadge">0</span>
                            <svg class="category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="filter-category-content" id="cuisineFilters">
                            ${this.renderFilterOptions('cuisine')}
                        </div>
                    </div>

                    <!-- Vibe Filter -->
                    <div class="filter-category">
                        <button class="filter-category-header" data-category="vibe">
                            <span class="category-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                                </svg>
                                Vibe
                            </span>
                            <span class="category-badge" id="vibeBadge">0</span>
                            <svg class="category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="filter-category-content" id="vibeFilters">
                            ${this.renderFilterOptions('vibe')}
                        </div>
                    </div>

                    <!-- Price Filter -->
                    <div class="filter-category">
                        <button class="filter-category-header" data-category="price">
                            <span class="category-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="1" x2="12" y2="23"></line>
                                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                                Price Range
                            </span>
                            <span class="category-badge" id="priceBadge">0</span>
                            <svg class="category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="filter-category-content" id="priceFilters">
                            ${this.renderFilterOptions('price')}
                        </div>
                    </div>

                    <!-- Features Filter -->
                    <div class="filter-category">
                        <button class="filter-category-header" data-category="features">
                            <span class="category-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 11 12 14 22 4"></polyline>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                </svg>
                                Features
                            </span>
                            <span class="category-badge" id="featuresBadge">0</span>
                            <svg class="category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="filter-category-content" id="featuresFilters">
                            ${this.renderFilterOptions('features')}
                        </div>
                    </div>
                </div>

                <div class="filter-panel-footer">
                    <button class="btn-apply-filters" id="applyFiltersBtn">
                        Apply Filters
                    </button>
                </div>
            </div>
        `;

        // Insert filter panel into page
        const container = document.querySelector('.filter-container') || document.querySelector('.explore-content');
        if (container) {
            container.insertAdjacentHTML('afterbegin', filterHTML);
        }
    }

    renderFilterOptions(category) {
        const options = this.filterDefinitions[category];
        
        if (category === 'price') {
            return options.map(option => `
                <label class="filter-option price-option">
                    <input 
                        type="checkbox" 
                        class="filter-checkbox" 
                        data-category="${category}" 
                        data-filter="${option.id}"
                    >
                    <span class="filter-label">
                        <span class="price-label">${option.label}</span>
                        <span class="price-description">${option.description}</span>
                    </span>
                </label>
            `).join('');
        }

        return options.map(option => `
            <label class="filter-option">
                <input 
                    type="checkbox" 
                    class="filter-checkbox" 
                    data-category="${category}" 
                    data-filter="${option.id}"
                >
                <span class="filter-label">
                    ${option.icon ? `<span class="filter-icon">${option.icon}</span>` : ''}
                    <span class="filter-text">${option.label}</span>
                </span>
            </label>
        `).join('');
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        // Category toggle
        document.querySelectorAll('.filter-category-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const category = header.closest('.filter-category');
                category.classList.toggle('active');
            });
        });

        // Filter checkboxes
        document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleFilterChange(e.target);
            });
        });

        // Reset button
        document.getElementById('filterResetBtn')?.addEventListener('click', () => {
            this.resetFilters();
        });

        // Apply button
        document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
            this.applyFilters();
        });
    }

    // ============================================
    // FILTER LOGIC
    // ============================================

    handleFilterChange(checkbox) {
        const category = checkbox.dataset.category;
        const filter = checkbox.dataset.filter;

        if (checkbox.checked) {
            if (!this.activeFilters[category].includes(filter)) {
                this.activeFilters[category].push(filter);
            }
        } else {
            this.activeFilters[category] = this.activeFilters[category].filter(f => f !== filter);
        }

        this.updateFilterUI();
        this.applyFilters();
    }

    applyFilters() {
        this.filteredVenues = this.venues.filter(venue => {
            // Check cuisine
            if (this.activeFilters.cuisine.length > 0) {
                if (!this.activeFilters.cuisine.includes(venue.cuisine)) {
                    return false;
                }
            }

            // Check vibe
            if (this.activeFilters.vibe.length > 0) {
                if (!venue.vibes || !venue.vibes.some(v => this.activeFilters.vibe.includes(v))) {
                    return false;
                }
            }

            // Check price
            if (this.activeFilters.price.length > 0) {
                const priceMatches = this.activeFilters.price.some(priceId => {
                    const priceFilter = this.filterDefinitions.price.find(p => p.id === priceId);
                    return venue.priceLevel >= priceFilter.range[0] && venue.priceLevel <= priceFilter.range[1];
                });
                if (!priceMatches) {
                    return false;
                }
            }

            // Check features
            if (this.activeFilters.features.length > 0) {
                if (!venue.features || !this.activeFilters.features.every(f => venue.features.includes(f))) {
                    return false;
                }
            }

            return true;
        });

        this.displayFilteredResults();
    }

    resetFilters() {
        this.activeFilters = {
            cuisine: [],
            vibe: [],
            price: [],
            features: []
        };

        // Uncheck all checkboxes
        document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });

        this.updateFilterUI();
        this.filteredVenues = [...this.venues];
        this.displayFilteredResults();
    }

    updateFilterUI() {
        // Update badges
        Object.keys(this.activeFilters).forEach(category => {
            const count = this.activeFilters[category].length;
            const badge = document.getElementById(`${category}Badge`);
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        });

        // Update total count
        const totalCount = Object.values(this.activeFilters).reduce((sum, arr) => sum + arr.length, 0);
        const filterCount = document.getElementById('filterCount');
        if (filterCount) {
            filterCount.textContent = `${totalCount} active`;
        }
    }

    // ============================================
    // VENUE DATA & DISPLAY
    // ============================================

    loadVenues() {
        // In production, this would fetch from API
        // For now, using sample data
        this.venues = this.generateSampleVenues();
        this.filteredVenues = [...this.venues];
    }

    generateSampleVenues() {
        // Sample venue data
        return [
            {
                id: 1,
                name: 'Bella Vista',
                cuisine: 'italian',
                vibes: ['romantic', 'upscale'],
                priceLevel: 45,
                features: ['outdoor', 'reservations', 'wine-bar'],
                rating: 4.5,
                reviewCount: 342
            },
            // Add more sample venues as needed
        ];
    }

    displayFilteredResults() {
        console.log(`Filtered results: ${this.filteredVenues.length} venues`);
        
        // Trigger event for other components to update
        const event = new CustomEvent('filtersApplied', {
            detail: {
                venues: this.filteredVenues,
                filters: this.activeFilters
            }
        });
        document.dispatchEvent(event);
    }

    // ============================================
    // PUBLIC API
    // ============================================

    getFilteredVenues() {
        return this.filteredVenues;
    }

    getActiveFilters() {
        return this.activeFilters;
    }
}

// Initialize Smart Filtering System
let smartFilters;
document.addEventListener('DOMContentLoaded', () => {
    smartFilters = new SmartFilteringSystem();
    console.log('Smart Filtering System initialized');
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.smartFilters = smartFilters;
}