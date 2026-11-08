// SceneLink Explore Page - Advanced Filters JavaScript
class AdvancedFiltersSystem {
    constructor() {
        this.state = {
            activeCategory: 'all',
            activeFilters: {},
            savedFilters: [],
            weatherData: null,
            mapLayers: {
                weather: false,
                transit: false,
                parking: false,
                traffic: false
            }
        };
        this.init();
    }

    init() {
        this.setupFilterPresets();
        this.setupCategorySpecificFilters();
        this.setupMapControls();
        this.setupWeatherModal();
        this.setupFooterActions();
        this.initializeSavedFilters();
    }

    // ============================================
    // FILTER PRESETS SYSTEM
    // ============================================

    setupFilterPresets() {
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.dataset.preset);
            });
        });
    }

    applyPreset(presetType) {
        const presets = {
            'best-value': {
                price: [1, 2],
                rating: 4,
                features: ['walkInFriendly', 'outdoorSeating']
            },
            'date-night': {
                price: [2, 3],
                rating: 4.5,
                features: ['romantic', 'reservations', 'liveMusic'],
                energy: 'lively'
            },
            'group-outing': {
                price: [1, 2, 3],
                rating: 4,
                features: ['groupFriendly', 'parking', 'reservations'],
                energy: 'party'
            },
            'happy-hour': {
                price: [1, 2],
                rating: 3.5,
                features: ['happyHour', 'outdoorSeating', 'walkInFriendly'],
                hours: 'happyHour'
            }
        };

        const preset = presets[presetType];
        if (preset) {
            // Reset all filters first
            this.resetAllFilters();
            
            // Apply preset filters
            if (preset.price) {
                preset.price.forEach(price => {
                    const btn = document.querySelector(`.filter-option[data-filter="price"][data-value="${price}"]`);
                    if (btn) btn.classList.add('active');
                });
            }

            if (preset.rating) {
                const btn = document.querySelector(`.filter-option[data-filter="rating"][data-value="${preset.rating}"]`);
                if (btn) btn.classList.add('active');
            }

            if (preset.features) {
                preset.features.forEach(feature => {
                    const checkbox = document.getElementById(feature);
                    if (checkbox) checkbox.checked = true;
                });
            }

            if (preset.energy) {
                const btn = document.querySelector(`.filter-option[data-filter="energy"][data-value="${preset.energy}"]`);
                if (btn) btn.classList.add('active');
            }

            // Update live summary
            this.updateFilterSummary();
            
            // Show toast
            this.showToast(`Applied "${presetType}" preset`);
        }
    }

    // ============================================
    // CATEGORY-SPECIFIC FILTERS
    // ============================================

    setupCategorySpecificFilters() {
        this.updateCategoryFilters('all');
        
        // Listen for category changes
        const categoryChips = document.querySelectorAll('.category-chip');
        categoryChips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.updateCategoryFilters(chip.dataset.category || 'all');
            });
        });
    }

    updateCategoryFilters(category) {
        const container = document.getElementById('categorySpecificFilters');
        const titleElement = document.getElementById('categoryFilterTitle');
        
        const categoryFilters = {
            'restaurants': {
                title: 'Restaurant Features',
                filters: [
                    { id: 'cuisine-italian', label: 'Italian', type: 'option' },
                    { id: 'cuisine-asian', label: 'Asian', type: 'option' },
                    { id: 'cuisine-american', label: 'American', type: 'option' },
                    { id: 'outdoor-seating', label: 'Outdoor Seating', type: 'checkbox' },
                    { id: 'family-friendly', label: 'Family Friendly', type: 'checkbox' },
                    { id: 'romantic', label: 'Romantic', type: 'checkbox' },
                    { id: 'bar-seating', label: 'Bar Seating', type: 'checkbox' }
                ]
            },
            'bars': {
                title: 'Bar Features',
                filters: [
                    { id: 'craft-cocktails', label: 'Craft Cocktails', type: 'option' },
                    { id: 'sports-bar', label: 'Sports Bar', type: 'option' },
                    { id: 'dive-bar', label: 'Dive Bar', type: 'option' },
                    { id: 'live-music', label: 'Live Music', type: 'checkbox' },
                    { id: 'rooftop', label: 'Rooftop', type: 'checkbox' },
                    { id: 'pool-table', label: 'Pool Table', type: 'checkbox' }
                ]
            },
            'events': {
                title: 'Event Types',
                filters: [
                    { id: 'concert', label: 'Concert', type: 'option' },
                    { id: 'festival', label: 'Festival', type: 'option' },
                    { id: 'comedy', label: 'Comedy Show', type: 'option' },
                    { id: 'networking', label: 'Networking', type: 'checkbox' },
                    { id: 'cultural', label: 'Cultural', type: 'checkbox' }
                ]
            },
            'nightlife': {
                title: 'Nightlife Features',
                filters: [
                    { id: 'dancing', label: 'Dancing', type: 'option' },
                    { id: 'dj-sets', label: 'DJ Sets', type: 'option' },
                    { id: 'cocktail-lounge', label: 'Cocktail Lounge', type: 'option' },
                    { id: 'bottle-service', label: 'Bottle Service', type: 'checkbox' },
                    { id: 'vip-area', label: 'VIP Area', type: 'checkbox' },
                    { id: 'late-night-food', label: 'Late Night Food', type: 'checkbox' }
                ]
            },
            'all': {
                title: 'General Features',
                filters: [
                    { id: 'pet-friendly', label: 'Pet Friendly', type: 'checkbox' },
                    { id: 'wheelchair-accessible', label: 'Wheelchair Accessible', type: 'checkbox' },
                    { id: 'valet-parking', label: 'Valet Parking', type: 'checkbox' }
                ]
            }
        };

        const filterConfig = categoryFilters[category] || categoryFilters['all'];
        
        // Update title
        titleElement.textContent = filterConfig.title;
        
        // Clear and rebuild filters
        container.innerHTML = '';
        
        filterConfig.filters.forEach(filter => {
            if (filter.type === 'option') {
                const btn = document.createElement('button');
                btn.className = 'filter-option';
                btn.dataset.filter = 'category';
                btn.dataset.value = filter.id;
                btn.textContent = filter.label;
                btn.addEventListener('click', () => {
                    btn.classList.toggle('active');
                    this.updateFilterSummary();
                });
                container.appendChild(btn);
            } else if (filter.type === 'checkbox') {
                const label = document.createElement('label');
                label.className = 'filter-checkbox';
                label.innerHTML = `
                    <input type="checkbox" id="${filter.id}">
                    <span class="checkbox-text">${filter.label}</span>
                `;
                const checkbox = label.querySelector('input');
                checkbox.addEventListener('change', () => {
                    this.updateFilterSummary();
                });
                container.appendChild(label);
            }
        });
    }

    // ============================================
    // MAP CONTROLS SYSTEM
    // ============================================

    setupMapControls() {
        const controls = {
            weatherBtn: this.toggleWeatherLayer,
            transitBtn: this.toggleTransitLayer,
            parkingBtn: this.toggleParkingLayer,
            trafficBtn: this.toggleTrafficLayer
        };

        Object.keys(controls).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => {
                    controls[btnId].call(this);
                    btn.classList.toggle('active');
                });
            }
        });

        // Info panel close button
        const closeBtn = document.getElementById('infoPanelClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('mapInfoPanel').classList.remove('active');
            });
        }
    }

    toggleWeatherLayer() {
        this.state.mapLayers.weather = !this.state.mapLayers.weather;
        this.updateMapInfoPanel('weather', this.getWeatherInfo());
    }

    toggleTransitLayer() {
        this.state.mapLayers.transit = !this.state.mapLayers.transit;
        this.updateMapInfoPanel('transit', this.getTransitInfo());
    }

    toggleParkingLayer() {
        this.state.mapLayers.parking = !this.state.mapLayers.parking;
        this.updateMapInfoPanel('parking', this.getParkingInfo());
    }

    toggleTrafficLayer() {
        this.state.mapLayers.traffic = !this.state.mapLayers.traffic;
        this.updateMapInfoPanel('traffic', this.getTrafficInfo());
    }

    updateMapInfoPanel(type, content) {
        const panel = document.getElementById('mapInfoPanel');
        const contentDiv = document.getElementById('infoPanelContent');
        
        contentDiv.innerHTML = content;
        panel.classList.add('active');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            panel.classList.remove('active');
        }, 5000);
    }

    getWeatherInfo() {
        return `
            <div class="info-item">
                <i class="fas fa-cloud-sun"></i>
                <span>Current: 72°F Partly Cloudy</span>
            </div>
            <div class="info-item">
                <i class="fas fa-umbrella"></i>
                <span>Evening: Clear, 68°F</span>
            </div>
            <div class="info-item">
                <i class="fas fa-wind"></i>
                <span>Light breeze 5mph</span>
            </div>
            <div class="info-suggestion">
                Perfect weather for rooftop venues and outdoor dining!
            </div>
        `;
    }

    getTransitInfo() {
        return `
            <div class="info-item">
                <i class="fas fa-subway"></i>
                <span>Nearest T Station: 0.3 mi</span>
            </div>
            <div class="info-item">
                <i class="fas fa-bus"></i>
                <span>Bus Routes: 3 nearby</span>
            </div>
            <div class="info-item">
                <i class="fas fa-bicycle"></i>
                <span>Bike Share: 2 stations</span>
            </div>
            <div class="info-suggestion">
                Excellent public transit access to most venues!
            </div>
        `;
    }

    getParkingInfo() {
        return `
            <div class="info-item">
                <i class="fas fa-parking"></i>
                <span>Street Parking: $2/hr</span>
            </div>
            <div class="info-item">
                <i class="fas fa-warehouse"></i>
                <span>Garages: 3 nearby</span>
            </div>
            <div class="info-item">
                <i class="fas fa-car"></i>
                <span>Valet Available: 2 venues</span>
            </div>
            <div class="info-suggestion">
                Parking can be limited on weekends - consider transit!
            </div>
        `;
    }

    getTrafficInfo() {
        return `
            <div class="info-item">
                <i class="fas fa-traffic-light"></i>
                <span>Current: Light traffic</span>
            </div>
            <div class="info-item">
                <i class="fas fa-route"></i>
                <span>Peak hours: 5-7PM</span>
            </div>
            <div class="info-item">
                <i class="fas fa-clock"></i>
                <span>Avg travel time: 15min</span>
            </div>
            <div class="info-suggestion">
                Leave early for dinner reservations during peak hours!
            </div>
        `;
    }

    // ============================================
    // WEATHER MODAL SYSTEM
    // ============================================

    setupWeatherModal() {
        // Global function for footer weather button
        window.openWeatherModal = () => {
            document.getElementById('weatherModal').classList.add('active');
            this.loadWeatherData();
        };

        window.closeWeatherModal = () => {
            document.getElementById('weatherModal').classList.remove('active');
        };

        // Click outside to close
        document.getElementById('weatherModal').addEventListener('click', (e) => {
            if (e.target.id === 'weatherModal') {
                closeWeatherModal();
            }
        });
    }

    loadWeatherData() {
        // Get user's location and load weather data
        this.getUserLocation().then(location => {
            this.getWeatherForLocation(location);
        }).catch(error => {
            // Fallback to Boston if location access denied
            this.getWeatherForLocation({ lat: 42.3601, lng: -71.0589, city: 'Boston' });
        });
    }

    async getUserLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        city: 'Current Location'
                    };
                    resolve(location);
                },
                (error) => {
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutes
                }
            );
        });
    }

    getWeatherForLocation(location) {
        // Mock weather API call - in production, this would call a real weather service
        const weatherConditions = [
            {
                temperature: 72,
                condition: 'Partly Cloudy',
                icon: 'cloud-sun',
                suggestions: [
                    { icon: 'umbrella', text: 'Rainy day? Try indoor venues' },
                    { icon: 'sun', text: 'Perfect for rooftop bars' },
                    { icon: 'wind', text: 'Cool evening? Cozy lounges' }
                ]
            },
            {
                temperature: 68,
                condition: 'Sunny',
                icon: 'sun',
                suggestions: [
                    { icon: 'sun', text: 'Perfect for outdoor dining' },
                    { icon: 'umbrella', text: 'Rooftop bars with great views' },
                    { icon: 'thermometer-half', text: 'Comfortable evening for patio seating' }
                ]
            },
            {
                temperature: 55,
                condition: 'Rainy',
                icon: 'cloud-rain',
                suggestions: [
                    { icon: 'umbrella', text: 'Cozy indoor venues recommended' },
                    { icon: 'cocktail', text: 'Perfect for cocktail lounges' },
                    { icon: 'music', text: 'Live music venues for entertainment' }
                ]
            },
            {
                temperature: 45,
                condition: 'Cloudy',
                icon: 'cloud',
                suggestions: [
                    { icon: 'fire', text: 'Warm up by fireplace lounges' },
                    { icon: 'cocktail', text: 'Intimate cocktail bars' },
                    { icon: 'utensils', text: 'Comfort food restaurants' }
                ]
            }
        ];

        // Select weather based on time of day and random variation
        const hour = new Date().getHours();
        const randomIndex = Math.floor(Math.random() * weatherConditions.length);
        
        let weather = weatherConditions[randomIndex];
        
        // Adjust for time of day
        if (hour >= 18 && hour <= 22) { // Evening
            weather.temperature -= 5;
            weather.condition = weather.temperature < 60 ? 'Cool Evening' : 'Pleasant Evening';
        }

        // Add location info
        weather.location = location.city;
        
        this.state.weatherData = weather;
        this.updateWeatherModal();
        this.updateWeatherSuggestions();
    }

    updateWeatherSuggestions() {
        if (!this.state.weatherData) return;

        const weather = this.state.weatherData;
        const suggestions = this.state.weatherData.suggestions;

        // Update map info panel weather info
        const weatherInfo = this.getWeatherInfo();
        
        // Add weather-based venue filtering if applicable
        if (weather.temperature < 60) {
            this.addWeatherFilterOption('Indoor', 'Perfect for cooler weather');
        } else if (weather.temperature > 75) {
            this.addWeatherFilterOption('Outdoor', 'Great weather for patios');
        }
    }

    addWeatherFilterOption(option, description) {
        // Add weather-based filter option to UI
        const vibeChips = document.getElementById('vibeChips');
        if (vibeChips && !vibeChips.querySelector(`[data-vibe="${option.toLowerCase()}"]`)) {
            const weatherChip = document.createElement('button');
            weatherChip.className = 'vibe-chip weather-suggestion';
            weatherChip.dataset.vibe = option.toLowerCase();
            weatherChip.innerHTML = `<i class="fas fa-cloud-sun"></i> ${option}`;
            weatherChip.title = description;
            vibeChips.appendChild(weatherChip);
        }
    }

    updateWeatherModal() {
        const weather = this.state.weatherData;
        if (!weather) return;

        const currentDiv = document.querySelector('.weather-current');
        const suggestionsDiv = document.querySelector('.weather-suggestions');

        currentDiv.innerHTML = `
            <i class="fas fa-${weather.icon}"></i>
            <span>${weather.temperature}°F ${weather.condition}</span>
        `;

        suggestionsDiv.innerHTML = weather.suggestions.map(suggestion => `
            <div class="weather-suggestion">
                <i class="fas fa-${suggestion.icon}"></i>
                <span>${suggestion.text}</span>
            </div>
        `).join('');
    }

    // ============================================
    // FOOTER ACTIONS SYSTEM
    // ============================================

    setupFooterActions() {
        // Global scroll function
        window.scrollToSection = (sectionId) => {
            const element = document.querySelector(`.${sectionId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        // Newsletter form
        const newsletterForm = document.querySelector('.newsletter-form');
        if (newsletterForm) {
            newsletterForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = newsletterForm.querySelector('input').value;
                if (email && email.includes('@')) {
                    this.showToast('Subscribed to nightly recommendations!');
                    newsletterForm.querySelector('input').value = '';
                } else {
                    this.showToast('Please enter a valid email address');
                }
            });
        }

        // App download buttons
        const appButtons = document.querySelectorAll('.app-store-btn, .google-play-btn');
        appButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.showToast('App download link copied to clipboard!');
            });
        });

        // Trending spots
        const trendingSpots = document.querySelectorAll('.trending-spot');
        trendingSpots.forEach((spot, index) => {
            spot.addEventListener('click', () => {
                this.showToast(`Opening trending spot #${index + 1}...`);
            });
        });

        // Social links
        const socialLinks = document.querySelectorAll('.social-link');
        socialLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showToast('Opening social media...');
            });
        });
    }

    // ============================================
    // FILTER SAVE/LOAD SYSTEM
    // ============================================

    initializeSavedFilters() {
        // Load saved filters from localStorage
        const saved = localStorage.getItem('scenelink_saved_filters');
        if (saved) {
            this.state.savedFilters = JSON.parse(saved);
        }

        // Setup save button
        const saveBtn = document.getElementById('filtersSaveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveCurrentFilters();
            });
        }
    }

    saveCurrentFilters() {
        const currentFilters = this.getCurrentFilterState();
        const filterName = prompt('Name your filter combination:');
        
        if (filterName && currentFilters) {
            const filterSet = {
                name: filterName,
                filters: currentFilters,
                timestamp: Date.now()
            };
            
            this.state.savedFilters.push(filterSet);
            localStorage.setItem('scenelink_saved_filters', JSON.stringify(this.state.savedFilters));
            this.showToast(`Filters saved as "${filterName}"`);
        }
    }

    getCurrentFilterState() {
        // Collect all active filters
        const activeFilters = {
            category: this.state.activeCategory,
            price: [],
            rating: null,
            features: [],
            energy: null
        };

        // Get price filters
        document.querySelectorAll('.filter-option[data-filter="price"].active').forEach(btn => {
            activeFilters.price.push(btn.dataset.value);
        });

        // Get rating filter
        const ratingBtn = document.querySelector('.filter-option[data-filter="rating"].active');
        if (ratingBtn) {
            activeFilters.rating = ratingBtn.dataset.value;
        }

        // Get checkbox features
        document.querySelectorAll('.filter-checkbox input:checked').forEach(checkbox => {
            activeFilters.features.push(checkbox.id);
        });

        // Get energy filter
        const energyBtn = document.querySelector('.filter-option[data-filter="energy"].active');
        if (energyBtn) {
            activeFilters.energy = energyBtn.dataset.value;
        }

        return activeFilters;
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    updateFilterSummary() {
        // Count active filters and update summary
        const activeCount = document.querySelectorAll('.filter-option.active').length + 
                          document.querySelectorAll('.filter-checkbox input:checked').length;
        
        const summary = document.getElementById('filtersLiveSummary');
        if (summary) {
            summary.querySelector('.summary-count').textContent = `${activeCount} matches`;
        }
    }

    resetAllFilters() {
        // Remove active classes from all options
        document.querySelectorAll('.filter-option.active').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Uncheck all checkboxes
        document.querySelectorAll('.filter-checkbox input:checked').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        this.updateFilterSummary();
    }

    showToast(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 14px;
            z-index: 1000;
            animation: slideUp 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }
}

// Initialize advanced filters system
const advancedFilters = new AdvancedFiltersSystem();

// Add CSS animations for toast
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes slideUp {
        from {
            transform: translate(-50%, 100%);
            opacity: 0;
        }
        to {
            transform: translate(-50%, 0);
            opacity: 1;
        }
    }
    
    @keyframes slideDown {
        from {
            transform: translate(-50%, 0);
            opacity: 1;
        }
        to {
            transform: translate(-50%, 100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(toastStyles);