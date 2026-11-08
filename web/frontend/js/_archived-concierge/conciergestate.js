/**
 * SceneLink Concierge State Management
 * Handles preferences, localStorage, and session state
 */

class SceneLinkConciergeState {
    constructor() {
        this.storageKey = 'scenelink-concierge-data';
        this.loadState();
        this.initEventListeners();
    }

    // Default preferences structure
    getDefaultPreferences() {
        return {
            location: '',
            vibe: '',
            budget: '',
            groupSize: '',
            occasion: '',
            dietaryRestrictions: [],
            preferredMusic: [],
            avoidedTags: []
        };
    }

    // ============================================
    // STATE LOADING AND SAVING
    // ============================================

    loadState() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            const data = saved ? JSON.parse(saved) : {};
            
            this.state = {
                preferences: data.preferences || this.getDefaultPreferences(),
                conversationHistory: data.conversationHistory || [],
                savedVenues: data.savedVenues || [],
                sessionCount: data.sessionCount || 0,
                lastVisit: data.lastVisit || null,
                onboardingCompleted: data.onboardingCompleted || false
            };

            // Increment session count
            this.state.sessionCount++;
            this.state.lastVisit = new Date().toISOString();
            this.saveState();

        } catch (error) {
            console.warn('Error loading concierge state:', error);
            this.state = {
                preferences: this.getDefaultPreferences(),
                conversationHistory: [],
                savedVenues: [],
                sessionCount: 1,
                lastVisit: new Date().toISOString(),
                onboardingCompleted: false
            };
        }
    }

    saveState() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (error) {
            console.warn('Error saving concierge state:', error);
        }
    }

    // ============================================
    // PREFERENCE MANAGEMENT
    // ============================================

    getPreferences() {
        return { ...this.state.preferences };
    }

    updatePreferences(updates) {
        this.state.preferences = { ...this.state.preferences, ...updates };
        this.saveState();
        
        // Emit preference change event
        this.emitEvent('preferencesChanged', this.state.preferences);
    }

    setPreference(key, value) {
        this.state.preferences[key] = value;
        this.saveState();
        this.emitEvent('preferencesChanged', this.state.preferences);
    }

    getPreference(key) {
        return this.state.preferences[key];
    }

    hasCompletePreferences() {
        const required = ['location', 'vibe', 'budget'];
        return required.every(key => this.state.preferences[key]);
    }

    getMissingPreferences() {
        const required = ['location', 'vibe', 'budget'];
        return required.filter(key => !this.state.preferences[key]);
    }

    // ============================================
    // CONVERSATION HISTORY
    // ============================================

    addMessage(message) {
        this.state.conversationHistory.push({
            ...message,
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString()
        });

        // Keep only last 50 messages
        if (this.state.conversationHistory.length > 50) {
            this.state.conversationHistory = this.state.conversationHistory.slice(-50);
        }

        this.saveState();
    }

    getConversationHistory(limit = 10) {
        return this.state.conversationHistory.slice(-limit);
    }

    clearConversationHistory() {
        this.state.conversationHistory = [];
        this.saveState();
    }

    // ============================================
    // SAVED VENUES
    // ============================================

    saveVenue(venue) {
        const exists = this.state.savedVenues.find(v => v.id === venue.id);
        
        if (!exists) {
            this.state.savedVenues.push({
                ...venue,
                savedAt: new Date().toISOString()
            });
            this.saveState();
            this.emitEvent('venueSaved', venue);
            return true;
        }
        
        return false;
    }

    removeVenue(venueId) {
        const index = this.state.savedVenues.findIndex(v => v.id === venueId);
        
        if (index > -1) {
            const removed = this.state.savedVenues.splice(index, 1)[0];
            this.saveState();
            this.emitEvent('venueRemoved', removed);
            return true;
        }
        
        return false;
    }

    isVenueSaved(venueId) {
        return this.state.savedVenues.some(v => v.id === venueId);
    }

    getSavedVenues() {
        return [...this.state.savedVenues];
    }

    // ============================================
    // ONBOARDING STATE
    // ============================================

    completeOnboarding() {
        this.state.onboardingCompleted = true;
        this.saveState();
        this.emitEvent('onboardingCompleted');
    }

    isOnboardingCompleted() {
        return this.state.onboardingCompleted;
    }

    // ============================================
    // SESSION INFO
    // ============================================

    getSessionInfo() {
        return {
            sessionCount: this.state.sessionCount,
            lastVisit: this.state.lastVisit,
            isReturning: this.state.sessionCount > 1,
            daysSinceLastVisit: this.state.lastVisit ? 
                Math.floor((new Date() - new Date(this.state.lastVisit)) / (1000 * 60 * 60 * 24)) : null
        };
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    resetState() {
        this.state = {
            preferences: this.getDefaultPreferences(),
            conversationHistory: [],
            savedVenues: [],
            sessionCount: 1,
            lastVisit: new Date().toISOString(),
            onboardingCompleted: false
        };
        this.saveState();
        this.emitEvent('stateReset');
    }

    exportState() {
        return JSON.stringify(this.state, null, 2);
    }

    importState(stateString) {
        try {
            const importedState = JSON.parse(stateString);
            this.state = { ...this.getDefaultState(), ...importedState };
            this.saveState();
            this.emitEvent('stateImported');
            return true;
        } catch (error) {
            console.error('Error importing state:', error);
            return false;
        }
    }

    // ============================================
    // EVENT SYSTEM
    // ============================================

    initEventListeners() {
        this.eventListeners = {};
    }

    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    off(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
        }
    }

    emitEvent(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => callback(data));
        }

        // Also dispatch as DOM event for broader compatibility
        const domEvent = new CustomEvent(`concierge:${event}`, { detail: data });
        document.dispatchEvent(domEvent);
    }

    // ============================================
    // SMART PREFERENCE EXTRACTION
    // ============================================

    extractPreferencesFromMessage(message) {
        const lowerMessage = message.toLowerCase();
        const updates = {};

        // Budget detection
        const budgetPatterns = {
            '$': [/\$/, /cheap/i, /affordable/i, /budget/i],
            '$$': [/\$\$/, /moderate/i, /reasonable/i],
            '$$$': [/\$\$\$/, /expensive/i, /upscale/i, /luxury/i, /fancy/i]
        };

        for (const [budget, patterns] of Object.entries(budgetPatterns)) {
            if (patterns.some(pattern => pattern.test(lowerMessage))) {
                updates.budget = budget;
                break;
            }
        }

        // Group size detection
        const groupPatterns = {
            '1-2': [/alone/i, /solo/i, /myself/i, /just me/i, /date/i, /one.*person/i],
            '3-4': [/3|four|4|three/i, /couple.*friends/i, /small.*group/i],
            '5-8': [/5|six|6|seven|7|eight|8/i, /group.*of/i, /bigger.*group/i],
            '9+': [/9|ten|10|large/i, /big.*group/i, /party/i]
        };

        for (const [size, patterns] of Object.entries(groupPatterns)) {
            if (patterns.some(pattern => pattern.test(lowerMessage))) {
                updates.groupSize = size;
                break;
            }
        }

        // Vibe detection
        const vibePatterns = {
            'Chill': [/chill/i, /relaxed/i, /casual/i, /laid back/i, /quiet/i],
            'Big night out': [/party/i, /dancing/i, /clubbing/i, /wild/i, /crazy/i],
            'Date night': [/date/i, /romantic/i, /intimate/i, /special occasion/i],
            'Group hang': [/group/i, /friends/i, /social/i, /hanging/i],
            'Live music': [/music/i, /band/i, /live/i, /concert/i, /dj/i],
            'Sports & TVs': [/sports/i, /game/i, /tv/i, /watch/i]
        };

        for (const [vibe, patterns] of Object.entries(vibePatterns)) {
            if (patterns.some(pattern => pattern.test(lowerMessage))) {
                updates.vibe = vibe;
                break;
            }
        }

        // Neighborhood detection (Boston-focused)
        const neighborhoodPatterns = [
            /downtown/i, /back bay/i, /cambridge/i, /seaport/i, 
            /north end/i, /south boston/i, /beacon hill/i, /fenway/i,
            /allston/i, /brookline/i, /jamaica plain/i
        ];

        for (const pattern of neighborhoodPatterns) {
            const match = lowerMessage.match(pattern);
            if (match) {
                updates.location = match[0];
                break;
            }
        }

        return Object.keys(updates).length > 0 ? updates : null;
    }

    // ============================================
    // PREFERENCE VALIDATION
    // ============================================

    validatePreferences(preferences) {
        const validBudgets = ['$', '$$', '$$$'];
        const validVibes = ['Chill', 'Big night out', 'Date night', 'Group hang', 'Live music', 'Sports & TVs'];
        const validGroupSizes = ['1-2', '3-4', '5-8', '9+'];

        const validation = {
            isValid: true,
            errors: []
        };

        if (preferences.budget && !validBudgets.includes(preferences.budget)) {
            validation.isValid = false;
            validation.errors.push(`Invalid budget: ${preferences.budget}`);
        }

        if (preferences.vibe && !validVibes.includes(preferences.vibe)) {
            validation.isValid = false;
            validation.errors.push(`Invalid vibe: ${preferences.vibe}`);
        }

        if (preferences.groupSize && !validGroupSizes.includes(preferences.groupSize)) {
            validation.isValid = false;
            validation.errors.push(`Invalid group size: ${preferences.groupSize}`);
        }

        return validation;
    }
}

// Initialize state manager
document.addEventListener('DOMContentLoaded', () => {
    window.sceneLinkConciergeState = new SceneLinkConciergeState();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SceneLinkConciergeState;
}