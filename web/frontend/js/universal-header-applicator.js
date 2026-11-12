/**
 * Universal Header Applicator Utility
 * Helps apply consistent header across all pages
 */

class UniversalHeaderApplicator {
    constructor() {
        this.template = null;
        this.pages = [
            'index.html',
            'explore.html', 
            'tonight.html',
            'nightlife.html',
            'events.html',
            'social-feed.html',
            'profile.html'
        ];
    }

    /**
     * Load the header template
     */
    async loadTemplate() {
        try {
            const response = await fetch('components/universal-header-template.html');
            this.template = await response.text();
            return this.template;
        } catch (error) {
            console.error('Failed to load header template:', error);
            return null;
        }
    }

    /**
     * Generate header HTML with proper active state for specific page
     */
    generateHeaderForPage(pageFilename) {
        if (!this.template) {
            console.error('Template not loaded. Call loadTemplate() first.');
            return '';
        }

        let headerHTML = this.template;
        
        // Determine which page should be active
        const pageMap = {
            'index.html': 'home',
            'explore.html': 'explore',
            'social-feed.html': 'social',
            'events.html': 'events',
            'nightlife.html': 'nightlife',
            'tonight.html': 'tonights-picks',
            'profile.html': 'profile'
        };

        const activePage = pageMap[pageFilename] || 'home';
        
        // Add active class to the correct navigation link
        headerHTML = headerHTML.replace(
            `data-page="${activePage}" class="nav-link"`,
            `data-page="${activePage}" class="nav-link active"`
        );

        return headerHTML;
    }

    /**
     * Generate complete CSS includes for header
     */
    generateCSSIncludes() {
        return `
    <!-- Universal Header CSS -->
    <link rel="stylesheet" href="css/universal-header-canonical.css?v=connected-20261112-auth1">
    <link rel="stylesheet" href="css/navigation-icons-enhanced.css?v=connected-20261112-auth1">
    <link rel="stylesheet" href="css/logo-size-enhanced.css?v=connected-20261112-auth1">
        `;
    }

    /**
     * Generate JavaScript includes for header
     */
    generateJSIncludes() {
        return `
    <!-- Universal Header JavaScript -->
    <script src="js/universal-header-manager.js?v=connected-20261112-auth1"></script>
        `;
    }

    /**
     * Apply header to a specific page (for runtime use)
     */
    async applyHeaderToPage(pageFilename) {
        const headerHTML = this.generateHeaderForPage(pageFilename);
        const existingHeader = document.querySelector('header');
        
        if (existingHeader) {
            existingHeader.outerHTML = headerHTML;
        } else {
            // Insert at beginning of body if no header exists
            const body = document.querySelector('body');
            if (body) {
                body.insertAdjacentHTML('afterbegin', headerHTML);
            }
        }

        // Initialize header manager
        if (window.UniversalHeaderManager) {
            window.universalHeader = new UniversalHeaderManager();
        }
    }

    /**
     * Validate header structure on current page
     */
    validateHeader() {
        const header = document.getElementById('mainHeader');
        if (!header) {
            return {
                valid: false,
                errors: ['No header element found with id="mainHeader"']
            };
        }

        const errors = [];
        
        // Check for required navigation links
        const requiredLinks = ['Home', 'Explore', 'Social', 'Events', 'Nightlife', "Tonight's Picks"];
        const navLinks = header.querySelectorAll('.nav-link');
        
        requiredLinks.forEach(linkText => {
            const found = Array.from(navLinks).some(link => 
                link.textContent.trim() === linkText
            );
            if (!found) {
                errors.push(`Missing navigation link: ${linkText}`);
            }
        });

        // Check for required elements
        const requiredElements = [
            { selector: '.logo-main', name: 'Logo' },
            { selector: '.nav-social-feed', name: 'Social Feed Icon' },
            { selector: '.nav-my-lists', name: 'My Lists Icon' },
            { selector: '.nav-profile', name: 'Profile Icon' },
            { selector: '#headerSignupBtn', name: 'Sign Up Button' }
        ];

        requiredElements.forEach(({ selector, name }) => {
            if (!header.querySelector(selector)) {
                errors.push(`Missing element: ${name} (${selector})`);
            }
        });

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Fix common header issues on current page
     */
    fixHeaderIssues() {
        const validation = this.validateHeader();
        
        if (!validation.valid) {
            console.warn('Header validation failed:', validation.errors);
            
            // Try to fix common issues
            const header = document.querySelector('header') || document.getElementById('mainHeader');
            if (header) {
                // Ensure header has correct ID and class
                if (!header.id) header.id = 'mainHeader';
                if (!header.classList.contains('header-enhanced')) {
                    header.classList.add('header-enhanced');
                }
            }
        }

        return validation;
    }
}

// Make available globally
window.UniversalHeaderApplicator = UniversalHeaderApplicator;

// Auto-initialize validator for debugging
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('myninja')) {
        setTimeout(() => {
            const applicator = new UniversalHeaderApplicator();
            const validation = applicator.validateHeader();
            if (!validation.valid) {
                console.group('Header Validation Issues');
                validation.errors.forEach(error => console.warn(error));
                console.groupEnd();
            }
        }, 1000);
    }
});