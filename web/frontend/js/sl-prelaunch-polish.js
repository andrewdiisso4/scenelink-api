/* =====================================================
 * SceneLink - Pre-Launch Polish (v1)
 * Additive JS that improves trust, conversion, UX.
 * All helpers are exposed on window.SLPolish and window.SLToast
 * so other scripts can use them. Nothing overrides existing
 * working logic.
 * ===================================================== */
(function () {
    'use strict';

    // ---------- TOAST SYSTEM (unified) ----------
    function toast(message, kind) {
        try {
            var existing = document.querySelectorAll('.sl-toast');
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].parentNode) existing[i].parentNode.removeChild(existing[i]);
            }
            var el = document.createElement('div');
            el.className = 'sl-toast sl-toast--' + (kind || 'info');
            var icon = kind === 'saved' ? '✓' : kind === 'error' ? '⚠' : 'ℹ';
            el.innerHTML = '<span style="font-weight:700;color:#D4AF37;font-size:16px">' +
                icon + '</span><span>' + String(message || '').replace(/</g, '&lt;') + '</span>';
            document.body.appendChild(el);
            setTimeout(function () {
                el.style.opacity = '0';
                el.style.transform = 'translate(-50%, 10px)';
                el.style.transition = 'all 0.25s ease';
                setTimeout(function () {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, 300);
            }, 3200);
        } catch (e) {}
    }

    window.SLToast = window.SLToast || {};
    window.SLToast.show = toast;
    window.SLToast.info = function (m) { toast(m, 'info'); };
    window.SLToast.success = function (m) { toast(m, 'saved'); };
    window.SLToast.saved = function (m) { toast(m, 'saved'); };
    window.SLToast.error = function (m) { toast(m, 'error'); };

    // ---------- AUTH STATE HELPER ----------
    function isLoggedIn() {
        try {
            if (window.SLApi && typeof window.SLApi.isLoggedIn === 'function') return window.SLApi.isLoggedIn();
            if (window.SLAuth && typeof window.SLAuth.isAuthed === 'function') return window.SLAuth.isAuthed();
            return !!(localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_jwt_v2'));
        } catch (_) { return false; }
    }

    // ---------- LOGIN PROMPT MODAL (premium replacement for plain toast) ----------
    function showLoginPrompt(actionLabel, opts) {
        opts = opts || {};
        // Don't double-show
        var existing = document.querySelector('.sl-login-prompt-modal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.className = 'sl-login-prompt-modal';
        modal.innerHTML =
            '<div class="sl-login-prompt-card" role="dialog" aria-modal="true">' +
              '<button class="sl-login-prompt-close" aria-label="Close" type="button">&times;</button>' +
              '<div class="sl-login-prompt-icon"><i class="fas fa-lock"></i></div>' +
              '<h3 class="sl-login-prompt-title">' + (opts.title || 'Sign in to SceneLink') + '</h3>' +
              '<p class="sl-login-prompt-text">' +
                (opts.body ||
                  'Create a free SceneLink account to ' +
                  (actionLabel || 'unlock this feature') +
                  '. Save spots, build plans with friends, and get AI-powered recommendations tuned to your taste.') +
              '</p>' +
              '<div class="sl-login-prompt-actions">' +
                '<button type="button" class="sl-login-prompt-btn-primary" data-action="login">Sign in</button>' +
                '<button type="button" class="sl-login-prompt-btn-secondary" data-action="signup">Create account</button>' +
              '</div>' +
            '</div>';

        document.body.appendChild(modal);
        // Prevent body scroll
        var prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        function close() {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            document.body.style.overflow = prevOverflow;
        }

        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
            if (e.target.closest('.sl-login-prompt-close')) close();
            var btn = e.target.closest('[data-action]');
            if (btn) {
                var action = btn.getAttribute('data-action');
                close();
                try {
                    if (window.SLAuth && typeof window.SLAuth.openLogin === 'function') {
                        window.SLAuth.openLogin(action === 'signup' ? 'signup' : 'login');
                        return;
                    }
                    if (window.SLAuthUI && typeof window.SLAuthUI.open === 'function') {
                        window.SLAuthUI.open(action === 'signup' ? 'signup' : 'login');
                        return;
                    }
                } catch (_) {}
                // Last-resort fallback — navigate to page with auth modal auto-open
                window.location.href = 'profile.html?auth=' + (action === 'signup' ? 'signup' : 'login');
            }
        });

        // Escape to close
        function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
        document.addEventListener('keydown', onKey);

        return close;
    }

    // Public API
    window.SLPolish = window.SLPolish || {};
    window.SLPolish.showLoginPrompt = showLoginPrompt;
    window.SLPolish.isLoggedIn = isLoggedIn;
    window.SLPolish.toast = toast;

    // Hijack the simple alert-style login prompts used by older scripts
    // (non-destructive — only runs if they try to alert() with certain patterns)
    var _origAlert = window.alert;
    window.alert = function (msg) {
        if (typeof msg === 'string' && /please (sign|log) ?in/i.test(msg)) {
            var m = msg.match(/to ([^.]+)/);
            showLoginPrompt(m ? m[1] : 'continue');
            return;
        }
        return _origAlert.apply(this, arguments);
    };

    // ---------- "REPORT INCORRECT INFO" CTA on venue detail ----------
    function initReportVenueCTA() {
        // Look for venue detail footer area
        var targets = document.querySelectorAll('.sl-vd-footer-meta, .venue-detail-footer, [data-venue-detail-footer]');
        targets.forEach(function (t) {
            if (t.querySelector('.sl-report-venue-link')) return;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sl-report-venue-link';
            btn.innerHTML = '<i class="fas fa-flag"></i> Report incorrect info';
            btn.addEventListener('click', function () {
                openReportForm(t);
            });
            t.appendChild(btn);
        });
    }

    function openReportForm(contextEl) {
        // Grab venue id/name from nearest ancestor
        var venueId = '';
        var venueName = '';
        try {
            var card = contextEl && contextEl.closest ? contextEl.closest('[data-venue-id]') : null;
            if (card) {
                venueId = card.getAttribute('data-venue-id') || '';
                venueName = card.getAttribute('data-venue-name') || '';
            }
        } catch (_) {}

        // Simple modal with pre-filled contact form
        var email = 'info@scenelink.app';
        var subject = encodeURIComponent('Report incorrect venue info' + (venueName ? ' — ' + venueName : ''));
        var body = encodeURIComponent(
            'Hi SceneLink team,\n\nI found incorrect info for' +
            (venueName ? ' "' + venueName + '"' : ' a venue') +
            (venueId ? ' (id: ' + venueId + ')' : '') +
            '.\n\nWhat is wrong:\n\nCorrect info (if known):\n\nThanks!'
        );
        // Open mailto, which works on desktop + mobile
        window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
    }

    window.SLPolish.initReportVenueCTA = initReportVenueCTA;

    // ---------- EMPTY STATE UPGRADES ----------
    // Look for thin/legacy empty messages and replace with premium cards
    function upgradeEmptyMessages() {
        var selectors = [
            '[data-empty]',
            '.legacy-empty',
            '.empty-msg-simple'
        ];
        selectors.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                if (el.classList.contains('sl-empty-state')) return;
                el.classList.add('sl-empty-state');
            });
        });
    }

    // ---------- INIT ----------
    function init() {
        upgradeEmptyMessages();
        initReportVenueCTA();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-scan after dynamic content loads
    if (window.MutationObserver) {
        var obs = new MutationObserver(function (mutations) {
            var has = false;
            for (var i = 0; i < mutations.length && !has; i++) {
                if (mutations[i].addedNodes.length) has = true;
            }
            if (has) { initReportVenueCTA(); upgradeEmptyMessages(); }
        });
        if (document.body) obs.observe(document.body, { childList: true, subtree: true });
        else document.addEventListener('DOMContentLoaded', function () {
            obs.observe(document.body, { childList: true, subtree: true });
        });
    }
})();