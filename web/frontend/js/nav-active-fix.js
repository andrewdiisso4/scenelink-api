/**
 * SceneLink Nav Active State - AUTHORITATIVE Controller
 * This script is the ONLY source of truth for nav active states.
 * It aggressively overrides ALL other scripts that try to set active states.
 * Loaded LAST on every page.
 */
(function() {
    'use strict';

    // Map of filenames to their nav data-page values
    const pageMap = {
        'index.html': 'home',
        '': 'home',
        '/': 'home',
        'explore.html': 'explore',
        'explore-v2.html': 'explore',
        'explore-enhanced-v2.html': 'explore',
        'social-feed.html': 'social',
        'events.html': 'events',
        'events-modern.html': 'events',
        'nightlife.html': 'nightlife',
        'tonight.html': 'tonights-picks',
        'lists.html': 'lists',
        'my-lists.html': 'lists',
        'profile.html': 'profile',
        'group-planning.html': 'group-planning'
    };

    // Determine current page once
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index.html';
    const currentPage = pageMap[filename] || '';

    function enforceActiveNav() {
        const navLinks = document.querySelectorAll('.nav-link');
        if (!navLinks.length) return;

        navLinks.forEach(link => {
            const dataPage = link.getAttribute('data-page');
            const shouldBeActive = (dataPage && dataPage === currentPage);
            const isActive = link.classList.contains('active');

            if (shouldBeActive && !isActive) {
                link.classList.add('active');
            } else if (!shouldBeActive && isActive) {
                link.classList.remove('active');
            }
        });
    }

    // Override competing scripts by intercepting classList modifications
    function installClassListGuard() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            const dataPage = link.getAttribute('data-page');
            const shouldBeActive = (dataPage && dataPage === currentPage);
            
            // Store original methods
            const origAdd = link.classList.add.bind(link.classList);
            const origRemove = link.classList.remove.bind(link.classList);

            // Override add - block 'active' if this link shouldn't be active
            link.classList.add = function(...classes) {
                const filtered = classes.filter(c => {
                    if (c === 'active' && !shouldBeActive) return false;
                    return true;
                });
                if (filtered.length) origAdd(...filtered);
                // Also ensure correct link stays active
                if (classes.includes('active') && !shouldBeActive) {
                    setTimeout(enforceActiveNav, 0);
                }
            };

            // Override remove - block removal of 'active' if this link should be active
            link.classList.remove = function(...classes) {
                const filtered = classes.filter(c => {
                    if (c === 'active' && shouldBeActive) return false;
                    return true;
                });
                if (filtered.length) origRemove(...filtered);
                // Re-enforce if someone tried to remove our active
                if (classes.includes('active') && shouldBeActive) {
                    setTimeout(() => origAdd('active'), 0);
                }
            };
        });
    }

    // Enforce on multiple timing strategies
    function scheduleEnforcement() {
        // Immediate
        enforceActiveNav();
        
        // Rapid-fire during script loading phase
        const timings = [10, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
        timings.forEach(ms => setTimeout(enforceActiveNav, ms));
    }

    // MutationObserver - never disconnects, uses debounce
    function startObserver() {
        const navContainer = document.querySelector('.nav-center, .nav-links, nav, header');
        if (!navContainer) return;

        let debounceTimer = null;
        const observer = new MutationObserver(function() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(enforceActiveNav, 10);
        });

        observer.observe(navContainer, {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true
        });
        
        // Never disconnect - this observer is permanent
    }

    // Initialize based on document state
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            scheduleEnforcement();
            startObserver();
            // Install classList guards after a brief delay for DOM to settle
            setTimeout(installClassListGuard, 200);
        });
    } else {
        scheduleEnforcement();
        startObserver();
        setTimeout(installClassListGuard, 200);
    }

    // Also on window load
    window.addEventListener('load', function() {
        enforceActiveNav();
        setTimeout(enforceActiveNav, 100);
        setTimeout(enforceActiveNav, 500);
    });

    // Expose for debugging
    window._navActiveFix = {
        enforce: enforceActiveNav,
        currentPage: currentPage,
        filename: filename
    };
})();