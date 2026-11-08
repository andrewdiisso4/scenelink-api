/* =========================================================================
   sl-auth.js — Compat shim for legacy code that loads this file.
   Actual auth is handled by sl-auth-core.js + sl-auth-ui.js.
   This file performs:
     1. Self-healing auth-aware UI (header buttons, hello messages)
     2. Back-compat for legacy helpers
   ========================================================================= */
(function(){
  'use strict';

  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  function applyAuthUI(){
    if (!window.SLAuth) return;
    var authed = window.SLAuth.isAuthed();
    var user = window.SLAuth.user();

    // Elements visible only when authed
    $all('[data-sl-show-if="authed"]').forEach(function(el){
      el.style.display = authed ? '' : 'none';
    });
    // Elements visible only when logged out
    $all('[data-sl-show-if="guest"]').forEach(function(el){
      el.style.display = authed ? 'none' : '';
    });

    // Display name slots
    $all('[data-sl-user="display_name"]').forEach(function(el){
      el.textContent = (user && (user.display_name || user.username)) || '';
    });
    $all('[data-sl-user="username"]').forEach(function(el){
      el.textContent = (user && user.username) ? '@' + user.username : '';
    });
    $all('[data-sl-user="avatar"]').forEach(function(el){
      if (user && user.avatar_url) {
        el.setAttribute('src', user.avatar_url);
        el.style.display = '';
      }
    });

    // Legacy header buttons
    $all('.sl-auth-trigger, [data-auth-open]').forEach(function(el){
      el.style.display = authed ? 'none' : '';
    });
    $all('.sl-logged-in-only, [data-logged-in-only]').forEach(function(el){
      el.style.display = authed ? '' : 'none';
    });
  }

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  onReady(function(){
    applyAuthUI();
    window.addEventListener('sl-auth-changed', applyAuthUI);
    // re-apply periodically for a few seconds (self-healing for async-rendered headers)
    var count = 0, iv = setInterval(function(){
      applyAuthUI();
      if (++count >= 8) clearInterval(iv);
    }, 500);
  });
})();