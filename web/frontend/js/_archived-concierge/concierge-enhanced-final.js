// SceneLink Enhanced AI Concierge - Final Version
(function() {
    'use strict';

    // Prevent multiple instances
    if (window.SceneLinkConciergeEnhanced) {
        console.log('SceneLink Enhanced Concierge already loaded');
        return;
    }

    class SceneLinkConciergeEnhanced {
        constructor() {
            this.widgetId = 'scenelink-concierge-widget';
            this.panelId = 'scenelink-concierge-panel';
            this.buttonId = 'scenelink-concierge-button';
            this.isOpen = false;
            this.isProcessing = false;
            this.init();
        }

        init() {
            if (document.getElementById(this.buttonId)) {
                console.log('Enhanced Concierge button already exists');
                return;
            }

            this.createButton();
            this.createPanel();
            this.injectStyles();
            this.attachEvents();
        }

        createButton() {
            const button = document.createElement('div');
            button.id = this.buttonId;
            button.innerHTML = `
                <div class="concierge-btn-content">
                    <div class="concierge-icon-enhanced">
                        <svg width="32" height="32" viewBox="0 0 24 24">
                            <!-- Place outline for enhanced visibility -->
                            <circle cx="12" cy="12" r="10" fill="none" stroke="#D4AF37" stroke-width="2" opacity="0.8"/>
                            <circle cx="12" cy="12" r="11" fill="none" stroke="#D4AF37" stroke-width="1" opacity="0.5"/>
                            
                            <!-- Star icon -->
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="white"/>
                            
                            <!-- AI symbol -->
                            <circle cx="12" cy="12" r="3" fill="rgba(212, 175, 55, 0.9)"/>
                            <path d="M12 8v8M8 12h8" stroke="white" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <span class="concierge-tooltip">Ask SceneLink Concierge</span>
                </div>
                <div class="concierge-pulse-ring"></div>
                <div class="concierge-glow-effect"></div>
            `;
            document.body.appendChild(button);
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.id = this.panelId;
            panel.innerHTML = `
                <div class="concierge-panel-header">
                    <h3>SceneLink AI Concierge</h3>
                    <button class="concierge-close-btn">&times;</button>
                </div>
                <div class="concierge-panel-content">
                    <div class="concierge-welcome">
                        <p>🌟 Welcome! I'm your personal SceneLink concierge. I can help you discover the perfect venues and plan your evening!</p>
                    </div>
                    <div class="concierge-suggestions">
                        <button class="suggestion-btn" data-query="What are the best restaurants near me?">🍽️ Best Restaurants</button>
                        <button class="suggestion-btn" data-query="Show me trending nightlife spots">🌃 Trending Nightlife</button>
                        <button class="suggestion-btn" data-query="Find romantic dinner spots">💕 Romantic Dining</button>
                        <button class="suggestion-btn" data-query="What's happening tonight?">🎯 Tonight's Events</button>
                    </div>
                    <div class="concierge-input-area">
                        <div class="concierge-input-wrapper">
                            <input type="text" id="concierge-input" placeholder="Ask me anything about Boston's dining and nightlife..." />
                            <button id="concierge-send" disabled>Send</button>
                        </div>
                        <div class="concierge-typing-indicator" style="display: none;">
                            <span class="typing-dot"></span>
                            <span class="typing-dot"></span>
                            <span class="typing-dot"></span>
                        </div>
                    </div>
                    <div id="concierge-messages" class="concierge-messages"></div>
                </div>
            `;
            document.body.appendChild(panel);
        }

        injectStyles() {
            const styles = document.createElement('style');
            styles.textContent = `
                /* Enhanced Concierge Button */
                #scenelink-concierge-button {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    z-index: 10000;
                    cursor: pointer;
                }

                .concierge-btn-content {
                    width: 64px;
                    height: 64px;
                    background: linear-gradient(135deg, #D4AF37, #b8941f);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 8px 32px rgba(212, 175, 55, 0.4);
                    transition: all 0.3s ease;
                    position: relative;
                }

                .concierge-icon-enhanced {
                    animation: conciergeIconGlow 2s ease-in-out infinite;
                }

                .concierge-glow-effect {
                    position: absolute;
                    top: -4px;
                    left: -4px;
                    right: -4px;
                    bottom: -4px;
                    background: linear-gradient(45deg, #D4AF37, #f4e4a6, #D4AF37);
                    border-radius: 50%;
                    opacity: 0;
                    z-index: -1;
                    animation: conciergeGlow 3s ease-in-out infinite;
                }

                .concierge-btn-content:hover {
                    transform: scale(1.1);
                    box-shadow: 0 12px 40px rgba(212, 175, 55, 0.6);
                }

                .concierge-btn-content:hover .concierge-glow-effect {
                    opacity: 0.7;
                }

                .concierge-pulse-ring {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 64px;
                    height: 64px;
                    border: 2px solid #D4AF37;
                    border-radius: 50%;
                    opacity: 0;
                    animation: conciergePulse 2s ease-out infinite;
                }

                .concierge-tooltip {
                    position: absolute;
                    bottom: 100%;
                    right: 0;
                    background: rgba(20, 20, 20, 0.95);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 14px;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transform: translateY(-8px);
                    transition: all 0.3s ease;
                    border: 1px solid rgba(212, 175, 55, 0.3);
                }

                .concierge-btn-content:hover .concierge-tooltip {
                    opacity: 1;
                    transform: translateY(-12px);
                }

                /* Enhanced Concierge Panel */
                #scenelink-concierge-panel {
                    position: fixed;
                    bottom: 100px;
                    right: 30px;
                    width: 400px;
                    max-width: 90vw;
                    height: 500px;
                    background: rgba(20, 20, 20, 0.98);
                    border: 1px solid rgba(212, 175, 55, 0.3);
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(20px);
                    z-index: 9999;
                    display: none;
                    opacity: 0;
                    transform: translateY(20px);
                    transition: all 0.3s ease;
                }

                #scenelink-concierge-panel.active {
                    display: block;
                    opacity: 1;
                    transform: translateY(0);
                }

                .concierge-panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid rgba(212, 175, 55, 0.2);
                    background: rgba(212, 175, 55, 0.1);
                }

                .concierge-panel-header h3 {
                    margin: 0;
                    color: #D4AF37;
                    font-size: 16px;
                    font-weight: 600;
                }

                .concierge-close-btn {
                    background: none;
                    border: none;
                    color: #b0b0b0;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: all 0.3s ease;
                }

                .concierge-close-btn:hover {
                    background: rgba(212, 175, 55, 0.2);
                    color: #D4AF37;
                }

                .concierge-panel-content {
                    padding: 20px;
                    height: calc(100% - 70px);
                    overflow-y: auto;
                }

                .concierge-welcome {
                    background: rgba(212, 175, 55, 0.1);
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 16px;
                    border: 1px solid rgba(212, 175, 55, 0.2);
                }

                .concierge-welcome p {
                    margin: 0;
                    color: #D4AF37;
                    font-size: 14px;
                    line-height: 1.5;
                }

                .concierge-suggestions {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    margin-bottom: 16px;
                }

                .suggestion-btn {
                    background: rgba(212, 175, 55, 0.1);
                    border: 1px solid rgba(212, 175, 55, 0.3);
                    color: #D4AF37;
                    padding: 8px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.3s ease;
                    white-space: nowrap;
                }

                .suggestion-btn:hover {
                    background: rgba(212, 175, 55, 0.2);
                    border-color: #D4AF37;
                    transform: translateY(-2px);
                }

                .concierge-input-area {
                    margin-bottom: 16px;
                }

                .concierge-input-wrapper {
                    display: flex;
                    gap: 8px;
                }

                #concierge-input {
                    flex: 1;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(212, 175, 55, 0.3);
                    color: white;
                    padding: 10px 14px;
                    border-radius: 8px;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.3s ease;
                }

                #concierge-input:focus {
                    border-color: #D4AF37;
                    background: rgba(255, 255, 255, 0.08);
                }

                #concierge-input::placeholder {
                    color: #b0b0b0;
                }

                #concierge-send {
                    background: linear-gradient(135deg, #D4AF37, #b8941f);
                    border: none;
                    color: rgba(20, 20, 20, 0.9);
                    padding: 10px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                    transition: all 0.3s ease;
                }

                #concierge-send:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.4);
                }

                #concierge-send:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .concierge-typing-indicator {
                    display: flex;
                    gap: 4px;
                    padding: 8px 0;
                }

                .typing-dot {
                    width: 8px;
                    height: 8px;
                    background: #D4AF37;
                    border-radius: 50%;
                    animation: typingDot 1.4s ease-in-out infinite;
                }

                .typing-dot:nth-child(2) { animation-delay: 0.2s; }
                .typing-dot:nth-child(3) { animation-delay: 0.4s; }

                .concierge-messages {
                    max-height: 200px;
                    overflow-y: auto;
                }

                .concierge-message {
                    margin-bottom: 12px;
                    padding: 10px;
                    border-radius: 8px;
                    animation: messageSlide 0.3s ease;
                }

                .concierge-message.user {
                    background: rgba(212, 175, 55, 0.2);
                    border-left: 3px solid #D4AF37;
                    color: white;
                }

                .concierge-message.ai {
                    background: rgba(255, 255, 255, 0.05);
                    border-left: 3px solid #667eea;
                    color: #e0e0e0;
                }

                .concierge-message strong {
                    color: #D4AF37;
                    display: block;
                    margin-bottom: 4px;
                    font-size: 12px;
                }

                /* Animations */
                @keyframes conciergeGlow {
                    0%, 100% { opacity: 0; }
                    50% { opacity: 0.6; }
                }

                @keyframes conciergePulse {
                    0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
                }

                @keyframes conciergeIconGlow {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }

                @keyframes typingDot {
                    0%, 60%, 100% { transform: scale(1); opacity: 0.4; }
                    30% { transform: scale(1.2); opacity: 1; }
                }

                @keyframes messageSlide {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* Mobile Responsive */
                @media (max-width: 480px) {
                    #scenelink-concierge-panel {
                        width: calc(100vw - 40px);
                        right: 20px;
                        left: 20px;
                        bottom: 90px;
                    }
                    
                    .concierge-suggestions {
                        grid-template-columns: 1fr;
                    }
                }
            `;
            document.head.appendChild(styles);
        }

        attachEvents() {
            const button = document.getElementById(this.buttonId);
            const panel = document.getElementById(this.panelId);
            const closeBtn = panel.querySelector('.concierge-close-btn');
            const input = document.getElementById('concierge-input');
            const sendBtn = document.getElementById('concierge-send');
            const suggestionBtns = panel.querySelectorAll('.suggestion-btn');

            button.addEventListener('click', () => this.togglePanel());
            closeBtn.addEventListener('click', () => this.closePanel());

            input.addEventListener('input', () => {
                sendBtn.disabled = !input.value.trim();
            });

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !sendBtn.disabled) {
                    this.sendMessage();
                }
            });

            sendBtn.addEventListener('click', () => this.sendMessage());

            suggestionBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const query = btn.getAttribute('data-query');
                    input.value = query;
                    sendBtn.disabled = false;
                    this.sendMessage();
                });
            });

            // Close panel when clicking outside
            document.addEventListener('click', (e) => {
                if (this.isOpen && !panel.contains(e.target) && !button.contains(e.target)) {
                    this.closePanel();
                }
            });
        }

        togglePanel() {
            if (this.isOpen) {
                this.closePanel();
            } else {
                this.openPanel();
            }
        }

        openPanel() {
            const panel = document.getElementById(this.panelId);
            panel.classList.add('active');
            this.isOpen = true;
            document.getElementById('concierge-input').focus();
        }

        closePanel() {
            const panel = document.getElementById(this.panelId);
            panel.classList.remove('active');
            this.isOpen = false;
        }

        sendMessage() {
            if (this.isProcessing) return;

            const input = document.getElementById('concierge-input');
            const sendBtn = document.getElementById('concierge-send');
            const message = input.value.trim();

            if (!message) return;

            this.isProcessing = true;
            sendBtn.disabled = true;
            input.disabled = true;

            this.addMessage(message, 'user');
            this.showTypingIndicator();

            // Simulate AI response
            setTimeout(() => {
                this.hideTypingIndicator();
                const response = this.generateEnhancedResponse(message);
                this.addMessage(response, 'ai');
                
                input.value = '';
                input.disabled = false;
                this.isProcessing = false;
            }, 1500 + Math.random() * 1000);
        }

        addMessage(text, sender) {
            const messagesContainer = document.getElementById('concierge-messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `concierge-message ${sender}`;
            
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const senderName = sender === 'user' ? 'You' : 'SceneLink Concierge';
            
            messageDiv.innerHTML = `
                <strong>${senderName} • ${timestamp}</strong>
                ${text}
            `;
            
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        showTypingIndicator() {
            const indicator = document.querySelector('.concierge-typing-indicator');
            if (indicator) {
                indicator.style.display = 'flex';
            }
        }

        hideTypingIndicator() {
            const indicator = document.querySelector('.concierge-typing-indicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
        }

        generateEnhancedResponse(query) {
            const responses = {
                'restaurant': [
                    "🍽️ I've found some amazing restaurants for you! Based on your preferences, I recommend **Giulia** in the North End for authentic Italian, or **Menton** for a luxurious French experience. Both have excellent ratings and reservations available tonight!",
                    "For the best dining experience, consider **Oleana** for Mediterranean cuisine or **Tasting Counter** for an innovative tasting menu. Would you like me to help you make reservations?"
                ],
                'nightlife': [
                    "🌃 Boston's nightlife is fantastic tonight! **The Grand** is featuring live jazz, **Lookout Rooftop Bar** has amazing city views, and **Belly of the Beast** has craft cocktails. What type of atmosphere are you looking for?",
                    "For the best nightlife spots, check out **The Hawthorne** for sophisticated cocktails, **Yvonne's** for a speakeasy vibe, or **Wink & Nod** for craft beer and dancing!"
                ],
                'tonight': [
                    "🎯 Tonight's highlights: **Boston Symphony Orchestra** at Symphony Hall, **Red Sox game** at Fenway, and outdoor dining at **Time Out Market**. What interests you most?",
                    "Perfect evening tonight! Start with dinner at **Row 34**, then catch the sunset from **Boston Harbor**, and end with craft cocktails at **The Salty Pig**!"
                ],
                'romantic': [
                    "💕 For a romantic evening, I suggest **L'Espalier** for fine dining, a sunset walk along **Boston Harbor**, and cocktails at **The Bar at The Biltmore**. Would you like me to suggest more intimate spots?",
                    "Create the perfect romantic night: **Mastro's Ocean Club** for oceanfront dining, **Boston Public Garden** for a moonlit stroll, and **Top of the Hub** for breathtaking views!"
                ],
                'default': [
                    "🌟 I'd be happy to help! Based on your request, I can recommend excellent venues across Boston. Are you looking for dining, nightlife, events, or a specific type of experience?",
                    "Let me find the perfect options for you! Boston has incredible choices for every occasion. What's your ideal evening look like?",
                    "I'm here to make your evening amazing! Tell me more about your preferences - cuisine style, budget range, or the type of atmosphere you're seeking."
                ]
            };

            const lowerQuery = query.toLowerCase();
            let responseArray = responses.default;

            if (lowerQuery.includes('restaurant') || lowerQuery.includes('food') || lowerQuery.includes('dinner')) {
                responseArray = responses.restaurant;
            } else if (lowerQuery.includes('nightlife') || lowerQuery.includes('bar') || lowerQuery.includes('club')) {
                responseArray = responses.nightlife;
            } else if (lowerQuery.includes('tonight') || lowerQuery.includes('today') || lowerQuery.includes('happening')) {
                responseArray = responses.tonight;
            } else if (lowerQuery.includes('romantic') || lowerQuery.includes('date') || lowerQuery.includes('couple')) {
                responseArray = responses.romantic;
            }

            return responseArray[Math.floor(Math.random() * responseArray.length)];
        }
    }

    // Initialize when DOM is ready
    function initConcierge() {
        window.SceneLinkConciergeEnhanced = new SceneLinkConciergeEnhanced();
        console.log('🌟 SceneLink Enhanced AI Concierge initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConcierge);
    } else {
        initConcierge();
    }
})();