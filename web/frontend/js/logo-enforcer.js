/* Logo Size Enforcer v3 — single source of truth for logo sizing across all pages.
   Header logo: 80px   Footer logo: 100px
   Uses !important + MutationObserver to defeat any legacy CSS/inline overrides.
*/
(function() {
    'use strict';

    var HEADER_HEIGHT = 80;
    var FOOTER_HEIGHT = 100;
    var HEADER_HEIGHT_MOBILE = 64;

    var isMobile = function() { return window.innerWidth <= 768; };

    function enforceLogoSize() {
        var headerH = isMobile() ? HEADER_HEIGHT_MOBILE : HEADER_HEIGHT;

        // Header / nav logos — cast a wide net
        var headerSelectors = [
            '.logo-main',
            'img.logo-main',
            '.sl-explore-logo',
            '.sl-explore-logo img',
            '.nav-logo',
            '.nav-logo img',
            '.navbar-logo',
            '.navbar-logo img',
            'header .logo',
            'header .logo img',
            '.header-enhanced img.logo-main',
            '.nav-enhanced img.logo-main',
            '.sl-brand-logo',
            '.sl-brand-logo img',
            '.sl-nav-logo',
            '.sl-nav-logo img',
            '.sl-header-logo',
            '.sl-header-logo img',
            '.nightlife-logo',
            '.nightlife-logo img',
            '.nav-brand img',
            'img[alt="SceneLink"]',
            'img[alt="SceneLink Logo"]'
        ];
        var headerLogos = document.querySelectorAll(headerSelectors.join(','));
        headerLogos.forEach(function(logo) {
            var inFooter = logo.closest('footer');
            if (inFooter) return;
            logo.style.setProperty('height', headerH + 'px', 'important');
            logo.style.setProperty('max-height', headerH + 'px', 'important');
            logo.style.setProperty('min-height', '0', 'important');
            logo.style.setProperty('width', 'auto', 'important');
            logo.style.setProperty('object-fit', 'contain', 'important');
        });

        // Footer logos
        var footerLogos = document.querySelectorAll('footer .logo-main, footer img.logo-main, .footer-logo, img.footer-logo, .footer-logo-img, img.footer-logo-img');
        footerLogos.forEach(function(logo) {
            logo.style.setProperty('height', FOOTER_HEIGHT + 'px', 'important');
            logo.style.setProperty('max-height', FOOTER_HEIGHT + 'px', 'important');
            logo.style.setProperty('min-height', '0', 'important');
            logo.style.setProperty('width', 'auto', 'important');
            logo.style.setProperty('object-fit', 'contain', 'important');
        });
    }

    // Run immediately and on intervals
    enforceLogoSize();
    setTimeout(enforceLogoSize, 100);
    setTimeout(enforceLogoSize, 500);
    setTimeout(enforceLogoSize, 1500);
    setTimeout(enforceLogoSize, 3000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enforceLogoSize);
    }
    window.addEventListener('load', enforceLogoSize);
    window.addEventListener('resize', enforceLogoSize);

    // MutationObserver to catch dynamic insertions / attribute mutations
    if (typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function(mutations) {
            var needsRun = false;
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (m.type === 'childList' && m.addedNodes.length) { needsRun = true; break; }
                if (m.type === 'attributes' && m.target && m.target.classList) { needsRun = true; break; }
            }
            if (needsRun) enforceLogoSize();
        });
        observer.observe(document.documentElement, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ['style', 'class']
        });
    }

    // Expose for external use
    window.SLLogoEnforcer = { run: enforceLogoSize };
})();