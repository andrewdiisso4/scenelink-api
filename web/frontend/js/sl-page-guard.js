/* =========================================================================
   SL PAGE GUARD — Protects pages and actions.
   
   Usage on an HTML page that requires auth:
     <body data-sl-page="requires-auth" data-sl-page-label="Messages">
   
   Usage on elements that require auth for an action:
     <button data-sl-requires-auth data-sl-action-label="Save venue">Save</button>
   
   Depends on: SLAuth (sl-auth-core.js), SLAuthUI (sl-auth-ui.js).
   ========================================================================= */
(function(){
  'use strict';

  function whenReady(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  function showGate(label){
    if (document.getElementById('sl-gate-overlay-el')) return;
    var title = String(label || 'Sign in required').replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
    var overlay = document.createElement('div');
    overlay.id = 'sl-gate-overlay-el';
    overlay.className = 'sl-gate-overlay';
    overlay.innerHTML = [
      '<div class="sl-gate-card">',
      '  <div class="sl-gate-icon">🔒</div>',
      '  <h2 class="sl-gate-title">' + title + '</h2>',
      '  <p class="sl-gate-msg">Create a free account or sign in to continue.</p>',
      '  <div class="sl-gate-btns">',
      '    <button type="button" class="sl-gate-btn sl-gate-btn-primary" data-sl-gate="login">Sign in</button>',
      '    <button type="button" class="sl-gate-btn sl-gate-btn-secondary" data-sl-gate="signup">Create account</button>',
      '  </div>',
      // Phase 8E: never trap a logged-out user — always offer a way back to a public page.
      '  <a href="/" class="sl-gate-back" data-sl-gate="home" style="display:inline-block;margin-top:16px;color:#9ca0b4;font-size:13px;text-decoration:none;font-weight:600;">← Back to Explore Boston</a>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.addEventListener('click', function(e){
      var b = e.target.closest('[data-sl-gate]');
      if (!b) return;
      var which = b.getAttribute('data-sl-gate');
      if (which === 'home') { return; } // let the <a href="/"> navigate normally
      e.preventDefault();
      if (window.SLAuthUI && window.SLAuthUI.open) window.SLAuthUI.open(which);
    });
    // Phase 8E: Escape closes the gate and returns home so users are never stuck.
    var escHandler = function(ev){
      if (ev.key === 'Escape' && document.getElementById('sl-gate-overlay-el') && !document.querySelector('.sl-auth-overlay.open')) {
        try { document.removeEventListener('keydown', escHandler, true); } catch(_){}
        window.location.href = '/';
      }
    };
    document.addEventListener('keydown', escHandler, true);
  }

  function hideGate(){
    var g = document.getElementById('sl-gate-overlay-el');
    if (g) { g.remove(); document.body.style.overflow = ''; }
  }

  function enforcePage(){
    var body = document.body;
    if (!body) return;
    var mode = body.getAttribute('data-sl-page');
    if (!window.SLAuth) return;
    // Phase 5D-B: stamp body with sl-authed class so per-page CSS can
    // gate visibility of protected UI (e.g., messages.html main).
    if (window.SLAuth.isAuthed()) {
      body.classList.add('sl-authed');
      body.classList.remove('sl-loggedout');
    } else {
      body.classList.add('sl-loggedout');
      body.classList.remove('sl-authed');
    }
    if (mode !== 'requires-auth') return;
    var label = body.getAttribute('data-sl-page-label') || 'This page requires sign in';
    if (!window.SLAuth.isAuthed()) {
      showGate(label);
    }
  }

  function wireActionGuards(){
    document.addEventListener('click', function(e){
      // Guard the explicit actionable control, never BODY, a page wrapper, nav or modal dismissal.
      if (e.target.closest('[role=dialog], .sl-auth-modal, #sl-gate-overlay-el, header, nav')) return;
      var t = e.target.closest('button[data-sl-requires-auth], a[data-sl-requires-auth], input[data-sl-requires-auth]');
      if (!t || t === document.body) return;
      if (!window.SLAuth || !window.SLAuth.isAuthed()) {
        e.preventDefault();
        e.stopPropagation();
        var label = t.getAttribute('data-sl-action-label') || 'Sign in required';
        if (window.SLAuthUI && window.SLAuthUI.open) {
          window.SLAuthUI.open('login');
        }
        return false;
      }
    }, true);
  }

  whenReady(function(){
    enforcePage();
    wireActionGuards();

    window.addEventListener('sl-auth-changed', function(e){
      var authed = e.detail && e.detail.authed;
      if (authed) {
        hideGate();
        // notify page scripts that auth state changed
      } else {
        // page guard: re-lock if this page requires auth
        enforcePage();
      }
    });
  });

  window.SLPageGuard = { showGate: showGate, hideGate: hideGate };
})();