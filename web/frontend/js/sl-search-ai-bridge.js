/* =====================================================
 * SceneLink — AI-Powered Search Bridge (launch-polish)
 * Adds AI concierge augmentation to the search bars on
 * nightlife.html + explore.html.
 *
 * Behavior:
 *  - If the user types a short keyword query (<= 3 words, no verbs),
 *    normal filter behavior runs (existing search).
 *  - If the user types a natural-language query ("where can I get
 *    tapas under $40 in the Seaport"), we detect intent and surface
 *    a small "Ask SceneLink" chip that opens the concierge with that
 *    exact query pre-filled.
 *  - We also add a sparkle button next to the search icon that
 *    ALWAYS opens the concierge with the current input contents.
 * ===================================================== */
(function () {
    'use strict';

    // Phase 5D-C4: Run on Home, Tonight, Explore, Nightlife, Events, Plans, Friends, Business
    var path = (location.pathname || '').toLowerCase();
    var onTargetPage = (
        /(index|home|tonight|nightlife|explore|events|plans|friends|business)\.html?$/.test(path) ||
        ['/','/index','/home','/tonight','/nightlife','/explore','/events','/plans','/friends','/business'].indexOf(path.replace(/\/$/,'')) >= 0
    );
    if (!onTargetPage) return;

    // Phase 5D-C4: Collect active filter chips on the page so they ride with the AI query.
    // We look for buttons with class names containing 'chip' that have aria-pressed='true' OR class 'active'
    function collectActiveFilters() {
        var chips = document.querySelectorAll('.tv2-chip.active, .nl-chip.active, .filter-chip.active, [class*="chip"][aria-pressed="true"]');
        var labels = [];
        chips.forEach(function (c) {
            var t = (c.getAttribute('data-vibe') || c.getAttribute('data-type') || c.getAttribute('data-price') || c.getAttribute('data-time') || c.textContent || '').trim();
            if (t && labels.indexOf(t) < 0) labels.push(t);
        });
        return labels;
    }

    function buildAIQuery(rawInput) {
        var q = (rawInput || '').trim();
        var filters = collectActiveFilters();
        if (!filters.length) return q || 'Help me plan my night in Boston';
        var filterStr = filters.join(', ');
        if (!q) return 'Recommend Boston venues matching: ' + filterStr;
        return q + ' (filters: ' + filterStr + ')';
    }

    function looksLikeNaturalQuery(q) {
        if (!q) return false;
        q = q.trim();
        if (q.length < 10) return false;
        // Word count > 3 suggests natural language
        var words = q.split(/\s+/).length;
        if (words >= 4) return true;
        // Contains question words or common intent phrases
        return /\b(where|what|when|who|how|best|top|near me|good for|under \$|cheap|fancy|date night|for my birthday|first date)\b/i.test(q);
    }

    function openConciergeWith(query) {
        try {
            if (window.SLConcierge && typeof window.SLConcierge.open === 'function') {
                window.SLConcierge.open(query);
                return true;
            }
        } catch (e) {}
        // Fallback: click a visible concierge trigger with the query
        var trigger = document.querySelector('[data-sl-concierge]');
        if (trigger) {
            trigger.setAttribute('data-sl-concierge', query);
            trigger.click();
            return true;
        }
        // Last resort: navigate to concierge with query param
        window.location.href = 'tonight.html?ai=' + encodeURIComponent(query);
        return true;
    }

    function injectAIChip(inputEl) {
        if (!inputEl || inputEl._slAIChip) return;
        inputEl._slAIChip = true;

        // Wrap input in a relative container if not already
        var parent = inputEl.parentElement;
        if (!parent) return;
        parent.classList.add('sl-search-ai-host');
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }

        // Create sparkle button
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sl-search-ai-btn';
        btn.title = 'Ask SceneLink Concierge';
        btn.setAttribute('aria-label', 'Ask SceneLink Concierge');
        btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
        btn.style.cssText = [
            'position:static',
            'flex:0 0 44px',
            'transform:none',
            'width:44px',
            'height:44px',
            'border-radius:10px',
            'border:none',
            'cursor:pointer',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'background:linear-gradient(135deg,#D4AF37,#B8941F)',
            'color:#0a0a0a',
            'box-shadow:0 4px 12px rgba(212,175,55,0.35)',
            'z-index:10',
            'transition:transform .15s ease,box-shadow .15s ease'
        ].join(';');
        btn.onmouseenter = function () {
            this.style.transform = 'none';
            this.style.boxShadow = '0 6px 18px rgba(212,175,55,0.55)';
        };
        btn.onmouseleave = function () {
            this.style.transform = 'none';
            this.style.boxShadow = '0 4px 12px rgba(212,175,55,0.35)';
        };
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            // Phase 5D-C4: build AI query that includes active filter chips
            var q = buildAIQuery(inputEl.value);
            openConciergeWith(q);
        });

        parent.appendChild(btn);

        // Also: intercept Enter key when query looks natural — offer AI path
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var q = (inputEl.value || '').trim();
                if (looksLikeNaturalQuery(q)) {
                    // Show a soft suggestion toast (non-blocking)
                    showAISuggestion(q, inputEl);
                }
            }
        });

        // The action is in normal flow; no overlay padding is needed.

    }

    function showAISuggestion(query, inputEl) {
        // Remove existing suggestion
        var existing = document.getElementById('slAISuggestChip');
        if (existing) existing.remove();

        var chip = document.createElement('div');
        chip.id = 'slAISuggestChip';
        chip.style.cssText = [
            'position:fixed',
            'bottom:90px',
            'right:20px',
            'background:linear-gradient(135deg,rgba(212,175,55,0.98),rgba(184,148,31,0.98))',
            'color:#0a0a0a',
            'padding:14px 18px',
            'border-radius:14px',
            'box-shadow:0 16px 40px rgba(0,0,0,0.45),0 0 0 1px rgba(212,175,55,0.3)',
            'cursor:pointer',
            'z-index:10000',
            'max-width:340px',
            'font-family:inherit',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'animation:slChipIn .4s cubic-bezier(0.18,0.89,0.32,1.28)'
        ].join(';');
        chip.innerHTML =
            '<i class="fas fa-wand-magic-sparkles" style="font-size:18px;flex-shrink:0"></i>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;font-size:13px;margin-bottom:2px">Try this with AI Concierge</div>' +
            '<div style="font-size:12px;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            query.replace(/</g, '&lt;') + '</div></div>' +
            '<button type="button" aria-label="Dismiss" style="background:rgba(10,10,10,0.15);border:none;width:26px;height:26px;border-radius:8px;cursor:pointer;color:#0a0a0a;font-weight:700;flex-shrink:0">&times;</button>';

        chip.addEventListener('click', function (e) {
            if (e.target.tagName === 'BUTTON') {
                chip.remove();
                return;
            }
            openConciergeWith(query);
            chip.remove();
        });

        document.body.appendChild(chip);
        setTimeout(function () { if (chip.parentNode) chip.remove(); }, 8000);
    }

    function init() {
        // Inject keyframe once
        if (!document.getElementById('slAIBridgeStyles')) {
            var st = document.createElement('style');
            st.id = 'slAIBridgeStyles';
            st.textContent = '@keyframes slChipIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
            document.head.appendChild(st);
        }

        // Primary search inputs on both pages
        var selectors = [
            '#slSearchInput',
            '#slMapSearchInput',
            '.sl-map-searchbar input',
            '.sl-search-input',
            'input[data-sl-search]',
            'input[placeholder*="earch" i]'
        ];
        selectors.forEach(function (sel) {
            var els = document.querySelectorAll(sel);
            els.forEach(injectAIChip);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    // Also re-scan once after delayed script loads
    setTimeout(init, 1200);
})();