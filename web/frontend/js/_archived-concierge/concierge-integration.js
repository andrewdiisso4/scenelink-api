/**
 * SceneLink Concierge Integration Script
 * Replaces the old ai-chat-interface.js with the new enhanced concierge system
 */

// Load the new concierge modules in the correct order
function loadConciergeModules() {
    const modules = [
        'js/mockVenues.js?v=connected-20261110-3',
        'js/conciergeRecommender.js?v=connected-20261110-3',
        'js/conciergeState.js?v=connected-20261110-3',
        'js/conciergeWidget.js?v=connected-20261110-3',
        'js/conciergeLogic.js?v=connected-20261110-3'
    ];

    modules.forEach((src, index) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false; // Load in order
        script.onload = () => {
            console.log(`✅ Concierge module loaded: ${src}`);
            if (index === modules.length - 1) {
                console.log('🎉 SceneLink Concierge fully initialized!');
            }
        };
        script.onerror = () => {
            console.error(`❌ Failed to load concierge module: ${src}`);
        };
        document.head.appendChild(script);
    });
}

// Load the concierge CSS
function loadConciergeStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/concierge-styles.css?v=connected-20261110-3';
    link.onload = () => {
        console.log('✅ Concierge styles loaded');
    };
    link.onerror = () => {
        console.error('❌ Failed to load concierge styles');
    };
    document.head.appendChild(link);
}

// Initialize when DOM is ready
function initializeConcierge() {
    // Load styles first
    loadConciergeStyles();
    
    // Wait for DOM to be ready, then load modules
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadConciergeModules);
    } else {
        loadConciergeModules();
    }
}

// Start initialization
initializeConcierge();

// Clean up any old chat interface
function cleanupOldChatInterface() {
    // Remove old chat button
    const oldButton = document.getElementById('aiChatButton');
    if (oldButton) {
        oldButton.remove();
        console.log('🧹 Removed old AI chat button');
    }

    // Remove old chat window
    const oldWindow = document.getElementById('aiChatWindow');
    if (oldWindow) {
        oldWindow.remove();
        console.log('🧹 Removed old AI chat window');
    }

    // Remove old CSS if present
    const oldStyles = document.querySelector('link[href*="ai-chat-interface"]');
    if (oldStyles) {
        oldStyles.remove();
        console.log('🧹 Removed old AI chat styles');
    }
}

// Cleanup old interface immediately
cleanupOldChatInterface();

// Export for debugging
window.sceneLinkConciergeStatus = {
    modules: ['mockVenues', 'conciergeRecommender', 'conciergeState', 'conciergeWidget', 'conciergeLogic'],
    loaded: false,
    version: '2.0.0'
};

console.log('🚀 SceneLink Concierge integration script loaded');