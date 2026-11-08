// AI Chat Interface - Interactive Chat System
// Provides intelligent venue recommendations through conversational AI

class AIChatInterface {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.conversationContext = {
            preferences: {},
            lastQuery: null,
            sessionStart: new Date()
        };
        this.init();
    }

    init() {
        this.createChatUI();
        this.setupEventListeners();
        this.loadChatHistory();
        this.addWelcomeMessage();
    }

    // ============================================
    // UI CREATION
    // ============================================

    createChatUI() {
        const chatHTML = `
            <!-- AI Chat Button -->
            <button class="ai-chat-button" id="aiChatButton" title="Chat with AI Assistant">
                <svg class="chat-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="chat-badge" id="chatBadge">1</span>
            </button>

            <!-- AI Chat Window -->
            <div class="ai-chat-window" id="aiChatWindow">
                <div class="chat-header">
                    <div class="chat-header-info">
                        <div class="chat-avatar">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                                <line x1="15" y1="9" x2="15.01" y2="9"></line>
                            </svg>
                        </div>
                        <div class="chat-header-text">
                            <h4>✨ SceneLink AI Assistant</h4>
                            <span class="chat-status">Online</span>
                        </div>
                    </div>
                    <button class="chat-close" id="chatCloseBtn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="chat-messages" id="chatMessages">
                    <!-- Messages will be inserted here -->
                </div>

                <div class="chat-quick-replies" id="chatQuickReplies">
                    <!-- Quick replies will be inserted here -->
                </div>

                <div class="chat-input-container">
                    <input 
                        type="text" 
                        class="chat-input" 
                        id="chatInput" 
                        placeholder="Ask me anything about venues..."
                        autocomplete="off"
                    >
                    <button class="chat-send" id="chatSendBtn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', chatHTML);
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        const chatButton = document.getElementById('aiChatButton');
        const chatCloseBtn = document.getElementById('chatCloseBtn');
        const chatSendBtn = document.getElementById('chatSendBtn');
        const chatInput = document.getElementById('chatInput');

        chatButton?.addEventListener('click', () => this.toggleChat());
        chatCloseBtn?.addEventListener('click', () => this.closeChat());
        chatSendBtn?.addEventListener('click', () => this.sendMessage());
        
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    // ============================================
    // CHAT FUNCTIONALITY
    // ============================================

    toggleChat() {
        this.isOpen = !this.isOpen;
        const chatWindow = document.getElementById('aiChatWindow');
        const chatButton = document.getElementById('aiChatButton');
        
        if (this.isOpen) {
            chatWindow.classList.add('open');
            chatButton.classList.add('active');
            this.clearBadge();
            setTimeout(() => {
                document.getElementById('chatInput')?.focus();
            }, 300);
        } else {
            chatWindow.classList.remove('open');
            chatButton.classList.remove('active');
        }
    }

    closeChat() {
        this.isOpen = false;
        document.getElementById('aiChatWindow').classList.remove('open');
        document.getElementById('aiChatButton').classList.remove('active');
    }

    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;

        // Add user message
        this.addMessage(message, 'user');
        input.value = '';

        // Show typing indicator
        this.showTypingIndicator();

        // Simulate AI response delay
        setTimeout(() => {
            this.hideTypingIndicator();
            const response = this.generateAIResponse(message);
            this.addMessage(response.text, 'ai');
            
            if (response.quickReplies) {
                this.showQuickReplies(response.quickReplies);
            }
        }, 1000 + Math.random() * 1000);
    }

    addMessage(text, sender) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}-message`;
        
        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit' 
        });

        messageDiv.innerHTML = `
            <div class="message-content">
                <p>${text}</p>
                <span class="message-time">${timestamp}</span>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Save to history
        this.messages.push({ text, sender, timestamp: new Date() });
        this.saveChatHistory();
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-message ai-message typing-indicator';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = `
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    // ============================================
    // AI RESPONSE GENERATION
    // ============================================

    generateAIResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        
        // Intent detection with SceneLink personality
        if (this.matchesIntent(lowerMessage, ['hello', 'hi', 'hey', 'greetings'])) {
            return {
                text: "Hey! 👋 So glad you're here! I'm your SceneLink AI companion, and I'm absolutely buzzing to help you discover Boston's hottest spots! 🌟 Whether it's a cozy dinner, craft cocktails, or tonight's best events - I've got the inside scoop. What adventure are we planning?",
                quickReplies: ['🍽️ Amazing Restaurants', '🍹 Best Bars', '🎭 Tonight\'s Events', '✨ Surprise Me!']
            };
        }

        if (this.matchesIntent(lowerMessage, ['restaurant', 'food', 'eat', 'dining', 'dinner', 'lunch'])) {
            const cuisine = this.extractCuisine(lowerMessage);
            const vibe = this.extractVibe(lowerMessage);
            
            let response = cuisine 
                ? `Ooh, ${cuisine}! 😋 Excellent taste! I've got some absolutely incredible ${cuisine} spots that'll blow your mind. ` 
                : "Yum! 🍽️ Let's find you something delicious! ";
            
            if (vibe) {
                response += `Perfect for a ${vibe} vibe! `;
            }
            
            response += "Ready to see your personalized picks?";
            
            return {
                text: response,
                quickReplies: ['🌟 Show Top Picks', '💰 Budget-Friendly', '📍 Near Me', '⭐ Highest Rated']
            };
        }

        if (this.matchesIntent(lowerMessage, ['bar', 'drink', 'cocktail', 'beer', 'wine'])) {
            return {
                text: "Now we're talking! 🍸✨ Boston's bar scene is absolutely fire right now! Whether you're vibing with craft cocktails, rooftop views, or a chill wine bar - I know all the spots where the magic happens. What's your mood tonight?",
                quickReplies: ['🍹 Craft Cocktails', '🏙️ Rooftop Bars', '🍷 Wine Bars', '🎵 Live Music Bars']
            };
        }

        if (this.matchesIntent(lowerMessage, ['event', 'tonight', 'happening', 'show', 'concert'])) {
            return {
                text: "Oh, you're in for a treat! 🎉✨ Tonight's lineup is AMAZING! From live bands to comedy shows, art galleries to food festivals - Boston is absolutely buzzing! What kind of experience are you craving?",
                quickReplies: ['🎸 Live Music', '😂 Comedy Shows', '🎨 Art & Culture', '🎭 All Events']
            };
        }

        if (this.matchesIntent(lowerMessage, ['romantic', 'date', 'anniversary', 'special occasion'])) {
            return {
                text: "Aww, how special! 💕✨ I'm getting all the romantic vibes! Let me curate the perfect evening for you - think candlelit ambiance, impeccable service, and cuisine that'll make hearts flutter. This is going to be unforgettable! What flavors speak to your soul?",
                quickReplies: ['🇮🇹 Italian Romance', '🇫🇷 French Elegance', '🥩 Steakhouse Classic', '✨ Surprise Us!']
            };
        }

        if (this.matchesIntent(lowerMessage, ['cheap', 'affordable', 'budget', 'inexpensive'])) {
            return {
                text: "Great taste doesn't have to break the bank! 💰 I'll show you highly-rated spots with excellent value. What type of cuisine are you craving?",
                quickReplies: ['Asian', 'Mexican', 'American', 'Pizza']
            };
        }

        if (this.matchesIntent(lowerMessage, ['group', 'friends', 'party', 'celebration'])) {
            return {
                text: "Party time! 🎊🎉 Group outings are my JAM! I know all the spots with killer vibes, shareable plates, and space for your whole crew to have an absolute blast! Let's make this legendary! How big is your squad?",
                quickReplies: ['4-6 people', '7-10 people', '10+ people', 'Not sure yet']
            };
        }

        if (this.matchesIntent(lowerMessage, ['outdoor', 'patio', 'rooftop', 'outside'])) {
            return {
                text: "Love the outdoor vibe! ☀️ I'll find you spots with great patios, rooftops, or outdoor seating. What type of venue?",
                quickReplies: ['Restaurants', 'Bars', 'Both', 'Rooftop only']
            };
        }

        // Default response with context
        return {
            text: "I can help you discover amazing venues! Try asking me about:\n• Restaurants by cuisine or vibe\n• Bars and nightlife\n• Tonight's events\n• Romantic date spots\n• Group dining options\n\nWhat interests you?",
            quickReplies: ['Find restaurants', 'Show bars', 'Events tonight', 'Surprise me']
        };
    }

    matchesIntent(message, keywords) {
        return keywords.some(keyword => message.includes(keyword));
    }

    extractCuisine(message) {
        const cuisines = {
            'italian': 'Italian',
            'chinese': 'Chinese',
            'japanese': 'Japanese',
            'sushi': 'Japanese',
            'mexican': 'Mexican',
            'thai': 'Thai',
            'indian': 'Indian',
            'french': 'French',
            'american': 'American',
            'mediterranean': 'Mediterranean',
            'greek': 'Greek',
            'korean': 'Korean',
            'vietnamese': 'Vietnamese',
            'pizza': 'Pizza',
            'steakhouse': 'Steakhouse',
            'seafood': 'Seafood'
        };

        for (const [key, value] of Object.entries(cuisines)) {
            if (message.includes(key)) {
                return value;
            }
        }
        return null;
    }

    extractVibe(message) {
        const vibes = {
            'romantic': 'romantic',
            'casual': 'casual',
            'upscale': 'upscale',
            'fancy': 'upscale',
            'lively': 'lively',
            'quiet': 'quiet',
            'cozy': 'cozy',
            'trendy': 'trendy'
        };

        for (const [key, value] of Object.entries(vibes)) {
            if (message.includes(key)) {
                return value;
            }
        }
        return null;
    }

    // ============================================
    // QUICK REPLIES
    // ============================================

    showQuickReplies(replies) {
        const container = document.getElementById('chatQuickReplies');
        container.innerHTML = replies.map(reply => `
            <button class="quick-reply-btn" onclick="aiChat.handleQuickReply('${reply}')">
                ${reply}
            </button>
        `).join('');
        container.style.display = 'flex';
    }

    handleQuickReply(reply) {
        document.getElementById('chatInput').value = reply;
        this.sendMessage();
        document.getElementById('chatQuickReplies').style.display = 'none';
    }

    // ============================================
    // WELCOME MESSAGE
    // ============================================

    addWelcomeMessage() {
        if (this.messages.length === 0) {
            setTimeout(() => {
                this.addMessage(
                    "✨ Hey there! I'm your SceneLink AI companion, here to help you discover Boston's best dining and nightlife experiences! 🍽️🍸\n\nWhether you're craving Italian, looking for rooftop bars, or planning a special date night, I've got you covered. What sounds good tonight?",
                    'ai'
                );
                this.showQuickReplies(['🍝 Italian Restaurants', '🍸 Rooftop Bars', '🎉 Tonight\'s Events', '💝 Date Night Ideas']);
                this.updateBadge();
            }, 1000);
        }
    }

    // ============================================
    // BADGE & NOTIFICATIONS
    // ============================================

    updateBadge() {
        const badge = document.getElementById('chatBadge');
        if (badge && !this.isOpen) {
            badge.style.display = 'flex';
        }
    }

    clearBadge() {
        const badge = document.getElementById('chatBadge');
        if (badge) {
            badge.style.display = 'none';
        }
    }

    // ============================================
    // PERSISTENCE
    // ============================================

    saveChatHistory() {
        try {
            localStorage.setItem('aiChatHistory', JSON.stringify(this.messages.slice(-50))); // Keep last 50 messages
        } catch (e) {
            console.log('Could not save chat history');
        }
    }

    loadChatHistory() {
        try {
            const history = localStorage.getItem('aiChatHistory');
            if (history) {
                this.messages = JSON.parse(history);
                // Restore messages to UI
                this.messages.forEach(msg => {
                    const messagesContainer = document.getElementById('chatMessages');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = `chat-message ${msg.sender}-message`;
                    messageDiv.innerHTML = `
                        <div class="message-content">
                            <p>${msg.text}</p>
                        </div>
                    `;
                    messagesContainer.appendChild(messageDiv);
                });
            }
        } catch (e) {
            console.log('Could not load chat history');
        }
    }
}

// Initialize AI Chat
let aiChat;
document.addEventListener('DOMContentLoaded', () => {
    aiChat = new AIChatInterface();
    console.log('AI Chat Interface initialized');
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.aiChat = aiChat;
}