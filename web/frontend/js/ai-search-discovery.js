// AI-Powered Search & Discovery System
// Implements natural language search, AI recommendations, and venue comparison

class AISearchDiscovery {
    constructor() {
        this.userPreferences = this.loadUserPreferences();
        this.searchHistory = this.loadSearchHistory();
        this.venueData = this.loadVenueData();
        this.init();
    }

    init() {
        this.setupSearchListeners();
        this.setupRecommendationEngine();
        this.setupComparisonTool();
    }

    // ============================================
    // NATURAL LANGUAGE SEARCH
    // ============================================

    setupSearchListeners() {
        const searchInputs = document.querySelectorAll('.search-input, #mainSearch, #exploreSearch');
        
        searchInputs.forEach(input => {
            // Real-time suggestions
            input.addEventListener('input', (e) => {
                this.handleNaturalLanguageSearch(e.target.value);
            });

            // Enter key search
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.executeSearch(e.target.value);
                }
            });
        });
    }

    handleNaturalLanguageSearch(query) {
        if (query.length < 3) return;

        // Parse natural language query
        const parsedQuery = this.parseNaturalLanguage(query);
        
        // Show intelligent suggestions
        this.showSearchSuggestions(parsedQuery);
        
        // Update search context
        this.updateSearchContext(parsedQuery);
    }

    parseNaturalLanguage(query) {
        const lowerQuery = query.toLowerCase();
        
        // Extract intent and entities
        const intent = this.detectIntent(lowerQuery);
        const entities = this.extractEntities(lowerQuery);
        
        return {
            original: query,
            intent: intent,
            entities: entities,
            filters: this.generateFilters(entities)
        };
    }

    detectIntent(query) {
        // Detect user intent from query
        const intents = {
            'find': ['find', 'looking for', 'search', 'where can i'],
            'recommend': ['recommend', 'suggest', 'best', 'top', 'good'],
            'compare': ['compare', 'difference', 'vs', 'versus', 'better'],
            'book': ['book', 'reserve', 'reservation', 'table'],
            'group': ['group', 'friends', 'party', 'celebration']
        };

        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => query.includes(keyword))) {
                return intent;
            }
        }

        return 'find'; // Default intent
    }

    extractEntities(query) {
        const entities = {
            cuisine: null,
            location: null,
            priceRange: null,
            atmosphere: null,
            occasion: null,
            time: null,
            features: []
        };

        // Cuisine types
        const cuisines = ['italian', 'japanese', 'chinese', 'mexican', 'thai', 'indian', 'french', 'american', 'mediterranean', 'korean', 'vietnamese', 'greek'];
        cuisines.forEach(cuisine => {
            if (query.includes(cuisine)) entities.cuisine = cuisine;
        });

        // Locations
        const locations = ['downtown', 'back bay', 'north end', 'seaport', 'cambridge', 'somerville', 'brookline', 'south end'];
        locations.forEach(location => {
            if (query.includes(location)) entities.location = location;
        });

        // Price indicators
        if (query.match(/cheap|affordable|budget/)) entities.priceRange = '$';
        if (query.match(/moderate|mid-range/)) entities.priceRange = '$$';
        if (query.match(/upscale|fancy|expensive|fine dining/)) entities.priceRange = '$$$';

        // Atmosphere
        if (query.match(/romantic|date|intimate/)) entities.atmosphere = 'romantic';
        if (query.match(/casual|relaxed|laid-back/)) entities.atmosphere = 'casual';
        if (query.match(/lively|energetic|vibrant/)) entities.atmosphere = 'lively';
        if (query.match(/quiet|peaceful|calm/)) entities.atmosphere = 'quiet';

        // Occasion
        if (query.match(/birthday|celebration|anniversary/)) entities.occasion = 'celebration';
        if (query.match(/business|meeting|professional/)) entities.occasion = 'business';
        if (query.match(/date|romantic/)) entities.occasion = 'date';
        if (query.match(/family|kids/)) entities.occasion = 'family';

        // Time
        if (query.match(/breakfast|morning/)) entities.time = 'breakfast';
        if (query.match(/lunch|afternoon/)) entities.time = 'lunch';
        if (query.match(/dinner|evening/)) entities.time = 'dinner';
        if (query.match(/late night|after hours/)) entities.time = 'late-night';

        // Features
        const features = ['outdoor seating', 'rooftop', 'live music', 'happy hour', 'brunch', 'vegan', 'gluten-free', 'pet-friendly', 'parking'];
        features.forEach(feature => {
            if (query.includes(feature)) entities.features.push(feature);
        });

        return entities;
    }

    generateFilters(entities) {
        const filters = {};

        if (entities.cuisine) filters.cuisine = entities.cuisine;
        if (entities.location) filters.location = entities.location;
        if (entities.priceRange) filters.price = entities.priceRange;
        if (entities.atmosphere) filters.atmosphere = entities.atmosphere;
        if (entities.time) filters.mealTime = entities.time;
        if (entities.features.length > 0) filters.features = entities.features;

        return filters;
    }

    showSearchSuggestions(parsedQuery) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (!suggestionsContainer) return;

        const suggestions = this.generateSuggestions(parsedQuery);
        
        suggestionsContainer.innerHTML = suggestions.map(suggestion => `
            <div class="search-suggestion" onclick="aiSearch.executeSearch('${suggestion.query}')">
                <i class="fas ${suggestion.icon}"></i>
                <div class="suggestion-content">
                    <div class="suggestion-text">${suggestion.text}</div>
                    <div class="suggestion-meta">${suggestion.meta}</div>
                </div>
            </div>
        `).join('');

        suggestionsContainer.style.display = suggestions.length > 0 ? 'block' : 'none';
    }

    generateSuggestions(parsedQuery) {
        const suggestions = [];
        const { intent, entities } = parsedQuery;

        // Context-aware suggestions based on intent
        if (intent === 'recommend') {
            suggestions.push({
                query: `Best ${entities.cuisine || 'restaurants'} in ${entities.location || 'Boston'}`,
                text: `Top-rated ${entities.cuisine || 'restaurants'} near you`,
                meta: 'Based on reviews and ratings',
                icon: 'fa-star'
            });
        }

        if (intent === 'find') {
            suggestions.push({
                query: `${entities.cuisine || 'Restaurants'} with ${entities.features[0] || 'outdoor seating'}`,
                text: `Places with ${entities.features[0] || 'special features'}`,
                meta: 'Filtered by amenities',
                icon: 'fa-filter'
            });
        }

        // Add personalized suggestions based on history
        const personalizedSuggestions = this.getPersonalizedSuggestions(entities);
        suggestions.push(...personalizedSuggestions);

        return suggestions.slice(0, 5); // Limit to 5 suggestions
    }

    getPersonalizedSuggestions(entities) {
        const suggestions = [];
        
        // Based on user preferences
        if (this.userPreferences.favoriteCuisines) {
            this.userPreferences.favoriteCuisines.slice(0, 2).forEach(cuisine => {
                suggestions.push({
                    query: `${cuisine} restaurants near me`,
                    text: `${cuisine} places you might like`,
                    meta: 'Based on your preferences',
                    icon: 'fa-heart'
                });
            });
        }

        // Based on search history
        if (this.searchHistory.length > 0) {
            const recentSearch = this.searchHistory[0];
            suggestions.push({
                query: recentSearch.query,
                text: `Search again: "${recentSearch.query}"`,
                meta: 'Recent search',
                icon: 'fa-history'
            });
        }

        return suggestions;
    }

    executeSearch(query) {
        // Save to history
        this.addToSearchHistory(query);
        
        // Parse and execute
        const parsedQuery = this.parseNaturalLanguage(query);
        
        // Apply filters and search
        this.applySearchFilters(parsedQuery.filters);
        
        // Show results
        this.displaySearchResults(parsedQuery);
        
        // Track analytics
        this.trackSearch(parsedQuery);
    }

    // ============================================
    // AI RECOMMENDATIONS ENGINE
    // ============================================

    setupRecommendationEngine() {
        this.recommendationModel = {
            userBased: this.getUserBasedRecommendations.bind(this),
            contentBased: this.getContentBasedRecommendations.bind(this),
            collaborative: this.getCollaborativeRecommendations.bind(this),
            contextual: this.getContextualRecommendations.bind(this)
        };
    }

    getAIRecommendations(context = {}) {
        const recommendations = [];

        // Combine multiple recommendation strategies
        const userBased = this.recommendationModel.userBased(context);
        const contentBased = this.recommendationModel.contentBased(context);
        const collaborative = this.recommendationModel.collaborative(context);
        const contextual = this.recommendationModel.contextual(context);

        // Merge and rank recommendations
        const allRecommendations = [
            ...userBased,
            ...contentBased,
            ...collaborative,
            ...contextual
        ];

        // Remove duplicates and rank by score
        const uniqueRecommendations = this.deduplicateAndRank(allRecommendations);

        return uniqueRecommendations.slice(0, 10); // Top 10 recommendations
    }

    getUserBasedRecommendations(context) {
        // Based on user's past behavior and preferences
        const recommendations = [];
        
        if (!this.userPreferences.visitedVenues) return recommendations;

        // Find similar venues to ones user liked
        this.userPreferences.visitedVenues.forEach(venue => {
            if (venue.rating >= 4) {
                const similar = this.findSimilarVenues(venue);
                recommendations.push(...similar.map(v => ({
                    ...v,
                    reason: `Because you liked ${venue.name}`,
                    score: 0.8
                })));
            }
        });

        return recommendations;
    }

    getContentBasedRecommendations(context) {
        // Based on venue attributes matching user preferences
        const recommendations = [];
        
        if (!this.userPreferences.favoriteCuisines) return recommendations;

        this.venueData.forEach(venue => {
            let score = 0;

            // Match cuisine preferences
            if (this.userPreferences.favoriteCuisines.includes(venue.cuisine)) {
                score += 0.4;
            }

            // Match price range preferences
            if (this.userPreferences.priceRange === venue.priceRange) {
                score += 0.2;
            }

            // Match atmosphere preferences
            if (this.userPreferences.atmosphere === venue.atmosphere) {
                score += 0.2;
            }

            // High ratings boost
            if (venue.rating >= 4.5) {
                score += 0.2;
            }

            if (score > 0.5) {
                recommendations.push({
                    ...venue,
                    reason: 'Matches your preferences',
                    score: score
                });
            }
        });

        return recommendations;
    }

    getCollaborativeRecommendations(context) {
        // Based on what similar users liked
        const recommendations = [];
        
        // Simulate collaborative filtering
        // In production, this would use actual user similarity data
        const similarUsers = this.findSimilarUsers();
        
        similarUsers.forEach(user => {
            user.likedVenues.forEach(venueId => {
                const venue = this.venueData.find(v => v.id === venueId);
                if (venue && !this.userPreferences.visitedVenues?.includes(venueId)) {
                    recommendations.push({
                        ...venue,
                        reason: 'Popular with users like you',
                        score: 0.7
                    });
                }
            });
        });

        return recommendations;
    }

    getContextualRecommendations(context) {
        // Based on current context (time, location, weather, etc.)
        const recommendations = [];
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();

        this.venueData.forEach(venue => {
            let score = 0;
            let reason = '';

            // Time-based recommendations
            if (hour >= 17 && hour <= 22 && venue.type === 'restaurant') {
                score += 0.3;
                reason = 'Perfect for dinner time';
            } else if (hour >= 22 && venue.type === 'bar') {
                score += 0.3;
                reason = 'Great for late night';
            }

            // Weekend recommendations
            if ((day === 5 || day === 6) && venue.features?.includes('live-music')) {
                score += 0.2;
                reason = 'Weekend entertainment';
            }

            // Location-based
            if (context.userLocation && venue.distance < 2) {
                score += 0.3;
                reason = 'Close to you';
            }

            // Trending venues
            if (venue.trending) {
                score += 0.2;
                reason = 'Trending now';
            }

            if (score > 0.4) {
                recommendations.push({
                    ...venue,
                    reason: reason,
                    score: score
                });
            }
        });

        return recommendations;
    }

    deduplicateAndRank(recommendations) {
        const uniqueMap = new Map();

        recommendations.forEach(rec => {
            if (!uniqueMap.has(rec.id) || uniqueMap.get(rec.id).score < rec.score) {
                uniqueMap.set(rec.id, rec);
            }
        });

        return Array.from(uniqueMap.values())
            .sort((a, b) => b.score - a.score);
    }

    // ============================================
    // VENUE COMPARISON TOOL
    // ============================================

    setupComparisonTool() {
        this.comparisonList = [];
        this.maxComparisons = 4;
    }

    addToComparison(venueId) {
        if (this.comparisonList.length >= this.maxComparisons) {
            this.showNotification('error', 'Comparison Limit', `You can compare up to ${this.maxComparisons} venues at once`);
            return false;
        }

        if (this.comparisonList.includes(venueId)) {
            this.showNotification('info', 'Already Added', 'This venue is already in your comparison');
            return false;
        }

        this.comparisonList.push(venueId);
        this.updateComparisonUI();
        return true;
    }

    removeFromComparison(venueId) {
        this.comparisonList = this.comparisonList.filter(id => id !== venueId);
        this.updateComparisonUI();
    }

    updateComparisonUI() {
        const comparisonBadge = document.getElementById('comparisonBadge');
        if (comparisonBadge) {
            comparisonBadge.textContent = this.comparisonList.length;
            comparisonBadge.style.display = this.comparisonList.length > 0 ? 'flex' : 'none';
        }

        // Update comparison buttons on venue cards
        document.querySelectorAll('.venue-card').forEach(card => {
            const venueId = card.dataset.venueId;
            const compareBtn = card.querySelector('.btn-compare');
            if (compareBtn) {
                if (this.comparisonList.includes(venueId)) {
                    compareBtn.classList.add('active');
                    compareBtn.innerHTML = '<i class="fas fa-check"></i> Added';
                } else {
                    compareBtn.classList.remove('active');
                    compareBtn.innerHTML = '<i class="fas fa-balance-scale"></i> Compare';
                }
            }
        });
    }

    openComparisonModal() {
        if (this.comparisonList.length < 2) {
            this.showNotification('info', 'Add More Venues', 'Please add at least 2 venues to compare');
            return;
        }

        const venues = this.comparisonList.map(id => 
            this.venueData.find(v => v.id === id)
        );

        this.displayComparisonModal(venues);
    }

    displayComparisonModal(venues) {
        const modal = document.getElementById('comparisonModal') || this.createComparisonModal();
        const comparisonTable = this.generateComparisonTable(venues);
        
        modal.querySelector('.modal-body').innerHTML = comparisonTable;
        modal.style.display = 'flex';
    }

    generateComparisonTable(venues) {
        const attributes = [
            { key: 'rating', label: 'Rating', format: (v) => `${v} ⭐` },
            { key: 'priceRange', label: 'Price Range', format: (v) => v },
            { key: 'cuisine', label: 'Cuisine', format: (v) => v },
            { key: 'atmosphere', label: 'Atmosphere', format: (v) => v },
            { key: 'distance', label: 'Distance', format: (v) => `${v} mi` },
            { key: 'reviewCount', label: 'Reviews', format: (v) => v.toLocaleString() }
        ];

        let html = `
            <div class="comparison-table">
                <table>
                    <thead>
                        <tr>
                            <th>Attribute</th>
                            ${venues.map(v => `<th>${v.name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        attributes.forEach(attr => {
            html += `
                <tr>
                    <td class="attr-label">${attr.label}</td>
                    ${venues.map(v => `<td>${attr.format(v[attr.key])}</td>`).join('')}
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
                <div class="comparison-actions">
                    <button class="btn-secondary" onclick="aiSearch.clearComparison()">Clear All</button>
                    <button class="btn-primary" onclick="aiSearch.closeComparisonModal()">Close</button>
                </div>
            </div>
        `;

        return html;
    }

    clearComparison() {
        this.comparisonList = [];
        this.updateComparisonUI();
        this.closeComparisonModal();
    }

    closeComparisonModal() {
        const modal = document.getElementById('comparisonModal');
        if (modal) modal.style.display = 'none';
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    findSimilarVenues(venue) {
        return this.venueData.filter(v => 
            v.id !== venue.id &&
            (v.cuisine === venue.cuisine || v.atmosphere === venue.atmosphere)
        ).slice(0, 3);
    }

    findSimilarUsers() {
        // Simulate finding similar users
        // In production, this would use actual user similarity algorithms
        return [
            { id: 1, likedVenues: [1, 3, 5, 7] },
            { id: 2, likedVenues: [2, 4, 6, 8] }
        ];
    }

    applySearchFilters(filters) {
        // Apply filters to current view
        console.log('Applying filters:', filters);
        // Implementation depends on page context
    }

    displaySearchResults(parsedQuery) {
        console.log('Displaying results for:', parsedQuery);
        // Implementation depends on page context
    }

    addToSearchHistory(query) {
        this.searchHistory.unshift({
            query: query,
            timestamp: new Date().toISOString()
        });
        this.searchHistory = this.searchHistory.slice(0, 10); // Keep last 10
        this.saveSearchHistory();
    }

    updateSearchContext(parsedQuery) {
        // Update UI based on parsed query
        console.log('Search context updated:', parsedQuery);
    }

    trackSearch(parsedQuery) {
        // Analytics tracking
        console.log('Search tracked:', parsedQuery);
    }

    showNotification(type, title, message) {
        if (typeof showNotification === 'function') {
            showNotification(type, title, message);
        } else {
            console.log(`${type}: ${title} - ${message}`);
        }
    }

    // ============================================
    // DATA PERSISTENCE
    // ============================================

    loadUserPreferences() {
        const stored = localStorage.getItem('userPreferences');
        return stored ? JSON.parse(stored) : {
            favoriteCuisines: ['Italian', 'Japanese', 'Mexican'],
            priceRange: '$$',
            atmosphere: 'casual',
            visitedVenues: []
        };
    }

    loadSearchHistory() {
        const stored = localStorage.getItem('searchHistory');
        return stored ? JSON.parse(stored) : [];
    }

    saveSearchHistory() {
        localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
    }

    loadVenueData() {
        // In production, this would fetch from API
        return [
            {
                id: 1,
                name: 'Bella Vista',
                cuisine: 'Italian',
                rating: 4.5,
                priceRange: '$$$',
                atmosphere: 'romantic',
                distance: 1.2,
                reviewCount: 342,
                type: 'restaurant',
                trending: true,
                features: ['outdoor-seating', 'wine-bar']
            },
            // Add more mock venues...
        ];
    }
}

// Initialize AI Search & Discovery
let aiSearch;
document.addEventListener('DOMContentLoaded', () => {
    aiSearch = new AISearchDiscovery();
    console.log('AI Search & Discovery initialized');
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.aiSearch = aiSearch;
}