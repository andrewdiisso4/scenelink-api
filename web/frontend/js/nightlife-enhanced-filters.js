// Nightlife Enhanced Filters Functionality
class NightlifeEnhancedFilters {
    constructor() {
        this.activeFilters = {
            vibe: null,
            type: null,
            neighborhood: null
        };
        this.init();
    }

    init() {
        this.initializeFilterChips();
        this.initializeFilterFunctionality();
    }

    initializeFilterChips() {
        // Get all filter chips
        const filterChips = document.querySelectorAll('.filter-chip');
        
        filterChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                this.handleFilterClick(chip);
            });
        });
    }

    handleFilterClick(chip) {
        const filterType = this.getFilterType(chip);
        const filterValue = chip.dataset[filterType];
        
        // Remove active class from all chips of the same type
        document.querySelectorAll(`[data-${filterType}]`).forEach(c => {
            c.classList.remove('active');
        });
        
        // Toggle active state
        if (this.activeFilters[filterType] === filterValue) {
            // If clicking the same filter, deactivate it
            this.activeFilters[filterType] = null;
        } else {
            // Activate the new filter
            chip.classList.add('active');
            this.activeFilters[filterType] = filterValue;
        }
        
        // Apply filters
        this.applyFilters();
        
        console.log('Active filters:', this.activeFilters);
    }

    getFilterType(chip) {
        if (chip.dataset.vibe) return 'vibe';
        if (chip.dataset.type) return 'type';
        if (chip.dataset.neighborhood) return 'neighborhood';
        return null;
    }

    applyFilters() {
        // Get all venue cards or map markers
        const venues = document.querySelectorAll('.venue-card, .nightlife-venue, [data-venue]');
        
        venues.forEach(venue => {
            let shouldShow = true;
            
            // Check vibe filter
            if (this.activeFilters.vibe) {
                const venueVibe = venue.dataset.vibe || venue.textContent.toLowerCase();
                shouldShow = shouldShow && this.matchesFilter(venueVibe, this.activeFilters.vibe);
            }
            
            // Check type filter
            if (this.activeFilters.type) {
                const venueType = venue.dataset.type || venue.textContent.toLowerCase();
                shouldShow = shouldShow && this.matchesFilter(venueType, this.activeFilters.type);
            }
            
            // Check neighborhood filter
            if (this.activeFilters.neighborhood) {
                const venueNeighborhood = venue.dataset.neighborhood || venue.textContent.toLowerCase();
                shouldShow = shouldShow && this.matchesFilter(venueNeighborhood, this.activeFilters.neighborhood);
            }
            
            // Show/hide venue
            if (venue.style) {
                venue.style.display = shouldShow ? 'block' : 'none';
            }
        });
        
        // Update map markers if applicable
        this.updateMapMarkers();
    }

    matchesFilter(venueData, filterValue) {
        const venueText = venueData.toString().toLowerCase();
        const filterText = filterValue.toLowerCase();
        
        // Direct match
        if (venueText.includes(filterText)) {
            return true;
        }
        
        // Fuzzy matching for related terms
        const matchMap = {
            'energetic': ['high energy', 'lively', 'party', 'dance'],
            'chill': ['relaxed', 'laid back', 'calm', 'quiet'],
            'upscale': ['fancy', 'luxury', 'premium', 'high-end'],
            'casual': ['informal', 'relaxed', 'comfortable'],
            'nightclub': ['club', 'dance club', 'night club'],
            'bar': ['pub', 'tavern', 'saloon'],
            'lounge': ['cocktail lounge', 'bar lounge'],
            'rooftop': ['roof', 'terrace', 'outdoor'],
            'downtown': ['city center', 'central'],
            'back-bay': ['back bay', 'backbay'],
            'cambridge': ['harvard', 'mit'],
            'seaport': ['waterfront', 'harbor']
        };
        
        const relatedTerms = matchMap[filterText] || [];
        return relatedTerms.some(term => venueText.includes(term));
    }

    updateMapMarkers() {
        // Update map markers based on filters
        if (window.nightlifeMap && typeof window.updateMapMarkers === 'function') {
            window.updateMapMarkers(this.activeFilters);
        }
    }

    resetFilters() {
        // Reset all filters
        this.activeFilters = {
            vibe: null,
            type: null,
            neighborhood: null
        };
        
        // Remove all active classes
        document.querySelectorAll('.filter-chip.active').forEach(chip => {
            chip.classList.remove('active');
        });
        
        // Show all venues
        document.querySelectorAll('.venue-card, .nightlife-venue, [data-venue]').forEach(venue => {
            if (venue.style) {
                venue.style.display = 'block';
            }
        });
        
        // Update map
        this.updateMapMarkers();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.nightlife-filter-buttons')) {
        window.nightlifeFilters = new NightlifeEnhancedFilters();
        console.log('Nightlife enhanced filters initialized');
    }
});