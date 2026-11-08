/**
 * Enhanced Advanced Filters System
 * Comprehensive filtering with 60+ options across 8 categories
 * Features: Multi-select, presets, save/load, search within filters
 */

class EnhancedFiltersSystem {
    constructor() {
        this.activeFilters = {
            cuisine: [],
            vibe: [],
            price: [],
            features: [],
            dietary: [],
            mealType: [],
            ambiance: [],
            serviceType: [],
            entertainment: [],
            seating: [],
            accessibility: [],
            payment: []
        };
        
        this.filterPresets = {
            dateNight: {
                name: '💕 Date Night',
                filters: {
                    vibe: ['Romantic', 'Upscale'],
                    ambiance: ['Date Night', 'Romantic'],
                    features: ['Outdoor Seating', 'Live Music'],
                    price: ['$$$', '$$$$']
                }
            },
            familyFriendly: {
                name: '👨‍👩‍👧‍👦 Family Friendly',
                filters: {
                    vibe: ['Casual', 'Family-Friendly'],
                    ambiance: ['Casual Hangout'],
                    features: ['Parking', 'WiFi'],
                    price: ['$', '$$']
                }
            },
            budgetFriendly: {
                name: '💰 Budget Friendly',
                filters: {
                    price: ['$', '$$'],
                    features: ['Happy Hour', 'Delivery'],
                    serviceType: ['Takeout', 'Delivery']
                }
            },
            luxuryExperience: {
                name: '✨ Luxury Experience',
                filters: {
                    vibe: ['Upscale'],
                    price: ['$$$', '$$$$'],
                    features: ['Private Dining', 'Reservations'],
                    ambiance: ['Anniversary', 'Celebration']
                }
            },
            groupHangout: {
                name: '🎉 Group Hangout',
                filters: {
                    vibe: ['Lively', 'Casual'],
                    features: ['Outdoor Seating', 'Happy Hour'],
                    entertainment: ['Live Music', 'Sports TV'],
                    ambiance: ['Girls Night', 'Guys Night']
                }
            },
            healthConscious: {
                name: '🥗 Health Conscious',
                filters: {
                    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free'],
                    features: ['Vegan', 'Gluten-Free'],
                    mealType: ['Brunch', 'Lunch']
                }
            }
        };
        
        this.filterCategories = {
            cuisine: {
                name: 'Cuisine Type',
                icon: '🍽️',
                options: [
                    'Italian', 'Japanese', 'Chinese', 'Mexican', 'Thai',
                    'Indian', 'French', 'American', 'Mediterranean', 'Korean',
                    'Vietnamese', 'Greek', 'Spanish', 'Seafood', 'Steakhouse'
                ]
            },
            vibe: {
                name: 'Vibe',
                icon: '✨',
                options: [
                    'Romantic', 'Casual', 'Upscale', 'Lively',
                    'Cozy', 'Trendy', 'Family-Friendly', 'Quiet'
                ]
            },
            price: {
                name: 'Price Range',
                icon: '💰',
                options: [
                    { value: '$', label: '$ - Budget ($10-20)', description: 'Affordable dining' },
                    { value: '$$', label: '$$ - Moderate ($20-40)', description: 'Mid-range options' },
                    { value: '$$$', label: '$$$ - Upscale ($40-70)', description: 'Fine dining' },
                    { value: '$$$$', label: '$$$$ - Luxury ($70+)', description: 'Premium experience' }
                ]
            },
            features: {
                name: 'Features',
                icon: '⭐',
                options: [
                    'Outdoor Seating', 'Rooftop', 'Live Music', 'Happy Hour',
                    'Brunch', 'Late Night', 'Vegan', 'Gluten-Free',
                    'Parking', 'Reservations', 'Delivery', 'WiFi',
                    'Pet-Friendly', 'Private Dining'
                ]
            },
            dietary: {
                name: 'Dietary Restrictions',
                icon: '🥗',
                options: [
                    'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
                    'Nut-Free', 'Halal', 'Kosher', 'Keto'
                ]
            },
            mealType: {
                name: 'Meal Type',
                icon: '🍳',
                options: [
                    'Breakfast', 'Brunch', 'Lunch', 'Dinner',
                    'Late Night', 'Dessert'
                ]
            },
            ambiance: {
                name: 'Ambiance',
                icon: '🎭',
                options: [
                    'Romantic', 'Business', 'Date Night', 'Girls Night',
                    'Guys Night', 'Solo Dining', 'Birthday', 'Anniversary',
                    'Celebration', 'Casual Hangout'
                ]
            },
            serviceType: {
                name: 'Service Type',
                icon: '🚗',
                options: [
                    'Dine-In', 'Takeout', 'Delivery', 'Curbside',
                    'Catering', 'Private Events'
                ]
            },
            entertainment: {
                name: 'Entertainment',
                icon: '🎵',
                options: [
                    'Live Music', 'DJ', 'Karaoke', 'Sports TV',
                    'Trivia Night', 'Comedy Shows', 'Dancing', 'Pool Tables'
                ]
            },
            seating: {
                name: 'Seating Options',
                icon: '🪑',
                options: [
                    'Bar Seating', 'Outdoor Patio', 'Rooftop', 'Private Room',
                    'Counter Seating', 'Booth Seating'
                ]
            },
            accessibility: {
                name: 'Accessibility',
                icon: '♿',
                options: [
                    'Wheelchair Accessible', 'Elevator Access', 'Accessible Parking',
                    'Accessible Restroom', 'Service Animal Friendly'
                ]
            },
            payment: {
                name: 'Payment Options',
                icon: '💳',
                options: [
                    'Credit Cards', 'Cash Only', 'Mobile Pay', 'Crypto Accepted'
                ]
            }
        };
        
        this.savedFilters = this.loadSavedFilters();
        this.filterHistory = this.loadFilterHistory();
        
        this.init();
    }
    
    init() {
        this.createFilterUI();
        this.attachEventListeners();
        this.loadLastUsedFilters();
    }
    
    createFilterUI() {
        // Check if filter panel already exists
        if (document.getElementById('enhanced-filters-panel')) return;
        
        const filterPanel = document.createElement('div');
        filterPanel.id = 'enhanced-filters-panel';
        filterPanel.className = 'enhanced-filters-panel';
        filterPanel.innerHTML = `
            <div class="filters-header">
                <h3>
                    <i class="fas fa-sliders-h"></i>
                    Advanced Filters
                </h3>
                <div class="filters-actions">
                    <button class="filter-preset-btn" id="filterPresetsBtn">
                        <i class="fas fa-star"></i> Presets
                    </button>
                    <button class="filter-save-btn" id="filterSaveBtn">
                        <i class="fas fa-save"></i> Save
                    </button>
                    <button class="filter-clear-btn" id="filterClearBtn">
                        <i class="fas fa-times"></i> Clear All
                    </button>
                    <button class="filter-close-btn" id="filterCloseBtn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="filters-search">
                <input type="text" id="filterSearchInput" placeholder="Search filters..." class="filter-search-input">
                <i class="fas fa-search"></i>
            </div>
            
            <div class="filters-presets" id="filtersPresets" style="display: none;">
                ${this.renderPresets()}
            </div>
            
            <div class="filters-content" id="filtersContent">
                ${this.renderFilterCategories()}
            </div>
            
            <div class="filters-footer">
                <div class="active-filters-count">
                    <span id="activeFiltersCount">0</span> filters active
                </div>
                <button class="apply-filters-btn" id="applyFiltersBtn">
                    Apply Filters
                </button>
            </div>
        `;
        
        document.body.appendChild(filterPanel);
    }
    
    renderPresets() {
        return `
            <div class="presets-grid">
                ${Object.entries(this.filterPresets).map(([key, preset]) => `
                    <button class="preset-card" data-preset="${key}">
                        <span class="preset-name">${preset.name}</span>
                        <span class="preset-count">${this.countPresetFilters(preset.filters)} filters</span>
                    </button>
                `).join('')}
            </div>
        `;
    }
    
    renderFilterCategories() {
        return Object.entries(this.filterCategories).map(([key, category]) => `
            <div class="filter-category" data-category="${key}">
                <div class="category-header">
                    <h4>
                        <span class="category-icon">${category.icon}</span>
                        ${category.name}
                        <span class="category-count" id="${key}Count">0</span>
                    </h4>
                    <div class="category-actions">
                        <button class="select-all-btn" data-category="${key}">Select All</button>
                        <button class="clear-category-btn" data-category="${key}">Clear</button>
                        <button class="toggle-category-btn" data-category="${key}">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>
                <div class="category-options" id="${key}Options">
                    ${this.renderCategoryOptions(key, category.options)}
                </div>
            </div>
        `).join('');
    }
    
    renderCategoryOptions(category, options) {
        if (category === 'price') {
            return options.map(option => `
                <label class="filter-option" data-filter="${option.value}">
                    <input type="checkbox" value="${option.value}" data-category="${category}">
                    <span class="option-content">
                        <span class="option-label">${option.label}</span>
                        <span class="option-description">${option.description}</span>
                    </span>
                </label>
            `).join('');
        }
        
        return options.map(option => `
            <label class="filter-option" data-filter="${option}">
                <input type="checkbox" value="${option}" data-category="${category}">
                <span class="option-label">${option}</span>
            </label>
        `).join('');
    }
    
    attachEventListeners() {
        // Close button
        const closeBtn = document.getElementById('filterCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePanel());
        }
        
        // Clear all button
        const clearBtn = document.getElementById('filterClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAllFilters());
        }
        
        // Save button
        const saveBtn = document.getElementById('filterSaveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveCurrentFilters());
        }
        
        // Presets button
        const presetsBtn = document.getElementById('filterPresetsBtn');
        if (presetsBtn) {
            presetsBtn.addEventListener('click', () => this.togglePresets());
        }
        
        // Apply button
        const applyBtn = document.getElementById('applyFiltersBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyFilters());
        }
        
        // Filter search
        const searchInput = document.getElementById('filterSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.searchFilters(e.target.value));
        }
        
        // Category toggles
        document.querySelectorAll('.toggle-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.toggleCategory(category);
            });
        });
        
        // Select all buttons
        document.querySelectorAll('.select-all-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.selectAllInCategory(category);
            });
        });
        
        // Clear category buttons
        document.querySelectorAll('.clear-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.clearCategory(category);
            });
        });
        
        // Filter checkboxes
        document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const category = e.target.dataset.category;
                const value = e.target.value;
                this.toggleFilter(category, value, e.target.checked);
            });
        });
        
        // Preset cards
        document.querySelectorAll('.preset-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const presetKey = e.currentTarget.dataset.preset;
                this.applyPreset(presetKey);
            });
        });
    }
    
    toggleFilter(category, value, checked) {
        if (checked) {
            if (!this.activeFilters[category].includes(value)) {
                this.activeFilters[category].push(value);
            }
        } else {
            this.activeFilters[category] = this.activeFilters[category].filter(v => v !== value);
        }
        
        this.updateFilterCounts();
        this.saveToHistory();
    }
    
    toggleCategory(category) {
        const optionsDiv = document.getElementById(`${category}Options`);
        const toggleBtn = document.querySelector(`[data-category="${category}"].toggle-category-btn`);
        
        if (optionsDiv.style.display === 'none') {
            optionsDiv.style.display = 'grid';
            toggleBtn.querySelector('i').classList.remove('fa-chevron-down');
            toggleBtn.querySelector('i').classList.add('fa-chevron-up');
        } else {
            optionsDiv.style.display = 'none';
            toggleBtn.querySelector('i').classList.remove('fa-chevron-up');
            toggleBtn.querySelector('i').classList.add('fa-chevron-down');
        }
    }
    
    selectAllInCategory(category) {
        const checkboxes = document.querySelectorAll(`input[data-category="${category}"]`);
        checkboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                checkbox.checked = true;
                this.toggleFilter(category, checkbox.value, true);
            }
        });
    }
    
    clearCategory(category) {
        const checkboxes = document.querySelectorAll(`input[data-category="${category}"]`);
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.activeFilters[category] = [];
        this.updateFilterCounts();
    }
    
    clearAllFilters() {
        Object.keys(this.activeFilters).forEach(category => {
            this.activeFilters[category] = [];
        });
        
        document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        this.updateFilterCounts();
        this.showNotification('All filters cleared', 'info');
    }
    
    applyPreset(presetKey) {
        const preset = this.filterPresets[presetKey];
        if (!preset) return;
        
        this.clearAllFilters();
        
        Object.entries(preset.filters).forEach(([category, values]) => {
            values.forEach(value => {
                const checkbox = document.querySelector(`input[value="${value}"][data-category="${category}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                    this.toggleFilter(category, value, true);
                }
            });
        });
        
        this.showNotification(`Applied preset: ${preset.name}`, 'success');
        this.togglePresets();
    }
    
    togglePresets() {
        const presetsDiv = document.getElementById('filtersPresets');
        if (presetsDiv.style.display === 'none') {
            presetsDiv.style.display = 'block';
        } else {
            presetsDiv.style.display = 'none';
        }
    }
    
    searchFilters(query) {
        const lowerQuery = query.toLowerCase();
        
        document.querySelectorAll('.filter-option').forEach(option => {
            const label = option.querySelector('.option-label').textContent.toLowerCase();
            if (label.includes(lowerQuery)) {
                option.style.display = 'flex';
            } else {
                option.style.display = 'none';
            }
        });
    }
    
    updateFilterCounts() {
        let totalCount = 0;
        
        Object.entries(this.activeFilters).forEach(([category, values]) => {
            const count = values.length;
            totalCount += count;
            
            const countElement = document.getElementById(`${category}Count`);
            if (countElement) {
                countElement.textContent = count;
                countElement.style.display = count > 0 ? 'inline' : 'none';
            }
        });
        
        const totalCountElement = document.getElementById('activeFiltersCount');
        if (totalCountElement) {
            totalCountElement.textContent = totalCount;
        }
    }
    
    applyFilters() {
        // Dispatch custom event with filter data
        const event = new CustomEvent('filtersApplied', {
            detail: {
                filters: this.activeFilters,
                timestamp: Date.now()
            }
        });
        
        document.dispatchEvent(event);
        
        this.saveToHistory();
        this.closePanel();
        this.showNotification('Filters applied successfully', 'success');
    }
    
    saveCurrentFilters() {
        const name = prompt('Enter a name for this filter combination:');
        if (!name) return;
        
        this.savedFilters[name] = {
            filters: JSON.parse(JSON.stringify(this.activeFilters)),
            timestamp: Date.now()
        };
        
        localStorage.setItem('scenelink_saved_filters', JSON.stringify(this.savedFilters));
        this.showNotification(`Filters saved as "${name}"`, 'success');
    }
    
    loadSavedFilters() {
        const saved = localStorage.getItem('scenelink_saved_filters');
        return saved ? JSON.parse(saved) : {};
    }
    
    saveToHistory() {
        this.filterHistory.unshift({
            filters: JSON.parse(JSON.stringify(this.activeFilters)),
            timestamp: Date.now()
        });
        
        // Keep only last 10 entries
        this.filterHistory = this.filterHistory.slice(0, 10);
        
        localStorage.setItem('scenelink_filter_history', JSON.stringify(this.filterHistory));
    }
    
    loadFilterHistory() {
        const history = localStorage.getItem('scenelink_filter_history');
        return history ? JSON.parse(history) : [];
    }
    
    loadLastUsedFilters() {
        if (this.filterHistory.length > 0) {
            const lastFilters = this.filterHistory[0].filters;
            
            Object.entries(lastFilters).forEach(([category, values]) => {
                values.forEach(value => {
                    const checkbox = document.querySelector(`input[value="${value}"][data-category="${category}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
            });
            
            this.activeFilters = JSON.parse(JSON.stringify(lastFilters));
            this.updateFilterCounts();
        }
    }
    
    openPanel() {
        const panel = document.getElementById('enhanced-filters-panel');
        if (panel) {
            panel.classList.add('active');
        }
    }
    
    closePanel() {
        const panel = document.getElementById('enhanced-filters-panel');
        if (panel) {
            panel.classList.remove('active');
        }
    }
    
    countPresetFilters(filters) {
        return Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);
    }
    
    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.enhancedFilters = new EnhancedFiltersSystem();
    });
} else {
    window.enhancedFilters = new EnhancedFiltersSystem();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedFiltersSystem;
}