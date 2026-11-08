/**
 * SceneLink V1 Launch — Feature Flags & Coming-Soon Labels
 *
 * After Phase 2-4, most social features are backed by real endpoints:
 *   - /api/friends, /api/conversations, /api/posts, /api/notifications
 *   - /api/reviews (POST), /api/checkins (POST)
 *   - /api/concierge (AI Concierge backend)
 *
 * This file still exists to:
 *  - provide a central `window.SL_FLAGS` toggle set
 *  - inject the shared toast style + `.sl-coming-soon-pill` / `.sl-feature-disabled` helpers
 *  - (optionally) disable not-yet-implemented UI pieces
 */
(function() {
  'use strict';

  const FLAGS = {
    FRIENDS_BACKEND: true,        // /api/friends LIVE
    AI_CONCIERGE_BACKEND: true,   // /api/concierge LIVE
    REVIEWS_WRITE: true,          // /api/reviews (POST) LIVE
    SOCIAL_FEED_REAL: true,       // /api/posts/feed LIVE
    CHECKINS_BACKEND: true,
    LISTS_BACKEND: true,
    FAVORITES_BACKEND: true,
    PLANS_BACKEND: true,
    MESSAGING_BACKEND: true,      // /api/conversations LIVE
    NOTIFICATIONS_BACKEND: true,  // /api/notifications LIVE
  };
  window.SL_FLAGS = FLAGS;

  // Inject shared toast + pill styles (used across app)
  const style = document.createElement('style');
  style.textContent = `
    .sl-coming-soon-pill {
      display: inline-block;
      padding: 2px 8px;
      margin-left: 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%);
      color: #000;
      border-radius: 10px;
      vertical-align: middle;
      white-space: nowrap;
    }
    .sl-feature-disabled {
      opacity: 0.55;
      pointer-events: none;
      position: relative;
    }
    .sl-feature-disabled::after {
      content: "Coming Soon";
      position: absolute;
      top: 8px;
      right: 8px;
      background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%);
      color: #000;
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      z-index: 5;
      pointer-events: none;
    }
    .sl-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20, 20, 20, 0.95);
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid rgba(212, 160, 23, 0.4);
      font-size: 14px;
      z-index: 100000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      animation: slSlideUp 0.3s ease-out;
      max-width: 90vw;
      text-align: center;
    }
    .sl-toast.sl-toast-error {
      border-color: rgba(255, 80, 80, 0.5);
    }
    .sl-toast.sl-toast-success {
      border-color: rgba(80, 220, 140, 0.5);
    }
    @keyframes slSlideUp {
      from { opacity: 0; transform: translate(-50%, 20px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
  `;
  document.head.appendChild(style);

  function toast(msg, ms, kind) {
    const t = document.createElement('div');
    t.className = 'sl-toast' + (kind ? ' sl-toast-' + kind : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.2s'; }, (ms || 2800) - 200);
    setTimeout(() => t.remove(), ms || 2800);
  }
  window.SLToast = toast;

  function addPill(el, text) {
    if (!el || el.querySelector('.sl-coming-soon-pill')) return;
    const pill = document.createElement('span');
    pill.className = 'sl-coming-soon-pill';
    pill.textContent = text || 'Soon';
    el.appendChild(pill);
  }

  function applyFlags() {
    // All major features are now backed by real endpoints — no need to disable.
    // This function is preserved as a hook for future feature flag work.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFlags);
  } else {
    applyFlags();
  }

  window.SLFeatureFlags = { FLAGS, applyFlags, toast, addPill };
})();