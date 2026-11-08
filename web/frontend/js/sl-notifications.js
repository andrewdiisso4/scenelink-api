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