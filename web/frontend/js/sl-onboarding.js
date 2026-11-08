/**
 * SceneLink Onboarding Flow
 * 
 * First-visit welcome modal with preference capture.
 * Integrates with SLState to personalize experience.
 * Shows only once (tracked via localStorage.sl_onboarded).
 */
(function(){
    'use strict';

    var ONBOARDED_KEY = 'sl_onboarded';
    var PREFS_KEY = 'sl_user_preferences';
    var interrupted = false;
    // Explicit venue/auth flows take precedence for this visit, without marking
    // onboarding complete or changing the user's saved preferences.
    function interrupt(){
        interrupted = true;
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }
    window.addEventListener('sl:explicit-modal', interrupt);
    function onInteraction(e){
        var target = e.target;
        if (!target || !target.closest || target.closest('#sl-ob-overlay')) return;
        if (target.closest('button, a[href], input, textarea, select, [contenteditable], [role="button"], [role="tab"]')) interrupt();
    }
    // Once a visitor starts navigating or editing, welcome can wait until a
    // future visit. Capture runs before click handlers open their own dialogs.
    document.addEventListener('click', onInteraction, true);
    document.addEventListener('focusin', onInteraction, true);

    // Skip if already onboarded/dismissed OR on auth-only pages
    function shouldShow(){
        if (interrupted || document.querySelector('.sl-vd-overlay.sl-open, .sl-auth-overlay.open')) return false;
        var v = localStorage.getItem(ONBOARDED_KEY);
        if (v === '1' || v === 'dismissed') return false;
        var path = window.location.pathname;
        // Don't show on business dashboard or plain auth pages
        if (/business\.html|\/business$/.test(path)) return false;
        return true;
    }

    // Inject styles
    function injectStyles(){
        if (document.getElementById('sl-ob-styles')) return;
        var css = `
        #sl-ob-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(0,0,0,0.75); backdrop-filter: blur(12px);
            display: flex; align-items: center; justify-content: center;
            padding: 20px; animation: slobFade 0.4s ease;
        }
        @keyframes slobFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slobRise { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        #sl-ob-modal {
            width: 100%; max-width: 560px;
            background: linear-gradient(135deg, rgba(20,20,20,0.95), rgba(10,10,10,0.98));
            border: 1px solid rgba(212,175,55,0.25); border-radius: 20px;
            padding: 36px 32px 28px; color: #fff;
            box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset;
            animation: slobRise 0.5s cubic-bezier(.2,.9,.25,1);
            max-height: 90vh; overflow-y: auto;
        }
        .sl-ob-step { display: none; }
        .sl-ob-step.active { display: block; }
        .sl-ob-progress {
            display: flex; gap: 6px; margin-bottom: 28px;
        }
        .sl-ob-dot {
            flex: 1; height: 3px; background: rgba(255,255,255,0.1);
            border-radius: 2px; transition: background 0.3s;
        }
        .sl-ob-dot.active { background: linear-gradient(90deg, #D4AF37, #f5d670); }
        .sl-ob-dot.done { background: rgba(212,175,55,0.4); }
        .sl-ob-hero-emoji {
            font-size: 56px; text-align: center; margin-bottom: 16px;
            filter: drop-shadow(0 4px 12px rgba(212,175,55,0.3));
        }
        .sl-ob-title {
            font-size: 26px; font-weight: 800; text-align: center;
            margin-bottom: 10px; letter-spacing: -0.02em;
            background: linear-gradient(135deg, #fff, #D4AF37);
            -webkit-background-clip: text; background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .sl-ob-sub {
            font-size: 14px; color: rgba(255,255,255,0.65);
            text-align: center; margin-bottom: 28px; line-height: 1.5;
        }
        .sl-ob-section-title {
            font-size: 15px; font-weight: 700; color: #D4AF37;
            margin-bottom: 12px; margin-top: 20px;
        }
        .sl-ob-section-title:first-of-type { margin-top: 0; }
        .sl-ob-chips {
            display: flex; flex-wrap: wrap; gap: 8px;
        }
        .sl-ob-chip {
            padding: 10px 16px; border-radius: 999px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            color: #fff; font-size: 13px; font-weight: 500;
            cursor: pointer; transition: all 0.2s;
            display: inline-flex; align-items: center; gap: 6px;
        }
        .sl-ob-chip:hover { background: rgba(255,255,255,0.08); }
        .sl-ob-chip.selected {
            background: linear-gradient(135deg, rgba(212,175,55,0.2), rgba(184,134,11,0.15));
            border-color: rgba(212,175,55,0.6);
            color: #D4AF37;
        }
        .sl-ob-chip.selected::before { content: "✓ "; }
        .sl-ob-actions {
            display: flex; gap: 10px; margin-top: 28px;
            justify-content: space-between; align-items: center;
        }
        .sl-ob-btn {
            padding: 12px 24px; border-radius: 10px;
            font-size: 14px; font-weight: 700; cursor: pointer;
            border: none; transition: all 0.2s;
            display: inline-flex; align-items: center; gap: 6px;
        }
        .sl-ob-btn-primary {
            background: linear-gradient(135deg, #D4AF37, #b8860b);
            color: #000;
            box-shadow: 0 4px 16px rgba(212,175,55,0.3);
        }
        .sl-ob-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,175,55,0.4); }
        .sl-ob-btn-ghost {
            background: transparent; color: rgba(255,255,255,0.5);
        }
        .sl-ob-btn-ghost:hover { color: #fff; }
        .sl-ob-close {
            position: absolute; top: 14px; right: 14px;
            width: 32px; height: 32px; border-radius: 50%;
            background: rgba(255,255,255,0.05); color: #fff;
            border: none; font-size: 16px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
        }
        .sl-ob-close:hover { background: rgba(255,255,255,0.1); }
        .sl-ob-notif-box {
            background: rgba(212,175,55,0.08);
            border: 1px solid rgba(212,175,55,0.2);
            border-radius: 12px; padding: 20px;
            display: flex; align-items: flex-start; gap: 14px;
        }
        .sl-ob-notif-box i { font-size: 24px; color: #D4AF37; margin-top: 2px; }
        .sl-ob-notif-box-text { flex: 1; font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.5; }
        .sl-ob-notif-box-text strong { color: #fff; display: block; margin-bottom: 4px; font-size: 14px; }
        .sl-ob-feature-list {
            list-style: none; padding: 0; margin: 0 0 24px;
        }
        .sl-ob-feature-list li {
            padding: 10px 0;
            display: flex; align-items: center; gap: 12px;
            font-size: 14px; color: rgba(255,255,255,0.8);
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .sl-ob-feature-list li:last-child { border-bottom: none; }
        .sl-ob-feature-list i {
            color: #D4AF37; width: 22px; text-align: center;
        }
        @media (max-width: 480px) {
            #sl-ob-modal { padding: 28px 22px 22px; border-radius: 16px; }
            .sl-ob-title { font-size: 22px; }
        }
        `;
        var style = document.createElement('style');
        style.id = 'sl-ob-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    var state = {
        step: 0,
        prefs: {
            cuisines: [],
            vibes: [],
            neighborhoods: []
        }
    };

    var CUISINES = ['Italian', 'Japanese', 'Mexican', 'American', 'Seafood', 'Thai', 'Steakhouse', 'Mediterranean', 'French', 'Indian'];
    var VIBES = ['Date Night', 'Cocktail Bar', 'Rooftop', 'Live Music', 'Nightclub', 'Casual', 'Fine Dining', 'Brunch', 'Sports Bar', 'Hidden Gem'];
    var NEIGHBORHOODS = ['Back Bay', 'South End', 'North End', 'Seaport', 'Downtown', 'Cambridge', 'Beacon Hill', 'Fort Point', 'Fenway', 'Somerville'];

    function render(){
        var dots = state.step;
        var html = `
        <div id="sl-ob-modal" style="position:relative;">
            <button class="sl-ob-close" id="slObCloseX" aria-label="Close">×</button>
            <div class="sl-ob-progress">
                <div class="sl-ob-dot ${state.step>=0?'active':''}"></div>
                <div class="sl-ob-dot ${state.step>=1?'active':''}"></div>
                <div class="sl-ob-dot ${state.step>=2?'active':''}"></div>
                <div class="sl-ob-dot ${state.step>=3?'active':''}"></div>
            </div>
            
            <!-- Step 0: Welcome -->
            <div class="sl-ob-step ${state.step===0?'active':''}">
                <div class="sl-ob-hero-emoji">🌆</div>
                <div class="sl-ob-title">Welcome to SceneLink</div>
                <div class="sl-ob-sub">Boston's smartest way to discover restaurants, bars, and nightlife — powered by real-time data and AI.</div>
                <ul class="sl-ob-feature-list">
                    <li><i class="fas fa-map-marker-alt"></i> Search the Boston venue directory; confirm details with each venue</li>
                    <li><i class="fas fa-magic"></i> AI Concierge — ask anything, get real answers</li>
                    <li><i class="fas fa-users"></i> Plan nights with friends, vote on venues</li>
                    <li><i class="fas fa-heart"></i> Save, list, and track your favorites</li>
                </ul>
                <div class="sl-ob-actions">
                    <button class="sl-ob-btn sl-ob-btn-ghost" id="slObSkip">Skip</button>
                    <button class="sl-ob-btn sl-ob-btn-primary" id="slObNext">Let's go <i class="fas fa-arrow-right"></i></button>
                </div>
            </div>

            <!-- Step 1: Preferences -->
            <div class="sl-ob-step ${state.step===1?'active':''}">
                <div class="sl-ob-title" style="font-size:22px;margin-bottom:6px;">What do you love?</div>
                <div class="sl-ob-sub">Pick a few to personalize your feed. You can change these anytime.</div>
                <div class="sl-ob-section-title">Cuisines</div>
                <div class="sl-ob-chips" data-group="cuisines">
                    ${CUISINES.map(function(c){ return '<div class="sl-ob-chip" data-val="'+c+'">'+c+'</div>'; }).join('')}
                </div>
                <div class="sl-ob-section-title">Vibes</div>
                <div class="sl-ob-chips" data-group="vibes">
                    ${VIBES.map(function(v){ return '<div class="sl-ob-chip" data-val="'+v+'">'+v+'</div>'; }).join('')}
                </div>
                <div class="sl-ob-actions">
                    <button class="sl-ob-btn sl-ob-btn-ghost" id="slObBack"><i class="fas fa-arrow-left"></i> Back</button>
                    <button class="sl-ob-btn sl-ob-btn-primary" id="slObNext">Next <i class="fas fa-arrow-right"></i></button>
                </div>
            </div>

            <!-- Step 2: Neighborhoods -->
            <div class="sl-ob-step ${state.step===2?'active':''}">
                <div class="sl-ob-title" style="font-size:22px;margin-bottom:6px;">Which neighborhoods?</div>
                <div class="sl-ob-sub">Where do you want to spend your nights?</div>
                <div class="sl-ob-chips" data-group="neighborhoods">
                    ${NEIGHBORHOODS.map(function(n){ return '<div class="sl-ob-chip" data-val="'+n+'">'+n+'</div>'; }).join('')}
                </div>
                <div class="sl-ob-actions">
                    <button class="sl-ob-btn sl-ob-btn-ghost" id="slObBack"><i class="fas fa-arrow-left"></i> Back</button>
                    <button class="sl-ob-btn sl-ob-btn-primary" id="slObNext">Next <i class="fas fa-arrow-right"></i></button>
                </div>
            </div>

            <!-- Step 3: Notifications -->
            <div class="sl-ob-step ${state.step===3?'active':''}">
                <div class="sl-ob-hero-emoji">🔔</div>
                <div class="sl-ob-title" style="font-size:22px;">Stay in the loop</div>
                <div class="sl-ob-sub">Choose whether to receive supported SceneLink notifications.</div>
                <div class="sl-ob-notif-box">
                    <i class="fas fa-bell"></i>
                    <div class="sl-ob-notif-box-text">
                        <strong>What you'll get</strong>
                        Friend requests · Plan invitations · Replies to your activity
                    </div>
                </div>
                <div class="sl-ob-actions">
                    <button class="sl-ob-btn sl-ob-btn-ghost" id="slObSkipNotif">Maybe later</button>
                    <button class="sl-ob-btn sl-ob-btn-primary" id="slObEnableNotif"><i class="fas fa-bell"></i> Enable notifications</button>
                </div>
            </div>
        </div>`;
        overlay.innerHTML = html;
        bindStep();
    }

    var overlay;

    function bindStep(){
        // Chip selection
        overlay.querySelectorAll('.sl-ob-chips').forEach(function(group){
            var key = group.dataset.group;
            group.querySelectorAll('.sl-ob-chip').forEach(function(chip){
                var val = chip.dataset.val;
                if (state.prefs[key].indexOf(val) !== -1) chip.classList.add('selected');
                chip.addEventListener('click', function(){
                    var idx = state.prefs[key].indexOf(val);
                    if (idx > -1) {
                        state.prefs[key].splice(idx, 1);
                        chip.classList.remove('selected');
                    } else {
                        state.prefs[key].push(val);
                        chip.classList.add('selected');
                    }
                });
            });
        });

        // Nav buttons
        var nextBtn = overlay.querySelector('#slObNext');
        if (nextBtn) nextBtn.addEventListener('click', function(){
            state.step++;
            if (state.step > 3) { complete(); return; }
            render();
        });
        var backBtn = overlay.querySelector('#slObBack');
        if (backBtn) backBtn.addEventListener('click', function(){
            if (state.step > 0) { state.step--; render(); }
        });
        var skipBtn = overlay.querySelector('#slObSkip');
        if (skipBtn) skipBtn.addEventListener('click', dismiss);
        var closeBtn = overlay.querySelector('#slObCloseX');
        if (closeBtn) closeBtn.addEventListener('click', dismiss);

        var enableN = overlay.querySelector('#slObEnableNotif');
        if (enableN) enableN.addEventListener('click', function(){
            if (window.SLNotifications && typeof SLNotifications.request === 'function') {
                SLNotifications.request().finally(complete);
            } else if ('Notification' in window) {
                Notification.requestPermission().finally(complete);
            } else {
                complete();
            }
        });
        var skipN = overlay.querySelector('#slObSkipNotif');
        if (skipN) skipN.addEventListener('click', dismiss);
    }

    // Phase 7C: dismiss = close without recording prefs; remembered so we
    // don't keep showing the modal to a user who explicitly closed it.
    function dismiss(){
        try { localStorage.setItem(ONBOARDED_KEY, 'dismissed'); } catch(_){}
        if (window.SLAnalytics) SLAnalytics.track('onboarding_dismissed');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s';
            setTimeout(function(){ if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
        }
    }

    function complete(){
        // Save preferences
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch(_){}
        localStorage.setItem(ONBOARDED_KEY, '1');
        // Dispatch event so concierge / feed can use preferences
        try {
            window.dispatchEvent(new CustomEvent('sl:onboarded', { detail: state.prefs }));
        } catch(_){}
        // Analytics
        if (window.SLAnalytics) SLAnalytics.track('onboarding_complete', { prefs: state.prefs });
        // Fade out
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s';
            setTimeout(function(){ if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
        }
    }

    function start(){
        if (!shouldShow() || (overlay && overlay.isConnected)) return;
        injectStyles();
        overlay = document.createElement('div');
        overlay.id = 'sl-ob-overlay';
        document.body.appendChild(overlay);
        render();
        // Phase 8F: never let the overlay trap the user.
        // Dismiss on Escape key and on backdrop click (clicking outside the modal).
        overlay.addEventListener('mousedown', function(e){
            if (e.target === overlay) dismiss();
        });
        var escHandler = function(e){
            if (overlay && overlay.isConnected && (e.key === 'Escape' || e.keyCode === 27)) {
                dismiss();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        if (window.SLAnalytics) SLAnalytics.track('onboarding_start');
    }

    // Expose global API
    window.SLOnboarding = {
        start: start,
        reset: function(){ localStorage.removeItem(ONBOARDED_KEY); localStorage.removeItem(PREFS_KEY); },
        getPrefs: function(){
            try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
            catch(_){ return {}; }
        },
        isComplete: function(){ return localStorage.getItem(ONBOARDED_KEY) === '1'; }
    };

    // Phase 7C: defer onboarding so the hero is fully visible first.
    // - Wait at least 4 seconds after page is interactive
    // Explicit interactions never trigger an unrelated welcome modal.
    function autoStart(){
        var fired = false;
        function go(){
            if (fired) return;
            fired = true;
            window.removeEventListener('scroll', go);
            start();
        }
        setTimeout(go, 4000);
        window.addEventListener('scroll', go, { passive: true, once: true });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoStart);
    } else {
        autoStart();
    }
})();