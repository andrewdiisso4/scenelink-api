// Enhanced SceneLink Concierge Integration
class EnhancedConciergeIntegration {
    constructor() {
        this.responseSystem = new EnhancedConciergeResponses();
        this.venueCards = new EnhancedVenueCards();
        this.conversationState = {
            stage: 'greeting',
            userPreferences: {},
            currentRecommendations: [],
            lastUserMessage: null
        };
        
        this.init();
    }

    init() {
        this.createEnhancedConciergeWidget();
        this.attachEventListeners();
        this.loadUserPreferences();
    }

    createEnhancedConciergeWidget() {
        // Enhanced floating button with better design
        const floatingButton = document.createElement('div');
        floatingButton.id = 'enhanced-concierge-button';
        floatingButton.innerHTML = `
            <div class="concierge-button-content">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    <circle cx="8" cy="10" r="1" fill="#0a0a0a"/>
                    <circle cx="12" cy="10" r="1" fill="#0a0a0a"/>
                    <circle cx="16" cy="10" r="1" fill="#0a0a0a"/>
                </svg>
                <span class="concierge-tooltip">Ask SceneLink Concierge</span>
            </div>
            <div class="pulse-ring"></div>
        `;

        // Enhanced chat panel
        const chatPanel = document.createElement('div');
        chatPanel.id = 'enhanced-concierge-panel';
        chatPanel.innerHTML = `
            <div class="concierge-header">
                <div class="concierge-branding">
                    <img src="images/logo-transparent.png" alt="SceneLink" class="concierge-logo">
                    <div class="concierge-title-section">
                        <h3>SceneLink Concierge</h3>
                        <p>Your personal nightlife expert</p>
                    </div>
                </div>
                <button class="concierge-close" onclick="enhancedConcierge.hidePanel()">×</button>
            </div>
            
            <div class="concierge-messages" id="concierge-messages">
                <!-- Messages will be added here -->
            </div>
            
            <div class="concierge-input-section">
                <div class="quick-actions" id="quick-actions">
                    <button class="quick-action-chip" onclick="enhancedConcierge.quickAction('date-night')">
                        💕 Date night spot
                    </button>
                    <button class="quick-action-chip" onclick="enhancedConcierge.quickAction('cocktail-bars')">
                        🍸 Cocktail bars
                    </button>
                    <button class="quick-action-chip" onclick="enhancedConcierge.quickAction('group-hang')">
                        🎉 Group hang
                    </button>
                    <button class="quick-action-chip" onclick="enhancedConcierge.quickAction('tonight')">
                        🌟 Tonight's picks
                    </button>
                </div>
                
                <div class="input-container">
                    <input type="text" id="concierge-input" placeholder="What are you looking for tonight?" />
                    <button id="concierge-send" onclick="enhancedConcierge.sendMessage()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Add enhanced styles
        this.addEnhancedStyles();
        
        // Add to page
        document.body.appendChild(floatingButton);
        document.body.appendChild(chatPanel);
        
        // Show initial greeting
        setTimeout(() => {
            this.showGreeting();
        }, 1000);
    }

    addEnhancedStyles() {
        if (document.getElementById('enhanced-concierge-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'enhanced-concierge-styles';
        styles.innerHTML = `
            /* Enhanced Floating Button */
            #enhanced-concierge-button {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 64px;
                height: 64px;
                background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 100%);
                border-radius: 50%;
                cursor: pointer;
                z-index: 9999;
                box-shadow: 0 8px 32px rgba(212, 175, 55, 0.3);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #enhanced-concierge-button:hover {
                transform: scale(1.1);
                box-shadow: 0 12px 40px rgba(212, 175, 55, 0.4);
            }

            #enhanced-concierge-button:hover .concierge-tooltip {
                opacity: 1;
                transform: translateX(-10px);
            }

            .concierge-tooltip {
                position: absolute;
                right: 80px;
                background: #2c3e50;
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 14px;
                white-space: nowrap;
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
            }

            .concierge-tooltip::after {
                content: '';
                position: absolute;
                right: -6px;
                top: 50%;
                transform: translateY(-50%);
                width: 0;
                height: 0;
                border-left: 6px solid #2c3e50;
                border-top: 6px solid transparent;
                border-bottom: 6px solid transparent;
            }

            .pulse-ring {
                position: absolute;
                top: -4px;
                left: -4px;
                width: 72px;
                height: 72px;
                border: 2px solid #d4af37;
                border-radius: 50%;
                animation: pulse 2s infinite;
                opacity: 0;
            }

            @keyframes pulse {
                0% {
                    transform: scale(1);
                    opacity: 0.6;
                }
                50% {
                    transform: scale(1.2);
                    opacity: 0;
                }
                100% {
                    transform: scale(1);
                    opacity: 0;
                }
            }

            /* Enhanced Chat Panel */
            #enhanced-concierge-panel {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 420px;
                max-width: 90vw;
                height: 600px;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                transform: translateY(120%);
                opacity: 0;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            #enhanced-concierge-panel.active {
                transform: translateY(0);
                opacity: 1;
            }

            .concierge-header {
                background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 100%);
                color: white;
                padding: 20px;
                border-radius: 20px 20px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .concierge-branding {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .concierge-logo {
                width: 40px;
                height: 40px;
                border-radius: 8px;
                background: white;
                padding: 4px;
            }

            .concierge-title-section h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
            }

            .concierge-title-section p {
                margin: 0;
                font-size: 14px;
                opacity: 0.9;
            }

            .concierge-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.3s ease;
            }

            .concierge-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .concierge-messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .message {
                max-width: 80%;
                padding: 12px 16px;
                border-radius: 18px;
                font-size: 14px;
                line-height: 1.4;
                animation: messageSlide 0.3s ease-out;
            }

            @keyframes messageSlide {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .message.user {
                align-self: flex-end;
                background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 100%);
                color: white;
            }

            .message.ai {
                align-self: flex-start;
                background: #f8f9fa;
                color: #2c3e50;
            }

            .typing-indicator {
                display: flex;
                gap: 4px;
                padding: 12px 16px;
                background: #f8f9fa;
                border-radius: 18px;
                width: fit-content;
            }

            .typing-dot {
                width: 8px;
                height: 8px;
                background: #d4af37;
                border-radius: 50%;
                animation: typing 1.4s infinite;
            }

            .typing-dot:nth-child(2) {
                animation-delay: 0.2s;
            }

            .typing-dot:nth-child(3) {
                animation-delay: 0.4s;
            }

            @keyframes typing {
                0%, 60%, 100% {
                    transform: translateY(0);
                }
                30% {
                    transform: translateY(-10px);
                }
            }

            .concierge-input-section {
                padding: 20px;
                border-top: 1px solid #e9ecef;
            }

            .quick-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 16px;
            }

            .quick-action-chip {
                padding: 8px 16px;
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 20px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .quick-action-chip:hover {
                background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 100%);
                border-color: #d4af37;
                color: white;
                transform: translateY(-2px);
            }

            .input-container {
                display: flex;
                gap: 8px;
            }

            #concierge-input {
                flex: 1;
                padding: 12px 16px;
                border: 1px solid #dee2e6;
                border-radius: 25px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.3s ease;
            }

            #concierge-input:focus {
                border-color: #d4af37;
            }

            #concierge-send {
                width: 44px;
                height: 44px;
                background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 100%);
                border: none;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.3s ease;
            }

            #concierge-send:hover {
                transform: scale(1.1);
            }

            /* Mobile Responsive */
            @media (max-width: 480px) {
                #enhanced-concierge-panel {
                    width: 100vw;
                    height: 100vh;
                    bottom: 0;
                    right: 0;
                    border-radius: 0;
                }

                .concierge-header {
                    border-radius: 0;
                }

                .quick-actions {
                    justify-content: center;
                }
            }
        `;
        
        document.head.appendChild(styles);
    }

    attachEventListeners() {
        // Floating button click
        document.getElementById('enhanced-concierge-button').addEventListener('click', () => {
            this.showPanel();
        });

        // Input enter key
        document.getElementById('concierge-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hidePanel();
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('enhanced-concierge-panel');
            const button = document.getElementById('enhanced-concierge-button');
            
            if (panel.classList.contains('active') && 
                !panel.contains(e.target) && 
                !button.contains(e.target)) {
                this.hidePanel();
            }
        });
    }

    showPanel() {
        document.getElementById('enhanced-concierge-panel').classList.add('active');
        document.getElementById('concierge-input').focus();
        
        // Hide floating button
        setTimeout(() => {
            document.getElementById('enhanced-concierge-button').style.display = 'none';
        }, 300);
    }

    hidePanel() {
        document.getElementById('enhanced-concierge-panel').classList.remove('active');
        
        // Show floating button
        setTimeout(() => {
            document.getElementById('enhanced-concierge-button').style.display = 'flex';
        }, 300);
    }

    loadUserPreferences() {
        const saved = localStorage.getItem('conciergePreferences');
        if (saved) {
            this.conversationState.userPreferences = JSON.parse(saved);
        }
    }

    saveUserPreferences() {
        localStorage.setItem('conciergePreferences', JSON.stringify(this.conversationState.userPreferences));
    }

    showGreeting() {
        const isFirstTime = !localStorage.getItem('conciergeVisited');
        const greeting = this.responseSystem.generateGreeting(isFirstTime, this.conversationState.userPreferences);
        
        this.addMessage(greeting, 'ai');
        
        if (isFirstTime) {
            localStorage.setItem('conciergeVisited', 'true');
        }
    }

    quickAction(action) {
        const actions = {
            'date-night': "I'm looking for a romantic spot for a date night. Something intimate with good ambiance.",
            'cocktail-bars': "Show me the best cocktail bars in Boston. I want craft cocktails and a sophisticated atmosphere.",
            'group-hang': "I need a good spot for a group hangout. We're 4-6 people looking for a fun, casual atmosphere.",
            'tonight': "What are the best places to go tonight? Show me what's happening right now."
        };

        const message = actions[action];
        document.getElementById('concierge-input').value = message;
        this.sendMessage();
    }

    sendMessage() {
        const input = document.getElementById('concierge-input');
        const message = input.value.trim();
        
        if (!message) return;

        // Add user message
        this.addMessage(message, 'user');
        this.conversationState.lastUserMessage = message;
        input.value = '';

        // Show typing indicator
        this.showTypingIndicator();

        // Process message
        setTimeout(() => {
            this.processMessage(message);
        }, 1000);
    }

    showTypingIndicator() {
        const typingHTML = `
            <div class="typing-indicator" id="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        
        const messagesContainer = document.getElementById('concierge-messages');
        messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    processMessage(message) {
        this.hideTypingIndicator();

        // Extract preferences
        const { preferences, extracted } = this.responseSystem.extractPreferences(message);
        
        // Update user preferences
        Object.assign(this.conversationState.userPreferences, preferences);
        this.saveUserPreferences();

        // Check if this is a refinement
        if (this.conversationState.currentRecommendations.length > 0) {
            const refinementType = this.responseSystem.handleRefinement(message, this.conversationState.currentRecommendations);
            
            if (refinementType) {
                this.handleRefinement(refinementType, message);
                return;
            }

            // Check if asking about specific venue
            const venue = this.responseSystem.detectVenueInMessage(message, this.conversationState.currentRecommendations);
            if (venue) {
                this.handleVenueInquiry(venue, message);
                return;
            }
        }

        // Generate new recommendations
        this.generateRecommendations(preferences, extracted);
    }

    generateRecommendations(preferences, extracted) {
        // Get matching venues
        const matchingVenues = this.getMatchingVenues(preferences);
        
        if (matchingVenues.length === 0) {
            const noResultsMessage = this.responseSystem.responseTemplates.recommendations.noResults[0];
            this.addMessage(noResultsMessage, 'ai');
            return;
        }

        // Generate response
        const response = this.responseSystem.generateRecommendationResponse(matchingVenues);
        this.conversationState.currentRecommendations = matchingVenues;

        // Add message
        this.addMessage(response.message, 'ai');

        // Render venue cards
        this.venueCards.renderVenues(matchingVenues);

        // Add follow-up message
        setTimeout(() => {
            this.addMessage(response.followUp, 'ai');
        }, 500);
    }

    getMatchingVenues(preferences) {
        if (!window.mockVenues) return [];

        let venues = [...window.mockVenues];

        // Apply filters
        if (preferences.location) {
            venues = venues.filter(v => 
                v.neighborhood.toLowerCase().includes(preferences.location.toLowerCase())
            );
        }

        if (preferences.vibe) {
            venues = venues.filter(v => 
                v.tags.some(tag => tag.toLowerCase().includes(preferences.vibe.toLowerCase())) ||
                v.description.toLowerCase().includes(preferences.vibe.toLowerCase())
            );
        }

        if (preferences.budget) {
            const budgetMap = {
                'cheap': ['$', '$$'],
                'moderate': ['$$', '$$$'],
                'expensive': ['$$$', '$$$$']
            };
            
            const allowedRanges = budgetMap[preferences.budget] || ['$$', '$$$'];
            venues = venues.filter(v => allowedRanges.some(range => v.priceRange.includes(range)));
        }

        // Sort by rating and limit
        venues.sort((a, b) => b.rating - a.rating);
        return venues.slice(0, 4);
    }

    handleRefinement(refinementType, message) {
        let refinedVenues = [...this.conversationState.currentRecommendations];

        switch (refinementType) {
            case 'cheaper':
                refinedVenues = refinedVenues.filter(v => v.priceRange === '$' || v.priceRange === '$$');
                break;
            case 'quieter':
                refinedVenues = refinedVenues.filter(v => 
                    v.tags.includes('Chill') || v.tags.includes('Cozy') || v.tags.includes('Lounge')
                );
                break;
            case 'livelier':
                refinedVenues = refinedVenues.filter(v => 
                    v.tags.includes('Energetic') || v.tags.includes('Music') || v.tags.includes('Nightclub')
                );
                break;
            case 'closer':
                // In real app, this would use user location
                refinedVenues = refinedVenues.slice(0, 2);
                break;
        }

        const response = this.responseSystem.generateRefinementResponse(refinementType, refinedVenues);
        
        if (response && refinedVenues.length > 0) {
            this.addMessage(response.message, 'ai');
            this.conversationState.currentRecommendations = refinedVenues;
            this.venueCards.renderVenues(refinedVenues);
            
            setTimeout(() => {
                this.addMessage("How do these look? Better fit for what you're looking for?", 'ai');
            }, 500);
        } else {
            this.addMessage("I couldn't find any venues that match that refinement. Let me try a different approach...", 'ai');
        }
    }

    handleVenueInquiry(venue, message) {
        const response = this.responseSystem.generateInteractionResponse('viewDetails', venue.name, {
            vibe: venue.tags[0],
            occasion: 'your night out'
        });

        this.addMessage(response, 'ai');
        
        // Navigate to venue details
        setTimeout(() => {
            window.location.href = `venue-details-enhanced.html?id=${venue.id}`;
        }, 1500);
    }

    addMessage(text, sender) {
        const messagesContainer = document.getElementById('concierge-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.textContent = text;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Update response system context
        this.responseSystem.updateContext(text, text, this.conversationState.currentRecommendations);
    }
}

// Initialize the enhanced concierge
let enhancedConcierge;

document.addEventListener('DOMContentLoaded', () => {
    // Wait for mock venues to be available
    setTimeout(() => {
        enhancedConcierge = new EnhancedConciergeIntegration();
    }, 1000);
});

// Export for global access
window.enhancedConcierge = enhancedConcierge;