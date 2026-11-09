// Smart Routing System - Enhanced Navigation & Page Transitions
// Handles intelligent routing to enhanced pages with smooth transitions

class SmartRouter {
    constructor() {
        // Explicit public route aliases from _redirects, plus the legacy profile page.
        this.routes = new Map();
        const aliases = {
            'social-feed.html': ['social-feed', 'social', 'social.html', 'feed', 'feed.html'],
            'my-lists.html': ['my-lists', 'lists', 'lists.html', 'saved', 'saved.html', 'favorites'],
            'profile.html': ['profile', 'profile-v2.html', 'friends', 'friends.html'],
            'explore.html': ['explore'],
            'plan-with-friends.html': ['plan-with-friends', 'group-planning', 'group', 'plan-night', 'plan', 'plan.html', 'plans', 'plans.html'],
            'events.html': ['events'],
            'nightlife.html': ['nightlife']
        };
        Object.entries(aliases).forEach(([target, paths]) => {
            [target, ...paths].forEach(path => this.routes.set('/' + path, '/' + target));
        });
        
        this.init();
    }

    init() {
        this.setupNavigationInterceptors();
        this.setupSmoothTransitions();
        this.updateAllNavigationLinks();
        this.setupBackButton();
    }

    setupNavigationInterceptors() {
        // Intercept all navigation clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
                e.shiftKey || e.altKey || link.hasAttribute('download') ||
                (link.target && link.target !== '_self')) return;

            const href = link.getAttribute('href');
            
            // Check if it's an internal link that needs routing
            if (this.shouldIntercept(href)) {
                e.preventDefault();
                this.navigateTo(href, link);
            }
        });
    }

    routeURL(href) {
        // Fragment-only links are in-page controls, not page aliases.
        if (!href || !href.trim() || href.trim().startsWith('#')) return null;
        try {
            const url = new URL(href, document.baseURI);
            if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin ||
                url.username || url.password || !this.routes.has(url.pathname)) return null;
            url.pathname = this.routes.get(url.pathname);
            return url;
        } catch (_) {
            return null;
        }
    }

    shouldIntercept(href) {
        return !!this.routeURL(href);
    }

    navigateTo(href, element) {
        // Add transition class
        document.body.classList.add('page-transitioning');
        
        // Smooth scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Navigate after transition
        setTimeout(() => {
            window.location.href = href;
        }, 300);
    }

    setupSmoothTransitions() {
        // Add CSS for smooth transitions
        if (!document.getElementById('smoothTransitionStyles')) {
            const style = document.createElement('style');
            style.id = 'smoothTransitionStyles';
            style.textContent = `
                body {
                    transition: opacity 0.3s ease;
                }
                
                body.page-transitioning {
                    opacity: 0.95;
                }
                
                /* Micro-interactions */
                .nav-link,
                .nav-icon-btn,
                .btn-header-primary,
                .mobile-menu-btn {
                    transition: all 0.2s ease;
                    position: relative;
                }
                
                .nav-link:hover,
                .nav-icon-btn:hover {
                    transform: translateY(-2px);
                }
                
                .nav-link:active,
                .nav-icon-btn:active {
                    transform: translateY(0);
                }
                
                /* Button ripple effect */
                .btn-header-primary {
                    overflow: hidden;
                }
                
                .btn-header-primary::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.3);
                    transform: translate(-50%, -50%);
                    transition: width 0.6s, height 0.6s;
                }
                
                .btn-header-primary:active::after {
                    width: 300px;
                    height: 300px;
                }
                
                /* Icon animations */
                .nav-icon-btn svg {
                    transition: all 0.3s ease;
                }
                
                .nav-icon-btn:hover svg {
                    stroke: #D4AF37;
                    filter: drop-shadow(0 0 8px rgba(212, 175, 55, 0.5));
                }
                
                /* Active page indicator */
                .nav-link.active::after {
                    content: '';
                    position: absolute;
                    bottom: -8px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: #D4AF37;
                    animation: slideIn 0.3s ease;
                }
                
                @keyframes slideIn {
                    from {
                        transform: scaleX(0);
                    }
                    to {
                        transform: scaleX(1);
                    }
                }
                
                /* Card hover effects */
                .venue-card,
                .event-card,
                .list-card,
                .post-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .venue-card:hover,
                .event-card:hover,
                .list-card:hover,
                .post-card:hover {
                    transform: translateY(-8px);
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
                }
                
                /* Button hover effects */
                .btn-primary,
                .btn-secondary {
                    transition: all 0.2s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .btn-primary::before,
                .btn-secondary::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transition: left 0.5s ease;
                }
                
                .btn-primary:hover::before,
                .btn-secondary:hover::before {
                    left: 100%;
                }
                
                /* Loading animation */
                .loading-indicator {
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 3px solid rgba(212, 175, 55, 0.3);
                    border-top-color: #D4AF37;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                /* Fade in animation for content */
                .fade-in {
                    animation: fadeIn 0.5s ease;
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Stagger animation for lists */
                .stagger-item {
                    opacity: 0;
                    animation: staggerFadeIn 0.5s ease forwards;
                }
                
                .stagger-item:nth-child(1) { animation-delay: 0.1s; }
                .stagger-item:nth-child(2) { animation-delay: 0.2s; }
                .stagger-item:nth-child(3) { animation-delay: 0.3s; }
                .stagger-item:nth-child(4) { animation-delay: 0.4s; }
                .stagger-item:nth-child(5) { animation-delay: 0.5s; }
                
                @keyframes staggerFadeIn {
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    updateAllNavigationLinks() {
        document.querySelectorAll('a[href]').forEach(link => {
            const url = this.routeURL(link.getAttribute('href'));
            if (url) link.setAttribute('href', url.pathname + url.search + url.hash);
        });
        this.markActivePage();
    }

    markActivePage() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        // Remove active class from all nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to current page link
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes(currentPage)) {
                link.classList.add('active');
            }
        });
        
        // Special handling for home page
        if (currentPage === 'index.html' || currentPage === '') {
            const homeLink = document.querySelector('.nav-link[href="index.html"], .nav-link[href="/"]');
            if (homeLink) homeLink.classList.add('active');
        }
    }

    setupBackButton() {
        // Handle browser back button
        window.addEventListener('popstate', () => {
            document.body.classList.add('page-transitioning');
            setTimeout(() => {
                document.body.classList.remove('page-transitioning');
            }, 300);
        });
    }

    // Utility function to add loading indicator
    showLoading(element) {
        const loader = document.createElement('span');
        loader.className = 'loading-indicator';
        element.appendChild(loader);
        return loader;
    }

    hideLoading(loader) {
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }

    // Add fade-in animation to elements
    animateFadeIn(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
            el.classList.add('fade-in');
            el.style.animationDelay = `${index * 0.1}s`;
        });
    }

    // Add stagger animation to list items
    animateStagger(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            el.classList.add('stagger-item');
        });
    }
}

// Initialize smart router when DOM is ready
let smartRouter;
document.addEventListener('DOMContentLoaded', () => {
    smartRouter = new SmartRouter();
    
    // Add fade-in animations to main content
    smartRouter.animateFadeIn('.hero-section, .section');
    
    // Add stagger animations to cards
    smartRouter.animateStagger('.venue-card, .event-card, .list-card, .post-card');
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartRouter;
}