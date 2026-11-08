/* SceneLink Phase 8D recovery: prevents dead CTAs/stuck loaders if an overlay or lazy AI script misfires. */
(function(){
  'use strict';
  if (window.__SL_PHASE8D_RECOVERY__) return;
  window.__SL_PHASE8D_RECOVERY__ = true;
  var AI_SCRIPT = 'js/ai-concierge-v5.js?v=connected-20261108-6';
  var AI_CSS = ['css/ai-concierge.css?v=connected-20261108-6','css/ai-concierge-v5.css?v=connected-20261108-6'];
  function qs(s,r){ return (r||document).querySelector(s); }
  function qsa(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function loadCss(href){
    if (qsa('link[href="'+href+'"]').length) return;
    var l=document.createElement('link'); l.rel='stylesheet'; l.href=href; document.head.appendChild(l);
  }
  function loadScript(src, cb){
    if (qsa('script[src="'+src+'"]').length) { cb && setTimeout(cb, 60); return; }
    var s=document.createElement('script'); s.src=src; s.defer=true; s.onload=function(){ cb&&cb(); }; document.head.appendChild(s);
  }
  function openConcierge(prompt){
    AI_CSS.forEach(loadCss);
    function act(){
      try {
        if (window.SLConcierge && prompt) return window.SLConcierge.ask(prompt);
        if (window.SLConcierge) return window.SLConcierge.open();
      } catch(_) {}
      setTimeout(function(){
        try {
          if (window.SLConcierge && prompt) window.SLConcierge.ask(prompt);
          else if (window.SLConcierge) window.SLConcierge.open();
        } catch(_) {}
      }, 450);
    }
    loadScript(AI_SCRIPT, act);
  }
  function bindConcierge(){
    document.addEventListener('click', function(e){
      var t = e.target && e.target.closest && e.target.closest('[data-sl-concierge], [data-ask-concierge], .tv2-ask-ai-btn, .sl-concierge-trigger, [data-concierge-ask], .ask-concierge-btn');
      if (!t) return;
      e.preventDefault();
      var q = t.getAttribute('data-sl-concierge') || t.getAttribute('data-ask-concierge') || t.getAttribute('data-concierge-ask') || t.getAttribute('data-ask') || 'Plan my night in Boston';
      openConcierge(q);
    }, true);
  }
  function bindMobileNav(){
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('[data-phase8-menu], .mobile-menu-toggle, .nav-toggle, [aria-label="Open menu"]');
      if (!btn) return;
      var links = qs('#phase8NavLinks') || qs('.sl-phase8-links') || qs('.nav-menu') || qs('.mobile-nav');
      if (links) links.classList.toggle('open');
    }, true);
  }
  function releaseStrandedLoaders(){
    document.body && document.body.classList.add('sl-phase8d-loader-released');
    qsa('.loading-overlay,.filters-loading-overlay,.global-loading,.page-loader,#loadingOverlay,#globalLoading,#pageLoader').forEach(function(el){
      if (el.hasAttribute('data-preserve-loading')) return;
      el.setAttribute('aria-hidden','true');
      el.style.pointerEvents='none';
      el.style.visibility='hidden';
      el.style.opacity='0';
    });
  }
  function patchBrokenIcons(){
    // Last-resort visible fallback if Font Awesome webfonts are missing or blocked.
    var map = {
      'fa-search':'⌕','fa-magic':'✦','fa-compass':'⌖','fa-bookmark':'★','fa-heart':'♡','fa-users':'👥','fa-bars':'☰',
      'fa-arrow-right':'→','fa-location-dot':'⌖','fa-spinner':'•','fa-check':'✓','fa-facebook-f':'f','fa-instagram':'◎','fa-twitter':'𝕏','fa-youtube':'▶'
    };
    qsa('i[class*="fa-"]').forEach(function(i){
      if (i.textContent.trim()) return;
      var cls = String(i.className||'').split(/\s+/).find(function(c){ return map[c]; });
      if (cls) { i.textContent = map[cls]; i.classList.add('sl-phase8d-icon-fallback'); }
    });
  }
  // Phase 8D: guarantee the first-visit onboarding overlay can NEVER permanently
  // trap the page. Root cause of the 8C "non-functional after a few seconds" report:
  // #sl-ob-overlay (js/sl-onboarding.js) renders full-screen at z-index 100000 with
  // pointer-events:auto ~4s after load, and with missing FontAwesome icons the dismiss
  // controls were not recognizable. We add resilient dismiss paths without removing
  // the onboarding feature itself.
  function dismissOnboarding(reason){
    try {
      var o = document.getElementById('sl-ob-overlay');
      if (!o) return false;
      try { localStorage.setItem('sl_onboarded', 'dismissed'); } catch(_){}
      o.style.transition = 'opacity .25s ease';
      o.style.opacity = '0';
      o.style.pointerEvents = 'none';
      setTimeout(function(){ try { o.parentNode && o.parentNode.removeChild(o); } catch(_){} }, 300);
      return true;
    } catch(_) { return false; }
  }
  function guardOnboarding(){
    // 1) Escape key always closes it.
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && document.getElementById('sl-ob-overlay')) dismissOnboarding('esc');
    }, true);
    // 2) Click on the dim backdrop (the overlay element itself, not its inner card) closes it.
    document.addEventListener('click', function(e){
      var o = document.getElementById('sl-ob-overlay');
      if (o && e.target === o) dismissOnboarding('backdrop');
    }, true);
    // 3) Ensure ANY skip/close/lets-go control inside it actually dismisses, even if
    //    the original handler failed to bind (icons missing made them invisible).
    document.addEventListener('click', function(e){
      var o = document.getElementById('sl-ob-overlay');
      if (!o) return;
      var btn = e.target && e.target.closest && e.target.closest('#slObSkip,#slObSkipNotif,[data-ob-close],.sl-ob-close,[aria-label="Close"],button');
      if (btn && o.contains(btn) && /skip|close|let.?s go|done|got it|×|✕|x/i.test((btn.textContent||'') + (btn.getAttribute('aria-label')||''))) {
        // give the native handler a beat; if overlay still present, force-dismiss.
        setTimeout(function(){ if (document.getElementById('sl-ob-overlay')) dismissOnboarding('btn-fallback'); }, 350);
      }
    }, true);
    // 4) Backstop: the onboarding overlay (#sl-ob-overlay) is full-screen z-100000.
    //    To honor "interactive within ~2s" and "no full-page overlay may block nav
    //    after initial load", we make the BACKDROP non-blocking as soon as it mounts
    //    while keeping its inner card fully interactive. The modal still shows and its
    //    Skip / Let's go buttons still work, but the dimmed area never traps the page.
    var armed = false;
    function neutralizeBackdrop(){
      var o = document.getElementById('sl-ob-overlay');
      if (!o) return;
      // Backdrop click-through; inner card keeps its own pointer events.
      o.style.pointerEvents = 'none';
      var card = o.querySelector(':scope > *');
      if (card) {
        card.style.pointerEvents = 'auto';
        // ensure focusable controls inside the card remain clickable
        Array.prototype.forEach.call(card.querySelectorAll('button,a,input,select,textarea'), function(el){ el.style.pointerEvents = 'auto'; });
      }
      armed = true;
    }
    // Watch for the overlay mounting (it appears ~4s after load via setTimeout in onboarding).
    try {
      var mo = new MutationObserver(function(){
        if (document.getElementById('sl-ob-overlay')) { neutralizeBackdrop(); }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // Stop observing after 20s to avoid lingering work.
      setTimeout(function(){ try { mo.disconnect(); } catch(_){} }, 20000);
    } catch(_){}
    // Hard fallback timers in case MutationObserver misses it.
    setTimeout(neutralizeBackdrop, 4500);
    setTimeout(neutralizeBackdrop, 7000);
  }
  function boot(){ bindConcierge(); bindMobileNav(); guardOnboarding(); setTimeout(releaseStrandedLoaders, 5500); setTimeout(patchBrokenIcons, 1200); setTimeout(patchBrokenIcons, 5000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
