/**
 * Universal SceneLink Header Manager
 * Single source of truth for header functionality across all pages
 */

class UniversalHeaderManager {
    constructor() {
        this.currentPage = this.detectCurrentPage();
        this.header = null;
        this.mobileMenuBtn = null;
        this.navCenter = null;
        this.init();
    }

    /**
     * Detect current page based on URL
     */
    detectCurrentPage() {
        const path = window.location.pathname;
        const filename = path.substring(path.lastIndexOf('/') + 1);
        
        // Map filenames to page identifiers
        const pageMap = {
            'index.html': 'home',
            '': 'home', // Root path
            'explore.html': 'explore',
            'social-feed.html': 'social',
            'events.html': 'events',
            'nightlife.html': 'nightlife',
            'tonight.html': 'tonights-picks',
            'profile.html': 'profile',
            'my-lists.html': 'lists'
        };

        return pageMap[filename] || 'home';
    }

    /**
     * Initialize the header system
     */
    init() {
        this.waitForHeader().then(() => {
            this.setupActiveStates();
            this.setupMobileMenu();
            this.setupScrollEffects();
            this.setupSignUpButton();
            this.setupAnimations();
            console.log('Universal Header Manager initialized for page:', this.currentPage);
        });
    }

    /**
     * Wait for header to be available in DOM
     */
    waitForHeader() {
        return new Promise((resolve) => {
            const checkForHeader = () => {
                this.header = document.getElementById('mainHeader');
                if (this.header) {
                    this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
                    this.navCenter = this.header.querySelector('.nav-center');
                    resolve();
                } else {
                    setTimeout(checkForHeader, 100);
                }
            };
            checkForHeader();
        });
    }

    /**
     * Setup active states for navigation links
     */
    setupActiveStates() {
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            const linkPage = link.getAttribute('data-page');
            
            // Remove any existing active classes
            link.classList.remove('active');
            
            // Add active class to current page link
            if (linkPage === this.currentPage) {
                link.classList.add('active');
            }

            // Add click handler for smooth transitions
            link.addEventListener('click', (e) => {
                // Remove active from all links
                navLinks.forEach(l => l.classList.remove('active'));
                // Add active to clicked link
                link.classList.add('active');
            });
        });
    }

    /**
     * Setup mobile menu functionality
     */
    setupMobileMenu() {
        if (!this.mobileMenuBtn || !this.navCenter) return;

        this.mobileMenuBtn.addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.header.contains(e.target) && this.navCenter.classList.contains('active')) {
                this.closeMobileMenu();
            }
        });

        // Close mobile menu on window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                this.closeMobileMenu();
            }
        });
    }

    /**
     * Toggle mobile menu
     */
    toggleMobileMenu() {
        const isActive = this.navCenter.classList.contains('active');
        if (isActive) {
            this.closeMobileMenu();
        } else {
            this.openMobileMenu();
        }
    }

    /**
     * Open mobile menu
     */
    openMobileMenu() {
        this.navCenter.classList.add('active');
        this.mobileMenuBtn.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close mobile menu
     */
    closeMobileMenu() {
        this.navCenter.classList.remove('active');
        this.mobileMenuBtn.classList.remove('active');
        document.body.style.overflow = '';
    }

    /**
     * Setup scroll effects for header
     */
    setupScrollEffects() {
        let lastScrollTop = 0;
        
        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > 50) {
                this.header.classList.add('scrolled');
            } else {
                this.header.classList.remove('scrolled');
            }

            lastScrollTop = scrollTop;
        });
    }

    /**
     * Setup sign up button functionality
     */
    setupSignUpButton() {
        const signUpBtn = document.getElementById('headerSignupBtn');
        if (!signUpBtn) return;

        signUpBtn.addEventListener('click', () => {
            this.handleSignUp();
        });
    }

    /**
     * Handle sign up button click
     */
    handleSignUp() {
        // Placeholder for sign up functionality
        console.log('Sign Up button clicked');
        // You can integrate with your existing sign up modal or redirect
        alert('Sign Up functionality would be implemented here');
    }

    /**
     * Setup additional animations and interactions
     */
    setupAnimations() {
        // Add hover effects to logo
        const logoContainer = document.querySelector('.logo-container');
        if (logoContainer) {
            logoContainer.addEventListener('mouseenter', () => {
                logoContainer.style.transform = 'scale(1.05)';
            });
            
            logoContainer.addEventListener('mouseleave', () => {
                logoContainer.style.transform = 'scale(1)';
            });
        }

        // Add ripple effect to icon buttons
        const iconButtons = document.querySelectorAll('.nav-icon-btn');
        iconButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.createRippleEffect(btn, e);
            });
        });
    }

    /**
     * Create ripple effect for button clicks
     */
    createRippleEffect(button, event) {
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');

        // Add ripple styles if not already present
        if (!document.querySelector('#ripple-styles')) {
            const style = document.createElement('style');
            style.id = 'ripple-styles';
            style.textContent = `
                .ripple {
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(212, 175, 55, 0.5);
                    transform: scale(0);
                    animation: ripple-animation 0.6s linear;
                    pointer-events: none;
                }
                @keyframes ripple-animation {
                    to {
                        transform: scale(4);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        button.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    /**
     * Public method to update active state programmatically
     */
    setActivePage(pageName) {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            const linkPage = link.getAttribute('data-page');
            if (linkPage === pageName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    /**
     * Public method to get current active page
     */
    getCurrentPage() {
        return this.currentPage;
    }

    /**
     * Cleanup method
     */
    destroy() {
        // Remove event listeners and cleanup
        if (this.mobileMenuBtn) {
            this.mobileMenuBtn.removeEventListener('click', this.toggleMobileMenu);
        }
        window.removeEventListener('scroll', this.setupScrollEffects);
        window.removeEventListener('resize', () => {
            if (window.innerWidth > 768) {
                this.closeMobileMenu();
            }
        });
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if header exists
    if (document.getElementById('mainHeader')) {
        window.universalHeader = new UniversalHeaderManager();
    }
});

// Make available globally
window.UniversalHeaderManager = UniversalHeaderManager;