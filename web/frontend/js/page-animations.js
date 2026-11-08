/* ============================================
   PAGE ANIMATIONS - SceneLink
   Scroll reveal & entrance animations
   ============================================ */

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        initScrollReveal();
        initNavActiveState();
    });

    /* ---- Scroll Reveal Observer ---- */
    function initScrollReveal() {
        const revealSelectors = [
            '.sl-reveal',
            '.sl-reveal-left',
            '.sl-reveal-right',
            '.sl-reveal-scale',
            '.sl-stagger-children',
            // Auto-apply to common sections
            '.events-grid-enhanced',
            '.venues-section',
            '.nightlife-venue-listings',
            '.tonights-specials',
            '.sl-events-grid',
            '.sl-map-wrapper',
            'section > .container > .section-header',
        ];

        const elements = document.querySelectorAll(revealSelectors.join(','));

        if (!elements.length) return;

        // Check for reduced motion preference
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            elements.forEach(el => el.classList.add('revealed'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -40px 0px'
        });

        elements.forEach(el => observer.observe(el));
    }

    /* ---- Nav Active State ---- */
    function initNavActiveState() {
        // Determine current page from URL
        const path = window.location.pathname;
        const page = path.split('/').pop().replace('.html', '') || 'index';

        const navLinks = document.querySelectorAll('.nav-center .nav-link');
        navLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const linkPage = href.replace('.html', '').replace('./', '');

            link.classList.remove('active');

            if (page === 'index' && (linkPage === 'index' || linkPage === '')) {
                link.classList.add('active');
            } else if (page === 'events' && linkPage === 'events') {
                link.classList.add('active');
            } else if (page === 'events-modern' && linkPage === 'events') {
                link.classList.add('active');
            } else if (linkPage === page) {
                link.classList.add('active');
            }
        });
    }
})();