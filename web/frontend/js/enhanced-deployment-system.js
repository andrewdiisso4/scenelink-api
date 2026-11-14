// Enhanced Deployment System
// Applies all consistency improvements across all pages

class EnhancedDeploymentSystem {
    constructor() {
        this.pages = [
            'index.html',
            'explore.html',
            'explore-v2.html',
            'events.html',
            'nightlife.html',
            'tonight.html',
            'social-feed.html'
        ];
        
        this.requiredCSS = [
            'css/universal-enhanced-header.css?v=connected-20261112-auth2',
            'css/page-header-consistent.css?v=connected-20261112-auth2',
            'css/openstreet-map-integration.css?v=connected-20261112-auth2'
        ];
        
        this.requiredJS = [
            'js/universal-header-consistency.js?v=connected-20261112-auth2',
            'js/openstreet-map-integration.js?v=connected-20261112-auth2'
        ];
        
        this.init();
    }

    init() {
        console.log('Enhanced Deployment System initialized');
        this.detectCurrentPage();
        this.applyUniversalEnhancements();
        this.setupPageSpecificFeatures();
        this.initializeMapIntegration();
        this.verifyDeployment();
    }

    detectCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        this.currentPage = filename;
        console.log('Current page detected:', this.currentPage);
    }

    applyUniversalEnhancements() {
        // Apply universal header CSS if not already present
        this.ensureCSSLoaded('css/universal-enhanced-header.css?v=connected-20261112-auth2');
        
        // Apply universal header JavaScript
        this.ensureJSLoaded('js/universal-header-consistency.js?v=connected-20261112-auth2');
        
        // Apply consistent footer
        this.updateFooterBrand();
        
        // Apply consistent page headers
        this.updatePageHeaders();
    }

    ensureCSSLoaded(cssPath) {
        if (!document.querySelector(`link[href="${cssPath}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssPath;
            document.head.appendChild(link);
            console.log('CSS loaded:', cssPath);
        }
    }

    ensureJSLoaded(jsPath) {
        if (!document.querySelector(`script[src="${jsPath}"]`)) {
            const script = document.createElement('script');
            script.src = jsPath;
            document.body.appendChild(script);
            console.log('JavaScript loaded:', jsPath);
        }
    }

    updateFooterBrand() {
        const footerBrandImg = document.querySelector('body > footer > div > div.footer-main > div.footer-brand > img');
        if (footerBrandImg) {
            // Update to new SceneLink logo
            footerBrandImg.src = 'images/scenelinkheaderlogo.png';
            footerBrandImg.alt = 'SceneLink';
            console.log('Footer brand image updated');
        }
    }

    updatePageHeaders() {
        // Standardize page headers across all pages
        const headerSelectors = [
            '.explore-page-header',
            '.events-page-header',
            '.nightlife-page-header'
        ];
        
        headerSelectors.forEach(selector => {
            const header = document.querySelector(selector);
            if (header) {
                this.standardizeHeaderStructure(header);
            }
        });
    }

    standardizeHeaderStructure(headerElement) {
        // Apply consistent styling to page headers
        if (!headerElement.classList.contains('page-header')) {
            headerElement.classList.add('page-header');
        }
        
        // Ensure consistent structure
        const container = headerElement.querySelector('.container') || 
                         headerElement.querySelector('.content-wrapper');
        
        if (container) {
            const h1 = container.querySelector('h1');
            const p = container.querySelector('p');
            
            if (h1 && p) {
                // Apply consistent styling
                h1.style.fontSize = 'clamp(2.5rem, 5vw, 4rem)';
                h1.style.fontWeight = '700';
                h1.style.color = 'var(--text-primary)';
                h1.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
                
                p.style.fontSize = '1.2rem';
                p.style.color = 'var(--text-secondary)';
                p.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.5)';
            }
        }
    }

    setupPageSpecificFeatures() {
        switch(this.currentPage) {
            case 'explore.html':
            case 'explore-v2.html':
                this.setupExplorePageFeatures();
                break;
            case 'events.html':
                this.setupEventsPageFeatures();
                break;
            case 'nightlife.html':
                this.setupNightlifePageFeatures();
                break;
            case 'tonight.html':
                this.setupTonightPicksFeatures();
                break;
            case 'index.html':
                this.setupHomePageFeatures();
                break;
        }
    }

    setupExplorePageFeatures() {
        // Add map integration to explore page
        this.ensureCSSLoaded('css/openstreet-map-integration.css?v=connected-20261112-auth2');
        this.ensureJSLoaded('js/openstreet-map-integration.js?v=connected-20261112-auth2');
        
        // Add map container if not present
        if (!document.querySelector('.map-container')) {
            this.insertMapContainer();
        }
        
        // Enhanced search filters
        this.addEnhancedFilters();
    }

    setupEventsPageFeatures() {
        // Add map integration to events page
        this.ensureCSSLoaded('css/openstreet-map-integration.css?v=connected-20261112-auth2');
        this.ensureJSLoaded('js/openstreet-map-integration.js?v=connected-20261112-auth2');
        
        // Add map container if not present
        if (!document.querySelector('.map-container')) {
            this.insertMapContainer();
        }
    }

    setupNightlifePageFeatures() {
        // Add map integration to nightlife page
        this.ensureCSSLoaded('css/openstreet-map-integration.css?v=connected-20261112-auth2');
        this.ensureJSLoaded('js/openstreet-map-integration.js?v=connected-20261112-auth2');
        
        // Add map container if not present
        if (!document.querySelector('.map-container')) {
            this.insertMapContainer();
        }
    }

    setupTonightPicksFeatures() {
        // Tonight's Picks already has enhanced filters
        console.log('Tonight\'s Picks features already applied');
    }

    setupHomePageFeatures() {
        // Add enhanced features to home page
        this.addHomePageMapIntegration();
    }

    insertMapContainer() {
        // Find appropriate location to insert map
        const contentSection = document.querySelector('.search-section') ||
                              document.querySelector('.content') ||
                              document.querySelector('main');
        
        if (contentSection) {
            const mapHTML = `
                <div class="map-section" style="margin: var(--spacing-xl) 0;">
                    <div class="container">
                        <h2 style="color: var(--text-primary); margin-bottom: var(--spacing-lg);">
                            Explore on Map
                        </h2>
                        <div class="map-container" id="venueMap" data-map-container="venueMap"></div>
                    </div>
                </div>
            `;
            
            contentSection.insertAdjacentHTML('afterbegin', mapHTML);
            console.log('Map container inserted');
        }
    }

    addEnhancedFilters() {
        // Add enhanced filters to pages that don't have them
        if (!document.querySelector('.enhanced-search-filters')) {
            const filtersHTML = `
                <!-- Enhanced Search Filters Section -->
                <section class="enhanced-search-filters">
                    <div class="enhanced-search-container">
                        <!-- Main Search Bar -->
                        <div class="enhanced-search-bar">
                            <div class="search-input-wrapper">
                                <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <path d="M21 21l-4.35-4.35"></path>
                                </svg>
                                <input type="text" class="search-input" placeholder="Search venues, events, or vibes...">
                            </div>
                            <button class="search-location-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                    <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                                Use My Location
                            </button>
                        </div>
                    </div>
                </section>
            `;
            
            const heroSection = document.querySelector('.page-header') ||
                               document.querySelector('.hero-section') ||
                               document.querySelector('header');
            
            if (heroSection) {
                heroSection.insertAdjacentHTML('afterend', filtersHTML);
                console.log('Enhanced filters added');
                
                // Load enhanced filters CSS and JS
                this.ensureCSSLoaded('css/tonights-picks-enhanced-filters.css?v=connected-20261112-auth2');
                this.ensureJSLoaded('js/enhanced-filters-interactive.js?v=connected-20261112-auth2');
            }
        }
    }

    addHomePageMapIntegration() {
        // Add a smaller map preview to home page
        const heroSection = document.querySelector('.hero') || document.querySelector('.hero-section');
        if (heroSection && !document.querySelector('.home-map-preview')) {
            const mapPreviewHTML = `
                <div class="home-map-preview" style="
                    margin: var(--spacing-xl) 0;
                    padding: 0 var(--spacing-lg);
                ">
                    <div class="container">
                        <h2 style="color: var(--text-primary); text-align: center; margin-bottom: var(--spacing-lg);">
                            Discover Boston's Best Spots
                        </h2>
                        <div class="map-container" style="height: 400px;" id="homeMap" data-map-container="homeMap"></div>
                        <div style="text-align: center; margin-top: var(--spacing-lg);">
                            <a href="explore.html" class="cta-button" style="
                                display: inline-block;
                                padding: var(--spacing-md) var(--spacing-xl);
                                background: var(--accent-gold);
                                color: var(--dark-primary);
                                text-decoration: none;
                                border-radius: var(--radius-full);
                                font-weight: 600;
                                transition: all 0.3s ease;
                            ">
                                Explore Full Map
                            </a>
                        </div>
                    </div>
                </div>
            `;
            
            heroSection.insertAdjacentHTML('afterend', mapPreviewHTML);
            
            this.ensureCSSLoaded('css/openstreet-map-integration.css?v=connected-20261112-auth2');
            this.ensureJSLoaded('js/openstreet-map-integration.js?v=connected-20261112-auth2');
            
            console.log('Home page map integration added');
        }
    }

    initializeMapIntegration() {
        // Initialize maps after a short delay to ensure DOM is ready
        setTimeout(() => {
            const mapContainers = document.querySelectorAll('[data-map-container]');
            mapContainers.forEach(container => {
                if (container && !container.hasAttribute('data-initialized')) {
                    try {
                        new window.OpenStreetMapIntegration(container.id, {
                            center: [42.3601, -71.0589],
                            zoom: 13
                        });
                        container.setAttribute('data-initialized', 'true');
                        console.log('Map initialized:', container.id);
                    } catch (error) {
                        console.error('Failed to initialize map:', error);
                    }
                }
            });
        }, 1000);
    }

    verifyDeployment() {
        // Verify all enhancements are properly deployed
        setTimeout(() => {
            const verification = {
                universalHeader: !!document.querySelector('.header-enhanced'),
                enhancedFilters: !!document.querySelector('.enhanced-search-filters'),
                mapIntegration: !!document.querySelector('.map-container'),
                updatedFooter: !!document.querySelector('footer img[src*="SceneLinkHeaderLogo"]'),
                consistentHeaders: !!document.querySelector('.page-header')
            };
            
            console.log('Deployment verification:', verification);
            
            // Display verification results
            this.displayVerificationResults(verification);
        }, 2000);
    }

    displayVerificationResults(results) {
        const allDeployed = Object.values(results).every(Boolean);
        
        if (allDeployed) {
            console.log('✅ All enhancements successfully deployed!');
            this.showSuccessNotification();
        } else {
            console.log('⚠️ Some enhancements may not be fully deployed:', results);
            this.showWarningNotification(results);
        }
    }

    showSuccessNotification() {
        // Disable success notifications
        console.log('✅ Enhanced SceneLink features successfully deployed!');
    }

    showWarningNotification(results) {
        // Disable warning notifications
        console.log('Features verification:', results);
    }
}

// Initialize deployment system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.enhancedDeployment = new EnhancedDeploymentSystem();
});

// Add notification animations
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
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
`;
document.head.appendChild(notificationStyles);