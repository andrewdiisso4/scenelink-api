// SceneLink Modern Enhanced Concierge
(function() {
    'use strict';

    class ModernConciergeWidget {
        constructor() {
            this.conversationState = {
                userPreferences: {},
                conversationHistory: [],
                isFirstTime: true,
                currentPage: this.detectCurrentPage()
            };
            this.responses = new EnhancedConciergeResponses();
            this.recommender = new VenueRecommender();
            this.init();
        }

        detectCurrentPage() {
            const path = window.location.pathname;
            if (path.includes('tonight-picks')) return 'tonight-picks';
            if (path.includes('explore')) return 'explore';
            if (path.includes('nightlife')) return 'nightlife';
            if (path.includes('events')) return 'events';
            return 'home';
        }

        init() {
            this.createModernConciergeWidget();
            this.injectEnhancedStyles();
            this.attachEventListeners();
            this.loadUserPreferences();
        }

        createModernConciergeWidget() {
            const floatingButton = document.createElement('div');
            floatingButton.id = 'modern-concierge-button';
            floatingButton.innerHTML = `
                <div class="concierge-button-content">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                        <!-- Modern star/sparkle icon design -->
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        <circle cx="12" cy="12" r="3" fill="rgba(212, 175, 55, 0.8)"/>
                        <path d="M12 8v8M8 12h8" stroke="#D4AF37" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span class="concierge-tooltip">Ask SceneLink Concierge</span>
                </div>
                <div class="pulse-ring-modern"></div>
            `;

            const chatPanel = document.createElement('div');
            chatPanel.id = 'modern-concierge-panel';
            chatPanel.innerHTML = `
                <div class="concierge-header">
                    <div class="concierge-branding">
                        <div class="concierge-logo">✨</div>
                        <div class="concierge-title-section">
                            <h3>SceneLink Concierge</h3>
                            <p>Your personal nightlife expert</p>
                        </div>
                    </div>
                    <button class="concierge-close" onclick="window.modernConcierge.hidePanel()">×</button>
                </div>

                <div class="concierge-messages" id="concierge-messages">
                </div>

                <div class="concierge-input-section">
                    <div class="quick-actions" id="quick-actions">
                        <button class="quick-action-chip" onclick="window.modernConcierge.quickAction('date-night')">
                            💕 Date night spot
                        </button>
                        <button class="quick-action-chip" onclick="window.modernConcierge.quickAction('cocktail-bars')">
                            🍸 Best cocktail bars
                        </button>
                        <button class="quick-action-chip" onclick="window.modernConcierge.quickAction('group-hang')">
                            🎉 Group hang for 4-6
                        </button>
                        <button class="quick-action-chip" onclick="window.modernConcierge.quickAction('pre-game')">
                            🏀 Pre-game near Garden
                        </button>
                        <button class="quick-action-chip" onclick="window.modernConcierge.quickAction('top-picks')">
                            ⭐ Top picks tonight
                        </button>
                    </div>
                    <div class="concierge-input-wrapper">
                        <input type="text" id="concierge-input" placeholder="Ask me anything about Boston nightlife..." />
                        <button id="concierge-send" onclick="window.modernConcierge.sendMessage()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(floatingButton);
            document.body.appendChild(chatPanel);

            // Initialize conversation
            setTimeout(() => {
                this.showWelcomeMessage();
            }, 1000);
        }

        injectEnhancedStyles() {
            if (document.getElementById('modern-concierge-styles')) return;

            const styles = document.createElement('style');
            styles.id = 'modern-concierge-styles';
            styles.innerHTML = `
                #modern-concierge-button {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    width: 68px;
                    height: 68px;
                    background: linear-gradient(135deg, #D4AF37 0%, #F4E4A6 50%, #D4AF37 100%);
                    border-radius: 50%;
                    cursor: pointer;
                    z-index: 9999;
                    box-shadow: 0 8px 32px rgba(212, 175, 55, 0.4), 0 0 0 1px rgba(212, 175, 55, 0.2);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid rgba(255, 255, 255, 0.1);
                }

                #modern-concierge-button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 12px 40px rgba(212, 175, 55, 0.5), 0 0 0 2px rgba(212, 175, 55, 0.3);
                }

                #modern-concierge-button:hover .concierge-tooltip {
                    opacity: 1;
                    transform: translateX(-8px);
                }

                .concierge-tooltip {
                    position: absolute;
                    right: 80px;
                    background: rgba(10, 10, 10, 0.95);
                    color: #ffffff;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    white-space: nowrap;
                    opacity: 0;
                    transform: translateX(0);
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(212, 175, 55, 0.2);
                    pointer-events: none;
                    font-weight: 500;
                }

                .concierge-button-content {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .pulse-ring-modern {
                    position: absolute;
                    top: -2px;
                    left: -2px;
                    width: 72px;
                    height: 72px;
                    border: 1px solid rgba(212, 175, 55, 0.3);
                    border-radius: 50%;
                    animation: pulse-modern 4s ease-in-out infinite;
                    opacity: 0;
                }

                @keyframes pulse-modern {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 0;
                    }
                    50% {
                        transform: scale(1.15);
                        opacity: 0.3;
                    }
                }

                #modern-concierge-panel {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    width: 420px;
                    max-width: 90vw;
                    height: 600px;
                    max-height: 80vh;
                    background: rgba(10, 10, 10, 0.98);
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(212, 175, 55, 0.2);
                    z-index: 10000;
                    transform: translateY(120%);
                    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    flex-direction: column;
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }

                #modern-concierge-panel.active {
                    transform: translateY(0);
                }

                .concierge-header {
                    padding: 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(10, 10, 10, 0.95) 100%);
                    border-radius: 16px 16px 0 0;
                }

                .concierge-branding {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .concierge-logo {
                    font-size: 24px;
                    background: linear-gradient(135deg, #D4AF37, #F4E4A6);
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                }

                .concierge-title-section h3 {
                    margin: 0;
                    font-size: 18px;
                    color: #D4AF37;
                    font-weight: 600;
                }

                .concierge-title-section p {
                    margin: 0;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .concierge-close {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 24px;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 50%;
                    transition: all 0.2s;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .concierge-close:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                }

                .concierge-messages {
                    flex: 1;
                    padding: 20px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .concierge-messages::-webkit-scrollbar {
                    width: 4px;
                }

                .concierge-messages::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                }

                .concierge-messages::-webkit-scrollbar-thumb {
                    background: rgba(212, 175, 55, 0.3);
                    border-radius: 2px;
                }

                .concierge-message {
                    display: flex;
                    gap: 12px;
                    animation: messageSlide 0.4s ease;
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

                .concierge-message.user {
                    flex-direction: row-reverse;
                }

                .concierge-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    flex-shrink: 0;
                }

                .concierge-message.ai .concierge-avatar {
                    background: linear-gradient(135deg, #D4AF37, #F4E4A6);
                }

                .concierge-message.user .concierge-avatar {
                    background: rgba(255, 255, 255, 0.1);
                }

                .concierge-bubble {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 12px 16px;
                    border-radius: 16px;
                    max-width: 70%;
                    word-wrap: break-word;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }

                .concierge-message.user .concierge-bubble {
                    background: linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.1));
                    border: 1px solid rgba(212, 175, 55, 0.2);
                }

                .concierge-bubble p {
                    margin: 0;
                    color: #ffffff;
                    font-size: 14px;
                    line-height: 1.4;
                }

                .concierge-bubble .time {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: 4px;
                }

                .venue-card {
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 12px;
                    padding: 12px;
                    margin-top: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }

                .venue-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: start;
                    margin-bottom: 8px;
                }

                .venue-name {
                    font-weight: 600;
                    color: #D4AF37;
                    margin-bottom: 4px;
                }

                .venue-rating {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .venue-description {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 13px;
                    margin-bottom: 8px;
                }

                .venue-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    margin-bottom: 8px;
                }

                .venue-tag {
                    background: rgba(212, 175, 55, 0.1);
                    color: #D4AF37;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                    border: 1px solid rgba(212, 175, 55, 0.2);
                }

                .venue-actions {
                    display: flex;
                    gap: 8px;
                }

                .venue-btn {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.8);
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .venue-btn:hover {
                    background: rgba(212, 175, 55, 0.2);
                    border-color: rgba(212, 175, 55, 0.3);
                    color: #D4AF37;
                }

                .quick-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    padding: 16px 20px 0 20px;
                }

                .quick-action-chip {
                    background: rgba(212, 175, 55, 0.1);
                    border: 1px solid rgba(212, 175, 55, 0.2);
                    color: #D4AF37;
                    padding: 8px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }

                .quick-action-chip:hover {
                    background: rgba(212, 175, 55, 0.2);
                    transform: translateY(-1px);
                }

                .concierge-input-section {
                    padding: 16px 20px 20px 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .concierge-input-wrapper {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                #concierge-input {
                    flex: 1;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                    padding: 12px 16px;
                    border-radius: 24px;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.2s;
                }

                #concierge-input:focus {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(212, 175, 55, 0.3);
                }

                #concierge-input::placeholder {
                    color: rgba(255, 255, 255, 0.5);
                }

                #concierge-send {
                    background: linear-gradient(135deg, #D4AF37, #F4E4A6);
                    border: none;
                    color: #0a0a0a;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                #concierge-send:hover {
                    transform: scale(1.05);
                    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
                }

                @media (max-width: 768px) {
                    #modern-concierge-button {
                        bottom: 20px;
                        right: 20px;
                        width: 60px;
                        height: 60px;
                    }

                    #modern-concierge-panel {
                        bottom: 0;
                        right: 0;
                        left: 0;
                        width: 100%;
                        max-width: 100%;
                        height: 70vh;
                        max-height: 70vh;
                        border-radius: 16px 16px 0 0;
                    }

                    .concierge-tooltip {
                        display: none;
                    }
                }
            `;

            document.head.appendChild(styles);
        }

        // Continue with the rest of the functionality...
        attachEventListeners() {
            document.getElementById('modern-concierge-button').addEventListener('click', () => {
                this.showPanel();
            });

            document.getElementById('concierge-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hidePanel();
                }
            });

            document.addEventListener('click', (e) => {
                const panel = document.getElementById('modern-concierge-panel');
                const button = document.getElementById('modern-concierge-button');
                
                if (panel.classList.contains('active') && 
                    !panel.contains(e.target) && 
                    !button.contains(e.target)) {
                    this.hidePanel();
                }
            });
        }

        showPanel() {
            document.getElementById('modern-concierge-panel').classList.add('active');
            document.getElementById('concierge-input').focus();
            
            setTimeout(() => {
                document.getElementById('modern-concierge-button').style.display = 'none';
            }, 300);
        }

        hidePanel() {
            document.getElementById('modern-concierge-panel').classList.remove('active');
            
            setTimeout(() => {
                document.getElementById('modern-concierge-button').style.display = 'flex';
            }, 300);
        }

        showWelcomeMessage() {
            const saved = localStorage.getItem('conciergePreferences');
            const isFirstTime = !saved;
            
            let message;
            if (isFirstTime) {
                message = this.responses.getGreeting('firstTime');
            } else {
                message = this.responses.getGreeting('returning');
            }
            
            this.addMessage(message, 'ai');
            
            // Show quick actions after welcome
            setTimeout(() => {
                const contextualMessage = this.responses.getContextualGreeting(this.conversationState.currentPage);
                this.addMessage(contextualMessage, 'ai');
            }, 1000);
        }

        addMessage(text, sender, venues = []) {
            const messagesContainer = document.getElementById('concierge-messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `concierge-message ${sender}`;
            
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            if (sender === 'ai') {
                messageDiv.innerHTML = `
                    <div class="concierge-avatar">✨</div>
                    <div class="concierge-bubble">
                        <p>${text}</p>
                        <div class="time">${time}</div>
                        ${venues.length > 0 ? this.renderVenueCards(venues) : ''}
                    </div>
                `;
            } else {
                messageDiv.innerHTML = `
                    <div class="concierge-avatar">👤</div>
                    <div class="concierge-bubble">
                        <p>${text}</p>
                        <div class="time">${time}</div>
                    </div>
                `;
            }
            
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            // Save to conversation history
            this.conversationState.conversationHistory.push({ text, sender, time });
        }

        renderVenueCards(venues) {
            return venues.map(venue => `
                <div class="venue-card">
                    <div class="venue-card-header">
                        <div>
                            <div class="venue-name">${venue.name}</div>
                            <div class="venue-rating">⭐ ${venue.rating} • ${venue.reviews} reviews</div>
                        </div>
                        <button class="venue-btn" onclick="window.modernConcierge.saveVenue('${venue.id}')">
                            💾
                        </button>
                    </div>
                    <div class="venue-description">${venue.description}</div>
                    <div class="venue-tags">
                        ${venue.tags.map(tag => `<span class="venue-tag">${tag}</span>`).join('')}
                    </div>
                    <div class="venue-actions">
                        <button class="venue-btn" onclick="window.modernConcierge.viewVenueDetails('${venue.id}')">View Details</button>
                        <button class="venue-btn" onclick="window.modernConcierge.reserveVenue('${venue.id}')">Reserve</button>
                    </div>
                </div>
            `).join('');
        }

        sendMessage() {
            const input = document.getElementById('concierge-input');
            const message = input.value.trim();
            
            if (!message) return;
            
            this.addMessage(message, 'user');
            input.value = '';
            
            // Extract preferences and get recommendations
            this.responses.extractPreferences(message, this.conversationState.userPreferences);
            this.saveUserPreferences();
            
            setTimeout(() => {
                const venues = this.recommender.getRecommendations(this.conversationState.userPreferences);
                const response = this.responses.getRecommendationResponse(venues.length);
                
                this.addMessage(response, 'ai', venues);
            }, 1000);
        }

        quickAction(type) {
            const quickActions = {
                'date-night': "Find me a romantic spot for date night",
                'cocktail-bars': "What are the best cocktail bars near me?",
                'group-hang': "I need a chill spot for a group of 4-6 people",
                'pre-game': "Where can we pre-game near TD Garden?",
                'top-picks': "Show me the top picks for tonight"
            };
            
            const message = quickActions[type];
            document.getElementById('concierge-input').value = message;
            this.sendMessage();
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
    }

    // Enhanced Response System
    class EnhancedConciergeResponses {
        constructor() {
            this.responseTemplates = {
                greetings: {
                    firstTime: [
                        "👋 Welcome to SceneLink! I'm your personal nightlife expert. What kind of vibe are you looking for tonight?",
                        "✨ Hey there! I know all the best spots in Boston. What's your perfect night out?",
                        "🍸 Welcome! Let me help you discover something amazing. What are you in the mood for?"
                    ],
                    returning: [
                        "👋 Welcome back! Ready for another great night out?",
                        "✨ Good to see you again! Let's find your next favorite spot.",
                        "🍸 Back for more? I've got some fresh recommendations for you!"
                    ]
                },
                recommendations: {
                    presenting: [
                        "Based on your preferences, here are my top recommendations:",
                        "I found some perfect matches for what you're looking for:",
                        "Here are the spots I think you'll absolutely love:",
                        "Perfect! I've curated some amazing options for you:"
                    ]
                }
            };
        }

        getGreeting(type) {
            const greetings = this.responseTemplates.greetings[type];
            return greetings[Math.floor(Math.random() * greetings.length)];
        }

        getContextualGreeting(page) {
            const contextualGreetings = {
                'tonight-picks': "✨ Perfect! You're on the Tonight's Picks page. Let me find something amazing for right now!",
                'explore': "🗺️ Exploring Boston? I can help you discover hidden gems and popular spots.",
                'nightlife': "🎵 Looking for nightlife? I know the best clubs, bars, and late-night destinations!",
                'events': "🎭 Events page! Are you looking for something happening tonight or planning ahead?",
                'home': "🏠 Welcome to SceneLink! Let's create your perfect night out."
            };
            
            return contextualGreetings[page] || contextualGreetings.home;
        }

        getRecommendationResponse(count) {
            const responses = this.responseTemplates.recommendations.presenting;
            return responses[Math.floor(Math.random() * responses.length)];
        }

        extractPreferences(message, preferences) {
            // Simple preference extraction
            if (message.toLowerCase().includes('date') || message.toLowerCase().includes('romantic')) {
                preferences.occasion = 'date';
            }
            if (message.toLowerCase().includes('group') || message.toLowerCase().includes('friends')) {
                preferences.groupSize = '4-6';
            }
            if (message.toLowerCase().includes('cocktail') || message.toLowerCase().includes('drinks')) {
                preferences.vibe = 'upscale';
            }
            if (message.toLowerCase().includes('garden') || message.toLowerCase().includes('sports')) {
                preferences.location = 'TD Garden';
            }
        }
    }

    // Venue Recommender
    class VenueRecommender {
        constructor() {
            this.venues = [
                {
                    id: '1',
                    name: 'The Liberty Hotel',
                    description: 'Historic jail turned luxury hotel with stunning bars and nightlife',
                    rating: '4.5',
                    reviews: '324',
                    tags: ['Upscale', 'Cocktails', 'Historic'],
                    price: '$$$'
                },
                {
                    id: '2',
                    name: 'Lookout Rooftop Bar',
                    description: 'Rooftop bar with panoramic city views and creative cocktails',
                    rating: '4.7',
                    reviews: '289',
                    tags: ['Rooftop', 'Views', 'Cocktails'],
                    price: '$$'
                },
                {
                    id: '3',
                    name: 'Yvonne\'s',
                    description: 'Intimate speakeasy-style lounge with craft cocktails',
                    rating: '4.8',
                    reviews: '412',
                    tags: ['Speakeasy', 'Intimate', 'Craft Cocktails'],
                    price: '$$$'
                },
                {
                    id: '4',
                    name: 'The Hawthorne',
                    description: 'Elegant cocktail lounge with extensive spirit selection',
                    rating: '4.6',
                    reviews: '198',
                    tags: ['Elegant', 'Cocktails', 'Classic'],
                    price: '$$$'
                }
            ];
        }

        getRecommendations(preferences) {
            // Return all venues for now - in real implementation would filter based on preferences
            return this.venues.slice(0, 3);
        }
    }

    // Initialize the widget
    if (!window.modernConcierge) {
        window.modernConcierge = new ModernConciergeWidget();
    }
})();