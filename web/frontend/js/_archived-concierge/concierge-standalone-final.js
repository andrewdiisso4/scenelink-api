// SceneLink Concierge - Standalone Final Version
(function() {
    'use strict';

    // Prevent multiple instances
    if (window.SceneLinkConcierge) {
        console.log('SceneLink Concierge already loaded');
        return;
    }

    class SceneLinkConcierge {
        constructor() {
            this.widgetId = 'scenelink-concierge-widget';
            this.panelId = 'scenelink-concierge-panel';
            this.buttonId = 'scenelink-concierge-button';
            this.init();
        }

        init() {
            if (document.getElementById(this.buttonId)) {
                console.log('Concierge button already exists');
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
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        <circle cx="12" cy="12" r="3" fill="rgba(212, 175, 55, 0.8)"/>
                        <path d="M12 8v8M8 12h8" stroke="#D4AF37" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span class="concierge-tooltip">Ask SceneLink Concierge</span>
                </div>
                <div class="concierge-pulse-ring"></div>
            `;
            document.body.appendChild(button);
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.id = this.panelId;
            panel.innerHTML = `
                <div class="concierge-header">
                    <div class="concierge-branding">
                        <div class="concierge-logo">✨</div>
                        <div class="concierge-title">
                            <h3>SceneLink Concierge</h3>
                            <p>Your personal nightlife expert</p>
                        </div>
                    </div>
                    <button class="concierge-close" onclick="window.SceneLinkConcierge.hidePanel()">×</button>
                </div>
                <div class="concierge-messages" id="concierge-messages">
                    <div class="concierge-message ai">
                        <div class="concierge-avatar">✨</div>
                        <div class="concierge-bubble">
                            <p>👋 Welcome to SceneLink! I'm your personal nightlife expert. What kind of vibe are you looking for tonight?</p>
                            <div class="time">Just now</div>
                        </div>
                    </div>
                </div>
                <div class="concierge-input-section">
                    <div class="quick-actions">
                        <button class="quick-action-chip" onclick="window.SceneLinkConcierge.quickAction('date-night')">
                            💕 Date night spot
                        </button>
                        <button class="quick-action-chip" onclick="window.SceneLinkConcierge.quickAction('cocktail-bars')">
                            🍸 Best cocktail bars
                        </button>
                        <button class="quick-action-chip" onclick="window.SceneLinkConcierge.quickAction('group-hang')">
                            🎉 Group hang for 4-6
                        </button>
                        <button class="quick-action-chip" onclick="window.SceneLinkConcierge.quickAction('top-picks')">
                            ⭐ Top picks tonight
                        </button>
                    </div>
                    <div class="concierge-input-wrapper">
                        <input type="text" id="concierge-input" placeholder="Ask me anything about Boston nightlife..." />
                        <button id="concierge-send" onclick="window.SceneLinkConcierge.sendMessage()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
        }

        injectStyles() {
            if (document.getElementById('concierge-widget-styles')) return;

            const styles = document.createElement('style');
            styles.id = 'concierge-widget-styles';
            styles.innerHTML = `
                #${this.buttonId} {
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

                #${this.buttonId}:hover {
                    transform: scale(1.05);
                    box-shadow: 0 12px 40px rgba(212, 175, 55, 0.5), 0 0 0 2px rgba(212, 175, 55, 0.3);
                }

                .concierge-btn-content {
                    position: relative;
                    z-index: 2;
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

                #${this.buttonId}:hover .concierge-tooltip {
                    opacity: 1;
                    transform: translateX(-8px);
                }

                .concierge-pulse-ring {
                    position: absolute;
                    top: -2px;
                    left: -2px;
                    width: 72px;
                    height: 72px;
                    border: 1px solid rgba(212, 175, 55, 0.3);
                    border-radius: 50%;
                    animation: concierge-pulse 4s ease-in-out infinite;
                    opacity: 0;
                }

                @keyframes concierge-pulse {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 0;
                    }
                    50% {
                        transform: scale(1.15);
                        opacity: 0.3;
                    }
                }

                #${this.panelId} {
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

                #${this.panelId}.active {
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

                .concierge-title h3 {
                    margin: 0;
                    font-size: 18px;
                    color: #D4AF37;
                    font-weight: 600;
                }

                .concierge-title p {
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
                    #${this.buttonId} {
                        bottom: 20px;
                        right: 20px;
                        width: 60px;
                        height: 60px;
                    }

                    #${this.panelId} {
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

        attachEvents() {
            const button = document.getElementById(this.buttonId);
            const input = document.getElementById('concierge-input');
            const sendBtn = document.getElementById('concierge-send');

            if (button) {
                button.addEventListener('click', () => this.showPanel());
            }

            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.sendMessage();
                    }
                });
            }

            if (sendBtn) {
                sendBtn.addEventListener('click', () => this.sendMessage());
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hidePanel();
                }
            });

            document.addEventListener('click', (e) => {
                const panel = document.getElementById(this.panelId);
                const button = document.getElementById(this.buttonId);
                
                if (panel && panel.classList.contains('active') && 
                    !panel.contains(e.target) && 
                    !button.contains(e.target)) {
                    this.hidePanel();
                }
            });
        }

        showPanel() {
            const panel = document.getElementById(this.panelId);
            const button = document.getElementById(this.buttonId);
            
            if (panel) {
                panel.classList.add('active');
                const input = document.getElementById('concierge-input');
                if (input) input.focus();
                
                setTimeout(() => {
                    if (button) button.style.display = 'none';
                }, 300);
            }
        }

        hidePanel() {
            const panel = document.getElementById(this.panelId);
            const button = document.getElementById(this.buttonId);
            
            if (panel) {
                panel.classList.remove('active');
                
                setTimeout(() => {
                    if (button) button.style.display = 'flex';
                }, 300);
            }
        }

        sendMessage() {
            const input = document.getElementById('concierge-input');
            const message = input.value.trim();
            
            if (!message) return;
            
            this.addMessage(message, 'user');
            input.value = '';
            
            setTimeout(() => {
                const responses = [
                    "Great question! Let me find some perfect spots for you.",
                    "Based on what you're looking for, I'd recommend checking out:",
                    "I know just the place! Here are my top suggestions:",
                    "Perfect! Here are some amazing options for your night out:"
                ];
                const response = responses[Math.floor(Math.random() * responses.length)];
                this.addMessage(response, 'ai');
            }, 1000);
        }

        addMessage(text, sender) {
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
        }

        quickAction(type) {
            const messages = {
                'date-night': "Find me a romantic spot for date night",
                'cocktail-bars': "What are the best cocktail bars near me?",
                'group-hang': "I need a chill spot for a group of 4-6 people",
                'top-picks': "Show me the top picks for tonight"
            };
            
            const message = messages[type];
            const input = document.getElementById('concierge-input');
            if (input) {
                input.value = message;
                this.sendMessage();
            }
        }
    }

    // Initialize the widget
    window.SceneLinkConcierge = new SceneLinkConcierge();
})();