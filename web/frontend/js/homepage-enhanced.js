// Enhanced Homepage JavaScript
document.addEventListener('DOMContentLoaded', function() {
    
    // AI Search Toggle Functionality (guard against missing elements)
    var aiSearchToggle = document.getElementById('aiSearchToggle');
    var heroSearchAI = document.getElementById('heroSearchAI');
    var heroSearchBtn = document.getElementById('heroSearchBtn');
    var aiMode = false;
    
    if (aiSearchToggle && heroSearchAI) {
        aiSearchToggle.addEventListener('click', function() {
            aiMode = !aiMode;
            if (aiMode) {
                heroSearchAI.placeholder = "AI-powered: 'Where should I go for date night tonight?'";
                aiSearchToggle.style.background = 'var(--gold-light)';
            } else {
                heroSearchAI.placeholder = "Search restaurants, bars, events...";
                aiSearchToggle.style.background = 'var(--gold-primary)';
            }
        });
    }
    
    // Enhanced Search Functionality
    if (heroSearchBtn && heroSearchAI) {
        heroSearchBtn.addEventListener('click', function() {
            var searchQuery = heroSearchAI.value.trim();
            if (searchQuery) {
                window.location.href = 'explore.html?search=' + encodeURIComponent(searchQuery);
            }
        });
        
        heroSearchAI.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                heroSearchBtn.click();
            }
        });
    }
    
    // Category Chips Functionality
    const categoryChips = document.querySelectorAll('.category-chip');
    categoryChips.forEach(chip => {
        chip.addEventListener('click', function() {
            const category = this.getAttribute('data-category');
            window.location.href = `explore.html?category=${category}`;
        });
    });
    
    // Map Action Chips Functionality
    const actionChips = document.querySelectorAll('.action-chip');
    actionChips.forEach(chip => {
        chip.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            
            // Remove active class from all chips
            actionChips.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked chip
            this.classList.add('active');
            
            // Filter map markers (this would integrate with Google Maps)
            filterMapMarkers(filter);
        });
    });
    
    // Group Planning Tool Actions
    const toolActionBtns = document.querySelectorAll('.btn-tool-action');
    toolActionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.textContent;
            handleGroupPlanningAction(action);
        });
    });
    
    // Social Feed Actions
    const feedActionBtns = document.querySelectorAll('.feed-action-btn');
    feedActionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.textContent;
            handleFeedAction(this, action);
        });
    });
    
    // View Full Social Feed
    const btnFeedFull = document.querySelector('.btn-feed-full');
    if (btnFeedFull) {
        btnFeedFull.addEventListener('click', function() {
            window.location.href = 'my-lists.html#social-feed';
        });
    }
    
    // View All Venues Button
    const viewAllBtn = document.getElementById('viewAllBtn');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', function() {
            window.location.href = 'explore.html';
        });
    }
    
    // City Selector
    const citySelector = document.getElementById('citySelector');
    if (citySelector) {
        citySelector.addEventListener('change', function() {
            const selectedCity = this.value;
            if (selectedCity !== 'boston') {
                // Show coming soon message for other cities
                showNotification(`${this.options[this.selectedIndex].text} - Coming Soon!`);
                this.value = 'boston'; // Reset to Boston
            } else {
                // Update map for Boston
                updateMapForCity(selectedCity);
            }
        });
    }
    
    // Mobile Menu Functionality
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navEnhanced = document.querySelector('.nav-enhanced');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            navEnhanced.classList.toggle('mobile-menu-open');
        });
    }
    
    // Header Scroll Effect
    const headerEnhanced = document.querySelector('.header-enhanced');
    let lastScroll = 0;
    
    if (headerEnhanced) {
        window.addEventListener('scroll', function() {
            const currentScroll = window.pageYOffset;
            
            if (currentScroll > 100) {
                headerEnhanced.style.background = 'rgba(10, 10, 10, 0.98)';
                headerEnhanced.style.backdropFilter = 'blur(20px)';
            } else {
                headerEnhanced.style.background = 'rgba(10, 10, 10, 0.95)';
                headerEnhanced.style.backdropFilter = 'blur(10px)';
            }
            
            lastScroll = currentScroll;
        });
    }
    
    // Initialize tooltips for better UX
    initializeTooltips();
    
    // Load initial map data
    initializeMap();
});

// Helper Functions

function filterMapMarkers(filter) {
    // This function would integrate with Google Maps API
    console.log(`Filtering map markers for: ${filter}`);
    showNotification(`Showing ${filter} near you`);
}

function handleGroupPlanningAction(action) {
    switch(action) {
        case 'Create Group':
            showNotification('Group creation feature coming soon!');
            break;
        case 'Start Voting':
            showNotification('Voting feature coming soon!');
            break;
        case 'Plan Event':
            showNotification('Event planning feature coming soon!');
            break;
        case 'Share List':
            window.location.href = 'my-lists.html';
            break;
        default:
            showNotification('Feature coming soon!');
    }
}

function handleFeedAction(button, action) {
    if (action.includes('❤️')) {
        const currentCount = parseInt(action.match(/\d+/)[0]);
        button.textContent = `❤️ ${currentCount + 1}`;
        button.style.color = 'var(--gold-primary)';
    } else if (action.includes('💬')) {
        showNotification('Comment feature coming soon!');
    } else if (action.includes('📍')) {
        showNotification('Location feature coming soon!');
    }
}

function updateMapForCity(city) {
    // This function would update the Google Maps for different cities
    console.log(`Updating map for city: ${city}`);
    showNotification(`Map updated for ${city}`);
}

function initializeMap() {
    // Initialize Google Maps with Boston coordinates
    console.log('Initializing map...');
    // This would integrate with Google Maps API
}

function initializeTooltips() {
    // Add hover tooltips for better UX
    const elementsWithTooltips = document.querySelectorAll('[title]');
    elementsWithTooltips.forEach(element => {
        element.addEventListener('mouseenter', function() {
            showTooltip(this, this.getAttribute('title'));
        });
        
        element.addEventListener('mouseleave', function() {
            hideTooltip();
        });
    });
}

function showNotification(message) {
    // Create and show a notification
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: var(--gold-primary);
        color: var(--dark-bg);
        padding: 1rem 1.5rem;
        border-radius: var(--radius-lg);
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: var(--shadow-lg);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function showTooltip(element, text) {
    // Tooltip functionality
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    tooltip.textContent = text;
    tooltip.style.cssText = `
        position: absolute;
        background: var(--dark-elevated);
        color: var(--text-primary);
        padding: 0.5rem 1rem;
        border-radius: var(--radius-sm);
        font-size: 0.9rem;
        z-index: 10000;
        pointer-events: none;
        white-space: nowrap;
        box-shadow: var(--shadow-md);
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
}

function hideTooltip() {
    const tooltip = document.querySelector('.custom-tooltip');
    if (tooltip) {
        document.body.removeChild(tooltip);
    }
}

// Add CSS animations dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .action-chip.active {
        background: var(--gold-primary) !important;
        color: var(--dark-bg) !important;
    }
    
    @media (max-width: 768px) {
        .hero-search-box-enhanced {
            flex-direction: column;
            gap: var(--spacing-md);
        }
        
        .hospitality-grid-centered {
            grid-template-columns: 1fr;
            gap: var(--spacing-lg);
        }
        
        .planning-tools-grid {
            grid-template-columns: 1fr;
        }
        
        .map-quick-actions {
            justify-content: flex-start;
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: var(--spacing-md);
        }
    }
`;
document.head.appendChild(style);