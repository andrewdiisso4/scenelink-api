// Header Consistency Applier
// Ensures all pages have the same header structure and behavior

class HeaderConsistencyApplier {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.init();
    }

    init() {
        console.log('Header Consistency Applier initialized for:', this.currentPage);
        this.ensureUniversalHeader();
        this.applyConsistentStyling();
        this.fixNavigationLinks();
        this.addConsistentScripts();
        this.verifyConsistency();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        return filename;
    }

    ensureUniversalHeader() {
        // Check if universal header CSS is loaded
        if (!document.querySelector('link[href*="universal-enhanced-header.css"]')) {
            this.addUniversalHeaderCSS();
        }

        // Check if universal header JS is loaded
        if (!document.querySelector('script[src*="universal-header-consistency.js"]')) {
            this.addUniversalHeaderJS();
        }
    }

    addUniversalHeaderCSS() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/universal-enhanced-header.css?v=connected-20261110-3';
        document.head.appendChild(link);
        console.log('Added universal header CSS');
    }

    addUniversalHeaderJS() {
        const script = document.createElement('script');
        script.src = 'js/universal-header-consistency.js?v=connected-20261110-3';
        document.body.appendChild(script);
        console.log('Added universal header JS');
    }

    applyConsistentStyling() {
        const header = document.querySelector('.header-enhanced');
        if (!header) return;

        // Ensure consistent structure
        this.ensureHeaderStructure(header);
        
        // Apply consistent logo
        this.updateLogoConsistency();
        
        // Apply consistent navigation icons
        this.updateNavigationIcons();
    }

    ensureHeaderStructure(header) {
        const nav = header.querySelector('.nav-enhanced');
        if (!nav) return;

        // Ensure all required sections exist
        if (!nav.querySelector('.nav-left')) {
            const navLeft = document.createElement('div');
            navLeft.className = 'nav-left';
            nav.insertBefore(navLeft, nav.firstChild);
        }

        if (!nav.querySelector('.nav-center')) {
            const navCenter = document.createElement('ul');
            navCenter.className = 'nav-center';
            nav.appendChild(navCenter);
        }

        if (!nav.querySelector('.nav-right')) {
            const navRight = document.createElement('div');
            navRight.className = 'nav-right';
            nav.appendChild(navRight);
        }

        // Ensure consistent navigation links
        this.ensureNavigationLinks(nav.querySelector('.nav-center'));
        this.ensureNavigationIcons(nav.querySelector('.nav-right'));
    }

    ensureNavigationLinks(navCenter) {
        const requiredLinks = [
            { href: 'index.html', text: 'Home', active: this.currentPage === 'index.html' },
            { href: 'explore.html', text: 'Explore', active: this.currentPage.includes('explore') },
            { href: 'social-feed.html', text: 'Social', active: this.currentPage === 'social-feed.html' },
            { href: 'events.html', text: 'Events', active: this.currentPage === 'events.html' },
            { href: 'nightlife.html', text: 'Nightlife', active: this.currentPage === 'nightlife.html' },
            { href: 'tonight.html', text: 'Tonight\'s Picks', active: this.currentPage === 'tonight.html' }
        ];

        // Clear existing links
        navCenter.innerHTML = '';

        // Add consistent navigation links
        requiredLinks.forEach(link => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = link.href;
            a.textContent = link.text;
            a.className = 'nav-link';
            if (link.active) {
                a.classList.add('active');
            }
            li.appendChild(a);
            navCenter.appendChild(li);
        });
    }

    ensureNavigationIcons(navRight) {
        // Clear existing icons
        navRight.innerHTML = '';

        // Add consistent navigation icons
        const icons = [
            {
                href: 'social-feed.html',
                title: 'Social Feed',
                svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>`
            },
            {
                href: 'my-lists.html',
                title: 'My Lists',
                svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>`
            },
            {
                href: '#',
                title: 'Search',
                onclick: 'return false;',
                svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="M21 21l-4.35-4.35"></path>
                </svg>`
            }
        ];

        icons.forEach(icon => {
            const a = document.createElement('a');
            a.href = icon.href;
            a.className = 'nav-icon-btn';
            a.title = icon.title;
            if (icon.onclick) {
                a.setAttribute('onclick', icon.onclick);
            }
            a.innerHTML = icon.svg;
            navRight.appendChild(a);
        });

        // Add search button
        const searchBtn = document.createElement('button');
        searchBtn.className = 'nav-search-btn';
        searchBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
            </svg>
            Search
        `;
        navRight.appendChild(searchBtn);
    }

    updateLogoConsistency() {
        const logoImg = document.querySelector('.logo-main');
        if (logoImg && !logoImg.src.includes('scenelinkheaderlogo.png')) {
            logoImg.src = 'images/scenelinkheaderlogo.png';
            logoImg.alt = 'SceneLink';
            console.log('Updated logo to scenelinkheaderlogo.png');
        }
    }

    updateNavigationIcons() {
        // Ensure all navigation icons have consistent styling
        const iconBtns = document.querySelectorAll('.nav-icon-btn');
        iconBtns.forEach(btn => {
            if (!btn.querySelector('svg')) {
                console.warn('Navigation icon button missing SVG');
            }
        });
    }

    fixNavigationLinks() {
        // Fix any broken or inconsistent navigation links
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            // Ensure proper active state
            const href = link.getAttribute('href');
            if (href && this.isCurrentPage(href)) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    isCurrentPage(href) {
        if (!href) return false;
        
        const hrefPage = href.replace('.html', '').replace('-', '');
        const currentPageFile = this.currentPage.replace('.html', '').replace('-', '');
        
        return hrefPage === currentPageFile || 
               (href === 'index.html' && this.currentPage === 'index.html') ||
               (href === 'explore.html' && this.currentPage.includes('explore'));
    }

    addConsistentScripts() {
        // Ensure deployment system is loaded
        if (!document.querySelector('script[src*="enhanced-deployment-system.js"]')) {
            const script = document.createElement('script');
            script.src = 'js/enhanced-deployment-system.js?v=connected-20261110-3';
            document.body.appendChild(script);
            console.log('Added enhanced deployment system');
        }
    }

    verifyConsistency() {
        setTimeout(() => {
            const checks = {
                universalHeaderCSS: !!document.querySelector('link[href*="universal-enhanced-header.css"]'),
                universalHeaderJS: !!document.querySelector('script[src*="universal-header-consistency.js"]'),
                consistentLogo: !!document.querySelector('.logo-main[src*="scenelinkheaderlogo.png"]'),
                navigationStructure: !!document.querySelector('.nav-enhanced .nav-left, .nav-enhanced .nav-center, .nav-enhanced .nav-right'),
                activeStates: !!document.querySelector('.nav-link.active'),
                deploymentSystem: !!document.querySelector('script[src*="enhanced-deployment-system.js"]')
            };

            const allGood = Object.values(checks).every(Boolean);
            
            if (allGood) {
                console.log('✅ Header consistency verified successfully');
                this.showSuccessMessage();
            } else {
                console.warn('⚠️ Header consistency issues detected:', checks);
                this.showWarningMessage(checks);
            }
        }, 1500);
    }

    showSuccessMessage() {
        if (this.currentPage === 'tonight.html') {
            // Don't show on tonight.html as it already shows deployment success
            return;
        }

        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: var(--accent-gold);
            color: var(--dark-primary);
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            font-weight: 600;
            font-size: 14px;
            animation: slideIn 0.3s ease;
        `;
           //         message.textContent = '✅ Header consistency applied successfully';
        
           //         document.body.appendChild(message);
        
        setTimeout(() => {
            message.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => message.remove(), 300);
        }, 3000);
    }

    showWarningMessage(checks) {
        const issues = Object.entries(checks)
            .filter(([key, value]) => !value)
            .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase());

        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #f39c12;
            color: var(--dark-primary);
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            font-weight: 600;
            font-size: 14px;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;
        message.innerHTML = `
            ⚠️ Some consistency issues:<br>
            <small>${issues.join(', ')}</small>
        `;
        
        document.body.appendChild(message);
        
        setTimeout(() => {
            message.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => message.remove(), 5000);
        }, 5000);
    }
}

// Auto-initialize on all pages
document.addEventListener('DOMContentLoaded', () => {
    window.headerConsistencyApplier = new HeaderConsistencyApplier();
});