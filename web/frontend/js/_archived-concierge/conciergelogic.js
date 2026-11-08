/**
 * SceneLink Concierge Logic Engine
 * Handles conversation flow, responses, and coordination between modules
 */

class SceneLinkConciergeLogic {
    constructor() {
        this.widget = null;
        this.state = null;
        this.recommender = null;
        this.currentConversation = [];
        this.init();
    }

    init() {
        // Wait for other modules to load
        setTimeout(() => {
            this.widget = window.sceneLinkConciergeWidget;
            this.state = window.sceneLinkConciergeState;
            this.recommender = window.sceneLinkConciergeRecommender;
            
            this.setupEventListeners();
            this.startConversation();
        }, 100);
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        // Listen to state changes
        this.state?.on('preferencesChanged', (preferences) => {
            this.handlePreferencesUpdate(preferences);
        });

        // Listen to venue save events
        this.state?.on('venueSaved', (venue) => {
            this.widget?.addMessage(`✅ ${venue.name} saved to your list!`, 'ai');
        });

        this.state?.on('venueRemoved', (venue) => {
            this.widget?.addMessage(`ℹ️ ${venue.name} removed from your list`, 'ai');
        });
    }

    // ============================================
    // CONVERSATION START
    // ============================================

    startConversation() {
        const sessionInfo = this.state?.getSessionInfo();
        const onboardingCompleted = this.state?.isOnboardingCompleted();

        if (!onboardingCompleted) {
            this.startOnboarding();
        } else {
            this.startReturningUserConversation(sessionInfo);
        }
    }

    startOnboarding() {
        const welcomeMessage = `👋 Hey, I'm the SceneLink Concierge! I'll help you find the perfect spot for tonight.

Tell me your vibe, budget, and neighborhood, and I'll suggest spots that match what you're looking for.

What sounds good to you tonight?`;
        
        this.widget?.addMessage(welcomeMessage, 'ai');
        this.showOnboardingQuickActions();
    }

    showOnboardingQuickActions() {
        const quickActions = [
            { label: 'Find a date night spot', type: 'quick_pick', scenario: 'dateNight' },
            { label: 'Best cocktail bars near me', type: 'quick_pick', scenario: 'cocktail' },
            { label: 'Chill group hang for 4-6 people', type: 'quick_pick', scenario: 'groupHang' },
            { label: 'Pre-game near the Garden', type: 'quick_pick', scenario: 'sports' },
            { label: 'Show top picks for tonight', type: 'quick_pick', scenario: 'trending' }
        ];

        this.widget?.showQuickActions(quickActions);
    }

    startReturningUserConversation(sessionInfo) {
        const preferences = this.state?.getPreferences();
        const hasCompletePrefs = this.state?.hasCompletePreferences();

        if (hasCompletePrefs) {
            const greeting = `👋 Welcome back! Planning another ${preferences.budget} ${preferences.vibe.toLowerCase()} in ${preferences.location}?`;
            this.widget?.addMessage(greeting, 'ai');

            const actions = [
                { label: 'Yes, show me recommendations', type: 'recommend_with_prefs' },
                { label: 'Change my preferences', type: 'change_preferences' },
                { label: 'Browse saved venues', type: 'saved_venues' }
            ];
            this.widget?.showQuickActions(actions);
        } else {
            this.startOnboarding(); // Fallback to onboarding
        }
    }

    // ============================================
    // MESSAGE HANDLING
    // ============================================

    handleUserMessage(message, currentPage = 'home') {
        // Save to conversation history
        this.widget?.addMessage(message, 'user');
        this.state?.addMessage({ text: message, sender: 'user', page: currentPage });

        // Extract preferences from message
        const extractedPrefs = this.state?.extractPreferencesFromMessage(message);
        if (extractedPrefs) {
            this.state?.updatePreferences(extractedPrefs);
        }

        // Determine response type
        const responseType = this.determineResponseType(message, currentPage);
        
        // Show typing indicator
        this.widget?.showTypingIndicator();

        // Generate and show response
        setTimeout(() => {
            this.widget?.hideTypingIndicator();
            this.generateResponse(responseType, message, currentPage);
        }, 800 + Math.random() * 700);
    }

    handleQuickAction(action) {
        this.widget?.hideQuickActions();

        switch (action.type) {
            case 'quick_pick':
                this.handleQuickPickScenario(action.scenario);
                break;
            case 'recommend_with_prefs':
                this.recommendWithCurrentPreferences();
                break;
            case 'change_preferences':
                this.handlePreferenceChange();
                break;
            case 'saved_venues':
                this.showSavedVenues();
                break;
            case 'preference_set':
                this.setSinglePreference(action.key, action.value);
                break;
            case 'view_venue_details':
                this.handleVenueDetails(action.venue);
                break;
        }
    }

    // ============================================
    // RESPONSE GENERATION
    // ============================================

    determineResponseType(message, currentPage) {
        const lowerMessage = message.toLowerCase();

        // Preference collection
        if (this.hasPreferenceKeywords(lowerMessage)) {
            return 'preference_collection';
        }

        // Refinement requests
        if (this.hasRefinementKeywords(lowerMessage)) {
            return 'refinement';
        }

        // Quick pick scenarios
        if (this.hasQuickPickKeywords(lowerMessage)) {
            return 'quick_pick';
        }

        // Direct venue requests
        if (this.hasVenueRequestKeywords(lowerMessage)) {
            return 'venue_request';
        }

        // Page-specific responses
        if (currentPage !== 'home') {
            return 'page_aware';
        }

        // General recommendation
        return 'general_recommendation';
    }

    hasPreferenceKeywords(message) {
        const keywords = [
            'budget', 'price', 'cheap', 'expensive', '$', '$$', '$$$',
            'vibe', 'mood', 'atmosphere', 'chill', 'party', 'romantic',
            'neighborhood', 'area', 'location', 'downtown', 'back bay',
            'group', 'people', 'alone', 'solo', 'couple', 'date'
        ];
        return keywords.some(keyword => message.includes(keyword));
    }

    hasRefinementKeywords(message) {
        const keywords = [
            'cheaper', 'expensive', 'less', 'more', 'quieter', 'louder',
            'closer', 'further', 'different', 'else', 'instead'
        ];
        return keywords.some(keyword => message.includes(keyword));
    }

    hasQuickPickKeywords(message) {
        const keywords = [
            'date night', 'romantic', 'group', 'friends', 'party', 'chill',
            'sports', 'game', 'music', 'live', 'dancing'
        ];
        return keywords.some(keyword => message.includes(keyword));
    }

    hasVenueRequestKeywords(message) {
        const keywords = [
            'show me', 'find', 'looking for', 'want', 'need', 'recommendation'
        ];
        return keywords.some(keyword => message.includes(keyword));
    }

    generateResponse(responseType, message, currentPage) {
        const preferences = this.state?.getPreferences();

        switch (responseType) {
            case 'preference_collection':
                this.handlePreferenceCollection(message, preferences);
                break;
            case 'refinement':
                this.handleRefinement(message, preferences);
                break;
            case 'quick_pick':
                this.handleQuickPickRequest(message);
                break;
            case 'venue_request':
                this.handleVenueRequest(message, preferences);
                break;
            case 'page_aware':
                this.handlePageAwareResponse(currentPage, preferences);
                break;
            default:
                this.handleGeneralRecommendation(preferences);
        }
    }

    // ============================================
    // SPECIFIC RESPONSE HANDLERS
    // ============================================

    handlePreferenceCollection(message, preferences) {
        const missing = this.state?.getMissingPreferences();

        if (missing.length === 0) {
            // We have complete preferences, make recommendations
            this.recommendWithCurrentPreferences();
            this.state?.completeOnboarding();
        } else {
            // Ask for remaining preferences
            const question = this.buildPreferenceQuestion(missing, preferences);
            this.widget?.addMessage(question, 'ai');
            
            if (missing.includes('vibe')) {
                this.showVibeOptions();
            } else if (missing.includes('price')) {
                this.showPriceOptions();
            } else if (missing.includes('location')) {
                this.showLocationOptions();
            }
        }
    }

    buildPreferenceQuestion(missing, current) {
        if (missing.includes('vibe')) {
            return `Great! What's the vibe you're going for tonight?`;
        }
        if (missing.includes('price')) {
            return `Perfect! What's your budget range?`;
        }
        if (missing.includes('location')) {
            return `Awesome! Which neighborhood are you interested in?`;
        }
        return `Let me help you find the perfect spot!`;
    }

    showVibeOptions() {
        const actions = [
            { label: '🍷 Date Night', type: 'preference_set', key: 'vibe', value: 'Date night' },
            { label: '🎉 Big Night Out', type: 'preference_set', key: 'vibe', value: 'Big night out' },
            { label: '😌 Chill', type: 'preference_set', key: 'vibe', value: 'Chill' },
            { label: '👥 Group Hang', type: 'preference_set', key: 'vibe', value: 'Group hang' },
            { label: '🎵 Live Music', type: 'preference_set', key: 'vibe', value: 'Live music' },
            { label: '📺 Sports & TVs', type: 'preference_set', key: 'vibe', value: 'Sports & TVs' }
        ];
        this.widget?.showQuickActions(actions);
    }

    showPriceOptions() {
        const actions = [
            { label: '$ Budget-friendly', type: 'preference_set', key: 'price', value: '$' },
            { label: '$$ Moderate', type: 'preference_set', key: 'price', value: '$$' },
            { label: '$$$ Upscale', type: 'preference_set', key: 'price', value: '$$$' }
        ];
        this.widget?.showQuickActions(actions);
    }

    showLocationOptions() {
        const actions = [
            { label: 'Downtown', type: 'preference_set', key: 'location', value: 'Downtown' },
            { label: 'Back Bay', type: 'preference_set', key: 'location', value: 'Back Bay' },
            { label: 'Seaport', type: 'preference_set', key: 'location', value: 'Seaport' },
            { label: 'Cambridge', type: 'preference_set', key: 'location', value: 'Cambridge' },
            { label: 'North End', type: 'preference_set', key: 'location', value: 'North End' }
        ];
        this.widget?.showQuickActions(actions);
    }

    handleRefinement(message, preferences) {
        const lowerMessage = message.toLowerCase();
        let refinement = null;

        if (lowerMessage.includes('cheaper') || lowerMessage.includes('less expensive')) {
            refinement = 'cheaper';
        } else if (lowerMessage.includes('quieter') || lowerMessage.includes('less loud')) {
            refinement = 'quieter';
        } else if (lowerMessage.includes('livelier') || lowerMessage.includes('more energy')) {
            refinement = 'livelier';
        } else if (lowerMessage.includes('closer') || lowerMessage.includes('near')) {
            refinement = 'closer';
        } else if (lowerMessage.includes('romantic')) {
            refinement = 'moreRomantic';
        } else if (lowerMessage.includes('group') || lowerMessage.includes('friends')) {
            refinement = 'betterForGroups';
        }

        if (refinement && this.currentConversation.length > 0) {
            const lastRecommendations = this.currentConversation[this.currentConversation.length - 1].venues;
            const refinedVenues = this.recommender?.refineRecommendations(lastRecommendations, refinement, preferences);

            this.widget?.addMessage(`Got it! Let me find ${refinement.replace(/([A-Z])/g, ' $1').toLowerCase()} options:`, 'ai');
            this.displayRecommendations(refinedVenues);
        } else {
            this.handleVenueRequest(message, preferences);
        }
    }

    handleQuickPickScenario(scenario) {
        const venues = this.recommender?.getQuickPicks({ scenario });
        
        const scenarioMessages = {
            dateNight: "Here are some perfect spots for a romantic evening:",
            cocktail: "These cocktail bars should hit the spot:",
            groupHang: "Great choices for your group hang:",
            sports: "Perfect spots to catch the game:",
            trending: "Here are the hottest spots tonight:"
        };

        this.widget?.addMessage(scenarioMessages[scenario] || "Here are some great options:", 'ai');
        this.displayRecommendations(venues);
    }

    handleVenueRequest(message, preferences) {
        const hasCompletePrefs = this.state?.hasCompletePreferences();
        
        if (hasCompletePrefs) {
            this.recommendWithCurrentPreferences();
        } else {
            this.widget?.addMessage("I'd love to help! To give you the best recommendations, could you tell me:\n\n• What vibe are you looking for?\n• What's your budget?\n• Which neighborhood?", 'ai');
            this.showVibeOptions();
        }
    }

    handlePageAwareResponse(currentPage, preferences) {
        const pageMessages = {
            'explore': `I see you're exploring venues! Want me to narrow these down based on your preferences?`,
            'tonights-picks': `Looking at tonight's picks? I can filter these based on your vibe and budget!`,
            'nightlife': `Checking out the nightlife scene? Let me find spots that match your style!`,
            'events': `Events page! Are you looking for something specific tonight?`
        };

        this.widget?.addMessage(pageMessages[currentPage] || "How can I help you tonight?", 'ai');
        
        if (this.state?.hasCompletePreferences()) {
            const actions = [
                { label: 'Show me recommendations', type: 'recommend_with_prefs' },
                { label: 'Browse all venues', type: 'quick_pick', scenario: 'trending' }
            ];
            this.widget?.showQuickActions(actions);
        }
    }

    handleGeneralRecommendation(preferences) {
        const hasCompletePrefs = this.state?.hasCompletePreferences();
        
        if (hasCompletePrefs) {
            this.recommendWithCurrentPreferences();
        } else {
            this.widget?.addMessage("I'm here to help you find the perfect spot! To get started, what kind of vibe are you looking for tonight?", 'ai');
            this.showVibeOptions();
        }
    }

    // ============================================
    // RECOMMENDATION DISPLAY
    // ============================================

    recommendWithCurrentPreferences() {
        const preferences = this.state?.getPreferences();
        const venues = this.recommender?.recommend(preferences, { limit: 4 });

        if (venues && venues.length > 0) {
            this.widget?.addMessage(`Here are some perfect spots for your ${preferences.vibe.toLowerCase()} in ${preferences.location}:`, 'ai');
            this.displayRecommendations(venues);
        } else {
            this.showNoResultsFallback();
        }
    }

    displayRecommendations(venues) {
        if (!venues || venues.length === 0) {
            this.showNoResultsFallback();
            return;
        }

        // Save to conversation for potential refinement
        this.currentConversation.push({ type: 'recommendation', venues });

        // Display venue cards
        this.widget?.addVenueCards(venues);

        // Show follow-up actions
        this.showRecommendationFollowups();
    }

    showNoResultsFallback() {
        this.widget?.addMessage("I don't see a perfect match for those criteria. Let me show you some popular options that might work:", 'ai');
        
        const fallbackVenues = this.recommender?.getTrendingVenues(3);
        this.displayRecommendations(fallbackVenues);
    }

    showRecommendationFollowups() {
        const actions = [
            { label: 'Show cheaper options', type: 'refinement', refinement: 'cheaper' },
            { label: 'Show quieter options', type: 'refinement', refinement: 'quieter' },
            { label: 'Show something else', type: 'quick_pick', scenario: 'trending' }
        ];
        this.widget?.showQuickActions(actions);
    }

    // ============================================
    // VENUE INTERACTIONS
    // ============================================

    handleVenueDetails(venue) {
        const details = `**${venue.name}**

${venue.description}

**Details:**
💰 ${venue.price} • 📍 ${venue.neighborhood} • 🕐 ${venue.hours}
⭐ ${venue.rating}/5 • 🏷️ ${venue.tags.join(' • ')}

**Features:**
${venue.features.map(f => `• ${f}`).join('\n')}

Want to save this venue or see more options?`;

        this.widget?.addMessage(details, 'ai');

        const actions = [
            { label: 'Save venue', type: 'save_venue', venue },
            { label: 'Show similar', type: 'similar_venues', venue },
            { label: 'More options', type: 'quick_pick', scenario: 'trending' }
        ];
        this.widget?.showQuickActions(actions);
    }

    handleVenueSave(venue, isSaved) {
        if (isSaved) {
            this.state?.saveVenue(venue);
        } else {
            this.state?.removeVenue(venue.id);
        }
    }

    showSavedVenues() {
        const savedVenues = this.state?.getSavedVenues();
        
        if (savedVenues.length === 0) {
            this.widget?.addMessage("You haven't saved any venues yet! I can show you some great options to get started.", 'ai');
            const actions = [{ label: 'Show trending spots', type: 'quick_pick', scenario: 'trending' }];
            this.widget?.showQuickActions(actions);
        } else {
            this.widget?.addMessage(`You have ${savedVenues.length} saved venue${savedVenues.length > 1 ? 's' : ''}:`, 'ai');
            this.displayRecommendations(savedVenues);
        }
    }

    handlePreferenceChange() {
        this.widget?.addMessage("What would you like to change?", 'ai');
        
        const actions = [
            { label: 'Change vibe', type: 'preference_change', key: 'vibe' },
            { label: 'Change budget', type: 'preference_change', key: 'price' },
            { label: 'Change location', type: 'preference_change', key: 'location' },
            { label: 'Change group size', type: 'preference_change', key: 'groupSize' }
        ];
        this.widget?.showQuickActions(actions);
    }

    setSinglePreference(key, value) {
        this.state?.setPreference(key, value);
        this.widget?.addMessage(`Got it! ${key.charAt(0).toUpperCase() + key.slice(1)} set to: ${value}`, 'ai');
        
        // Check if we have complete preferences now
        if (this.state?.hasCompletePreferences()) {
            this.widget?.addMessage("Perfect! I have everything I need. Let me show you some recommendations:", 'ai');
            this.recommendWithCurrentPreferences();
            this.state?.completeOnboarding();
        } else {
            const missing = this.state?.getMissingPreferences();
            this.handlePreferenceCollection('', this.state?.getPreferences());
        }
    }

    handlePreferencesUpdate(preferences) {
        // Auto-recommend when preferences change significantly
        if (this.state?.hasCompletePreferences()) {
            const hasCompletePrefs = this.state?.hasCompletePreferences();
            if (hasCompletePrefs) {
                this.recommendWithCurrentPreferences();
            }
        }
    }
}

// Initialize logic engine
document.addEventListener('DOMContentLoaded', () => {
    window.sceneLinkConciergeLogic = new SceneLinkConciergeLogic();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SceneLinkConciergeLogic;
}