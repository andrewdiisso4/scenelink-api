/**
 * SceneLink Explore Page - Mobile-First Refined Experience
 * "Where should I go tonight?" - Optimized for mobile app-style interactions
 */

(function() {
    'use strict';

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    
    const state = {
        venues: [],
        filteredVenues: [],
        currentView: 'list', // 'list' or 'map'
        currentScope: 'all', // 'all', 'friends', 'trending'
        filters: {
            search: '',
            category: 'all',
            vibes: [],
            price: [1, 4],
            features: [],
            distance: 10
        },
        location: {
            name: 'Boston',
            coords: null
        },
        time: {
            label: 'Tonight',
            value: 'tonight'
        },
        isLoading: false
    };

    // ============================================
    // MOCK VENUE DATA
    // ============================================
    
    const mockVenues = [
        {
            id: 1,
            name: "Toro",
            type: "Spanish Tapas",
            price: 3,
            neighborhood: "South End",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.8,
            reviewCount: 1247,
            distance: 0.4,
            status: "open",
            closingTime: "1am",
            hook: "Known for omakase bar",
            tags: ["Romantic", "Great for groups", "Takes reservations"],
            category: "restaurants",
            vibes: ["date-night", "group-friendly", "outdoor"]
        },
        {
            id: 2,
            name: "Neptune Oyster",
            type: "Seafood",
            price: 4,
            neighborhood: "North End",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.9,
            reviewCount: 2156,
            distance: 0.8,
            status: "open",
            closingTime: "10pm",
            hook: "Rooftop skyline views",
            tags: ["Fresh seafood", "Raw bar", "Outdoor seating"],
            category: "restaurants",
            vibes: ["date-night", "outdoor"]
        },
        {
            id: 3,
            name: "Drink",
            type: "Cocktail Bar",
            price: 3,
            neighborhood: "Seaport",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.7,
            reviewCount: 1893,
            distance: 1.2,
            status: "open",
            closingTime: "2am",
            hook: "Craft cocktails tailored to your taste",
            tags: ["Creative cocktails", "Upscale", "Games & TVs"],
            category: "bars",
            vibes: ["cocktail-bars", "date-night", "live-music"]
        },
        {
            id: 4,
            name: "The Salty Pig",
            type: "Italian",
            price: 2,
            neighborhood: "Back Bay",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.6,
            reviewCount: 1543,
            distance: 0.5,
            status: "open",
            closingTime: "11pm",
            hook: "Popular pre-game spot before games",
            tags: ["Pizza", "Craft beer", "Games & TVs"],
            category: "restaurants",
            vibes: ["group-friendly", "italian"]
        },
        {
            id: 5,
            name: "House of Blues",
            type: "Live Music Venue",
            price: 3,
            neighborhood: "Fenway",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.5,
            reviewCount: 3421,
            distance: 1.8,
            status: "open",
            closingTime: "2am",
            hook: "Live performances in an iconic venue",
            tags: ["Live music", "Dancing", "Full bar"],
            category: "nightlife",
            vibes: ["live-music", "group-friendly"]
        },
        {
            id: 6,
            name: "Oleana",
            type: "Mediterranean",
            price: 3,
            neighborhood: "Cambridge",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.8,
            reviewCount: 1678,
            distance: 2.1,
            status: "open",
            closingTime: "10pm",
            hook: "Award-winning Mediterranean with seasonal menu",
            tags: ["Romantic", "Outdoor seating", "Takes reservations"],
            category: "restaurants",
            vibes: ["date-night", "outdoor"]
        },
        {
            id: 7,
            name: "Beehive",
            type: "American",
            price: 2,
            neighborhood: "South End",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.4,
            reviewCount: 2134,
            distance: 0.6,
            status: "open",
            closingTime: "1am",
            hook: "Bohemian restaurant with live jazz nightly",
            tags: ["Live music", "Brunch", "Full bar"],
            category: "restaurants",
            vibes: ["live-music", "group-friendly"]
        },
        {
            id: 8,
            name: "Lolita Cocina",
            type: "Mexican",
            price: 2,
            neighborhood: "Back Bay",
            image: "/assets/img/placeholder-venue.svg",
            rating: 4.5,
            reviewCount: 1821,
            distance: 0.7,
            status: "open",
            closingTime: "11pm",
            hook: "Vibrant Mexican with creative margaritas",
            tags: ["Margaritas", "Tacos", "Group friendly"],
            category: "restaurants",
            vibes: ["group-friendly", "cocktail-bars"]
        }
    ];

    // ============================================
    // INITIALIZATION
    // ============================================
    
    function init() {
        state.venues = mockVenues;
        state.filteredVenues = mockVenues;
        
        setupEventListeners();
        renderVenues();
        updateResultCount();
        detectUserLocation();
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    
    function setupEventListeners() {
        // Search input
        const searchInput = document.querySelector('.search-input');
        const searchClearBtn = document.querySelector('.search-clear-btn');
        
        if (searchInput) {
            searchInput.addEventListener('input', debounce(handleSearch, 300));
            searchInput.addEventListener('input', (e) => {
                if (searchClearBtn) {
                    searchClearBtn.classList.toggle('visible', e.target.value.length > 0);
                }
            });
        }
        
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    searchClearBtn.classList.remove('visible');
                    state.filters.search = '';
                    applyFilters();
                }
            });
        }

        // Location selector
        const locationSelector = document.querySelector('.location-selector');
        if (locationSelector) {
            locationSelector.addEventListener('click', showLocationOptions);
        }

        // Time selector
        const timeSelector = document.querySelector('.time-selector');
        if (timeSelector) {
            timeSelector.addEventListener('click', showTimeOptions);
        }

        // Category chips
        const categoryChips = document.querySelectorAll('.category-chip');
        categoryChips.forEach(chip => {
            chip.addEventListener('click', () => handleCategoryClick(chip));
        });

        // Vibe chips
        const vibeChips = document.querySelectorAll('.vibe-chip');
        vibeChips.forEach(chip => {
            chip.addEventListener('click', () => handleVibeClick(chip));
        });

        // Filters control
        const filtersControl = document.querySelector('.filters-control');
        if (filtersControl) {
            filtersControl.addEventListener('click', openFiltersModal);
        }

        // Filters modal
        setupFiltersModal();

        // View toggle
        const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
        viewToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => handleViewToggle(btn));
        });

        // Scope toggle
        const scopeToggleBtns = document.querySelectorAll('.scope-toggle-btn');
        scopeToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => handleScopeToggle(btn));
        });
    }

    // ============================================
    // SEARCH FUNCTIONALITY
    // ============================================
    
    function handleSearch(e) {
        state.filters.search = e.target.value.toLowerCase();
        applyFilters();
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

    // ============================================
    // LOCATION & TIME CONTROLS
    // ============================================
    
    function showLocationOptions() {
        // In a real app, this would show a modal or dropdown
        const locations = ['Near me', 'Boston', 'Cambridge', 'Somerville', 'Brookline'];
        const currentIndex = locations.indexOf(state.location.name);
        const nextIndex = (currentIndex + 1) % locations.length;
        
        state.location.name = locations[nextIndex];
        updateLocationDisplay();
        applyFilters();
    }

    function updateLocationDisplay() {
        const locationSelector = document.querySelector('.location-selector');
        if (locationSelector) {
            const textSpan = locationSelector.querySelector('span:last-child');
            if (textSpan) {
                textSpan.textContent = state.location.name;
            }
        }
    }

    function showTimeOptions() {
        const times = [
            { label: 'Now', value: 'now' },
            { label: 'Tonight', value: 'tonight' },
            { label: 'This weekend', value: 'weekend' },
            { label: 'Pick date', value: 'custom' }
        ];
        
        // Find current index, handling custom date case
        let currentIndex;
        if (state.time.value === 'custom') {
            // If we're on a custom date, the next option should be "Tonight"
            currentIndex = times.findIndex(t => t.value === 'tonight');
        } else {
            currentIndex = times.findIndex(t => t.value === state.time.value);
        }
        
        const nextIndex = (currentIndex + 1) % times.length;
        const selectedTime = times[nextIndex];
        
        if (selectedTime.value === 'custom') {
            showDatePicker();
        } else {
            state.time = selectedTime;
            updateTimeDisplay();
        }
    }

    function showDatePicker() {
        // Create a simple date picker modal
        const modal = document.createElement('div');
        modal.className = 'date-picker-modal';
        modal.innerHTML = `
            <div class="date-picker-backdrop"></div>
            <div class="date-picker-content">
                <div class="date-picker-header">
                    <h3>Select Date</h3>
                    <button class="date-picker-close">&times;</button>
                </div>
                <div class="date-picker-body">
                    <input type="date" class="date-picker-input" min="">
                </div>
                <div class="date-picker-actions">
                    <button class="date-picker-cancel">Cancel</button>
                    <button class="date-picker-confirm">Set Date</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Set min date to today
        const today = new Date().toISOString().split('T')[0];
        modal.querySelector('.date-picker-input').min = today;
        modal.querySelector('.date-picker-input').value = today;
        
        // Handle events
        const closeBtn = modal.querySelector('.date-picker-close');
        const cancelBtn = modal.querySelector('.date-picker-cancel');
        const confirmBtn = modal.querySelector('.date-picker-confirm');
        const backdrop = modal.querySelector('.date-picker-backdrop');
        
        const closeModal = () => {
            document.body.removeChild(modal);
        };
        
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', () => {
            const dateInput = modal.querySelector('.date-picker-input').value;
            if (dateInput) {
                const date = new Date(dateInput);
                const formatted = formatDateForDisplay(date);
                state.time = {
                    label: formatted,
                    value: 'custom',
                    date: dateInput
                };
                updateTimeDisplay();
            }
            closeModal();
        });
    }

    function formatDateForDisplay(date) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Tomorrow';
        } else {
            const options = { month: 'short', day: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        }
    }

    function updateTimeDisplay() {
        const timeSelector = document.querySelector('.time-selector');
        if (timeSelector) {
            const textSpan = timeSelector.querySelector('span:last-child');
            if (textSpan) {
                textSpan.textContent = state.time.label;
            }
        }
    }

    function updateTimeDisplay() {
        const timeSelector = document.querySelector('.time-selector');
        if (timeSelector) {
            const textSpan = timeSelector.querySelector('span:last-child');
            if (textSpan) {
                textSpan.textContent = state.time.label;
            }
        }
    }

    function detectUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    state.location.coords = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                },
                (error) => {
                    // Location detection failed, use default
                }
            );
        }
    }

    // ============================================
    // CATEGORY CHIPS
    // ============================================
    
    function handleCategoryClick(chip) {
        // Remove active from all chips
        document.querySelectorAll('.category-chip').forEach(c => {
            c.classList.remove('active');
        });
        
        // Add active to clicked chip
        chip.classList.add('active');
        
        // Update filter
        state.filters.category = chip.dataset.category || 'all';
        
        // Update vibe chips based on selected category
        updateVibeChipsByCategory(chip.dataset.category || 'all');
        
        // Update filters modal if it's open
        const modal = document.getElementById('filtersModal');
        if (modal && modal.classList.contains('active')) {
            updateFilterOptionsByCategory();
        }
        
        applyFilters();
    }

    function updateVibeChipsByCategory(category) {
        const vibeChipsContainer = document.getElementById('vibeChips');
        
        // Define vibe options for each category
        const categoryVibes = {
            'all': [
                { id: 'date-night', label: 'Date Night' },
                { id: 'group-friendly', label: 'Group Friendly' },
                { id: 'casual', label: 'Casual' },
                { id: 'upscale', label: 'Upscale' },
                { id: 'live-music', label: 'Live Music' },
                { id: 'outdoor', label: 'Outdoor Seating' }
            ],
            'restaurants': [
                { id: 'fine-dining', label: 'Fine Dining' },
                { id: 'casual', label: 'Casual' },
                { id: 'family-friendly', label: 'Family-Friendly' },
                { id: 'romantic', label: 'Romantic' },
                { id: 'outdoor-seating', label: 'Outdoor Seating' },
                { id: 'late-night', label: 'Late Night' },
                { id: 'seafood', label: 'Seafood' },
                { id: 'italian', label: 'Italian' }
            ],
            'bars': [
                { id: 'craft-cocktails', label: 'Craft Cocktails' },
                { id: 'dive-bar', label: 'Dive Bar' },
                { id: 'sports-bar', label: 'Sports Bar' },
                { id: 'wine-bar', label: 'Wine Bar' },
                { id: 'brewery', label: 'Brewery' },
                { id: 'cocktail-lounge', label: 'Cocktail Lounge' },
                { id: 'rooftop', label: 'Rooftop' },
                { id: 'live-music', label: 'Live Music' }
            ],
            'events': [
                { id: 'concert', label: 'Concert' },
                { id: 'festival', label: 'Festival' },
                { id: 'comedy-show', label: 'Comedy Show' },
                { id: 'networking', label: 'Networking' },
                { id: 'art-exhibition', label: 'Art Exhibition' },
                { id: 'party', label: 'Party' },
                { id: 'cultural', label: 'Cultural' },
                { id: 'sports-event', label: 'Sports Event' }
            ],
            'nightlife': [
                { id: 'dancing', label: 'Dancing' },
                { id: 'live-music', label: 'Live Music' },
                { id: 'cocktail-lounge', label: 'Cocktail Lounge' },
                { id: 'sports-bar', label: 'Sports Bar' },
                { id: 'rooftop', label: 'Rooftop' },
                { id: 'underground', label: 'Underground' },
                { id: 'high-energy', label: 'High Energy' },
                { id: 'dj-sets', label: 'DJ Sets' }
            ]
        };
        
        const vibes = categoryVibes[category] || categoryVibes['all'];
        
        // Clear existing vibe chips
        vibeChipsContainer.innerHTML = '';
        
        // Create new vibe chips
        vibes.forEach(vibe => {
            const chip = document.createElement('button');
            chip.className = 'vibe-chip';
            chip.dataset.vibe = vibe.id;
            chip.textContent = vibe.label;
            
            // Add click event
            chip.addEventListener('click', () => handleVibeClick(chip));
            
            // Add to container
            vibeChipsContainer.appendChild(chip);
        });
        
        // Reset vibe filters
        state.filters.vibes = [];
        
        // Update section label
        const sectionLabel = document.querySelector('.vibe-section-label');
        if (category === 'all') {
            sectionLabel.textContent = 'Popular Vibes';
        } else {
            sectionLabel.textContent = `${category.charAt(0).toUpperCase() + category.slice(1)} Vibes`;
        }
    }

    // ============================================
    // VIBE CHIPS
    // ============================================
    
    function handleVibeClick(chip) {
        const vibe = chip.dataset.vibe;
        
        // Toggle active state
        chip.classList.toggle('active');
        
        // Update filters
        if (chip.classList.contains('active')) {
            if (!state.filters.vibes.includes(vibe)) {
                state.filters.vibes.push(vibe);
            }
        } else {
            state.filters.vibes = state.filters.vibes.filter(v => v !== vibe);
        }
        
        applyFilters();
    }

    // ============================================
    // FILTERS MODAL
    // ============================================
    
    function setupFiltersModal() {
        const modal = document.getElementById('filtersModal');
        const closeBtn = document.getElementById('filtersCloseBtn');
        const resetBtn = document.getElementById('filtersResetBtn');
        const applyBtn = document.getElementById('filtersApplyBtn');
        const openNowToggle = document.getElementById('openNowToggle');

        if (!modal) return;

        // Close modal
        if (closeBtn) {
            closeBtn.addEventListener('click', closeFiltersModal);
        }

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeFiltersModal();
            }
        });

        // Filter options
        attachFilterOptionListeners();

        // Open now toggle
        if (openNowToggle) {
            openNowToggle.addEventListener('click', () => {
                openNowToggle.classList.toggle('active');
            });
        }

        // Reset filters
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                filterOptions.forEach(option => option.classList.remove('active'));
                if (openNowToggle) openNowToggle.classList.remove('active');
            });
        }

        // Apply filters
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                applyFiltersFromModal();
                closeFiltersModal();
            });
        }
    }

    function openFiltersModal() {
        const modal = document.getElementById('filtersModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            updateFilterOptionsByCategory();
        }
    }

    function updateFilterOptionsByCategory() {
        // Update filter options based on selected category
        const category = state.filters.category;
        
        // Always show energy section but update options
        if (category === 'restaurants') {
            updateEnergyOptions(['Chill', 'Lively', 'Party']);
        } else if (category === 'bars') {
            updateEnergyOptions(['Chill', 'Lively', 'Party', 'Upscale']);
        } else if (category === 'events') {
            updateEnergyOptions(['Chill', 'Lively', 'High Energy']);
        } else if (category === 'nightlife') {
            updateEnergyOptions(['Chill', 'Lively', 'Party', 'High Energy']);
        } else {
            // All categories - show general options
            updateEnergyOptions(['Chill', 'Lively', 'Party']);
        }
        
        updateFiltersLiveSummary();
    }

    function updateEnergyOptions(options) {
        const energyContainer = document.querySelector('.filter-group:nth-child(6) .filter-options');
        
        if (!energyContainer) return;
        
        // Clear existing energy options
        energyContainer.innerHTML = '';
        
        // Add new energy options
        options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'filter-option';
            button.dataset.filter = 'energy';
            button.dataset.value = option.toLowerCase();
            button.textContent = option;
            energyContainer.appendChild(button);
        });
        
        // Re-attach event listeners for new options
        attachFilterOptionListeners();
    }

    function attachFilterOptionListeners() {
        const filterOptions = document.querySelectorAll('.filter-option');
        filterOptions.forEach(option => {
            // Remove existing listeners by cloning and replacing
            const newOption = option.cloneNode(true);
            option.parentNode.replaceChild(newOption, option);
            
            // Add new listener
            newOption.addEventListener('click', handleFilterOptionClick);
        });
    }

    function handleFilterOptionClick() {
        const option = this;
        const filterType = option.dataset.filter;
        const filterValue = option.dataset.value;

        // For single-select filters (price, distance, energy)
        if (['price', 'distance', 'energy'].includes(filterType)) {
            // Remove active from siblings
            const siblings = document.querySelectorAll(`[data-filter="${filterType}"]`);
            siblings.forEach(s => s.classList.remove('active'));
        }

        // Toggle active state
        option.classList.toggle('active');
        updateFiltersLiveSummary();
    }

    function closeFiltersModal() {
        const modal = document.getElementById('filtersModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function applyFiltersFromModal() {
        // Count active filters
        const activeFilters = document.querySelectorAll('.filter-option.active').length;
        const openNowActive = document.getElementById('openNowToggle')?.classList.contains('active');
        const totalActive = activeFilters + (openNowActive ? 1 : 0);

        // Update badge
        const filterBadge = document.querySelector('.filter-badge');
        const filtersControl = document.querySelector('.filters-control');
        
        if (filterBadge && filtersControl) {
            if (totalActive > 0) {
                filtersControl.classList.add('has-active');
                filterBadge.textContent = totalActive;
                filterBadge.style.display = 'inline-flex';
            } else {
                filtersControl.classList.remove('has-active');
                filterBadge.style.display = 'none';
            }
        }

        // Apply filters to venues (simplified for now)
        applyFilters();
    }

    function applyFilters() {
        let filtered = [...state.venues];

        // Search filter
        if (state.filters.search) {
            filtered = filtered.filter(venue => {
                return venue.name.toLowerCase().includes(state.filters.search) ||
                       venue.type.toLowerCase().includes(state.filters.search) ||
                       venue.neighborhood.toLowerCase().includes(state.filters.search) ||
                       venue.tags.some(tag => tag.toLowerCase().includes(state.filters.search));
            });
        }

        // Category filter
        if (state.filters.category !== 'all') {
            filtered = filtered.filter(venue => venue.category === state.filters.category);
        }

        // Vibe filters
        if (state.filters.vibes.length > 0) {
            filtered = filtered.filter(venue => {
                return state.filters.vibes.some(vibe => venue.vibes.includes(vibe));
            });
        }

        state.filteredVenues = filtered;
        renderVenues();
        updateResultCount();
        updateFiltersDisplay();
    }

    function updateFiltersDisplay() {
        const filtersControl = document.querySelector('.filters-control');
        const filterBadge = document.querySelector('.filter-badge');
        
        if (!filtersControl || !filterBadge) return;

        // Count active filters (excluding search and category)
        let activeCount = state.filters.vibes.length;
        
        if (activeCount > 0) {
            filtersControl.classList.add('has-active');
            filterBadge.textContent = activeCount;
            filterBadge.style.display = 'inline-flex';
        } else {
            filtersControl.classList.remove('has-active');
            filterBadge.style.display = 'none';
        }
    }

    // ============================================
    // RESULT COUNT
    // ============================================
    
    function updateResultCount() {
        const resultCount = document.querySelector('.result-count');
        if (!resultCount) return;

        const count = state.filteredVenues.length;
        const time = state.time.label.toLowerCase();

        let text = `<strong>${count}</strong> ${count === 1 ? 'place' : 'places'}`;
        
        // Add scope context
        if (state.currentScope === 'friends') {
            text += ' from friends';
        } else if (state.currentScope === 'trending') {
            text += ' trending';
        }
        
        // Add context based on active filters
        if (state.filters.vibes.length > 0) {
            const vibeText = state.filters.vibes[0].replace('-', ' ');
            const capitalizedVibe = vibeText.charAt(0).toUpperCase() + vibeText.slice(1);
            text += ` for ${capitalizedVibe}`;
        } else if (state.filters.category !== 'all') {
            text += ` in ${state.filters.category}`;
        }
        
        // Add location if not "Near me"
        if (state.location.name !== 'Near me') {
            text += ` in ${state.location.name}`;
        }
        
        text += ` · ${time}`;

        resultCount.innerHTML = text;
        updateFiltersLiveSummary();
    }

    // ============================================
    // VIEW TOGGLE
    // ============================================
    
    function handleViewToggle(btn) {
        const view = btn.dataset.view;
        
        // Update button states
        document.querySelectorAll('.view-toggle-btn').forEach(b => {
            b.classList.remove('active');
        });
        btn.classList.add('active');
        
        // Update state
        state.currentView = view;
        
        // Toggle views
        const venuesContainer = document.querySelector('.venues-container');
        const mapContainer = document.querySelector('.map-container');
        
        if (view === 'list') {
            if (venuesContainer) venuesContainer.style.display = 'block';
            if (mapContainer) mapContainer.classList.remove('active');
        } else {
            if (venuesContainer) venuesContainer.style.display = 'none';
            if (mapContainer) mapContainer.classList.add('active');
            initMap();
        }
    }

    // ============================================
    // VENUE RENDERING
    // ============================================
    
    function renderVenues() {
        const venuesList = document.querySelector('.venues-list');
        if (!venuesList) return;

        if (state.isLoading) {
            renderSkeletonLoaders(venuesList);
            return;
        }

        if (state.filteredVenues.length === 0) {
            renderEmptyState(venuesList);
            return;
        }

        venuesList.innerHTML = state.filteredVenues.map(venue => createVenueCard(venue)).join('');
        
        // Add event listeners to venue cards
        attachVenueCardListeners();
    }

    function createVenueCard(venue) {
        const priceSymbols = '$'.repeat(venue.price);
        const statusClass = venue.status === 'open' ? 'open' : 'closed';
        const statusText = venue.status === 'open' ? `Open until ${venue.closingTime}` : 'Closed';

        return `
            <div class="venue-card" data-venue-id="${venue.id}">
                <div class="venue-card-image">
                    <img src="${venue.image}" alt="${venue.name}" loading="lazy">
                </div>
                <div class="venue-card-content">
                    <div class="venue-card-header">
                        <h3 class="venue-name">${venue.name}</h3>
                        <div class="venue-rating">
                            <i class="fas fa-star rating-star"></i>
                            <span class="rating-value">${venue.rating}</span>
                        </div>
                    </div>
                    <div class="venue-meta">
                        <span class="venue-type">${venue.type}</span>
                        <span class="meta-separator">•</span>
                        <span class="venue-price">${priceSymbols}</span>
                        <span class="meta-separator">•</span>
                        <span class="venue-neighborhood">${venue.neighborhood}</span>
                    </div>
                    <p class="venue-hook">${venue.hook}</p>
                    <div class="venue-details">
                        <div class="venue-distance">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${venue.distance} mi</span>
                        </div>
                        <span class="meta-separator">•</span>
                        <div class="venue-status ${statusClass}">
                            <i class="fas fa-circle"></i>
                            <span>${statusText}</span>
                        </div>
                    </div>
                    <div class="venue-tags">
                        ${venue.tags.slice(0, 3).map(tag => `<span class="venue-tag-chip">${tag}</span>`).join('')}
                    </div>
                    <div class="venue-actions">
                        <button class="venue-btn venue-btn-secondary venue-save-btn" data-venue-id="${venue.id}">
                            <i class="fas fa-heart"></i>
                        </button>
                        <button class="venue-btn venue-btn-primary" data-action="details" data-venue-id="${venue.id}">
                            Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function attachVenueCardListeners() {
        // Save buttons
        document.querySelectorAll('.venue-save-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.classList.toggle('saved');
            });
        });

        // Action buttons
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const venueId = parseInt(btn.dataset.venueId);
                handleVenueAction(action, venueId);
            });
        });

        // Card clicks
        document.querySelectorAll('.venue-card').forEach(card => {
            card.addEventListener('click', () => {
                const venueId = parseInt(card.dataset.venueId);
                showVenueDetails(venueId);
            });
        });
    }

    function handleVenueAction(action, venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;

        switch (action) {
            case 'share':
                shareVenue(venue);
                break;
            case 'details':
                showVenueDetails(venueId);
                break;
        }
    }

    function shareVenue(venue) {
        if (navigator.share) {
            navigator.share({
                title: venue.name,
                text: `Check out ${venue.name} on SceneLink!`,
                url: window.location.href
            }).catch(err => {
                // Share failed or was cancelled
            });
        } else {
            // Fallback for browsers that don't support Web Share API
            const shareText = `Check out ${venue.name} on SceneLink!`;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(shareText);
                showToast('Link copied to clipboard!');
            }
        }
    }

    function showVenueDetails(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;

        const modal = document.getElementById('venueDetailsModal');
        if (!modal) return;

        const priceSymbols = '$'.repeat(venue.price);
        const statusClass = venue.status === 'open' ? 'open' : 'closed';
        const statusText = venue.status === 'open' ? `Open until ${venue.closingTime}` : 'Closed';

        modal.innerHTML = `
            <div style="background:#1a1a1a; border-radius:16px; max-width:600px; width:100%; max-height:90vh; overflow-y:auto; position:relative; border:1px solid rgba(212,175,55,0.2); box-shadow:0 25px 60px rgba(0,0,0,0.5);">
                <button onclick="document.getElementById('venueDetailsModal').style.display='none'; document.body.style.overflow='';" style="position:absolute; top:12px; right:12px; z-index:10; background:rgba(0,0,0,0.6); border:none; color:#fff; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:18px; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(10px);">✕</button>
                <div style="width:100%; height:250px; overflow:hidden; border-radius:16px 16px 0 0; position:relative;">
                    <img src="${venue.image}" alt="${venue.name}" style="width:100%; height:100%; object-fit:cover;">
                    <div style="position:absolute; top:12px; left:12px; background:linear-gradient(135deg, #D4AF37, #B8960C); color:#000; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; text-transform:uppercase;">${venue.type}</div>
                    <div style="position:absolute; bottom:0; left:0; right:0; height:80px; background:linear-gradient(transparent, rgba(26,26,26,0.95));"></div>
                </div>
                <div style="padding:24px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                        <div>
                            <h2 style="color:#fff; font-size:24px; margin:0 0 8px 0; font-weight:700;">${venue.name}</h2>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="color:#D4AF37; font-size:16px;">★ ${venue.rating}</span>
                                <span style="color:#999; font-size:13px;">(${venue.reviewCount} reviews)</span>
                            </div>
                        </div>
                        <button class="modal-save-btn" data-venue-id="${venue.id}" style="background:transparent; border:2px solid #D4AF37; color:#D4AF37; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;">
                            <span>♥</span> Save
                        </button>
                    </div>

                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
                        <span style="color:#ccc; font-size:14px;">${priceSymbols}</span>
                        <span style="color:#666;">•</span>
                        <span style="color:#ccc; font-size:14px;">${venue.neighborhood}</span>
                        <span style="color:#666;">•</span>
                        <span style="color:${venue.status === 'open' ? '#4ade80' : '#f87171'}; font-size:14px;">● ${statusText}</span>
                        <span style="color:#666;">•</span>
                        <span style="color:#ccc; font-size:14px;">${venue.distance} mi away</span>
                    </div>

                    <div style="margin-bottom:20px; padding:16px; background:rgba(212,175,55,0.08); border-radius:12px; border-left:3px solid #D4AF37;">
                        <h3 style="color:#D4AF37; font-size:14px; margin:0 0 8px 0; text-transform:uppercase; letter-spacing:1px;">✨ Known For</h3>
                        <p style="color:#ddd; font-size:15px; margin:0; line-height:1.5;">${venue.hook}</p>
                    </div>

                    <div style="margin-bottom:20px;">
                        <h3 style="color:#D4AF37; font-size:14px; margin:0 0 12px 0; text-transform:uppercase; letter-spacing:1px;">🏷️ Tags</h3>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                            ${venue.tags.map(tag => `<span style="background:rgba(212,175,55,0.12); color:#D4AF37; padding:6px 14px; border-radius:20px; font-size:13px; border:1px solid rgba(212,175,55,0.2);">${tag}</span>`).join('')}
                        </div>
                    </div>

                    <div style="display:flex; gap:10px; margin-top:24px;">
                        <button onclick="if(navigator.share){navigator.share({title:'${venue.name.replace(/'/g, "\\'")}',text:'Check out ${venue.name.replace(/'/g, "\\'")} on SceneLink!',url:window.location.href}).catch(()=>{})}else{navigator.clipboard&&navigator.clipboard.writeText('Check out ${venue.name.replace(/'/g, "\\'")} on SceneLink!');}" style="flex:1; padding:12px; background:linear-gradient(135deg, #D4AF37, #B8960C); color:#000; border:none; border-radius:10px; cursor:pointer; font-weight:700; font-size:14px;">
                            Share
                        </button>
                        <button onclick="window.open('https://maps.google.com/maps?q=${encodeURIComponent(venue.name + ' ' + venue.neighborhood + ' Boston')}', '_blank')" style="flex:1; padding:12px; background:rgba(212,175,55,0.12); color:#D4AF37; border:1px solid rgba(212,175,55,0.3); border-radius:10px; cursor:pointer; font-weight:600; font-size:14px;">
                            Directions
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Close on backdrop click
        modal.onclick = function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        };

        // Close on Escape key
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                modal.style.display = 'none';
                document.body.style.overflow = '';
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    function showToast(message) {
        // Simple toast notification
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // ============================================
    // SKELETON LOADERS
    // ============================================
    
    function renderSkeletonLoaders(container) {
        const skeletonHTML = `
            ${Array(3).fill(0).map(() => `
                <div class="skeleton-card">
                    <div class="skeleton-image"></div>
                    <div class="skeleton-content">
                        <div class="skeleton-title"></div>
                        <div class="skeleton-text"></div>
                        <div class="skeleton-text short"></div>
                        <div class="skeleton-text medium"></div>
                        <div class="skeleton-text short"></div>
                        <div style="display: flex; gap: 6px; margin-bottom: 12px;">
                            <div class="skeleton-text" style="width: 60px; height: 20px;"></div>
                            <div class="skeleton-text" style="width: 80px; height: 20px;"></div>
                            <div class="skeleton-text" style="width: 70px; height: 20px;"></div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <div class="skeleton-text" style="flex: 1; height: 36px; border-radius: 12px;"></div>
                            <div class="skeleton-text" style="width: 36px; height: 36px; border-radius: 18px;"></div>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
        container.innerHTML = skeletonHTML;
    }

    // ============================================
    // EMPTY STATE
    // ============================================
    
    function renderEmptyState(container) {
        // Show a few random venues as "similar spots"
        const similarVenues = state.venues.slice(0, 3);
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-search"></i>
                </div>
                <h3 class="empty-state-title">No perfect matches yet</h3>
                <p class="empty-state-message">
                    Try adjusting your filters or check out these similar spots:
                </p>
                <div class="similar-spots">
                    ${similarVenues.map(venue => createVenueCard(venue)).join('')}
                </div>
                <button class="empty-state-action" onclick="window.exploreApp.resetFilters()">
                    Reset Filters
                </button>
            </div>
        `;
    }

    // ============================================
    // MAP FUNCTIONALITY
    // ============================================
    
    function initMap() {
        // In a real app, this would initialize Google Maps or Mapbox
        const mapElement = document.getElementById('explore-map');
        if (!mapElement) return;

        // Create functional map with venue markers
        if (!mapElement.querySelector('.map-functional')) {
            mapElement.innerHTML = `
                <div class="map-functional">
                    <div class="map-canvas">
                        <img src="/assets/img/placeholder-venue.svg" alt="Boston Map" class="map-background">
                        <div class="venue-markers">
                            ${state.filteredVenues.slice(0, 8).map(venue => `
                                <div class="venue-marker" data-venue-id="${venue.id}" 
                                     style="left: ${Math.random() * 70 + 15}%; top: ${Math.random() * 60 + 20}%;">
                                    <div class="marker-icon">
                                        <i class="fas fa-map-pin"></i>
                                        <span class="marker-price">${venue.price.replace('$', '')}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="map-controls">
                        <button class="map-zoom-btn zoom-in" onclick="zoomMap('in')">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="map-zoom-btn zoom-out" onclick="zoomMap('out')">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="map-center-btn" onclick="centerMap()">
                            <i class="fas fa-crosshairs"></i>
                        </button>
                    </div>
                </div>
            `;

            // Add click handlers to venue markers
            mapElement.querySelectorAll('.venue-marker').forEach(marker => {
                marker.addEventListener('click', () => {
                    const venueId = parseInt(marker.dataset.venueId);
                    showMapBottomSheet(venueId);
                });
            });
        }
        
        // Show bottom sheet when marker is clicked
        // showMapBottomSheet(venue);
    }

    function handleScopeToggle(btn) {
        // Update button states
        document.querySelectorAll('.scope-toggle-btn').forEach(b => {
            b.classList.remove('active');
        });
        btn.classList.add('active');
        
        // Update state
        state.currentScope = btn.dataset.scope;
        
        // Apply filtering
        applyFilters();
    }

    function updateFiltersLiveSummary() {
        const summary = document.getElementById('filtersLiveSummary');
        if (!summary) return;

        const count = state.filteredVenues.length;
        const location = state.location.name;
        const time = state.time.label;

        let summaryText = `<span class="summary-count">${count} matches</span>`;
        
        if (location !== 'Near me') {
            summaryText += ` <span class="summary-location">· ${location}</span>`;
        }
        
        summaryText += ` <span class="summary-time">· ${time}</span>`;

        summary.innerHTML = summaryText;
    }

    function showMapBottomSheet(venue) {
        const bottomSheet = document.querySelector('.map-bottom-sheet');
        if (!bottomSheet) return;

        const priceSymbols = '$'.repeat(venue.price);

        bottomSheet.innerHTML = `
            <div class="bottom-sheet-handle"></div>
            <h3 class="bottom-sheet-venue-name">${venue.name}</h3>
            <div class="bottom-sheet-venue-meta">
                <span>${venue.type}</span>
                <span class="meta-separator">•</span>
                <span>${priceSymbols}</span>
                <span class="meta-separator">•</span>
                <span>${venue.distance} mi</span>
            </div>
            <div class="bottom-sheet-actions">
                <button class="venue-btn venue-btn-secondary">
                    <i class="fas fa-directions"></i>
                    Directions
                </button>
                <button class="venue-btn venue-btn-primary">
                    Details
                </button>
            </div>
        `;

        bottomSheet.classList.add('visible');
    }

    // ============================================
    // PUBLIC API
    // ============================================
    
    window.exploreApp = {
        resetFilters: function() {
            // Reset all filters
            state.filters = {
                search: '',
                category: 'all',
                vibes: [],
                price: [1, 4],
                features: [],
                distance: 10
            };

            // Reset UI
            const searchInput = document.querySelector('.search-input');
            if (searchInput) searchInput.value = '';

            const searchClearBtn = document.querySelector('.search-clear-btn');
            if (searchClearBtn) searchClearBtn.classList.remove('visible');

            document.querySelectorAll('.category-chip').forEach(chip => {
                chip.classList.remove('active');
                if (chip.dataset.category === 'all') {
                    chip.classList.add('active');
                }
            });

            document.querySelectorAll('.vibe-chip').forEach(chip => {
                chip.classList.remove('active');
            });

            // Reapply filters
            applyFilters();
        }
    };

    // ============================================
    // MAP CONTROL FUNCTIONS
    // ============================================

    window.zoomMap = function(direction) {
        const mapCanvas = document.querySelector('.map-canvas');
        if (!mapCanvas) return;
        
        const currentScale = parseFloat(mapCanvas.style.transform?.replace('scale(', '')?.replace(')', '') || 1);
        const newScale = direction === 'in' ? Math.min(currentScale + 0.2, 2) : Math.max(currentScale - 0.2, 0.8);
        
        mapCanvas.style.transform = `scale(${newScale})`;
        mapCanvas.style.transformOrigin = 'center center';
    };

    window.centerMap = function() {
        const mapCanvas = document.querySelector('.map-canvas');
        if (!mapCanvas) return;
        
        mapCanvas.style.transform = 'scale(1)';
        
        // Pulse animation to indicate centering
        mapCanvas.style.animation = 'pulse 0.3s ease';
        setTimeout(() => {
            mapCanvas.style.animation = '';
        }, 300);
    };

    function showMapBottomSheet(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;

        const bottomSheet = document.querySelector('.map-bottom-sheet');
        if (bottomSheet) {
            bottomSheet.querySelector('.bottom-sheet-venue-name').textContent = venue.name;
            bottomSheet.querySelector('.bottom-sheet-venue-meta').innerHTML = `
                <span>${venue.type}</span>
                <span class="meta-separator">•</span>
                <span>${venue.price}</span>
                <span class="meta-separator">•</span>
                <span>${venue.distance} mi</span>
            `;
            
            // Show bottom sheet with animation
            bottomSheet.style.transform = 'translateY(0)';
        }
    }

    // ============================================
    // START APP
    // ============================================
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();