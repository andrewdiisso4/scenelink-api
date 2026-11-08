// Consistent Header Component - Universal Navigation System
// Ensures identical header structure and behavior across all pages

class ConsistentHeader {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.init();
    }

    init() {
        this.ensureHeaderStructure();
        this.updateActiveNavigation();
        this.setupMobileMenu();
        this.setupScrollBehavior();
        this.setupUserMenu();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';
        return page.replace('.html', '');
    }

    ensureHeaderStructure() {
        const header = document.querySelector('header');
        if (!header) {
            console.warn('No header element found');
            return;
        }

        // Ensure header has consistent classes
        if (!header.classList.contains('header-enhanced')) {
            header.classList.add('header-enhanced');
        }

        // Ensure all navigation links are correct
        this.updateNavigationLinks();
    }

    updateNavigationLinks() {
        // Update all social feed links
        document.querySelectorAll('a[href*="social"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes('#social-feed')) {
                link.setAttribute('href', 'social-feed.html');
            }
        });

        // Update all profile links
        document.querySelectorAll('a[href*="profile"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes('profile-v2')) {
                link.setAttribute('href', 'profile.html');
            }
        });

        // Ensure lists links are consistent
        document.querySelectorAll('a[href*="lists"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.includes('my-lists.html') && href.includes('lists')) {
                link.setAttribute('href', 'my-lists.html');
            }
        });
    }

    updateActiveNavigation() {
        // Remove all active classes
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Add active class to current page
        const pageMap = {
            'index': 'index.html',
            '': 'index.html',
            'explore': 'explore.html',
            'social-feed': 'social-feed.html',
            'events-modern': 'events.html',
            'nightlife': 'nightlife.html',
            'tonight': 'tonight.html',
            'lists-v2': 'my-lists.html',
            'profile': 'profile.html',
            'group-planning': 'group-planning.html'
        };

        const targetPage = pageMap[this.currentPage] || `${this.currentPage}.html`;

        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href === targetPage || href === `/${targetPage}`) {
                link.classList.add('active');
            }
        });

        // Special handling for social link
        if (this.currentPage === 'social-feed') {
            document.querySelectorAll('a[href="social-feed.html"]').forEach(link => {
                link.classList.add('active');
            });
        }
    }

    setupMobileMenu() {
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn, .mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu, .nav-enhanced, nav ul');
        
        if (!mobileMenuBtn || !navMenu) return;

        mobileMenuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('header') && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        });

        // Close menu when clicking a link
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
                document.body.classList.remove('menu-open');
            });
        });
    }

    setupScrollBehavior() {
        const header = document.querySelector('header');
        if (!header) return;

        let lastScroll = 0;
        const scrollThreshold = 100;

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;

            // Add scrolled class when scrolled down
            if (currentScroll > scrollThreshold) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }

            // Hide/show header on scroll (optional)
            if (currentScroll > lastScroll && currentScroll > scrollThreshold) {
                header.classList.add('header-hidden');
            } else {
                header.classList.remove('header-hidden');
            }

            lastScroll = currentScroll;
        });
    }

    setupUserMenu() {
        const profileBtn = document.querySelector('a[href="profile.html"]');
        if (!profileBtn) return;

        // Add user menu dropdown (optional enhancement)
        // This can be expanded to show user options
    }

    // Utility method to get header HTML template
    static getHeaderTemplate() {
        return `
            <header class="header-enhanced" id="mainHeader">
                <div class="container">
                    <div class="header-content">
                        <div class="logo">
                            <a href="index.html">
                                <img src="images/logo-transparent.png" alt="SceneLink" class="logo-img">
                            </a>
                        </div>
                        
                        <nav class="nav-menu" id="navMenu">
                            <a href="index.html" class="nav-link">Home</a>
                            <a href="explore.html" class="nav-link">Explore</a>
                            <a href="social-feed.html" class="nav-link">Social</a>
                            <a href="events.html" class="nav-link">Events</a>
                            <a href="nightlife.html" class="nav-link">Nightlife</a>
                            <a href="tonight.html" class="nav-link">Tonight's Picks</a>
                        </nav>

                        <div class="nav-right">
                            <a href="social-feed.html" class="nav-icon-btn" title="Social Feed">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                            </a>
                            <a href="my-lists.html" class="nav-icon-btn" title="My Lists">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                    <polyline points="10 9 9 9 8 9"></polyline>
                                </svg>
                            </a>
                            <a href="profile.html" class="nav-icon-btn" title="Profile">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                            </a>
                            <button class="btn-header-primary" id="headerSignupBtn">Sign Up</button>
                        </div>
                        
                        <button class="mobile-menu-btn" id="mobileMenuBtn">
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>
                    </div>
                </div>
            </header>
        `;
    }

    // Utility method to get footer HTML template
    static getFooterTemplate() {
        return `
            <footer class="footer-enhanced">
                <div class="container">
                    <div class="footer-content">
                        <div class="footer-section">
                            <div class="footer-brand">
                                <img src="images/logo-transparent.png" alt="SceneLink" class="footer-logo">
                                <p>Discover the best dining and nightlife experiences in your city.</p>
                            </div>
                        </div>
                        
                        <div class="footer-section">
                            <h4>Explore</h4>
                            <ul>
                                <li><a href="explore.html">Restaurants</a></li>
                                <li><a href="explore.html?type=bars">Bars & Lounges</a></li>
                                <li><a href="nightlife.html">Nightlife</a></li>
                                <li><a href="events.html">Events</a></li>
                            </ul>
                        </div>
                        
                        <div class="footer-section">
                            <h4>Company</h4>
                            <ul>
                                <li><a href="about.html">About Us</a></li>
                                <li><a href="contact.html">Contact</a></li>
                                <li><a href="about.html#careers">Careers</a></li>
                                <li><a href="about.html#press">Press</a></li>
                            </ul>
                        </div>
                        
                        <div class="footer-section">
                            <h4>Legal</h4>
                            <ul>
                                <li><a href="privacy.html">Privacy Policy</a></li>
                                <li><a href="terms.html">Terms of Service</a></li>
                                <li><a href="contact.html">Support</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="footer-bottom">
                        <p>&copy; 2024 SceneLink. All rights reserved.</p>
                        <div class="footer-social">
                            <a href="#" aria-label="Facebook"><i class="fab fa-facebook"></i></a>
                            <a href="#" aria-label="X (formerly Twitter)" class="sl-social-x"><i class="fa-brands fa-x-twitter"></i></a>
                            <a href="#" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
                            <a href="#" aria-label="LinkedIn"><i class="fab fa-linkedin"></i></a>
                        </div>
                    </div>
                </div>
            </footer>
        `;
    }
}

// Initialize when DOM is ready
let consistentHeader;
document.addEventListener('DOMContentLoaded', () => {
    consistentHeader = new ConsistentHeader();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConsistentHeader;
}