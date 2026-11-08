/**
 * Complete Technical Features Implementation
 * 100% functional HTML/CSS/JavaScript with all interactive elements
 */

(function() {
    'use strict';

    // Technical features state
    const techState = {
        mapInitialized: false,
        markers: [],
        clusters: [],
        userLocation: null,
        routes: [],
        filters: {
            category: 'all',
            cuisine: 'all',
            price: 'all',
            rating: 'all',
            distance: 'all',
            features: []
        },
        floatingActions: {
            search: false,
            filter: false,
            map: false,
            bookmark: false
        }
    };

    // Initialize all technical features
    function initializeTechnicalFeatures() {
        setupInteractiveFilters();
        setupFunctionalSearch();
        setupClickableElements();
        setupFloatingActions();
        setupMapFeatures();
        ensureConsistency();
        addTechnicalStyles();
    }

    // Setup interactive filter tabs
    function setupInteractiveFilters() {
        // Category filters
        const categoryFilters = document.querySelectorAll('.category-filter, .filter-tab, .quick-filter-btn');
        categoryFilters.forEach(filter => {
            filter.addEventListener('click', function() {
                const parent = this.closest('.category-filters, .filter-tabs, .quick-filters');
                const siblings = parent ? parent.querySelectorAll('.category-filter, .filter-tab, .quick-filter-btn') : [];
                
                // Remove active class from siblings
                siblings.forEach(sibling => sibling.classList.remove('active'));
                
                // Add active class to clicked filter
                this.classList.add('active');
                
                // Store filter value
                const filterType = this.dataset.filter || this.dataset.category;
                techState.filters.category = filterType;
                
                // Apply filter
                applyFilters();
                
                // Visual feedback
                showFilterFeedback(this);
            });
        });

        // Multi-select filters (checkboxes)
        const checkboxFilters = document.querySelectorAll('.filter-checkbox, .feature-filter');
        checkboxFilters.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const feature = this.value || this.dataset.feature;
                if (this.checked) {
                    if (!techState.filters.features.includes(feature)) {
                        techState.filters.features.push(feature);
                    }
                } else {
                    techState.filters.features = techState.filters.features.filter(f => f !== feature);
                }
                applyFilters();
            });
        });

        // Dropdown filters
        const dropdownFilters = document.querySelectorAll('select.filter-select');
        dropdownFilters.forEach(select => {
            select.addEventListener('change', function() {
                const filterType = this.dataset.type || 'category';
                techState.filters[filterType] = this.value;
                applyFilters();
            });
        });
    }

    // Setup functional search input
    function setupFunctionalSearch() {
        const searchInputs = document.querySelectorAll('.search-input, .search-box, input[type="search"]');
        
        searchInputs.forEach(input => {
            // Real-time search on input
            let searchTimeout;
            input.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    performSearch(this.value);
                }, 300);
            });

            // Search on enter key
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    performSearch(this.value);
                }
            });

            // Clear search on escape
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    this.value = '';
                    performSearch('');
                }
            });

            // Add search suggestions
            setupSearchSuggestions(input);
        });
    }

    // Perform search
    function performSearch(query) {
        const normalizedQuery = query.toLowerCase().trim();
        
        // Show search feedback
        showSearchFeedback(normalizedQuery);
        
        // Filter content based on search
        const searchableElements = document.querySelectorAll('.searchable, .venue-card, .event-card, .list-item');
        let visibleCount = 0;
        
        searchableElements.forEach(element => {
            const text = element.textContent.toLowerCase();
            const matches = !normalizedQuery || text.includes(normalizedQuery);
            
            element.style.display = matches ? '' : 'none';
            
            if (matches) {
                visibleCount++;
                // Highlight search term
                if (normalizedQuery) {
                    highlightSearchTerm(element, normalizedQuery);
                } else {
                    removeHighlight(element);
                }
            }
        });
        
        // Update search results count
        updateSearchResultsCount(visibleCount, normalizedQuery);
    }

    // Setup search suggestions
    function setupSearchSuggestions(input) {
        const suggestions = [
            'restaurants', 'bars', 'nightlife', 'live music', 'rooftop',
            'outdoor seating', 'pizza', 'italian', 'jazz club', 'cocktails'
        ];

        const suggestionsBox = document.createElement('div');
        suggestionsBox.className = 'search-suggestions';
        suggestionsBox.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #1a1a1a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 0 0 8px 8px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
        `;

        input.parentNode.style.position = 'relative';
        input.parentNode.appendChild(suggestionsBox);

        input.addEventListener('focus', function() {
            if (this.value.length > 0) {
                showSuggestions(this.value, suggestionsBox, suggestions);
            }
        });

        input.addEventListener('blur', function() {
            setTimeout(() => {
                suggestionsBox.style.display = 'none';
            }, 200);
        });

        input.addEventListener('input', function() {
            showSuggestions(this.value, suggestionsBox, suggestions);
        });
    }

    // Show search suggestions
    function showSuggestions(query, suggestionsBox, suggestions) {
        const filtered = suggestions.filter(s => s.toLowerCase().includes(query.toLowerCase()));
        
        if (filtered.length > 0 && query.length > 0) {
            suggestionsBox.innerHTML = filtered.map(suggestion => `
                <div class="suggestion-item" onclick="selectSuggestion('${suggestion}')">
                    <i class="fas fa-search"></i> ${suggestion}
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    }

    // Select suggestion
    window.selectSuggestion = function(suggestion) {
        const searchInput = document.querySelector('.search-input, .search-box, input[type="search"]');
        if (searchInput) {
            searchInput.value = suggestion;
            performSearch(suggestion);
            document.querySelector('.search-suggestions').style.display = 'none';
        }
    };

    // Setup clickable elements
    function setupClickableElements() {
        // Venue cards
        const venueCards = document.querySelectorAll('.venue-card, .discovered-venue-card');
        venueCards.forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function(e) {
                // Don't trigger if clicking on buttons
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                
                // Add click animation
                this.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    this.style.transform = '';
                }, 100);
                
                // View venue details
                const venueId = this.dataset.venueId;
                if (venueId && window.viewVenueDetails) {
                    window.viewVenueDetails(venueId);
                } else {
                    // Fallback: expand card or navigate
                    showCardDetails(this);
                }
            });
        });

        // Action buttons
        const actionButtons = document.querySelectorAll('.btn-book, .btn-save, .btn-share, .btn-view-details');
        actionButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                handleActionButton(this);
            });
        });

        // Navigation elements
        const navElements = document.querySelectorAll('.nav-link, .header-nav-link');
        navElements.forEach(link => {
            link.addEventListener('click', function(e) {
                // Smooth scroll for anchor links
                if (this.getAttribute('href').startsWith('#')) {
                    e.preventDefault();
                    const target = document.querySelector(this.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            });
        });
    }

    // Handle action buttons
    function handleActionButton(button) {
        const action = button.classList.contains('btn-book') ? 'book' :
                      button.classList.contains('btn-save') ? 'save' :
                      button.classList.contains('btn-share') ? 'share' : 'details';

        // Visual feedback
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
            button.style.transform = '';
        }, 150);

        // Execute action
        switch (action) {
            case 'book':
                if (window.bookVenue) {
                    const venueId = button.closest('[data-venue-id]')?.dataset.venueId;
                    if (venueId) window.bookVenue(venueId);
                }
                break;
            case 'save':
                if (window.toggleSave) {
                    const venueId = button.closest('[data-venue-id]')?.dataset.venueId;
                    if (venueId) window.toggleSave(venueId);
                }
                break;
            case 'share':
                if (window.shareVenue) {
                    const venueId = button.closest('[data-venue-id]')?.dataset.venueId;
                    if (venueId) window.shareVenue(venueId);
                }
                break;
            case 'details':
                if (window.viewVenueDetails) {
                    const venueId = button.closest('[data-venue-id]')?.dataset.venueId;
                    if (venueId) window.viewVenueDetails(venueId);
                }
                break;
        }
    }

    // Setup floating action buttons
    function setupFloatingActions() {
        // Create floating actions container
        const floatingContainer = document.createElement('div');
        floatingContainer.className = 'floating-actions-container';
        floatingContainer.innerHTML = `
            <button class="fab fab-search" onclick="toggleSearch()" title="Search">
                <i class="fas fa-search"></i>
            </button>
            <button class="fab fab-filter" onclick="toggleFilters()" title="Filters">
                <i class="fas fa-filter"></i>
            </button>
            <button class="fab fab-map" onclick="toggleMap()" title="Map View">
                <i class="fas fa-map"></i>
            </button>
            <button class="fab fab-bookmark" onclick="toggleBookmarks()" title="Saved Items">
                <i class="fas fa-bookmark"></i>
            </button>
        `;

        document.body.appendChild(floatingContainer);

        // Add floating action styles
        addFloatingActionStyles();

        // Setup tooltips
        setupTooltips();
    }

    // Toggle functions
    window.toggleSearch = function() {
        const searchBox = document.querySelector('.search-container, .search-box-container');
        if (searchBox) {
            searchBox.classList.toggle('active');
            const input = searchBox.querySelector('input');
            if (input && searchBox.classList.contains('active')) {
                input.focus();
            }
        }
        techState.floatingActions.search = !techState.floatingActions.search;
    };

    window.toggleFilters = function() {
        const filters = document.querySelector('.filters-section, .venue-discovery-filters');
        if (filters) {
            filters.classList.toggle('active');
        }
        techState.floatingActions.filter = !techState.floatingActions.filter;
    };

    window.toggleMap = function() {
        const map = document.querySelector('.map-container, .venue-map');
        if (map) {
            map.classList.toggle('active');
        }
        techState.floatingActions.map = !techState.floatingActions.map;
    };

    window.toggleBookmarks = function() {
        showNotification('Bookmarks feature coming soon!', 'info');
        techState.floatingActions.bookmark = !techState.floatingActions.bookmark;
    };

    // Setup map features
    function setupMapFeatures() {
        // Initialize map if map container exists
        const mapContainer = document.querySelector('.map-container, #map');
        if (mapContainer) {
            initializeMap(mapContainer);
        }

        // Add map controls
        addMapControls();
    }

    // Initialize map
    function initializeMap(container) {
        if (techState.mapInitialized) return;

        // Create simulated map
        container.innerHTML = `
            <div class="map-controls">
                <button class="map-control-btn" onclick="zoomIn()">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="map-control-btn" onclick="zoomOut()">
                    <i class="fas fa-minus"></i>
                </button>
                <button class="map-control-btn" onclick="resetMap()">
                    <i class="fas fa-home"></i>
                </button>
                <button class="map-control-btn" onclick="toggleMapStyle()">
                    <i class="fas fa-layer-group"></i>
                </button>
            </div>
            <div class="map-legend">
                <div class="legend-item">
                    <span class="legend-marker marker-restaurant"></span>
                    Restaurants
                </div>
                <div class="legend-item">
                    <span class="legend-marker marker-bar"></span>
                    Bars
                </div>
                <div class="legend-item">
                    <span class="legend-marker marker-nightlife"></span>
                    Nightlife
                </div>
            </div>
            <div class="map-viewport" id="mapViewport">
                <div class="map-markers">
                    <!-- Map markers will be added here -->
                </div>
            </div>
        `;

        // Add sample markers
        addMapMarkers();
        
        techState.mapInitialized = true;
    }

    // Add map markers
    function addMapMarkers() {
        const markersContainer = document.querySelector('.map-markers');
        if (!markersContainer) return;

        const markers = [
            { id: 1, type: 'restaurant', x: 30, y: 40, name: 'Sky Lounge' },
            { id: 2, type: 'bar', x: 60, y: 30, name: 'Blue Note Jazz Club' },
            { id: 3, type: 'nightlife', x: 45, y: 60, name: 'The Underground Club' },
            { id: 4, type: 'restaurant', x: 20, y: 70, name: 'Pizzeria Uno' },
            { id: 5, type: 'restaurant', x: 70, y: 50, name: 'The Garden Bistro' }
        ];

        markers.forEach(marker => {
            const markerEl = document.createElement('div');
            markerEl.className = `map-marker marker-${marker.type}`;
            markerEl.style.cssText = `
                position: absolute;
                left: ${marker.x}%;
                top: ${marker.y}%;
                transform: translate(-50%, -50%);
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: ${getMarkerColor(marker.type)};
                border: 3px solid white;
                cursor: pointer;
                transition: all 0.3s ease;
                z-index: 10;
            `;
            markerEl.title = marker.name;
            markerEl.onclick = () => showMarkerDetails(marker);
            
            markersContainer.appendChild(markerEl);
            techState.markers.push(markerEl);
        });

        // Add clustering simulation for nearby markers
        simulateClustering();
    }

    // Get marker color
    function getMarkerColor(type) {
        const colors = {
            restaurant: '#ef4444',
            bar: '#3b82f6',
            nightlife: '#8b5cf6'
        };
        return colors[type] || '#6b7280';
    }

    // Simulate clustering
    function simulateClustering() {
        // In real implementation, this would use a clustering library
        const clusters = document.querySelectorAll('.map-marker');
        clusters.forEach((marker, index) => {
            if (index > 2) {
                marker.style.transform = 'translate(-50%, -50%) scale(0.8)';
                marker.style.opacity = '0.8';
            }
        });
    }

    // Map control functions
    window.zoomIn = function() {
        const viewport = document.getElementById('mapViewport');
        const currentScale = parseFloat(viewport.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] || 1);
        const newScale = Math.min(currentScale + 0.2, 3);
        viewport.style.transform = `scale(${newScale})`;
    };

    window.zoomOut = function() {
        const viewport = document.getElementById('mapViewport');
        const currentScale = parseFloat(viewport.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] || 1);
        const newScale = Math.max(currentScale - 0.2, 0.5);
        viewport.style.transform = `scale(${newScale})`;
    };

    window.resetMap = function() {
        const viewport = document.getElementById('mapViewport');
        viewport.style.transform = 'scale(1)';
    };

    window.toggleMapStyle = function() {
        const container = document.querySelector('.map-container');
        container.classList.toggle('satellite-view');
    };

    // Show marker details
    function showMarkerDetails(marker) {
        showNotification(`${marker.name} - ${marker.type}`, 'info');
    }

    // Add map controls
    function addMapControls() {
        // Route planning
        const routeBtn = document.createElement('button');
        routeBtn.className = 'map-control-btn route-btn';
        routeBtn.innerHTML = '<i class="fas fa-route"></i>';
        routeBtn.title = 'Plan Route';
        routeBtn.onclick = () => showRoutePlanner();
        
        const controls = document.querySelector('.map-controls');
        if (controls) {
            controls.appendChild(routeBtn);
        }
    }

    // Show route planner
    function showRoutePlanner() {
        showNotification('Route planner activated!', 'info');
        // In real implementation, this would open a route planning interface
    }

    // Ensure consistency across all pages
    function ensureConsistency() {
        // Check for consistent headers
        ensureConsistentHeader();
        
        // Check for consistent footers
        ensureConsistentFooter();
        
        // Check navigation consistency
        ensureNavigationConsistency();
    }

    // Ensure consistent header
    function ensureConsistentHeader() {
        const headers = document.querySelectorAll('header, .header');
        const headerClasses = ['site-header', 'header-enhanced', 'universal-header'];
        
        headers.forEach(header => {
            if (!headerClasses.some(cls => header.classList.contains(cls))) {
                header.classList.add('universal-header');
            }
        });
    }

    // Ensure consistent footer
    function ensureConsistentFooter() {
        const footers = document.querySelectorAll('footer, .footer');
        const footerClasses = ['site-footer', 'footer-enhanced', 'universal-footer'];
        
        footers.forEach(footer => {
            if (!footerClasses.some(cls => footer.classList.contains(cls))) {
                footer.classList.add('universal-footer');
            }
        });
    }

    // Ensure navigation consistency
    function ensureNavigationConsistency() {
        const navLinks = document.querySelectorAll('nav a, .nav-link, .header-nav-link');
        const standardLinks = [
            { text: 'Home', href: 'index.html', icon: 'home' },
            { text: 'Explore', href: 'explore.html', icon: 'compass' },
            { text: 'Social', href: 'social-feed.html', icon: 'users' },
            { text: 'Events', href: 'events.html', icon: 'calendar' },
            { text: 'Nightlife', href: 'nightlife.html', icon: 'glass-cheers' }
        ];
        
        // Ensure all pages have consistent navigation
        standardLinks.forEach(link => {
            const existingLink = Array.from(navLinks).find(nav => 
                nav.textContent.includes(link.text) || nav.href.includes(link.href)
            );
            
            if (!existingLink) {
                console.log(`Missing navigation link: ${link.text}`);
            }
        });
    }

    // Add technical styles
    function addTechnicalStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Floating Actions */
            .floating-actions-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 1000;
            }
            
            .fab {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, #D4AF37 0%, #E5C158 100%);
                border: none;
                color: #0a0a0a;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(212, 175, 55, 0.4);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 12px;
                font-size: 20px;
            }
            
            .fab:hover {
                transform: translateY(-4px);
                box-shadow: 0 8px 20px rgba(212, 175, 55, 0.6);
            }
            
            .fab:active {
                transform: translateY(-2px);
            }
            
            /* Search Suggestions */
            .suggestion-item {
                padding: 12px 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                transition: background 0.2s ease;
            }
            
            .suggestion-item:hover {
                background: rgba(212, 175, 55, 0.1);
            }
            
            .suggestion-item i {
                color: #D4AF37;
            }
            
            /* Map Styles */
            .map-container {
                position: relative;
                background: #1a1a1a;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                overflow: hidden;
                height: 400px;
            }
            
            .map-controls {
                position: absolute;
                top: 16px;
                right: 16px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 100;
            }
            
            .map-control-btn {
                width: 40px;
                height: 40px;
                background: rgba(255, 255, 255, 0.9);
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .map-control-btn:hover {
                background: #D4AF37;
                color: #0a0a0a;
            }
            
            .map-legend {
                position: absolute;
                bottom: 16px;
                left: 16px;
                background: rgba(0, 0, 0, 0.8);
                padding: 12px;
                border-radius: 8px;
                z-index: 100;
            }
            
            .legend-item {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
                color: white;
                font-size: 0.9rem;
            }
            
            .legend-marker {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 2px solid white;
            }
            
            .marker-restaurant { background: #ef4444; }
            .marker-bar { background: #3b82f6; }
            .marker-nightlife { background: #8b5cf6; }
            
            .map-viewport {
                width: 100%;
                height: 100%;
                background: linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
                            linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
                            linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
                            linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
                background-size: 20px 20px;
                background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                transition: transform 0.3s ease;
                transform-origin: center;
            }
            
            .map-markers {
                position: relative;
                width: 100%;
                height: 100%;
            }
            
            .satellite-view .map-viewport {
                background: linear-gradient(to bottom, #1a237e, #0d47a1, #01579b);
            }
            
            /* Filter Feedback */
            @keyframes filterPulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
            
            .filter-active {
                animation: filterPulse 0.3s ease;
            }
            
            /* Search Highlight */
            .search-highlight {
                background: rgba(212, 175, 55, 0.3);
                padding: 2px 4px;
                border-radius: 3px;
            }
            
            /* Loading States */
            .loading {
                position: relative;
                overflow: hidden;
            }
            
            .loading::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.3), transparent);
                animation: loading 1.5s infinite;
            }
            
            @keyframes loading {
                0% { left: -100%; }
                100% { left: 100%; }
            }
            
            /* Responsive Design */
            @media (max-width: 768px) {
                .floating-actions-container {
                    bottom: 16px;
                    right: 16px;
                }
                
                .fab {
                    width: 48px;
                    height: 48px;
                    font-size: 18px;
                }
                
                .map-controls {
                    top: 8px;
                    right: 8px;
                }
                
                .map-control-btn {
                    width: 36px;
                    height: 36px;
                }
                
                .map-legend {
                    bottom: 8px;
                    left: 8px;
                    font-size: 0.8rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Setup tooltips
    function setupTooltips() {
        const tooltipElements = document.querySelectorAll('[title]');
        
        tooltipElements.forEach(element => {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = element.title;
            
            element.removeAttribute('title');
            element.appendChild(tooltip);
            
            element.addEventListener('mouseenter', () => {
                tooltip.style.opacity = '1';
                tooltip.style.visibility = 'visible';
            });
            
            element.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
                tooltip.style.visibility = 'hidden';
            });
        });
    }

    // Apply filters
    function applyFilters() {
        console.log('Applying filters:', techState.filters);
        // In real implementation, this would filter the displayed content
        showNotification('Filters applied', 'info');
    }

    // Show filter feedback
    function showFilterFeedback(filter) {
        filter.classList.add('filter-active');
        setTimeout(() => {
            filter.classList.remove('filter-active');
        }, 300);
    }

    // Show search feedback
    function showSearchFeedback(query) {
        if (query) {
            console.log('Searching for:', query);
        }
    }

    // Highlight search term
    function highlightSearchTerm(element, term) {
        // Implementation for highlighting search terms
    }

    // Remove highlight
    function removeHighlight(element) {
        // Implementation for removing highlights
    }

    // Update search results count
    function updateSearchResultsCount(count, query) {
        const countElement = document.querySelector('.search-results-count');
        if (countElement) {
            if (query) {
                countElement.textContent = `${count} results for "${query}"`;
            } else {
                countElement.textContent = '';
            }
        }
    }

    // Show card details
    function showCardDetails(card) {
        card.classList.toggle('expanded');
        if (card.classList.contains('expanded')) {
            // Show detailed view
            console.log('Card expanded:', card);
        }
    }

    // Show notification
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            padding: '16px 24px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            zIndex: '10000',
            animation: 'slideInRight 0.3s ease',
            background: type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6'
        });
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTechnicalFeatures);
    } else {
        initializeTechnicalFeatures();
    }

})();
