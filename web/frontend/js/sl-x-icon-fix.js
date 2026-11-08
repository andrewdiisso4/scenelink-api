/* SceneLink — X (Twitter) Icon Fix v2
 * Injects inline SVG INSIDE <i class="fa-x-twitter"> tags,
 * preserving existing classes and CSS (width, color, font-size).
 * This keeps the icon visually consistent with Instagram/Facebook/YouTube.
 * v2.0 — 2026-05-03
 */
(function () {
    'use strict';

    var X_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor" style="display:inline-block;vertical-align:-0.125em" aria-hidden="true"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8l164.9-188.5L26.8 48h145.6l100.5 132.9L389.2 48zm-24.8 373.8h39.1L151.1 88h-42L364.4 421.8z"/></svg>';

    function fixIcons() {
        // Select all X icons
        var icons = document.querySelectorAll('i.fa-x-twitter, i.fab.fa-x-twitter, .fa-x-twitter');
        for (var i = 0; i < icons.length; i++) {
            var el = icons[i];
            if (el.getAttribute('data-x-fixed') === '1') continue;
            // Skip if this element isn't an <i> or <span>
            if (el.tagName !== 'I' && el.tagName !== 'SPAN') continue;

            el.setAttribute('data-x-fixed', '1');

            // Remove FA's ::before content by clearing existing content
            // Inject inline SVG as child
            el.innerHTML = X_SVG;

            // Neutralize FA font-family so ::before can't render a broken glyph
            el.style.fontFamily = 'inherit';
            // Ensure visible display
            if (!el.style.display) el.style.display = 'inline-flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
        }
    }

    function init() { fixIcons(); }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Catch dynamically added icons
    if (window.MutationObserver) {
        var obs = new MutationObserver(function (mutations) {
            // Only re-run if new nodes with icons might be added
            var hasNew = false;
            for (var m = 0; m < mutations.length; m++) {
                if (mutations[m].addedNodes && mutations[m].addedNodes.length) { hasNew = true; break; }
            }
            if (hasNew) fixIcons();
        });
        function startObserver() {
            if (document.body) obs.observe(document.body, { childList: true, subtree: true });
        }
        if (document.body) startObserver();
        else document.addEventListener('DOMContentLoaded', startObserver);
    }
})();