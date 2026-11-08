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