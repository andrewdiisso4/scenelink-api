// AI-Powered Search - Natural Language Processing & Smart Suggestions
// Handles intelligent search queries, context-aware suggestions, and personalized results

class AISearchManager {
    constructor() {
        this.searchHistory = this.loadSearchHistory();
        this.userPreferences = this.loadUserPreferences();
        this.contextData = {
            location: 'Boston, MA',
            time: new Date(),
            weather: null,
            recentActivity: []
        };
        this.init();
    }

    init() {
        this.setupSearchListeners();
        this.loadContextData();
        this.setupVoiceSearch();
    }

    setupSearchListeners() {
        // Main search input
        const searchInput = document.getElementById('mainSearch') || document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
            searchInput.addEventListener('focus', () => this.showSuggestions());
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(e.target.value);
                }
            });
        }

        // Search button
        const searchBtn = document.getElementById('searchBtn') || document.querySelector('.search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const input = document.getElementById('mainSearch') || document.querySelector('.search-input');
                if (input) this.performSearch(input.value);
            });
        }

        // Voice search button
        const voiceBtn = document.getElementById('voiceSearchBtn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => this.startVoiceSearch());
        }

        // Advanced filters button
        const filtersBtn = document.getElementById('advancedFiltersBtn');
        if (filtersBtn) {
            filtersBtn.addEventListener('click', () => this.openAdvancedFilters());
        }

        // Click outside to close suggestions
        document.addEventListener('click', (e) => {
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer && !searchContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });
    }

    handleSearchInput(event) {
        const query = event.target.value.trim();
        
        if (query.length === 0) {
            this.showRecentSearches();
            return;
        }

        if (query.length < 2) {
            this.hideSuggestions();
            return;
        }

        // Debounce the search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.generateSuggestions(query);
        }, 300);
    }

    async generateSuggestions(query) {
        const suggestions = await this.processNaturalLanguage(query);
        this.displaySuggestions(suggestions);
    }

    async processNaturalLanguage(query) {
        // Analyze the query for intent and entities
        const analysis = this.analyzeQuery(query);
        
        // Generate contextual suggestions
        const suggestions = {
            venues: [],
            categories: [],
            filters: [],
            smartSuggestions: []
        };

        // Venue suggestions based on query
        suggestions.venues = this.getVenueSuggestions(query, analysis);
        
        // Category suggestions
        suggestions.categories = this.getCategorySuggestions(query, analysis);
        
        // Smart contextual suggestions
        suggestions.smartSuggestions = this.getSmartSuggestions(query, analysis);
        
        // Filter suggestions
        suggestions.filters = this.getFilterSuggestions(analysis);

        return suggestions;
    }

    analyzeQuery(query) {
        const lowerQuery = query.toLowerCase();
        
        const analysis = {
            intent: this.detectIntent(lowerQuery),
            cuisine: this.detectCuisine(lowerQuery),
            priceRange: this.detectPriceRange(lowerQuery),
            atmosphere: this.detectAtmosphere(lowerQuery),
            time: this.detectTimeContext(lowerQuery),
            occasion: this.detectOccasion(lowerQuery),
            dietary: this.detectDietary(lowerQuery),
            location: this.detectLocation(lowerQuery)
        };

        return analysis;
    }

    detectIntent(query) {
        const intents = {
            dining: ['restaurant', 'dinner', 'lunch', 'breakfast', 'brunch', 'eat', 'food'],
            drinks: ['bar', 'cocktail', 'beer', 'wine', 'drinks', 'happy hour'],
            nightlife: ['club', 'dancing', 'nightclub', 'party', 'dj'],
            events: ['event', 'show', 'concert', 'performance', 'live music'],
            casual: ['casual', 'quick', 'grab', 'takeout'],
            formal: ['fine dining', 'upscale', 'fancy', 'elegant']
        };

        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => query.includes(keyword))) {
                return intent;
            }
        }

        return 'general';
    }

    detectCuisine(query) {
        const cuisines = [
            'italian', 'chinese', 'japanese', 'mexican', 'thai', 'indian',
            'french', 'american', 'mediterranean', 'korean', 'vietnamese',
            'greek', 'spanish', 'sushi', 'pizza', 'burger', 'seafood'
        ];

        for (const cuisine of cuisines) {
            if (query.includes(cuisine)) {
                return cuisine;
            }
        }

        return null;
    }

    detectPriceRange(query) {
        if (query.includes('cheap') || query.includes('budget') || query.includes('affordable')) {
            return '$';
        }
        if (query.includes('expensive') || query.includes('upscale') || query.includes('fine dining')) {
            return '$$$';
        }
        if (query.includes('moderate') || query.includes('mid-range')) {
            return '$$';
        }
        return null;
    }

    detectAtmosphere(query) {
        const atmospheres = {
            romantic: ['romantic', 'date', 'intimate', 'cozy'],
            casual: ['casual', 'relaxed', 'laid back', 'chill'],
            lively: ['lively', 'energetic', 'vibrant', 'busy'],
            quiet: ['quiet', 'peaceful', 'calm', 'serene'],
            trendy: ['trendy', 'hip', 'modern', 'stylish']
        };

        for (const [atmosphere, keywords] of Object.entries(atmospheres)) {
            if (keywords.some(keyword => query.includes(keyword))) {
                return atmosphere;
            }
        }

        return null;
    }

    detectTimeContext(query) {
        const now = new Date();
        const hour = now.getHours();

        if (query.includes('tonight') || query.includes('this evening')) {
            return 'tonight';
        }
        if (query.includes('tomorrow')) {
            return 'tomorrow';
        }
        if (query.includes('weekend')) {
            return 'weekend';
        }
        if (query.includes('now') || query.includes('right now')) {
            return 'now';
        }

        // Infer from current time
        if (hour >= 5 && hour < 11) return 'breakfast';
        if (hour >= 11 && hour < 15) return 'lunch';
        if (hour >= 15 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 22) return 'dinner';
        if (hour >= 22 || hour < 5) return 'late-night';

        return null;
    }

    detectOccasion(query) {
        const occasions = {
            birthday: ['birthday', 'bday'],
            anniversary: ['anniversary'],
            date: ['date', 'date night'],
            business: ['business', 'meeting', 'client'],
            celebration: ['celebration', 'celebrate'],
            group: ['group', 'friends', 'party']
        };

        for (const [occasion, keywords] of Object.entries(occasions)) {
            if (keywords.some(keyword => query.includes(keyword))) {
                return occasion;
            }
        }

        return null;
    }

    detectDietary(query) {
        const dietary = ['vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher', 'dairy-free'];
        
        for (const diet of dietary) {
            if (query.includes(diet)) {
                return diet;
            }
        }

        return null;
    }

    detectLocation(query) {
        const neighborhoods = [
            'back bay', 'south end', 'north end', 'seaport', 'downtown',
            'cambridge', 'somerville', 'brookline', 'beacon hill', 'fenway'
        ];

        for (const neighborhood of neighborhoods) {
            if (query.includes(neighborhood)) {
                return neighborhood;
            }
        }

        return null;
    }

    getVenueSuggestions(query, analysis) {
        // In a real app, this would query a database
        // For now, return sample suggestions based on analysis
        
        const sampleVenues = [
            { name: 'Trattoria Toscana', type: 'Italian Restaurant', rating: 4.7, price: '$$' },
            { name: 'The Sushi Bar', type: 'Japanese Restaurant', rating: 4.8, price: '$$$' },
            { name: 'Taco Fiesta', type: 'Mexican Restaurant', rating: 4.5, price: '$' },
            { name: 'Le Bistro', type: 'French Restaurant', rating: 4.9, price: '$$$' },
            { name: 'The Burger Joint', type: 'American Restaurant', rating: 4.6, price: '$$' }
        ];

        return sampleVenues
            .filter(venue => {
                if (analysis.cuisine) {
                    return venue.type.toLowerCase().includes(analysis.cuisine);
                }
                return venue.name.toLowerCase().includes(query.toLowerCase()) ||
                       venue.type.toLowerCase().includes(query.toLowerCase());
            })
            .slice(0, 5);
    }

    getCategorySuggestions(query, analysis) {
        const categories = [];

        if (analysis.intent === 'dining' || !analysis.intent) {
            categories.push({ name: 'Restaurants', icon: 'utensils', count: 150 });
        }
        if (analysis.intent === 'drinks' || !analysis.intent) {
            categories.push({ name: 'Bars & Lounges', icon: 'cocktail', count: 80 });
        }
        if (analysis.intent === 'nightlife' || !analysis.intent) {
            categories.push({ name: 'Nightclubs', icon: 'music', count: 45 });
        }
        if (analysis.intent === 'events' || !analysis.intent) {
            categories.push({ name: 'Events', icon: 'calendar', count: 30 });
        }

        return categories;
    }

    getSmartSuggestions(query, analysis) {
        const suggestions = [];

        // Time-based suggestions
        if (analysis.time === 'tonight') {
            suggestions.push({
                type: 'smart',
                text: 'Top picks for tonight',
                icon: 'clock',
                filters: { topRated: true }
            });
        }

        // Occasion-based suggestions
        if (analysis.occasion === 'date') {
            suggestions.push({
                type: 'smart',
                text: 'Romantic spots perfect for date night',
                icon: 'heart',
                filters: { atmosphere: 'romantic' }
            });
        }

        // Cuisine-based suggestions
        if (analysis.cuisine) {
            suggestions.push({
                type: 'smart',
                text: `Top-rated ${analysis.cuisine} restaurants`,
                icon: 'star',
                filters: { cuisine: analysis.cuisine, sortBy: 'rating' }
            });
        }

        // Location-based suggestions
        if (analysis.location) {
            suggestions.push({
                type: 'smart',
                text: `Popular in ${analysis.location}`,
                icon: 'map-marker-alt',
                filters: { location: analysis.location }
            });
        }

        // Dietary suggestions
        if (analysis.dietary) {
            suggestions.push({
                type: 'smart',
                text: `${analysis.dietary} friendly options`,
                icon: 'leaf',
                filters: { dietary: analysis.dietary }
            });
        }

        return suggestions;
    }

    getFilterSuggestions(analysis) {
        const filters = [];

        if (analysis.priceRange) {
            filters.push({ type: 'price', value: analysis.priceRange });
        }
        if (analysis.atmosphere) {
            filters.push({ type: 'atmosphere', value: analysis.atmosphere });
        }
        if (analysis.dietary) {
            filters.push({ type: 'dietary', value: analysis.dietary });
        }

        return filters;
    }

    displaySuggestions(suggestions) {
        let suggestionsContainer = document.getElementById('searchSuggestions');
        
        if (!suggestionsContainer) {
            suggestionsContainer = document.createElement('div');
            suggestionsContainer.id = 'searchSuggestions';
            suggestionsContainer.className = 'search-suggestions';
            
            const searchContainer = document.querySelector('.search-container') || 
                                  document.querySelector('.search-bar');
            if (searchContainer) {
                searchContainer.appendChild(suggestionsContainer);
            }
        }

        let html = '';

        // Smart suggestions
        if (suggestions.smartSuggestions.length > 0) {
            html += '<div class="suggestion-section">';
            html += '<div class="suggestion-header"><i class="fas fa-magic"></i> Smart Suggestions</div>';
            suggestions.smartSuggestions.forEach(suggestion => {
                html += `
                    <div class="suggestion-item smart-suggestion" data-filters='${JSON.stringify(suggestion.filters)}'>
                        <i class="fas fa-${suggestion.icon}"></i>
                        <span>${suggestion.text}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Venue suggestions
        if (suggestions.venues.length > 0) {
            html += '<div class="suggestion-section">';
            html += '<div class="suggestion-header"><i class="fas fa-map-marker-alt"></i> Venues</div>';
            suggestions.venues.forEach(venue => {
                html += `
                    <div class="suggestion-item venue-suggestion" data-venue='${JSON.stringify(venue)}'>
                        <div class="venue-suggestion-info">
                            <strong>${venue.name}</strong>
                            <span class="venue-type">${venue.type}</span>
                        </div>
                        <div class="venue-suggestion-meta">
                            <span class="rating"><i class="fas fa-star"></i> ${venue.rating}</span>
                            <span class="price">${venue.price}</span>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Category suggestions
        if (suggestions.categories.length > 0) {
            html += '<div class="suggestion-section">';
            html += '<div class="suggestion-header"><i class="fas fa-th-large"></i> Categories</div>';
            suggestions.categories.forEach(category => {
                html += `
                    <div class="suggestion-item category-suggestion" data-category="${category.name}">
                        <i class="fas fa-${category.icon}"></i>
                        <span>${category.name}</span>
                        <span class="count">${category.count}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        suggestionsContainer.innerHTML = html;
        suggestionsContainer.classList.add('active');

        // Attach click listeners
        this.attachSuggestionListeners(suggestionsContainer);
    }

    attachSuggestionListeners(container) {
        const items = container.querySelectorAll('.suggestion-item');
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (item.classList.contains('smart-suggestion')) {
                    const filters = JSON.parse(item.dataset.filters);
                    this.applySmartFilters(filters);
                } else if (item.classList.contains('venue-suggestion')) {
                    const venue = JSON.parse(item.dataset.venue);
                    this.navigateToVenue(venue);
                } else if (item.classList.contains('category-suggestion')) {
                    const category = item.dataset.category;
                    this.filterByCategory(category);
                }
                
                this.hideSuggestions();
            });
        });
    }

    showSuggestions() {
        const container = document.getElementById('searchSuggestions');
        if (container && container.innerHTML) {
            container.classList.add('active');
        } else {
            this.showRecentSearches();
        }
    }

    hideSuggestions() {
        const container = document.getElementById('searchSuggestions');
        if (container) {
            container.classList.remove('active');
        }
    }

    showRecentSearches() {
        if (this.searchHistory.length === 0) return;

        let suggestionsContainer = document.getElementById('searchSuggestions');
        
        if (!suggestionsContainer) {
            suggestionsContainer = document.createElement('div');
            suggestionsContainer.id = 'searchSuggestions';
            suggestionsContainer.className = 'search-suggestions';
            
            const searchContainer = document.querySelector('.search-container') || 
                                  document.querySelector('.search-bar');
            if (searchContainer) {
                searchContainer.appendChild(suggestionsContainer);
            }
        }

        let html = '<div class="suggestion-section">';
        html += '<div class="suggestion-header"><i class="fas fa-history"></i> Recent Searches</div>';
        
        this.searchHistory.slice(0, 5).forEach(search => {
            html += `
                <div class="suggestion-item recent-search" data-query="${search.query}">
                    <i class="fas fa-search"></i>
                    <span>${search.query}</span>
                    <button class="remove-search" data-query="${search.query}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        
        html += '</div>';
        suggestionsContainer.innerHTML = html;
        suggestionsContainer.classList.add('active');

        // Attach listeners
        const recentItems = suggestionsContainer.querySelectorAll('.recent-search');
        recentItems.forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.remove-search')) {
                    const query = item.dataset.query;
                    const input = document.getElementById('mainSearch') || document.querySelector('.search-input');
                    if (input) {
                        input.value = query;
                        this.performSearch(query);
                    }
                }
            });
        });

        const removeButtons = suggestionsContainer.querySelectorAll('.remove-search');
        removeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const query = btn.dataset.query;
                this.removeFromHistory(query);
            });
        });
    }

    performSearch(query) {
        if (!query || query.trim().length === 0) return;

        // Add to search history
        this.addToHistory(query);

        // Hide suggestions
        this.hideSuggestions();

        // Analyze query
        const analysis = this.analyzeQuery(query);

        // Navigate to explore page with filters
        const params = new URLSearchParams();
        params.set('q', query);
        
        if (analysis.cuisine) params.set('cuisine', analysis.cuisine);
        if (analysis.priceRange) params.set('price', analysis.priceRange);
        if (analysis.atmosphere) params.set('atmosphere', analysis.atmosphere);
        if (analysis.location) params.set('location', analysis.location);
        if (analysis.dietary) params.set('dietary', analysis.dietary);

        window.location.href = `explore.html?${params.toString()}`;
    }

    applySmartFilters(filters) {
        const params = new URLSearchParams();
        
        for (const [key, value] of Object.entries(filters)) {
            params.set(key, value);
        }

        window.location.href = `explore.html?${params.toString()}`;
    }

    navigateToVenue(venue) {
        // In a real app, navigate to venue detail page
        console.log('Navigate to venue:', venue);
        window.location.href = `venue.html?name=${encodeURIComponent(venue.name)}`;
    }

    filterByCategory(category) {
        window.location.href = `explore.html?category=${encodeURIComponent(category)}`;
    }

    addToHistory(query) {
        // Remove if already exists
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);
        
        // Add to beginning
        this.searchHistory.unshift({
            query: query,
            timestamp: new Date().toISOString()
        });

        // Keep only last 10
        this.searchHistory = this.searchHistory.slice(0, 10);

        // Save
        this.saveSearchHistory();
    }

    removeFromHistory(query) {
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);
        this.saveSearchHistory();
        this.showRecentSearches();
    }

    setupVoiceSearch() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            // Voice search not supported
            const voiceBtn = document.getElementById('voiceSearchBtn');
            if (voiceBtn) voiceBtn.style.display = 'none';
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const input = document.getElementById('mainSearch') || document.querySelector('.search-input');
            if (input) {
                input.value = transcript;
                this.performSearch(transcript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };
    }

    startVoiceSearch() {
        if (this.recognition) {
            this.recognition.start();
            
            // Visual feedback
            const voiceBtn = document.getElementById('voiceSearchBtn');
            if (voiceBtn) {
                voiceBtn.classList.add('listening');
                setTimeout(() => voiceBtn.classList.remove('listening'), 3000);
            }
        }
    }

    openAdvancedFilters() {
        // This would open an advanced filters modal
        console.log('Opening advanced filters...');
        
        // For now, navigate to explore with filters panel open
        window.location.href = 'explore.html?filters=open';
    }

    loadContextData() {
        // Load user's current context (location, time, weather, etc.)
        // In a real app, this would fetch from APIs
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.contextData.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                },
                (error) => {
                    console.log('Location access denied');
                }
            );
        }
    }

    loadSearchHistory() {
        const stored = localStorage.getItem('searchHistory');
        return stored ? JSON.parse(stored) : [];
    }

    saveSearchHistory() {
        localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
    }

    loadUserPreferences() {
        const stored = localStorage.getItem('userPreferences');
        return stored ? JSON.parse(stored) : {
            favoriteCuisines: [],
            pricePreference: '$$',
            dietaryRestrictions: []
        };
    }
}

// Initialize when DOM is ready
let aiSearch;
document.addEventListener('DOMContentLoaded', () => {
    aiSearch = new AISearchManager();
});