/**
 * SceneLink Concierge Widget - Enhanced UI Component
 * Handles the floating button and chat panel interface
 */

class SceneLinkConciergeWidget {
    constructor() {
        this.isOpen = false;
        this.hasAnimatedFirstTime = false;
        this.init();
    }

    init() {
        this.createConciergeUI();
        this.setupEventListeners();
        this.checkFirstVisit();
        this.detectCurrentPage();
    }

    // ============================================
    // UI CREATION
    // ============================================

    createConciergeUI() {
        const conciergeHTML = `
            <!-- SceneLink Concierge Button -->
            <button class="concierge-button" id="conciergeButton" 
                    data-tooltip="Ask SceneLink Concierge"
                    aria-label="Ask SceneLink Concierge">
                <div class="concierge-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                        <circle cx="9" cy="11" r="1" fill="currentColor"></circle>
                        <circle cx="15" cy="11" r="1" fill="currentColor"></circle>
                    </svg>
                </div>
                <div class="concierge-pulse-ring"></div>
            </button>

            <!-- SceneLink Concierge Panel -->
            <div class="concierge-panel" id="conciergePanel">
                <!-- Panel Header -->
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
                    <div class="concierge-header-actions">
                        <button class="concierge-minimize" id="conciergeMinimize" title="Minimize">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button class="concierge-close" id="conciergeClose" title="Close">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Messages Container -->
                <div class="concierge-messages" id="conciergeMessages">
                    <!-- Messages will be dynamically added here -->
                </div>

                <!-- Quick Actions Container -->
                <div class="concierge-quick-actions" id="conciergeQuickActions">
                    <!-- Quick actions will be dynamically added here -->
                </div>

                <!-- Input Container -->
                <div class="concierge-input-container">
                    <div class="concierge-input-wrapper">
                        <input 
                            type="text" 
                            class="concierge-input" 
                            id="conciergeInput" 
                            placeholder="Ask where to go tonight..."
                            autocomplete="off"
                            maxlength="200"
                        >
                        <button class="concierge-send" id="conciergeSend" title="Send message">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove any existing concierge elements
        this.removeExistingConcierge();
        
        // Add new concierge UI
        document.body.insertAdjacentHTML('beforeend', conciergeHTML);
    }

    removeExistingConcierge() {
        const existingButton = document.getElementById('aiChatButton');
        const existingWindow = document.getElementById('aiChatWindow');
        
        if (existingButton) existingButton.remove();
        if (existingWindow) existingWindow.remove();
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        // Main button
        const conciergeButton = document.getElementById('conciergeButton');
        conciergeButton?.addEventListener('click', () => this.toggleConcierge());

        // Header controls
        document.getElementById('conciergeClose')?.addEventListener('click', () => this.closeConcierge());
        document.getElementById('conciergeMinimize')?.addEventListener('click', () => this.minimizeConcierge());

        // Input controls
        const sendBtn = document.getElementById('conciergeSend');
        const input = document.getElementById('conciergeInput');

        sendBtn?.addEventListener('click', () => this.handleUserInput());
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleUserInput();
            }
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isOpen && !e.target.closest('.concierge-panel') && !e.target.closest('.concierge-button')) {
                this.closeConcierge();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeConcierge();
            }
        });
    }

    // ============================================
    // UI STATE MANAGEMENT
    // ============================================

    toggleConcierge() {
        if (this.isOpen) {
            this.closeConcierge();
        } else {
            this.openConcierge();
        }
    }

    openConcierge() {
        this.isOpen = true;
        const panel = document.getElementById('conciergePanel');
        const button = document.getElementById('conciergeButton');

        panel.classList.add('open');
        button.classList.add('active');

        // Focus input after animation
        setTimeout(() => {
            document.getElementById('conciergeInput')?.focus();
        }, 300);

        // Mark first open as complete
        this.hasAnimatedFirstTime = true;
        localStorage.setItem('scenelink-concierge-visited', 'true');
    }

    closeConcierge() {
        this.isOpen = false;
        const panel = document.getElementById('conciergePanel');
        const button = document.getElementById('conciergeButton');

        panel.classList.remove('open');
        button.classList.remove('active');
    }

    minimizeConcierge() {
        // Simple close for now - could expand to minimize state
        this.closeConcierge();
    }

    // ============================================
    // VISITOR DETECTION
    // ============================================

    checkFirstVisit() {
        const hasVisited = localStorage.getItem('scenelink-concierge-visited');
        
        if (!hasVisited) {
            this.triggerFirstTimePulse();
        }
    }

    triggerFirstTimePulse() {
        const button = document.getElementById('conciergeButton');
        if (button) {
            button.classList.add('first-time-pulse');
            
            // Remove pulse after 6 seconds
            setTimeout(() => {
                button.classList.remove('first-time-pulse');
            }, 6000);
        }
    }

    // ============================================
    // PAGE DETECTION
    // ============================================

    detectCurrentPage() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop() || 'index.html';

        // Map file names to page types
        const pageMap = {
            'index.html': 'home',
            'tonight.html': 'tonights-picks',
            'explore.html': 'explore',
            'nightlife.html': 'nightlife',
            'events.html': 'events',
            'social-feed.html': 'social',
            'profile.html': 'profile',
            'my-lists.html': 'lists'
        };

        this.currentPage = pageMap[filename] || 'other';
        
        // Set data attribute for styling
        document.body.setAttribute('data-concierge-page', this.currentPage);
    }

    // ============================================
    // INPUT HANDLING
    // ============================================

    handleUserInput() {
        const input = document.getElementById('conciergeInput');
        const message = input.value.trim();

        if (!message) return;

        // Emit event for the logic layer
        window.sceneLinkConciergeLogic?.handleUserMessage(message, this.currentPage);

        // Clear input
        input.value = '';
    }

    // ============================================
    // MESSAGE DISPLAY
    // ============================================

    addMessage(text, sender = 'ai', options = {}) {
        const messagesContainer = document.getElementById('conciergeMessages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `concierge-message ${sender}-message`;
        
        if (options.isTyping) {
            messageDiv.classList.add('typing-indicator');
        }

        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit' 
        });

        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-text">${text}</div>
                ${options.meta ? `<div class="message-meta">${options.meta}</div>` : ''}
                <div class="message-time">${timestamp}</div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return messageDiv;
    }

    showTypingIndicator() {
        const typingDiv = this.addMessage('', 'ai', { isTyping: true });
        typingDiv.id = 'conciergeTypingIndicator';
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('conciergeTypingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    clearMessages() {
        const messagesContainer = document.getElementById('conciergeMessages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
    }

    // ============================================
    // QUICK ACTIONS
    // ============================================

    showQuickActions(actions) {
        const container = document.getElementById('conciergeQuickActions');
        if (!container) return;

        container.innerHTML = '';

        if (!actions || actions.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        actions.forEach(action => {
            const chip = document.createElement('button');
            chip.className = 'concierge-quick-chip';
            chip.textContent = action.label;
            chip.addEventListener('click', () => {
                window.sceneLinkConciergeLogic?.handleQuickAction(action);
            });
            container.appendChild(chip);
        });
    }

    hideQuickActions() {
        const container = document.getElementById('conciergeQuickActions');
        if (container) {
            container.style.display = 'none';
        }
    }

    // ============================================
    // VENUE CARDS
    // ============================================

    addVenueCards(venues) {
        const messagesContainer = document.getElementById('conciergeMessages');
        if (!messagesContainer || !venues || venues.length === 0) return;

        const venuesContainer = document.createElement('div');
        venuesContainer.className = 'concierge-venues-container';

        venues.forEach(venue => {
            const venueCard = this.createVenueCard(venue);
            venuesContainer.appendChild(venueCard);
        });

        messagesContainer.appendChild(venuesContainer);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    createVenueCard(venue) {
        const card = document.createElement('div');
        card.className = 'concierge-venue-card';

        const tags = venue.tags.map(tag => 
            `<span class="venue-tag">${tag}</span>`
        ).join('');

        card.innerHTML = `
            <div class="venue-card-header">
                <div class="venue-info">
                    <h4 class="venue-name">${venue.name}</h4>
                    <p class="venue-description">${venue.description}</p>
                    <div class="venue-meta">
                        <span class="venue-price">${venue.price}</span>
                        <span class="venue-neighborhood">${venue.neighborhood}</span>
                        <span class="venue-hours">${venue.hours}</span>
                    </div>
                </div>
                ${venue.image ? `<img src="${venue.image}" alt="${venue.name}" class="venue-image">` : ''}
            </div>
            <div class="venue-tags">${tags}</div>
            <div class="venue-actions">
                <button class="venue-btn venue-btn-primary" data-venue-id="${venue.id}">
                    View Details
                </button>
                <button class="venue-btn venue-btn-secondary save-venue" data-venue-id="${venue.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
            </div>
        `;

        // Add event listeners
        const viewBtn = card.querySelector('.venue-btn-primary');
        const saveBtn = card.querySelector('.save-venue');

        viewBtn?.addEventListener('click', () => {
            window.sceneLinkConciergeLogic?.handleVenueDetails(venue);
        });

        saveBtn?.addEventListener('click', () => {
            this.toggleVenueSave(saveBtn, venue);
        });

        return card;
    }

    toggleVenueSave(button, venue) {
        const isSaved = button.classList.toggle('saved');
        
        // Update visual state
        if (isSaved) {
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            `;
        } else {
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            `;
        }

        // Notify logic layer
        window.sceneLinkConciergeLogic?.handleVenueSave(venue, isSaved);
    }
}

// Initialize widget when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.sceneLinkConciergeWidget = new SceneLinkConciergeWidget();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SceneLinkConciergeWidget;
}