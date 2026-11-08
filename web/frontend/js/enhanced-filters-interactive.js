// Enhanced Filters Interactive JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize enhanced filters
    initializeEnhancedFilters();
    
    // Setup filter interactions
    setupFilterInteractions();
    
    // Setup advanced filters toggle
    setupAdvancedFilters();
    
    // Setup search functionality
    setupSearchFunctionality();
});

function initializeEnhancedFilters() {
    console.log('Enhanced filters initialized');
    
    // Set up active states
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            toggleFilterChip(this);
        });
    });
    
    document.querySelectorAll('.quick-filter-pill').forEach(pill => {
        pill.addEventListener('click', function() {
            toggleQuickFilter(this);
        });
    });
}

function setupFilterInteractions() {
    // Filter category interactions
    document.querySelectorAll('.filter-category').forEach(category => {
        category.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        category.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
    
    // Apply filters button
    document.querySelector('.apply-filters-btn')?.addEventListener('click', applyAllFilters);
    
    // Clear filters button
    document.querySelector('.clear-filters-btn')?.addEventListener('click', clearAllFilters);
}

function setupAdvancedFilters() {
    const toggleBtn = document.querySelector('.toggle-advanced-btn');
    const panel = document.getElementById('advancedFiltersPanel');
    
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', function() {
            panel.classList.toggle('active');
            
            // Update button text
            if (panel.classList.contains('active')) {
                toggleBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="M21 21l-4.35-4.35"></path>
                        <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                    Hide Advanced Filters
                `;
            } else {
                toggleBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="M21 21l-4.35-4.35"></path>
                        <line x1="11" y1="8" x2="11" y2="14"></line>
                        <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                    Advanced Filters
                `;
            }
        });
    }
}

function setupSearchFunctionality() {
    const searchInput = document.querySelector('.search-input');
    const locationBtn = document.querySelector('.search-location-btn');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            handleSearchInput(this.value);
        });
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }
    
    if (locationBtn) {
        locationBtn.addEventListener('click', function() {
            requestUserLocation();
        });
    }
}

function toggleFilterChip(chip) {
    // Allow multiple selection within category
    const category = chip.closest('.filter-category');
    
    // Toggle active state
    chip.classList.toggle('active');
    
    // Update filter state
    updateFilterState();
    
    // Trigger filter animation
    animateFilterSelection(chip);
}

function toggleQuickFilter(pill) {
    // Remove active from siblings
    document.querySelectorAll('.quick-filter-pill').forEach(p => {
        p.classList.remove('active');
    });
    
    // Add active to clicked pill
    pill.classList.add('active');
    
    // Apply quick filter
    applyQuickFilter(pill.dataset.quick);
}

function updateFilterState() {
    const activeFilters = {
        vibe: getActiveFilters('data-vibe'),
        group: getActiveFilters('data-group'),
        price: getActiveFilters('data-price'),
        occasion: getActiveFilters('data-occasion')
    };
    
    console.log('Active filters:', activeFilters);
    
    // Store in localStorage for persistence
    localStorage.setItem('activeFilters', JSON.stringify(activeFilters));
}

function getActiveFilters(dataAttribute) {
    const filters = document.querySelectorAll(`.filter-chip.active[${dataAttribute}]`);
    return Array.from(filters).map(f => f.dataset[dataAttribute.replace('data-', '')]);
}

function animateFilterSelection(element) {
    element.style.transform = 'scale(0.95)';
    setTimeout(() => {
        element.style.transform = 'scale(1)';
    }, 150);
}

function applyAllFilters() {
    const filters = getAllActiveFilters();
    
    // Show loading state
    showFilterLoading();
    
    // Simulate API call
    setTimeout(() => {
        console.log('Applying filters:', filters);
        hideFilterLoading();
        showFilterResults();
    }, 1000);
}

function clearAllFilters() {
    // Clear all active states
    document.querySelectorAll('.filter-chip.active').forEach(chip => {
        chip.classList.remove('active');
    });
    
    // Reset quick filters
    document.querySelectorAll('.quick-filter-pill').forEach(pill => {
        pill.classList.remove('active');
    });
    
    // Clear advanced filters
    document.querySelectorAll('.advanced-filter-input').forEach(input => {
        input.selectedIndex = 0;
    });
    
    // Clear localStorage
    localStorage.removeItem('activeFilters');
    
    // Reset venue display
    resetVenueDisplay();
}

function getAllActiveFilters() {
    return {
        search: document.querySelector('.search-input')?.value || '',
        vibe: getActiveFilters('data-vibe'),
        group: getActiveFilters('data-group'),
        price: getActiveFilters('data-price'),
        occasion: getActiveFilters('data-occasion'),
        quick: document.querySelector('.quick-filter-pill.active')?.dataset.quick || '',
        advanced: getAdvancedFilterValues()
    };
}

function getAdvancedFilterValues() {
    const advanced = {};
    document.querySelectorAll('.advanced-filter-input').forEach(input => {
        const label = input.closest('.advanced-filter-group').querySelector('.advanced-filter-label').textContent.toLowerCase();
        advanced[label] = input.value;
    });
    return advanced;
}

function handleSearchInput(query) {
    if (query.length > 2) {
        // Trigger search suggestions
        showSearchSuggestions(query);
    } else {
        hideSearchSuggestions();
    }
}

function performSearch() {
    const query = document.querySelector('.search-input').value;
    if (query.trim()) {
        console.log('Searching for:', query);
        // Implement search logic
    }
}

function requestUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                console.log('Location obtained:', position.coords);
                updateLocationDisplay(position.coords);
            },
            error => {
                console.error('Location error:', error);
                showLocationError();
            }
        );
    } else {
        showLocationError();
    }
}

function updateLocationDisplay(coords) {
    const btn = document.querySelector('.search-location-btn');
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
        </svg>
        Location Set
    `;
    btn.style.background = 'var(--success-green)';
}

function showLocationError() {
    const btn = document.querySelector('.search-location-btn');
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        Location Failed
    `;
    setTimeout(() => {
        location.reload();
    }, 2000);
}

function showFilterLoading() {
    // Add loading overlay
    const overlay = document.createElement('div');
    overlay.className = 'filters-loading-overlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.querySelector('.enhanced-search-filters').appendChild(overlay);
}

function hideFilterLoading() {
    const overlay = document.querySelector('.filters-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function showFilterResults() {
    // Show success message
    const results = document.createElement('div');
    results.className = 'filter-results-toast';
    results.textContent = 'Filters applied successfully!';
    document.body.appendChild(results);
    
    setTimeout(() => {
        results.remove();
    }, 3000);
}

function showSearchSuggestions(query) {
    // Implement search suggestions dropdown
    console.log('Showing suggestions for:', query);
}

function hideSearchSuggestions() {
    // Hide suggestions dropdown
    console.log('Hiding suggestions');
}

function resetVenueDisplay() {
    // Reset venue grid to show all items
    console.log('Resetting venue display');
}

function applyQuickFilter(quickType) {
    console.log('Applying quick filter:', quickType);
    
    // Update venue display based on quick filter
    const venueGrids = document.querySelectorAll('.venue-grid-horizontal');
    venueGrids.forEach(grid => {
        // Add animation
        grid.style.opacity = '0.7';
        setTimeout(() => {
            grid.style.opacity = '1';
        }, 300);
    });
}

// Export functions for use by other scripts
window.enhancedFilters = {
    applyFilters: applyAllFilters,
    clearFilters: clearAllFilters,
    getActiveFilters: getAllActiveFilters
};