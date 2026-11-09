/* Phase 7D UI bundle - secondary deferred scripts */

/* === js/sl-app-waitlist.js === */
/**
 * SceneLink — App Waitlist Capture
 * Upgrades App Store / Google Play footer badges into an email-capture popup
 * instead of the toast "Coming soon". Persists submissions via POST /api/newsletter
 * with source="app_waitlist_ios" or "app_waitlist_android".
 */
(function () {
  'use strict';

  function apiBase() {
    return (window.SLConfig && (window.SLConfig.API_URL || window.SLConfig.API_BASE_URL)) ||
           (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) ||
           '/api';
  }

  function closeModal() {
    var m = document.getElementById('sl-waitlist-modal');
    if (m) m.remove();
  }

  function openModal(platform) {
    closeModal();
    var modal = document.createElement('div');
    modal.id = 'sl-waitlist-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;animation:sl-wl-fade 0.2s ease-out;';

    var isIOS = platform === 'ios';
    var plat = isIOS ? 'iOS' : 'Android';
    var icon = isIOS ? 'fa-apple' : 'fa-google-play';

    modal.innerHTML =
      '<style>@keyframes sl-wl-fade{from{opacity:0}to{opacity:1}}@keyframes sl-wl-pop{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}</style>' +
      '<div role="dialog" aria-modal="true" aria-labelledby="sl-wl-title" style="background:linear-gradient(180deg,#1a1f2e 0%,#0f1420 100%);border:1px solid rgba(212,175,55,0.3);border-radius:20px;max-width:440px;width:100%;padding:36px 32px;position:relative;animation:sl-wl-pop 0.25s ease-out;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
        '<button id="sl-wl-close" aria-label="Close" style="position:absolute;top:14px;right:14px;background:transparent;border:none;color:rgba(255,255,255,0.5);font-size:24px;cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseout="this.style.background=\'transparent\'">&times;</button>' +
        '<div style="text-align:center;margin-bottom:20px;">' +
          '<div style="width:60px;height:60px;margin:0 auto 14px;background:linear-gradient(135deg,#D4AF37,#B8912A);border-radius:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(212,175,55,0.3);">' +
            '<i class="fab ' + icon + '" style="font-size:28px;color:#000"></i>' +
          '</div>' +
          '<h3 id="sl-wl-title" style="color:#D4AF37;font-size:20px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;">SceneLink for ' + plat + '</h3>' +
          '<p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0;line-height:1.5;">The app is in active development. Join the waitlist and we\'ll email you the moment it\'s ready.</p>' +
        '</div>' +
        '<form id="sl-wl-form" style="display:flex;flex-direction:column;gap:10px;">' +
          '<input id="sl-wl-email" type="email" required placeholder="you@example.com" autocomplete="email" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:12px 14px;border-radius:10px;font-size:14px;font-family:inherit;outline:none;transition:all 0.2s;" />' +
          '<button type="submit" id="sl-wl-submit" style="background:linear-gradient(135deg,#D4AF37,#B8912A);color:#000;font-weight:700;border:none;padding:12px;border-radius:10px;cursor:pointer;font-size:14px;transition:all 0.2s;font-family:inherit;">Notify Me</button>' +
        '</form>' +
        '<div id="sl-wl-result" style="text-align:center;margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);"></div>' +
        '<p style="text-align:center;margin:14px 0 0;font-size:11px;color:rgba(255,255,255,0.4);">We\'ll only use your email for launch notifications. Unsubscribe anytime.</p>' +
      '</div>';

    document.body.appendChild(modal);

    var emailEl = document.getElementById('sl-wl-email');
    if (emailEl) {
      emailEl.focus();
      emailEl.addEventListener('focus', function () { emailEl.style.borderColor = '#D4AF37'; });
      emailEl.addEventListener('blur', function () { emailEl.style.borderColor = 'rgba(255,255,255,0.12)'; });
    }

    document.getElementById('sl-wl-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    document.getElementById('sl-wl-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = (emailEl.value || '').trim();
      var submitBtn = document.getElementById('sl-wl-submit');
      var result = document.getElementById('sl-wl-result');
      if (!email) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Joining…';
      result.style.color = 'rgba(255,255,255,0.5)';
      result.textContent = '';

      try {
        var res = await fetch(apiBase() + '/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            source: 'app_waitlist_' + platform
          })
        });
        // Accept 200 or 409 (already subscribed) as success
        if (res.ok || res.status === 409) {
          result.style.color = '#D4AF37';
          result.innerHTML = '<i class="fas fa-check-circle"></i> You\'re on the list. We\'ll be in touch soon.';
          submitBtn.style.display = 'none';
          emailEl.disabled = true;
          setTimeout(closeModal, 2400);
        } else {
          var err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Something went wrong');
        }
      } catch (err) {
        result.style.color = '#ef4444';
        result.textContent = 'Error: ' + (err.message || 'Please try again');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Notify Me';
      }
    });
  }

  function wireAppBadges() {
    // Find all app-badge-like anchors: footer-app-badges children, or any anchor with fa-apple/fa-google-play
    var badges = document.querySelectorAll('.footer-app-badges a, a.app-badge, [data-app-waitlist]');
    badges.forEach(function (a) {
      if (a.dataset.slWaitlistWired === '1') return;
      a.dataset.slWaitlistWired = '1';
      // Detect platform
      var icon = a.querySelector('i');
      var isIOS = icon && /fa-apple/.test(icon.className);
      var isAndroid = icon && /fa-google-play/.test(icon.className);
      if (!isIOS && !isAndroid) {
        // Fallback: check text
        var txt = (a.textContent || '').toLowerCase();
        isIOS = /app store|ios|iphone/.test(txt);
        isAndroid = /google play|android/.test(txt);
      }
      if (!isIOS && !isAndroid) return;
      // Strip legacy inline onclick that shows the old toast
      a.removeAttribute('onclick');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(isIOS ? 'ios' : 'android');
      });
    });
  }

  function init() {
    wireAppBadges();
    // Re-wire if footer is injected dynamically
    var observer = new MutationObserver(wireAppBadges);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* === js/sl-notifications.js === */
/**
 * SceneLink Notifications
 * 
 * Non-intrusive, premium permission flow wrapping Notification API.
 * Triggers after meaningful user actions (not page load).
 */
(function(){
    'use strict';

    var DECISION_KEY = 'sl_notify_decision'; // 'granted' | 'denied' | 'deferred' | 'default'
    var TRIGGER_COUNT_KEY = 'sl_notify_trigger_count';
    var DEFER_UNTIL_KEY = 'sl_notify_defer_until';
    var MIN_TRIGGERS_BEFORE_PROMPT = 2;

    function hasSupport(){ return 'Notification' in window; }
    function currentBrowserPerm(){ return hasSupport() ? Notification.permission : 'unsupported'; }

    function getDecision(){
        var d = localStorage.getItem(DECISION_KEY);
        if (d) return d;
        return currentBrowserPerm(); // fall back to browser's view
    }

    function setDecision(d){
        localStorage.setItem(DECISION_KEY, d);
    }

    function shouldShowPrompt(){
        if (!hasSupport()) return false;
        var perm = currentBrowserPerm();
        if (perm === 'granted' || perm === 'denied') return false;
        var decision = localStorage.getItem(DECISION_KEY);
        if (decision === 'deferred') {
            var until = parseInt(localStorage.getItem(DEFER_UNTIL_KEY) || '0', 10);
            if (Date.now() < until) return false;
        }
        var count = parseInt(localStorage.getItem(TRIGGER_COUNT_KEY) || '0', 10);
        return count >= MIN_TRIGGERS_BEFORE_PROMPT;
    }

    function injectStyles(){
        if (document.getElementById('sl-notif-styles')) return;
        var css = `
        #sl-notif-prompt {
            position: fixed; bottom: 24px; right: 24px; z-index: 99990;
            width: 360px; max-width: calc(100vw - 32px);
            background: linear-gradient(135deg, rgba(20,20,20,0.97), rgba(10,10,10,0.99));
            border: 1px solid rgba(212,175,55,0.3); border-radius: 16px;
            padding: 20px 22px 18px; color: #fff;
            box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset;
            animation: slnSlideUp 0.5s cubic-bezier(.2,.9,.25,1);
            backdrop-filter: blur(12px);
        }
        @keyframes slnSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slnSlideDown { to { opacity: 0; transform: translateY(30px); } }
        #sl-notif-prompt.closing { animation: slnSlideDown 0.3s forwards; }
        .sln-head {
            display: flex; align-items: center; gap: 12px; margin-bottom: 10px;
        }
        .sln-icon {
            width: 40px; height: 40px; border-radius: 12px;
            background: linear-gradient(135deg, rgba(212,175,55,0.2), rgba(184,134,11,0.1));
            display: flex; align-items: center; justify-content: center;
            color: #D4AF37; font-size: 18px;
        }
        .sln-title {
            font-size: 15px; font-weight: 700; color: #fff;
            letter-spacing: -0.01em;
        }
        .sln-sub {
            font-size: 12px; color: rgba(255,255,255,0.5);
            margin-top: 2px;
        }
        .sln-body {
            font-size: 13px; color: rgba(255,255,255,0.75);
            line-height: 1.5; margin-bottom: 14px;
        }
        .sln-actions {
            display: flex; gap: 8px; justify-content: flex-end;
        }
        .sln-btn {
            padding: 8px 14px; border-radius: 8px;
            font-size: 12px; font-weight: 600; cursor: pointer;
            border: none; transition: all 0.2s;
        }
        .sln-btn-primary {
            background: linear-gradient(135deg, #D4AF37, #b8860b);
            color: #000;
        }
        .sln-btn-primary:hover { transform: translateY(-1px); }
        .sln-btn-ghost {
            background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6);
            border: 1px solid rgba(255,255,255,0.08);
        }
        .sln-btn-ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .sln-close {
            position: absolute; top: 8px; right: 8px;
            width: 24px; height: 24px; border-radius: 50%;
            background: transparent; color: rgba(255,255,255,0.4);
            border: none; font-size: 14px; cursor: pointer;
        }
        .sln-close:hover { color: #fff; }
        @media (max-width: 480px) {
            #sl-notif-prompt { bottom: 12px; right: 12px; left: 12px; width: auto; }
        }
        `;
        var s = document.createElement('style');
        s.id = 'sl-notif-styles';
        s.textContent = css;
        document.head.appendChild(s);
    }

    function showPrompt(options){
        if (!hasSupport()) return Promise.reject(new Error('Notifications not supported'));
        options = options || {};
        injectStyles();
        // Remove any existing prompt
        var existing = document.getElementById('sl-notif-prompt');
        if (existing) existing.remove();

        return new Promise(function(resolve){
            var el = document.createElement('div');
            el.id = 'sl-notif-prompt';
            el.innerHTML = `
                <button class="sln-close" aria-label="Close">×</button>
                <div class="sln-head">
                    <div class="sln-icon"><i class="fas fa-bell"></i></div>
                    <div>
                        <div class="sln-title">${options.title || 'Stay in the loop'}</div>
                        <div class="sln-sub">SceneLink alerts · Free · No spam</div>
                    </div>
                </div>
                <div class="sln-body">${options.body || "Get notified about Tonight's Picks, friends' plans, and exclusive deals near you. You can turn this off anytime."}</div>
                <div class="sln-actions">
                    <button class="sln-btn sln-btn-ghost" data-action="defer">Not now</button>
                    <button class="sln-btn sln-btn-primary" data-action="allow"><i class="fas fa-bell"></i> Allow</button>
                </div>
            `;
            document.body.appendChild(el);

            function close(){
                el.classList.add('closing');
                setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 300);
            }

            el.querySelector('[data-action="allow"]').addEventListener('click', function(){
                request().then(function(result){
                    close();
                    resolve(result);
                }).catch(function(){ close(); resolve('default'); });
            });

            el.querySelector('[data-action="defer"]').addEventListener('click', function(){
                setDecision('deferred');
                // Don't re-prompt for 7 days
                localStorage.setItem(DEFER_UNTIL_KEY, String(Date.now() + 7 * 24 * 3600 * 1000));
                if (window.SLAnalytics) SLAnalytics.track('notification_deferred');
                close();
                resolve('deferred');
            });

            el.querySelector('.sln-close').addEventListener('click', function(){
                setDecision('deferred');
                localStorage.setItem(DEFER_UNTIL_KEY, String(Date.now() + 3 * 24 * 3600 * 1000));
                close();
                resolve('dismissed');
            });
        });
    }

    function request(){
        if (!hasSupport()) return Promise.reject(new Error('Notifications not supported'));
        return Notification.requestPermission().then(function(perm){
            setDecision(perm);
            if (window.SLAnalytics) SLAnalytics.track('notification_permission', { result: perm });
            if (perm === 'granted') {
                // Send welcome notification
                try {
                    new Notification('SceneLink alerts enabled', {
                        body: "You'll get Tonight's Picks and friends' plans. Welcome!",
                        icon: '/assets/logo.png'
                    });
                } catch(_){}
            }
            return perm;
        });
    }

    function trigger(){
        // Called after meaningful action. Increments count, shows prompt if ready.
        if (!hasSupport()) return;
        if (currentBrowserPerm() !== 'default') return;
        var count = parseInt(localStorage.getItem(TRIGGER_COUNT_KEY) || '0', 10);
        count++;
        localStorage.setItem(TRIGGER_COUNT_KEY, String(count));
        if (shouldShowPrompt()) {
            showPrompt();
        }
    }

    // Expose
    window.SLNotifications = {
        request: request,
        showPrompt: showPrompt,
        trigger: trigger,
        getDecision: getDecision,
        shouldShow: shouldShowPrompt
    };

    // Auto-trigger on meaningful events
    function bindAutoTriggers(){
        // Listen for unified state events
        ['sl:saved', 'sl:plan-created', 'sl:checked-in'].forEach(function(evt){
            window.addEventListener(evt, function(){
                trigger();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindAutoTriggers);
    } else {
        bindAutoTriggers();
    }
})();

/* === js/sl-onboarding.js === */
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

/* === js/sl-onboarding-hint.js === */
/**
 * SceneLink — Post-Onboarding Quick Hint
 * Shows a subtle, dismissible "3 quick next steps" card AFTER the main
 * onboarding flow completes (sl_onboarded === '1'). Guides users to
 * save, create lists, and invite friends. Fires only on discovery pages.
 */
(function () {
  'use strict';

  var HINT_KEY = 'sl_hint_v1_dismissed';
  var ONBOARDED_KEY = 'sl_onboarded';
  var SHOW_ON = /^\/(index\.html|explore\.html|nightlife\.html|$)/;

  function isLoggedIn() {
    try {
      if (window.SLApi && window.SLApi.isLoggedIn && window.SLApi.isLoggedIn()) return true;
      if (window.SLAuth && window.SLAuth.isAuthed && window.SLAuth.isAuthed()) return true;
      return !!(localStorage.getItem('sl_jwt_v2') || localStorage.getItem('sl_jwt_token'));
    } catch (_) { return false; }
  }

  function shouldShow() {
    try {
      if (localStorage.getItem(HINT_KEY) === '1') return false;
      // Only after main onboarding finished
      if (localStorage.getItem(ONBOARDED_KEY) !== '1') return false;
    } catch (_) { return false; }
    if (!isLoggedIn()) return false;
    var path = window.location.pathname;
    if (path === '/' || path === '') return true;
    return SHOW_ON.test(path);
  }

  function markDismissed() {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (_) {}
  }

  function closeCard() {
    var el = document.getElementById('sl-hint-card');
    if (!el) return;
    el.style.animation = 'sl-hint-out 0.25s ease-in forwards';
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 260);
    markDismissed();
  }

  function show() {
    if (document.getElementById('sl-hint-card')) return;
    var wrap = document.createElement('div');
    wrap.id = 'sl-hint-card';
    wrap.style.cssText =
      'position:fixed;bottom:24px;right:24px;width:340px;max-width:calc(100vw - 32px);' +
      'background:linear-gradient(180deg,#1a1f2e 0%,#0f1420 100%);' +
      'border:1px solid rgba(212,175,55,0.35);border-radius:16px;padding:18px;' +
      'z-index:9998;box-shadow:0 16px 48px rgba(0,0,0,0.5);color:#fff;' +
      'font-family:inherit;animation:sl-hint-in 0.4s cubic-bezier(0.22,1,0.36,1);';

    wrap.innerHTML =
      '<style>@keyframes sl-hint-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}' +
        '@keyframes sl-hint-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(20px)}}' +
        '.sl-h-step{display:flex;align-items:flex-start;gap:10px;padding:8px 6px;border-radius:8px;cursor:pointer;text-decoration:none;color:inherit;transition:background 0.15s}' +
        '.sl-h-step:hover{background:rgba(212,175,55,0.06)}' +
        '.sl-h-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:rgba(212,175,55,0.15);color:#D4AF37;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px}' +
        '.sl-h-step:hover .sl-h-num{background:#D4AF37;color:#000}</style>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
        '<div>' +
          '<div style="color:#D4AF37;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:2px;">Next steps</div>' +
          '<div style="font-size:15px;font-weight:700;color:#fff;">Make SceneLink yours</div>' +
        '</div>' +
        '<button id="sl-h-close" aria-label="Dismiss" style="background:transparent;border:none;color:rgba(255,255,255,0.5);font-size:18px;cursor:pointer;padding:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:6px;" onmouseover="this.style.background=\'rgba(255,255,255,0.1)\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'rgba(255,255,255,0.5)\'">&times;</button>' +
      '</div>' +
      '<div>' +
        '<a href="explore.html" class="sl-h-step">' +
          '<div class="sl-h-num">1</div>' +
          '<div><div style="font-size:12px;font-weight:600;color:#fff;">Save a venue</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:1px;">Tap the heart on any spot</div></div>' +
        '</a>' +
        '<a href="my-lists.html" class="sl-h-step">' +
          '<div class="sl-h-num">2</div>' +
          '<div><div style="font-size:12px;font-weight:600;color:#fff;">Create your first list</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:1px;">"Date night picks", "Best rooftops"\u2026</div></div>' +
        '</a>' +
        '<a href="plan-with-friends.html" class="sl-h-step">' +
          '<div class="sl-h-num">3</div>' +
          '<div><div style="font-size:12px;font-weight:600;color:#fff;">Invite a friend to plan</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:1px;">SceneLink is better with your crew</div></div>' +
        '</a>' +
      '</div>' +
      '<button id="sl-h-gotit" style="width:100%;margin-top:12px;background:transparent;border:1px solid rgba(212,175,55,0.4);color:#D4AF37;font-weight:600;padding:9px;border-radius:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all 0.2s;" onmouseover="this.style.background=\'rgba(212,175,55,0.08)\'" onmouseout="this.style.background=\'transparent\'">Got it</button>';

    document.body.appendChild(wrap);
    document.getElementById('sl-h-close').addEventListener('click', closeCard);
    document.getElementById('sl-h-gotit').addEventListener('click', closeCard);
  }

  function init() {
    if (!shouldShow()) return;
    // Small delay so it doesn't fight with main onboarding teardown
    setTimeout(show, 1600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SLHint = {
    show: function () { try { localStorage.removeItem(HINT_KEY); } catch (_) {} show(); },
    reset: function () { try { localStorage.removeItem(HINT_KEY); } catch (_) {} }
  };
})();

/* === js/sl-search-enhanced.js === */
/**
 * SceneLink — Enhanced Search (Tier 4D)
 * Attaches an autocomplete dropdown to any search input on the page.
 * Remembers recent searches in localStorage.
 * Hooks: .header-search-input, #searchInput, [data-sl-search], .sl-search-input
 */
(function () {
  'use strict';

  var RECENT_KEY = 'sl_recent_searches';
  var MAX_RECENT = 6;
  var DEBOUNCE_MS = 220;

  function apiBase() {
    return (window.SLConfig && (window.SLConfig.API_URL || window.SLConfig.API_BASE_URL)) ||
           (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) ||
           '/api';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadRecents() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
  }

  function saveRecent(q) {
    q = String(q || '').trim();
    if (!q) return;
    var list = loadRecents().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
    list.unshift(q);
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById('sl-search-enhanced-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-search-enhanced-style';
    st.textContent =
      '.sl-search-wrapper { position: relative; }' +
      '.sl-search-dropdown {' +
        'position: absolute; top: calc(100% + 6px); left: 0; right: 0;' +
        'background: #111; border: 1px solid rgba(212,175,55,0.2); border-radius: 12px;' +
        'box-shadow: 0 20px 60px rgba(0,0,0,0.6); z-index: 9998;' +
        'max-height: 440px; overflow-y: auto; display: none;' +
      '}' +
      '.sl-search-dropdown.open { display: block; }' +
      '.sl-search-section { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }' +
      '.sl-search-section:last-child { border-bottom: none; }' +
      '.sl-search-section-title {' +
        'font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4);' +
        'text-transform: uppercase; letter-spacing: 0.08em; padding: 0 14px 6px;' +
      '}' +
      '.sl-search-item {' +
        'display: flex; align-items: center; gap: 10px; padding: 8px 14px;' +
        'cursor: pointer; transition: background 0.12s; color: #f5f5f5; font-size: 0.88rem;' +
      '}' +
      '.sl-search-item:hover, .sl-search-item.active { background: rgba(212,175,55,0.08); }' +
      '.sl-search-item-img { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; background: #222; flex-shrink: 0; }' +
      '.sl-search-item-body { flex: 1; min-width: 0; }' +
      '.sl-search-item-name { font-weight: 600; color: #f5f5f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
      '.sl-search-item-meta { font-size: 0.74rem; color: rgba(255,255,255,0.5); margin-top: 2px; }' +
      '.sl-search-item-icon { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(212,175,55,0.1); color: #D4AF37; flex-shrink: 0; }' +
      '.sl-search-empty { padding: 18px 14px; text-align: center; color: rgba(255,255,255,0.45); font-size: 0.85rem; }' +
      '.sl-search-loading { padding: 16px 14px; text-align: center; color: rgba(255,255,255,0.5); font-size: 0.85rem; }' +
      '.sl-search-recent-clear { font-size: 0.7rem; color: rgba(255,255,255,0.4); cursor: pointer; float: right; padding-right: 14px; }' +
      '.sl-search-recent-clear:hover { color: #D4AF37; }';
    document.head.appendChild(st);
  }

  function buildDropdown(input) {
    // Wrap input in a positioned container if not already
    var parent = input.parentElement;
    if (!parent.classList.contains('sl-search-wrapper')) {
      var wrap = document.createElement('div');
      wrap.className = 'sl-search-wrapper';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      parent = wrap;
    }
    var dd = parent.querySelector(':scope > .sl-search-dropdown');
    if (dd) return dd;
    dd = document.createElement('div');
    dd.className = 'sl-search-dropdown';
    parent.appendChild(dd);
    return dd;
  }

  function renderRecents(dd) {
    var recents = loadRecents();
    if (!recents.length) {
      dd.innerHTML = '<div class="sl-search-empty">Start typing to search venues, cuisines, or neighborhoods</div>';
      return;
    }
    dd.innerHTML =
      '<div class="sl-search-section">' +
        '<div class="sl-search-section-title">Recent <span class="sl-search-recent-clear" data-action="clear-recents">Clear</span></div>' +
        recents.map(function (q) {
          return '<div class="sl-search-item" data-query="' + escapeHtml(q) + '">' +
            '<div class="sl-search-item-icon"><i class="fas fa-clock-rotate-left"></i></div>' +
            '<div class="sl-search-item-body"><div class="sl-search-item-name">' + escapeHtml(q) + '</div></div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  function renderResults(dd, venues, query) {
    if (!venues.length) {
      dd.innerHTML = '<div class="sl-search-empty">No venues match “' + escapeHtml(query) + '”</div>';
      return;
    }
    dd.innerHTML =
      '<div class="sl-search-section">' +
        '<div class="sl-search-section-title">Venues</div>' +
        venues.slice(0, 8).map(function (v) {
          var img = v.image_url || '/assets/img/placeholder-venue.svg';
          var meta = [v.category || v.type, v.neighborhood, v.price_label].filter(Boolean).join(' · ');
          return '<div class="sl-search-item" data-venue-slug="' + escapeHtml(v.slug || '') + '" data-venue-id="' + escapeHtml(v.id || '') + '">' +
            '<img src="' + escapeHtml(img) + '" class="sl-search-item-img" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<div class="sl-search-item-body">' +
              '<div class="sl-search-item-name">' + escapeHtml(v.name || '') + '</div>' +
              '<div class="sl-search-item-meta">' + escapeHtml(meta) + '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  function attach(input) {
    if (input.__slSearchAttached) return;
    input.__slSearchAttached = true;
    ensureStyles();

    var dd = buildDropdown(input);
    var timer = null;
    var abortCtrl = null;

    function open() { dd.classList.add('open'); }
    function close() { dd.classList.remove('open'); }

    function navigateToVenue(slug, id) {
      if (slug) window.location.href = 'venue-details.html?slug=' + encodeURIComponent(slug);
      else if (id) window.location.href = 'venue-details.html?id=' + encodeURIComponent(id);
    }

    input.addEventListener('focus', function () {
      if (!input.value.trim()) renderRecents(dd);
      open();
    });

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (abortCtrl) { try { abortCtrl.abort(); } catch (_) {} }
      if (!q) {
        renderRecents(dd);
        open();
        return;
      }
      dd.innerHTML = '<div class="sl-search-loading"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
      open();
      timer = setTimeout(function () {
        abortCtrl = new AbortController();
        fetch(apiBase() + '/venues/search?q=' + encodeURIComponent(q) + '&limit=10', { signal: abortCtrl.signal })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var venues = (data && (data.venues || data.results)) || [];
            renderResults(dd, venues, q);
          })
          .catch(function (err) {
            if (err && err.name === 'AbortError') return;
            dd.innerHTML = '<div class="sl-search-empty">Could not search right now</div>';
          });
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = input.value.trim();
        if (q) saveRecent(q);
        // First item dispatch
        var first = dd.querySelector('.sl-search-item');
        if (first) {
          var slug = first.getAttribute('data-venue-slug');
          var id = first.getAttribute('data-venue-id');
          var query = first.getAttribute('data-query');
          if (slug || id) { navigateToVenue(slug, id); return; }
          if (query) { input.value = query; input.dispatchEvent(new Event('input')); return; }
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });

    dd.addEventListener('click', function (e) {
      var item = e.target.closest('.sl-search-item');
      var clearBtn = e.target.closest('[data-action="clear-recents"]');
      if (clearBtn) {
        e.stopPropagation();
        try { localStorage.removeItem(RECENT_KEY); } catch (_) {}
        renderRecents(dd);
        return;
      }
      if (!item) return;
      var slug = item.getAttribute('data-venue-slug');
      var id = item.getAttribute('data-venue-id');
      var query = item.getAttribute('data-query');
      if (slug || id) {
        saveRecent(input.value.trim() || item.querySelector('.sl-search-item-name').textContent);
        navigateToVenue(slug, id);
      } else if (query) {
        input.value = query;
        input.dispatchEvent(new Event('input'));
        input.focus();
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!dd.contains(e.target) && e.target !== input) close();
    });
  }

  function init() {
    var selectors = [
      '.header-search-input',
      '#searchInput',
      '[data-sl-search]',
      '.sl-search-input',
      'input[type="search"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(function (inp) {
      if (inp.tagName !== 'INPUT') return;
      attach(inp);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-scan for late-added search inputs
  setTimeout(init, 1000);
  setTimeout(init, 3000);

  window.SLSearchEnhanced = { init: init, attach: attach };
})();

/* === js/sl-search-ai-bridge.js === */
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

/* === js/sl-newsletter.js === */
/**
 * SceneLink — Newsletter Subscription
 * Wires all footer-newsletter-form elements to POST /api/newsletter/subscribe
 * v1.0
 */
(function () {
  'use strict';

  var API_BASE = (window.SL_CONFIG && window.SL_CONFIG.API_BASE) || 'https://scenelink-api-prod.onrender.com';

  function initNewsletterForms() {
    document.querySelectorAll('.footer-newsletter-form').forEach(function (form) {
      // Current forms are owned by sl-phase8-completion.js. Do not attach a
      // second request handler, regardless of deferred bundle load order.
      if (form.hasAttribute('data-sl-newsletter')) return;
      if (form.getAttribute('data-sl-newsletter-wired')) return;
      form.setAttribute('data-sl-newsletter-wired', '1');

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailInput = form.querySelector('input[type="email"], input[type="text"]');
        var btn = form.querySelector('button[type="submit"], button');
        if (!emailInput || !emailInput.value.trim()) return;

        var email = emailInput.value.trim();
        var origText = btn ? btn.textContent : 'Subscribe';
        if (btn) { btn.textContent = 'Subscribing…'; btn.disabled = true; }

        fetch(API_BASE + '/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'footer' }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            if (btn) { btn.textContent = 'Subscribed ✓'; btn.style.background = '#22c55e'; }
            emailInput.disabled = true;
            emailInput.value = email;
            // Show toast
            showToast('🎉 You\'re subscribed! Check your inbox.', 'success');
          } else {
            if (btn) { btn.textContent = origText; btn.disabled = false; }
            showToast(data.error || 'Subscription failed. Please try again.', 'error');
          }
        })
        .catch(function () {
          if (btn) { btn.textContent = origText; btn.disabled = false; }
          showToast('Network error. Please try again.', 'error');
        });
      });
    });
  }

  function showToast(msg, type) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;' +
      'background:' + (type === 'success' ? '#0d2b1a' : '#2b0d0d') + ';' +
      'border:1px solid ' + (type === 'success' ? '#22c55e' : '#e17055') + ';' +
      'color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-family:sans-serif;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.4);white-space:nowrap;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 3500);
    setTimeout(function () { el.remove(); }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewsletterForms);
  } else {
    initNewsletterForms();
  }
})();

/* === js/smart-routing.js === */
// Smart Routing System - Enhanced Navigation & Page Transitions
// Handles intelligent routing to enhanced pages with smooth transitions

class SmartRouter {
    constructor() {
        // Explicit public route aliases from _redirects, plus the legacy profile page.
        this.routes = new Map();
        const aliases = {
            'social-feed.html': ['social-feed', 'social', 'social.html', 'feed', 'feed.html'],
            'my-lists.html': ['my-lists', 'lists', 'lists.html', 'saved', 'saved.html', 'favorites'],
            'profile.html': ['profile', 'profile-v2.html', 'friends', 'friends.html'],
            'explore.html': ['explore'],
            'plan-with-friends.html': ['plan-with-friends', 'group-planning', 'group', 'plan-night', 'plan', 'plan.html', 'plans', 'plans.html'],
            'events.html': ['events'],
            'nightlife.html': ['nightlife']
        };
        Object.entries(aliases).forEach(([target, paths]) => {
            [target, ...paths].forEach(path => this.routes.set('/' + path, '/' + target));
        });
        
        this.init();
    }

    init() {
        this.setupNavigationInterceptors();
        this.setupSmoothTransitions();
        this.updateAllNavigationLinks();
        this.setupBackButton();
    }

    setupNavigationInterceptors() {
        // Intercept all navigation clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
                e.shiftKey || e.altKey || link.hasAttribute('download') ||
                (link.target && link.target !== '_self')) return;

            const href = link.getAttribute('href');
            
            // Check if it's an internal link that needs routing
            if (this.shouldIntercept(href)) {
                e.preventDefault();
                this.navigateTo(href, link);
            }
        });
    }

    routeURL(href) {
        // Fragment-only links are in-page controls, not page aliases.
        if (!href || !href.trim() || href.trim().startsWith('#')) return null;
        try {
            const url = new URL(href, document.baseURI);
            if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin ||
                url.username || url.password || !this.routes.has(url.pathname)) return null;
            url.pathname = this.routes.get(url.pathname);
            return url;
        } catch (_) {
            return null;
        }
    }

    shouldIntercept(href) {
        return !!this.routeURL(href);
    }

    navigateTo(href, element) {
        // Add transition class
        document.body.classList.add('page-transitioning');
        
        // Smooth scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Navigate after transition
        setTimeout(() => {
            window.location.href = href;
        }, 300);
    }

    setupSmoothTransitions() {
        // Add CSS for smooth transitions
        if (!document.getElementById('smoothTransitionStyles')) {
            const style = document.createElement('style');
            style.id = 'smoothTransitionStyles';
            style.textContent = `
                body {
                    transition: opacity 0.3s ease;
                }
                
                body.page-transitioning {
                    opacity: 0.95;
                }
                
                /* Micro-interactions */
                .nav-link,
                .nav-icon-btn,
                .btn-header-primary,
                .mobile-menu-btn {
                    transition: all 0.2s ease;
                    position: relative;
                }
                
                .nav-link:hover,
                .nav-icon-btn:hover {
                    transform: translateY(-2px);
                }
                
                .nav-link:active,
                .nav-icon-btn:active {
                    transform: translateY(0);
                }
                
                /* Button ripple effect */
                .btn-header-primary {
                    overflow: hidden;
                }
                
                .btn-header-primary::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.3);
                    transform: translate(-50%, -50%);
                    transition: width 0.6s, height 0.6s;
                }
                
                .btn-header-primary:active::after {
                    width: 300px;
                    height: 300px;
                }
                
                /* Icon animations */
                .nav-icon-btn svg {
                    transition: all 0.3s ease;
                }
                
                .nav-icon-btn:hover svg {
                    stroke: #D4AF37;
                    filter: drop-shadow(0 0 8px rgba(212, 175, 55, 0.5));
                }
                
                /* Active page indicator */
                .nav-link.active::after {
                    content: '';
                    position: absolute;
                    bottom: -8px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: #D4AF37;
                    animation: slideIn 0.3s ease;
                }
                
                @keyframes slideIn {
                    from {
                        transform: scaleX(0);
                    }
                    to {
                        transform: scaleX(1);
                    }
                }
                
                /* Card hover effects */
                .venue-card,
                .event-card,
                .list-card,
                .post-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .venue-card:hover,
                .event-card:hover,
                .list-card:hover,
                .post-card:hover {
                    transform: translateY(-8px);
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
                }
                
                /* Button hover effects */
                .btn-primary,
                .btn-secondary {
                    transition: all 0.2s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .btn-primary::before,
                .btn-secondary::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transition: left 0.5s ease;
                }
                
                .btn-primary:hover::before,
                .btn-secondary:hover::before {
                    left: 100%;
                }
                
                /* Loading animation */
                .loading-indicator {
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 3px solid rgba(212, 175, 55, 0.3);
                    border-top-color: #D4AF37;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                /* Fade in animation for content */
                .fade-in {
                    animation: fadeIn 0.5s ease;
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Stagger animation for lists */
                .stagger-item {
                    opacity: 0;
                    animation: staggerFadeIn 0.5s ease forwards;
                }
                
                .stagger-item:nth-child(1) { animation-delay: 0.1s; }
                .stagger-item:nth-child(2) { animation-delay: 0.2s; }
                .stagger-item:nth-child(3) { animation-delay: 0.3s; }
                .stagger-item:nth-child(4) { animation-delay: 0.4s; }
                .stagger-item:nth-child(5) { animation-delay: 0.5s; }
                
                @keyframes staggerFadeIn {
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    updateAllNavigationLinks() {
        document.querySelectorAll('a[href]').forEach(link => {
            const url = this.routeURL(link.getAttribute('href'));
            if (url) link.setAttribute('href', url.pathname + url.search + url.hash);
        });
        this.markActivePage();
    }

    markActivePage() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        // Remove active class from all nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to current page link
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes(currentPage)) {
                link.classList.add('active');
            }
        });
        
        // Special handling for home page
        if (currentPage === 'index.html' || currentPage === '') {
            const homeLink = document.querySelector('.nav-link[href="index.html"], .nav-link[href="/"]');
            if (homeLink) homeLink.classList.add('active');
        }
    }

    setupBackButton() {
        // Handle browser back button
        window.addEventListener('popstate', () => {
            document.body.classList.add('page-transitioning');
            setTimeout(() => {
                document.body.classList.remove('page-transitioning');
            }, 300);
        });
    }

    // Utility function to add loading indicator
    showLoading(element) {
        const loader = document.createElement('span');
        loader.className = 'loading-indicator';
        element.appendChild(loader);
        return loader;
    }

    hideLoading(loader) {
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }

    // Add fade-in animation to elements
    animateFadeIn(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
            el.classList.add('fade-in');
            el.style.animationDelay = `${index * 0.1}s`;
        });
    }

    // Add stagger animation to list items
    animateStagger(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            el.classList.add('stagger-item');
        });
    }
}

// Initialize smart router when DOM is ready
let smartRouter;
document.addEventListener('DOMContentLoaded', () => {
    smartRouter = new SmartRouter();
    
    // Add fade-in animations to main content
    smartRouter.animateFadeIn('.hero-section, .section');
    
    // Add stagger animations to cards
    smartRouter.animateStagger('.venue-card, .event-card, .list-card, .post-card');
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartRouter;
}

/* === js/sl-phase7d-polish.js === */
/* Phase 7D — Premium polish runtime hooks
 * - Top loading bar during navigation
 * - Heart-pop animation when favoriting (hooks into existing favorite buttons)
 * - AI Concierge typing-dots polisher
 * - Image lazy-load fade-in
 *
 * Runs after DCL. Idempotent.
 */
(function () {
  'use strict';
  if (window.__sl_polish_loaded) return;
  window.__sl_polish_loaded = true;

  // ── Top loading bar ───────────────────────────────────────────────
  function ensureLoaderEl() {
    var el = document.getElementById('sl-top-loader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sl-top-loader';
      el.className = 'sl-top-loader';
      document.body && document.body.appendChild(el);
    }
    return el;
  }
  function showLoader() {
    var el = ensureLoaderEl();
    if (el) el.classList.add('active');
  }
  function hideLoader() {
    var el = document.getElementById('sl-top-loader');
    if (el) el.classList.remove('active');
  }
  // Fire on link click that navigates within site
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (a.target === '_blank') return;
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search) return;
    } catch (_) { return; }
    showLoader();
  }, true);
  window.addEventListener('pageshow', hideLoader);
  window.addEventListener('beforeunload', showLoader);

  // ── Heart pop when favorite button is clicked ─────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-fav-btn], .sl-fav-btn, .sl-venue-save-btn, .fav-btn, [data-action="favorite"]');
    if (!btn) return;
    var icon = btn.querySelector('i.fa-heart, .fa-heart, .fas');
    if (icon) {
      icon.classList.remove('sl-heart-pop');
      // restart animation
      void icon.offsetWidth;
      icon.classList.add('sl-heart-pop');
      setTimeout(function () { icon.classList.remove('sl-heart-pop'); }, 500);
    }
  });

  // ── Image fade-in on load ─────────────────────────────────────────
  function markLoaded(img) {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('sl-img-loaded');
    } else {
      img.addEventListener('load', function () { img.classList.add('sl-img-loaded'); }, { once: true });
      img.addEventListener('error', function () { img.classList.add('sl-img-loaded'); }, { once: true });
    }
  }
  function markAll() {
    document.querySelectorAll('img[loading="lazy"]:not(.sl-img-loaded)').forEach(markLoaded);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markAll);
  } else {
    markAll();
  }
  // Watch for newly inserted images (venue cards, etc.)
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function (records) {
      for (var r of records) {
        for (var n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('img[loading="lazy"]')) markLoaded(n);
          if (n.querySelectorAll) n.querySelectorAll('img[loading="lazy"]').forEach(markLoaded);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── AI Concierge typing indicator helper ─────────────────────────
  // Public API: window.SLPolish.showTyping(container) returns the typing element.
  // Concierge can call SLPolish.showTyping(panel) → polished dots, .hideTyping() to remove.
  window.SLPolish = window.SLPolish || {};
  window.SLPolish.showTyping = function (container) {
    if (!container) return null;
    var existing = container.querySelector('.sl-typing-dots');
    if (existing) return existing;
    var d = document.createElement('div');
    d.className = 'sl-typing-dots';
    d.setAttribute('aria-label', 'Thinking…');
    d.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(d);
    return d;
  };
  window.SLPolish.hideTyping = function (container) {
    if (!container) return;
    var d = container.querySelector('.sl-typing-dots');
    if (d) d.remove();
  };
  window.SLPolish.showLoader = showLoader;
  window.SLPolish.hideLoader = hideLoader;
})();
