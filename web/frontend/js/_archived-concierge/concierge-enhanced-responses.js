// Enhanced SceneLink Concierge - Improved Response System
class EnhancedConciergeResponses {
    constructor() {
        this.context = {
            lastRecommendations: [],
            userPreferences: {},
            conversationHistory: [],
            currentPage: this.detectCurrentPage()
        };
        
        this.responseTemplates = {
            greetings: {
                firstTime: [
                    "👋 Welcome to SceneLink! I'm your personal concierge. What kind of experience are you looking for tonight?",
                    "🌟 Hey there! I can help you find the perfect spot. What's your vibe for tonight?",
                    "🍸 Welcome! Let me help you discover something amazing. What are you in the mood for?"
                ],
                returning: [
                    "👋 Welcome back! Ready to find another great spot?",
                    "🌟 Good to see you again! What adventure awaits tonight?",
                    "🍸 Back for more? I've got some fresh recommendations for you!"
                ],
                contextual: {
                    'tonight-picks': "🌟 Perfect! You're on the Tonight's Picks page. Let me help you find something amazing for right now!",
                    'explore': "🗺️ Great! You're exploring Boston. What neighborhood or vibe catches your interest?",
                    'nightlife': "🌃 Looking for nightlife? I know all the best spots for dancing, drinks, and late-night fun!",
                    'events': "🎭 Events page! Are you looking for something happening tonight or planning ahead?",
                    'home': "🏠 Welcome to SceneLink! Let's find your perfect night out."
                }
            },
            
            preferenceExtraction: {
                location: [
                    "Got it! I'll focus on {location}. What kind of vibe are you looking for?",
                    "Perfect! {location} has some amazing spots. What's your ideal atmosphere?",
                    "Great choice! I'll search in {location}. What type of experience appeals to you?"
                ],
                vibe: [
                    "I love that vibe! I know some perfect {vibe} spots. What's your budget range?",
                    "{vibe} it is! I have some excellent recommendations. How much are you looking to spend?",
                    "Perfect! {vibe} atmosphere coming up. Any dietary restrictions or preferences?"
                ],
                budget: [
                    "Got it! {budget} range. Are you looking for something casual or more upscale?",
                    "Perfect! I'll find options in your {budget} range. How many people in your group?",
                    "{budget} budget noted. Is this for a special occasion or casual hangout?"
                ],
                groupSize: [
                    "Great! A group of {groupSize}. Should I look for places good for groups?",
                    "Perfect for {groupSize} people! Do you need reservations or walk-in friendly?",
                    "{groupSize} people it is! Any preferences on noise level or crowd size?"
                ]
            },
            
            recommendations: {
                presenting: [
                    "Based on what you've told me, here are my top picks for you:",
                    "I found some perfect matches for what you're looking for:",
                    "Here are the spots that I think you'll absolutely love:",
                    "Perfect! I've curated some recommendations just for you:"
                ],
                followUp: [
                    "Do any of these catch your eye? I can tell you more about any of them!",
                    "What do you think? Want to know more about any specific place?",
                    "See anything you like? I can provide more details or find similar options!",
                    "Which one sparks your interest? I can dive deeper or suggest alternatives!"
                ],
                noResults: [
                    "Hmm, let me broaden the search a bit. What's most important to you?",
                    "Those criteria are a bit specific! Would you be open to adjusting slightly?",
                    "Let me think outside the box. What's your must-have versus nice-to-have?",
                    "I want to find you something perfect! What could we be flexible on?"
                ]
            },
            
            refinements: {
                cheaper: [
                    "Great call! Here are some more budget-friendly options that still have great vibes:",
                    "Smart choice! These spots offer amazing value without skimping on atmosphere:",
                    "Perfect! Here are some hidden gems that won't break the bank:"
                ],
                quieter: [
                    "I totally get it! Here are some more laid-back spots where you can actually chat:",
                    "Good call! These places have a more relaxed atmosphere for better conversations:",
                    "Perfect! Here are some chill spots where the vibe is more mellow:"
                ],
                livelier: [
                    "Let's turn up the energy! These spots are buzzing with great atmosphere:",
                    "You want the full experience! Here are some high-energy places:",
                    "Perfect! These spots have that electric energy you're looking for:"
                ],
                closer: [
                    "Let me find you something more convenient! Here are spots that are closer:",
                    "Good thinking! Here are some nearby options that are walkable:",
                    "Perfect! These spots are much closer to you:"
                ]
            },
            
            interactions: {
                saveVenue: [
                    "Perfect! {venueName} has been saved to your list. You can find it in 'My Lists' anytime!",
                    "Great choice! {venueName} is now saved. Want me to find you more options?",
                    "Awesome! {venueName} added to your collection. What else can I help you find?"
                ],
                viewDetails: [
                    "Great choice! {venueName} is fantastic for {occasion}. Let me get you the full details...",
                    "Excellent pick! {venueName} has such a great {vibe}. Here's everything you need to know...",
                    "Perfect! {venueName} is one of my favorites. Let me show you why..."
                ],
                booking: [
                    "I'll help you get a table at {venueName}! Do you have a preferred time?",
                    "Great! {venueName} gets busy. What time works best for your reservation?",
                    "Perfect choice! When would you like to visit {venueName}?"
                ]
            }
        };
    }

    detectCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('tonight-picks')) return 'tonight-picks';
        if (path.includes('explore')) return 'explore';
        if (path.includes('nightlife')) return 'nightlife';
        if (path.includes('events')) return 'events';
        if (path.includes('social-feed')) return 'social-feed';
        return 'home';
    }

    generateGreeting(isFirstTime, preferences) {
        const templates = this.responseTemplates.greetings;
        
        // Check for contextual greeting
        if (templates.contextual[this.context.currentPage]) {
            const contextualGreeting = templates.contextual[this.context.currentPage];
            if (isFirstTime) {
                return this.getRandomTemplate(templates.firstTime)[0] + " " + contextualGreeting;
            } else {
                return this.getRandomTemplate(templates.returning)[0] + " " + contextualGreeting;
            }
        }
        
        // Standard greeting
        const greetingArray = isFirstTime ? templates.firstTime : templates.returning;
        return this.getRandomTemplate(greetingArray)[0];
    }

    extractPreferences(message) {
        const preferences = {};
        const extracted = [];
        
        // Location extraction
        const locations = ['downtown', 'back bay', 'cambridge', 'seaport', 'north end', 'south end', 'fenway', 'brookline'];
        const locationMatch = locations.find(loc => message.toLowerCase().includes(loc));
        if (locationMatch) {
            preferences.location = locationMatch;
            extracted.push({ type: 'location', value: locationMatch });
        }
        
        // Vibe extraction
        const vibes = {
            'energetic': ['energetic', 'lively', 'upbeat', 'party', 'dancing', 'music'],
            'chill': ['chill', 'relaxed', 'laid back', 'quiet', 'calm', 'cozy'],
            'upscale': ['upscale', 'fancy', 'elegant', 'classy', 'nice', 'dressy'],
            'casual': ['casual', 'relaxed', 'comfortable', 'laid back', 'informal'],
            'romantic': ['romantic', 'date', 'intimate', 'cozy', 'romance']
        };
        
        for (const [vibe, keywords] of Object.entries(vibes)) {
            if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
                preferences.vibe = vibe;
                extracted.push({ type: 'vibe', value: vibe });
                break;
            }
        }
        
        // Budget extraction
        const budgetKeywords = {
            'cheap': ['cheap', 'budget', 'affordable', 'inexpensive', 'under $20'],
            'moderate': ['moderate', 'reasonable', 'mid-range', 'around $30', '$25-35'],
            'expensive': ['expensive', 'upscale', 'fancy', 'pricey', 'over $50']
        };
        
        for (const [budget, keywords] of Object.entries(budgetKeywords)) {
            if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
                preferences.budget = budget;
                extracted.push({ type: 'budget', value: budget });
                break;
            }
        }
        
        // Group size extraction
        const groupMatch = message.match(/(\d+|a|two|three|four|five|six|seven|eight|nine|ten)\s*(people|person|friends|us)/i);
        if (groupMatch) {
            const numberMap = { 'a': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10 };
            const size = numberMap[groupMatch[1].toLowerCase()] || parseInt(groupMatch[1]);
            if (size && size > 0) {
                preferences.groupSize = size;
                extracted.push({ type: 'groupSize', value: size });
            }
        }
        
        // Occasion extraction
        const occasions = ['date', 'birthday', 'anniversary', 'celebration', 'after work', 'weekend', 'weeknight'];
        const occasionMatch = occasions.find(occ => message.toLowerCase().includes(occ));
        if (occasionMatch) {
            preferences.occasion = occasionMatch;
            extracted.push({ type: 'occasion', value: occasionMatch });
        }
        
        return { preferences, extracted };
    }

    generatePreferenceResponse(extracted, preferences) {
        for (const extraction of extracted) {
            const templates = this.responseTemplates.preferenceExtraction[extraction.type];
            if (templates) {
                const template = this.getRandomTemplate(templates)[0];
                return template.replace(`{${extraction.type}}`, extraction.value);
            }
        }
        return null;
    }

    generateRecommendationResponse(venues) {
        const templates = this.responseTemplates.recommendations;
        const presentingTemplate = this.getRandomTemplate(templates.presenting)[0];
        const followUpTemplate = this.getRandomTemplate(templates.followUp)[0];
        
        this.context.lastRecommendations = venues;
        
        return {
            message: presentingTemplate,
            venues: venues,
            followUp: followUpTemplate
        };
    }

    generateRefinementResponse(refinementType, venues) {
        const templates = this.responseTemplates.refinements[refinementType];
        if (templates) {
            const template = this.getRandomTemplate(templates)[0];
            return {
                message: template,
                venues: venues,
                refined: true
            };
        }
        return null;
    }

    generateInteractionResponse(interactionType, venueName, additionalData = {}) {
        const templates = this.responseTemplates.interactions[interactionType];
        if (templates) {
            const template = this.getRandomTemplate(templates)[0];
            let response = template.replace('{venueName}', venueName);
            
            // Replace additional placeholders
            for (const [key, value] of Object.entries(additionalData)) {
                response = response.replace(`{${key}}`, value);
            }
            
            return response;
        }
        return null;
    }

    handleRefinement(message, currentRecommendations) {
        const messageLower = message.toLowerCase();
        
        // Detect refinement type
        if (messageLower.includes('cheaper') || messageLower.includes('less expensive') || messageLower.includes('budget')) {
            return 'cheaper';
        } else if (messageLower.includes('quieter') || messageLower.includes('less loud') || messageLower.includes('calmer')) {
            return 'quieter';
        } else if (messageLower.includes('livelier') || messageLower.includes('more energy') || messageLower.includes('busier')) {
            return 'livelier';
        } else if (messageLower.includes('closer') || messageLower.includes('nearer') || messageLower.includes('walkable')) {
            return 'closer';
        }
        
        return null;
    }

    isVenueRelatedMessage(message) {
        const venueKeywords = [
            'tell me more', 'more about', 'details', 'information',
            'book', 'reservation', 'table', 'visit', 'go to'
        ];
        
        return venueKeywords.some(keyword => message.toLowerCase().includes(keyword));
    }

    detectVenueInMessage(message, venues) {
        const messageLower = message.toLowerCase();
        
        for (const venue of venues) {
            if (messageLower.includes(venue.name.toLowerCase()) || 
                messageLower.includes(venue.name.toLowerCase().split(' ')[0])) {
                return venue;
            }
        }
        
        return null;
    }

    getRandomTemplate(templates) {
        return templates.sort(() => Math.random() - 0.5);
    }

    updateContext(message, response, venues = []) {
        this.context.conversationHistory.push({
            timestamp: new Date(),
            userMessage: message,
            aiResponse: response,
            venues: venues
        });
        
        // Keep only last 10 conversations
        if (this.context.conversationHistory.length > 10) {
            this.context.conversationHistory = this.context.conversationHistory.slice(-10);
        }
    }

    getContextualInsights() {
        const insights = {
            currentPage: this.context.currentPage,
            lastRecommendations: this.context.lastRecommendations,
            conversationLength: this.context.conversationHistory.length
        };
        
        // Add preference patterns
        if (this.context.conversationHistory.length > 0) {
            const userPreferences = this.extractUserPatterns();
            insights.userPatterns = userPreferences;
        }
        
        return insights;
    }

    extractUserPatterns() {
        const patterns = {
            preferredVibes: [],
            preferredBudgets: [],
            preferredLocations: [],
            typicalGroupSize: null
        };
        
        // Analyze conversation history for patterns
        for (const conversation of this.context.conversationHistory) {
            if (conversation.extracted) {
                for (const extraction of conversation.extracted) {
                    switch (extraction.type) {
                        case 'vibe':
                            if (!patterns.preferredVibes.includes(extraction.value)) {
                                patterns.preferredVibes.push(extraction.value);
                            }
                            break;
                        case 'budget':
                            if (!patterns.preferredBudgets.includes(extraction.value)) {
                                patterns.preferredBudgets.push(extraction.value);
                            }
                            break;
                        case 'location':
                            if (!patterns.preferredLocations.includes(extraction.value)) {
                                patterns.preferredLocations.push(extraction.value);
                            }
                            break;
                        case 'groupSize':
                            patterns.typicalGroupSize = extraction.value;
                            break;
                    }
                }
            }
        }
        
        return patterns;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedConciergeResponses;
} else {
    window.EnhancedConciergeResponses = EnhancedConciergeResponses;
}