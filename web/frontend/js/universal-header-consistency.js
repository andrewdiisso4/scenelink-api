// Universal Header Consistency Script
// Ensures consistent navigation behavior across all pages

class UniversalHeader {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.header = null;
        this.navLinks = null;
        this.init();
    }

    init() {
        this.header = document.querySelector('.header-enhanced');
        this.navLinks = document.querySelectorAll('.nav-link');
        
        if (!this.header || this.navLinks.length === 0) {
            console.warn('Universal header elements not found');
            return;
        }

        this.setupActiveStates();
        this.setupScrollEffects();
        this.setupMobileMenu();
        this.setupAccessibility();
        this.enforceConsistency();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        
        // Handle different file variations
        const pageMap = {
            'index.html': 'home',
            '': 'home',
            'explore.html': 'explore',
            'explore-v2.html': 'explore',
            'social-feed.html': 'social',
            'events.html': 'events',
            'nightlife.html': 'nightlife',
            'tonight.html': 'tonight-picks'
        };
        
        return pageMap[filename] || filename.replace('.html', '');
    }

    setupActiveStates() {
        this.navLinks.forEach(link => {
            const href = link.getAttribute('href');
            const linkPage = this.getPageFromHref(href);
            
            // Remove existing active states
            link.classList.remove('active');
            
            // Add active state if matches current page
            if (linkPage === this.currentPage) {
                link.classList.add('active');
                this.addUnderlineEffect(link);
            }
            
            // Handle hover states
            link.addEventListener('mouseenter', () => this.handleLinkHover(link, true));
            link.addEventListener('mouseleave', () => this.handleLinkHover(link, false));
            
            // Handle click events
            link.addEventListener('click', (e) => this.handleLinkClick(e, link));
        });
    }

    getPageFromHref(href) {
        if (!href) return '';
        
        const pageMap = {
            'index.html': 'home',
            '': 'home',
            'explore.html': 'explore',
            'explore-v2.html': 'explore',
            'social-feed.html': 'social',
            'events.html': 'events',
            'nightlife.html': 'nightlife',
            'tonight.html': 'tonight-picks'
        };
        
        return pageMap[href] || href.replace('.html', '');
    }

    addUnderlineEffect(link) {
        // Ensure underline is properly positioned
        if (link.classList.contains('active')) {
            // Remove existing underline if any
            const existingUnderline = link.querySelector('::after');
            if (!existingUnderline) {
                // Force reflow to ensure CSS animation applies
                link.style.display = 'inline-block';
                setTimeout(() => {
                    link.style.display = '';
                }, 10);
            }
        }
    }

    handleLinkHover(link, isHovering) {
        if (isHovering && !link.classList.contains('active')) {
            link.style.transform = 'translateY(-1px)';
        } else if (!isHovering && !link.classList.contains('active')) {
            link.style.transform = 'translateY(0)';
        }
    }

    handleLinkClick(event, link) {
        // Add smooth transition effect
        event.preventDefault();
        const href = link.getAttribute('href');
        
        // Add click animation
        link.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            link.style.transform = '';
            window.location.href = href;
        }, 150);
    }

    setupScrollEffects() {
        let lastScrollY = window.scrollY;
        
        window.addEventListener('scroll', () => {
            const currentScrollY = window.scrollY;
            
            if (currentScrollY > 50) {
                this.header.classList.add('scrolled');
            } else {
                this.header.classList.remove('scrolled');
            }
            
            // Hide/show header on scroll
            if (currentScrollY > lastScrollY && currentScrollY > 100) {
                this.header.style.transform = 'translateY(-100%)';
            } else {
                this.header.style.transform = 'translateY(0)';
            }
            
            lastScrollY = currentScrollY;
        });
    }

    setupMobileMenu() {
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        const navCenter = document.querySelector('.nav-center');
        
        if (mobileToggle && navCenter) {
            mobileToggle.addEventListener('click', () => {
                navCenter.classList.toggle('mobile-open');
                mobileToggle.classList.toggle('active');
                
                // Animate hamburger menu
                const spans = mobileToggle.querySelectorAll('span');
                if (navCenter.classList.contains('mobile-open')) {
                    spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                    spans[1].style.opacity = '0';
                    spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
                } else {
                    spans[0].style.transform = '';
                    spans[1].style.opacity = '';
                    spans[2].style.transform = '';
                }
            });
            
            // Close mobile menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!this.header.contains(e.target) && navCenter.classList.contains('mobile-open')) {
                    navCenter.classList.remove('mobile-open');
                    mobileToggle.classList.remove('active');
                    
                    // Reset hamburger menu
                    const spans = mobileToggle.querySelectorAll('span');
                    spans.forEach(span => span.style.transform = '');
                }
            });
        }
    }

    setupAccessibility() {
        // Add keyboard navigation
        this.navLinks.forEach((link, index) => {
            link.setAttribute('tabindex', '0');
            link.setAttribute('role', 'menuitem');
            
            link.addEventListener('keydown', (e) => {
                switch(e.key) {
                    case 'ArrowRight':
                        e.preventDefault();
                        const nextLink = this.navLinks[index + 1] || this.navLinks[0];
                        nextLink.focus();
                        break;
                    case 'ArrowLeft':
                        e.preventDefault();
                        const prevLink = this.navLinks[index - 1] || this.navLinks[this.navLinks.length - 1];
                        prevLink.focus();
                        break;
                    case 'Enter':
                    case ' ':
                        e.preventDefault();
                        link.click();
                        break;
                }
            });
        });
    }

    enforceConsistency() {
        // Ensure consistent spacing and alignment
        const navCenter = document.querySelector('.nav-center');
        if (navCenter) {
            // Force center alignment
            navCenter.style.justifyContent = 'center';
            navCenter.style.alignItems = 'center';
            
            // Ensure consistent gap
            const computedStyle = window.getComputedStyle(navCenter);
            if (computedStyle.gap === 'normal') {
                navCenter.style.gap = 'var(--spacing-xl)';
            }
        }
        
        // Ensure underline positioning is consistent
        this.navLinks.forEach(link => {
            if (link.classList.contains('active')) {
                // Force consistent underline position
                const style = document.createElement('style');
                style.textContent = `
                    .nav-link.active::after {
                        bottom: -8px !important;
                        left: 50% !important;
                        transform: translateX(-50%) !important;
                    }
                `;
                if (!document.querySelector('style[data-header-underline]')) {
                    style.setAttribute('data-header-underline', 'true');
                    document.head.appendChild(style);
                }
            }
        });
    }

    updateActivePage(newPage) {
        this.currentPage = newPage;
        this.setupActiveStates();
    }

    // Public methods for external use
    setActiveLink(pageName) {
        this.navLinks.forEach(link => {
            link.classList.remove('active');
            const linkPage = this.getPageFromHref(link.getAttribute('href'));
            if (linkPage === pageName) {
                link.classList.add('active');
                this.addUnderlineEffect(link);
            }
        });
    }

    showHeader() {
        this.header.style.transform = 'translateY(0)';
    }

    hideHeader() {
        this.header.style.transform = 'translateY(-100%)';
    }
}

// Initialize universal header when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.universalHeader = new UniversalHeader();
    
    // Make available globally for other scripts
    window.headerManager = window.universalHeader;
});

// Also initialize on dynamic content changes
if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
        if (!window.universalHeader) {
            window.universalHeader = new UniversalHeader();
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}