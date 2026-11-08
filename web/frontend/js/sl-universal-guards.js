/* =========================================================================
   sl-universal-guards.js
   Wraps SLApi methods so any protected API call from logged-out users
   triggers the universal login modal instead of silently 401-ing.
   Also gates common button patterns: .save-btn, .sl-save-btn,
   [data-action="save"], [data-action="plan-add"], .create-plan-btn, etc.
   ========================================================================= */
(function(){
  'use strict';

  function openLogin(label){
    if (window.SLAuthUI && window.SLAuthUI.open) {
      window.SLAuthUI.open('login');
      return true;
    }
    return false;
  }

  function wrapApi(){
    if (!window.SLApi) return;
    if (window.SLApi.__guardsInstalled) return;
    window.SLApi.__guardsInstalled = true;

    // Methods that should not run if logged out
    var PROTECTED = [
      'toggleFavorite','createPost','likePost','unlikePost','commentOnPost',
      'sendFriendRequest','acceptFriendRequest','removeFriend',
      'sendMessage','markRead',
      'createPlan','updatePlan','deletePlan','inviteToPlan','respondToInvite',
      'createReview','updateReview','deleteReview',
      'checkIn','uncheckIn',
      'deleteAccount','reportContent','registerPushToken','unregisterPushToken'
    ];

    PROTECTED.forEach(function(fn){
      var original = window.SLApi[fn];
      if (typeof original !== 'function') return;
      window.SLApi[fn] = function(){
        if (!window.SLApi.isLoggedIn()) {
          openLogin();
          return Promise.reject(new Error('Not authenticated'));
        }
        return original.apply(window.SLApi, arguments);
      };
    });
    console.log('[SLGuards] wrapped ' + PROTECTED.length + ' API methods');
  }

  // Global click delegate: intercept common "save/plan/follow/like" selectors
  function installClickInterceptor(){
    var PROTECTED_SELECTORS = [
      '.sl-save-btn',
      '[data-action="save"]',
      '[data-action="plan-add"]',
      '[data-action="plan-create"]',
      '[data-action="follow"]',
      '[data-action="like"]',
      '[data-action="comment"]',
      '[data-action="review"]',
      '[data-action="check-in"]',
      '[data-action="message"]',
      '.sl-create-plan-btn',
      '.sl-invite-friend-btn'
    ].join(',');

    document.addEventListener('click', function(e){
      var btn = e.target.closest(PROTECTED_SELECTORS);
      if (!btn) return;
      if (window.SLApi && window.SLApi.isLoggedIn()) return; // authorized → pass through
      e.preventDefault();
      e.stopPropagation();
      openLogin();
    }, true); // capture phase so we run before other handlers
  }

  function boot(){
    wrapApi();
    installClickInterceptor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else { boot(); }

  // Also wrap later in case SLApi is re-created or delayed
  setTimeout(wrapApi, 500);
  setTimeout(wrapApi, 1500);
})();