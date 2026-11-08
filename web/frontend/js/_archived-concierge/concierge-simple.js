/**
 * Simple SceneLink Concierge - Direct Integration
 * Minimal conflict version for immediate testing
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    function initConcierge() {
        // Remove any existing old chat elements first
        const oldButton = document.getElementById('aiChatButton');
        const oldWindow = document.getElementById('aiChatWindow');
        if (oldButton) oldButton.remove();
        if (oldWindow) oldWindow.remove();

        // Create the floating button
        const button = document.createElement('button');
        button.id = 'sceneLinkConciergeBtn';
        button.className = 'concierge-button';
        button.innerHTML = `
            <div class="concierge-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                    <circle cx="9" cy="11" r="1" fill="currentColor"></circle>
                    <circle cx="15" cy="11" r="1" fill="currentColor"></circle>
                </svg>
            </div>
        `;
        button.setAttribute('title', 'Ask SceneLink Concierge');

        // Create the chat panel
        const panel = document.createElement('div');
        panel.id = 'sceneLinkConciergePanel';
        panel.className = 'concierge-panel';
        panel.innerHTML = `
            <div class="concierge-header">
                <div class="concierge-header-content">
                    <div class="concierge-logo">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                            <line x1="9" y1="9" x2="9.01" y2="9"></line>
                            <line x1="15" y1="9" x2="15.01" y2="9"></line>
                        </svg>
                    </div>
                    <div class="concierge-header-text">
                        <h3>SceneLink Concierge</h3>
                        <p>Your personal guide for tonight's plans</p>
                    </div>
                </div>
                <button class="concierge-close" onclick="toggleConcierge()">×</button>
            </div>
            <div class="concierge-messages" id="conciergeMessages">
                <div class="concierge-message ai-message">
                    <div class="message-content">
                        <div class="message-text">
                            👋 Hey! I'm the SceneLink Concierge. Tell me your vibe, budget, and neighborhood and I'll suggest perfect spots for tonight!
                        </div>
                        <div class="message-time">Just now</div>
                    </div>
                </div>
            </div>
            <div class="concierge-quick-actions">
                <button class="concierge-quick-chip" onclick="quickAction('date')">🍷 Date Night</button>
                <button class="concierge-quick-chip" onclick="quickAction('group')">👥 Group Hang</button>
                <button class="concierge-quick-chip" onclick="quickAction('chill')">😌 Chill</button>
                <button class="concierge-quick-chip" onclick="quickAction('party')">🎉 Big Night Out</button>
            </div>
            <div class="concierge-input-container">
                <div class="concierge-input-wrapper">
                    <input type="text" class="concierge-input" id="conciergeInput" placeholder="Ask where to go tonight..." onkeypress="handleInput(event)">
                    <button class="concierge-send" onclick="sendMessage()">→</button>
                </div>
            </div>
        `;

        // Add to body
        document.body.appendChild(button);
        document.body.appendChild(panel);

        // Add styles
        if (!document.getElementById('concierge-styles')) {
            const style = document.createElement('style');
            style.id = 'concierge-styles';
            style.textContent = `
                .concierge-button {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    width: 68px;
                    height: 68px;
                    background: linear-gradient(135deg, #d4af37 0%, #e5c158 50%, #f5d06c 100%);
                    border: 3px solid rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    box-shadow: 0 8px 32px rgba(212, 175, 55, 0.5);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    transition: all 0.3s ease;
                }
                .concierge-button:hover {
                    transform: scale(1.1);
                    box-shadow: 0 12px 40px rgba(212, 175, 55, 0.7);
                }
                .concierge-button .concierge-icon svg {
                    color: #0a0a0a;
                }
                .concierge-panel {
                    position: fixed;
                    bottom: 100px;
                    right: 24px;
                    width: 420px;
                    height: 600px;
                    background: linear-gradient(135deg, rgba(26, 26, 26, 0.98), rgba(15, 15, 15, 0.98));
                    backdrop-filter: blur(20px);
                    border: 2px solid rgba(212, 175, 55, 0.3);
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
                    display: none;
                    flex-direction: column;
                    z-index: 9998;
                    overflow: hidden;
                }
                .concierge-panel.open {
                    display: flex;
                }
                .concierge-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px;
                    background: linear-gradient(135deg, rgba(10, 10, 10, 0.9), rgba(20, 20, 20, 0.9));
                    border-bottom: 1px solid rgba(212, 175, 55, 0.3);
                }
                .concierge-header-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .concierge-logo {
                    width: 40px;
                    height: 40px;
                    background: linear-gradient(135deg, #d4af37, #e5c158);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #0a0a0a;
                }
                .concierge-header-text h3 {
                    color: #d4af37;
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0;
                }
                .concierge-header-text p {
                    color: #b0b0b0;
                    font-size: 13px;
                    margin: 2px 0 0 0;
                }
                .concierge-close {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 18px;
                    transition: all 0.3s ease;
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
                .concierge-message {
                    max-width: 85%;
                }
                .concierge-message.ai-message {
                    align-self: flex-start;
                }
                .concierge-message.user-message {
                    align-self: flex-end;
                }
                .message-content {
                    padding: 12px 16px;
                    border-radius: 16px;
                }
                .ai-message .message-content {
                    background: rgba(42, 42, 42, 0.8);
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .user-message .message-content {
                    background: linear-gradient(135deg, #d4af37, #c49b2a);
                    color: #0a0a0a;
                }
                .message-text {
                    line-height: 1.4;
                    font-size: 14px;
                }
                .message-time {
                    font-size: 11px;
                    opacity: 0.5;
                    margin-top: 6px;
                }
                .concierge-quick-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    padding: 0 20px;
                    margin-bottom: 12px;
                }
                .concierge-quick-chip {
                    background: rgba(212, 175, 55, 0.1);
                    border: 1px solid rgba(212, 175, 55, 0.2);
                    color: #e5c158;
                    padding: 8px 14px;
                    border-radius: 20px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    border: none;
                }
                .concierge-quick-chip:hover {
                    background: rgba(212, 175, 55, 0.2);
                    transform: translateY(-1px);
                }
                .concierge-input-container {
                    padding: 16px 20px 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                }
                .concierge-input-wrapper {
                    display: flex;
                    gap: 8px;
                }
                .concierge-input {
                    flex: 1;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 12px 16px;
                    color: #fff;
                    font-size: 14px;
                    outline: none;
                }
                .concierge-input:focus {
                    border-color: #d4af37;
                }
                .concierge-send {
                    width: 44px;
                    height: 44px;
                    background: linear-gradient(135deg, #d4af37, #c49b2a);
                    border: none;
                    border-radius: 12px;
                    color: #0a0a0a;
                    cursor: pointer;
                    font-size: 18px;
                    font-weight: bold;
                    transition: all 0.3s ease;
                }
                .concierge-send:hover {
                    transform: scale(1.05);
                }
                @media (max-width: 768px) {
                    .concierge-panel {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        width: 100%;
                        height: 85vh;
                        border-radius: 20px 20px 0 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Global functions for onclick handlers
        window.toggleConcierge = function() {
            const panel = document.getElementById('sceneLinkConciergePanel');
            const isOpen = panel.classList.contains('open');
            if (isOpen) {
                panel.classList.remove('open');
            } else {
                panel.classList.add('open');
            }
        };

        window.quickAction = function(type) {
            const messages = {
                'date': "Looking for a romantic date night spot? Let me find some perfect options for you!",
                'group': "Great! A group hang. I'll find spots that work well for groups.",
                'chill': "Perfect! A chill vibe. Let me suggest some relaxed spots.",
                'party': "Big night out! I'll find some energetic venues for you."
            };
            
            addMessage(messages[type] || "Let me find some great options for you!", 'ai');
            
            // Show some sample venues
            setTimeout(() => {
                addMessage("Here are some spots I recommend:", 'ai');
                addVenueCard({
                    name: "Club Nova",
                    description: "High-energy nightclub with VIP bottle service",
                    price: "$$$",
                    neighborhood: "Downtown",
                    tags: ["Nightclub", "Dancing", "VIP"]
                });
                addVenueCard({
                    name: "The Garden Terrace", 
                    description: "Rooftop lounge with city views",
                    price: "$$",
                    neighborhood: "Seaport",
                    tags: ["Rooftop", "Outdoor", "Views"]
                });
            }, 800);
        };

        window.sendMessage = function() {
            const input = document.getElementById('conciergeInput');
            const message = input.value.trim();
            if (!message) return;
            
            addMessage(message, 'user');
            input.value = '';
            
            // Simple response
            setTimeout(() => {
                addMessage("Thanks for your message! I'm finding the perfect spots for you based on your preferences...", 'ai');
            }, 500);
        };

        window.handleInput = function(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        };

        function addMessage(text, sender) {
            const messagesContainer = document.getElementById('conciergeMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `concierge-message ${sender}-message`;
            
            const timestamp = new Date().toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit' 
            });

            messageDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-text">${text}</div>
                    <div class="message-time">${timestamp}</div>
                </div>
            `;

            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function addVenueCard(venue) {
            const messagesContainer = document.getElementById('conciergeMessages');
            const venueDiv = document.createElement('div');
            venueDiv.className = 'venue-card';
            venueDiv.style.cssText = `
                background: rgba(42, 42, 42, 0.8);
                border: 1px solid rgba(212, 175, 55, 0.2);
                border-radius: 12px;
                padding: 16px;
                margin: 8px 0;
                cursor: pointer;
                transition: all 0.3s ease;
            `;
            venueDiv.innerHTML = `
                <h4 style="color: #d4af37; margin: 0 0 8px 0;">${venue.name}</h4>
                <p style="color: #fff; margin: 0 0 8px 0;">${venue.description}</p>
                <div style="color: #b0b0b0; font-size: 12px;">
                    ${venue.price} • ${venue.neighborhood} • ${venue.tags.join(' • ')}
                </div>
            `;
            venueDiv.onmouseover = () => venueDiv.style.transform = 'translateY(-2px)';
            venueDiv.onmouseout = () => venueDiv.style.transform = 'translateY(0)';
            
            messagesContainer.appendChild(venueDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Click handler for button
        button.addEventListener('click', toggleConcierge);
        
        // First visit pulse animation
        if (!localStorage.getItem('concierge-visited')) {
            button.style.animation = 'pulse 6s ease-in-out';
            localStorage.setItem('concierge-visited', 'true');
            
            // Add pulse keyframes
            const pulseStyle = document.createElement('style');
            pulseStyle.textContent = `
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 8px 32px rgba(212, 175, 55, 0.5); }
                    50% { box-shadow: 0 8px 32px rgba(212, 175, 55, 0.5), 0 0 0 15px rgba(212, 175, 55, 0.3); }
                }
            `;
            document.head.appendChild(pulseStyle);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConcierge);
    } else {
        initConcierge();
    }

    console.log('🎉 SceneLink Concierge loaded successfully!');
})();