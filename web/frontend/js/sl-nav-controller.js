/**
 * SL-NAV-CONTROLLER — single authoritative mobile nav controller.
 * Phase 5D-E. Loaded ONCE per page, replaces 7+ legacy duplicate handlers.
 *
 * Supports BOTH header structures used across the SceneLink site:
 *  A) .header-enhanced > .nav-enhanced > .nav-center  +  #mobileMenuBtn
 *     (home, business, profile, social-feed, events, tonight, messages, lists, plans, etc.)
 *  B) .sl-explore-header.sl-unified-nav > .sl-header-nav  (no hamburger present)
 *     (explore.html, nightlife.html)
 *     -> we INJECT a hamburger and treat the nav like a mobile drawer.
 *
 * Single source of truth class:
 *    body.menu-open                   = drawer open
 *    .mobile-menu-btn.is-open         = animated hamburger to X
 *
 * Re-entrant safe.
 */
(function(){
  'use strict';
  if (window.__SL_NAV_CONTROLLER__) return;
  window.__SL_NAV_CONTROLLER__ = true;

  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }
  function $(s, root){ return (root||document).querySelector(s); }

  function open(){
    window.dispatchEvent(new CustomEvent('sl:explicit-modal'));
    document.body.classList.add('menu-open');
    var first = document.querySelector('#primary-mobile-menu a[href]');
    if (first) first.focus();
    var btn = $('.mobile-menu-btn'); if (btn){ btn.classList.add('is-open'); btn.setAttribute('aria-expanded','true'); }
  }
  function close(){
    var wasOpen = document.body.classList.contains('menu-open');
    document.body.classList.remove('menu-open');
    var btn = $('.mobile-menu-btn'); if (btn){ btn.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); if (wasOpen) btn.focus(); }
  }
  function toggle(){
    if (document.body.classList.contains('menu-open')) close(); else open();
  }

  function setActiveLink(){
    var path = (location.pathname || '/').toLowerCase();
    var file = path.substring(path.lastIndexOf('/')+1) || 'index.html';
    var links = document.querySelectorAll('.nav-center .nav-link[href], .sl-header-nav .sl-header-nav-link[href]');
    links.forEach(function(a){
      a.classList.remove('active');
      var href = (a.getAttribute('href')||'').toLowerCase();
      if (!href || href === '#') return;
      var hf = href.split('?')[0].split('#')[0];
      hf = hf.substring(hf.lastIndexOf('/')+1);
      if (hf === file) a.classList.add('active');
      if ((file==='' || file==='index.html') && hf==='index.html') a.classList.add('active');
    });
  }

  function ensureHamburger(parent){
    // For pages without a hamburger, inject one. parent is the header element.
    var existing = parent.querySelector('.mobile-menu-btn, #mobileMenuBtn');
    if (existing) return existing;
    var btn = document.createElement('button');
    btn.className = 'mobile-menu-btn sl-injected-hamburger';
    btn.id = 'mobileMenuBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label','Toggle menu');
    btn.innerHTML = '<span></span><span></span><span></span>';
    parent.appendChild(btn);
    return btn;
  }

  function init(){
    // Try header A (canonical)
    var headerA = $('#mainHeader') || $('.header-enhanced');
    var navA = headerA && headerA.querySelector('.nav-center');
    var btnA = $('#mobileMenuBtn');

    // Try header B (explore/nightlife legacy)
    var headerB = $('.sl-explore-header, .sl-unified-nav');
    var navB = headerB && headerB.querySelector('.sl-header-nav');

    var header, nav, btn;
    if (headerA && navA){
      header = headerA; nav = navA; btn = btnA || ensureHamburger(headerA);
    } else if (headerB && navB){
      header = headerB; nav = navB; btn = ensureHamburger(headerB);
      // Mark the nav so the CSS rules can target it as a drawer
      nav.classList.add('sl-mobile-drawer');
    } else {
      // No supported header on this page (404, offline) — bail.
      return;
    }

    btn.setAttribute('aria-controls','primary-mobile-menu');
    btn.setAttribute('aria-expanded','false');
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label','Toggle menu');
    nav.setAttribute('id','primary-mobile-menu');
    nav.setAttribute('role','navigation');

    btn.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      toggle();
    });

    document.addEventListener('click', function(e){
      if (!document.body.classList.contains('menu-open')) return;
      if (header.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.sl-auth-modal,.sl-concierge,.sl-modal,[data-keep-menu]')) return;
      close();
    });

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) close();
    });

    nav.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a');
      if (a) close();
    });

    var rT;
    window.addEventListener('resize', function(){
      clearTimeout(rT);
      rT = setTimeout(function(){
        if (window.innerWidth > 900 && document.body.classList.contains('menu-open')) close();
      }, 120);
    });

    var scrollT;
    window.addEventListener('scroll', function(){
      if (scrollT) return;
      scrollT = requestAnimationFrame(function(){
        scrollT = null;
        if (window.scrollY > 12) header.classList.add('scrolled'); else header.classList.remove('scrolled');
      });
    }, {passive:true});

    setActiveLink();
  }

  ready(init);
  // Re-run if header is injected late (some pages inject it via JS)
  setTimeout(function(){
    if (!document.querySelector('.mobile-menu-btn')) {
      window.__SL_NAV_CONTROLLER__ = false;
      window.__SL_NAV_CONTROLLER__ = true;
      init();
    }
  }, 800);
})();
