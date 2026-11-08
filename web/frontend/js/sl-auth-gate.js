/* =========================================================================
   sl-auth-gate.js — Compat shim.
   Real gating logic lives in sl-page-guard.js.
   Exports SLAuthGate alias so older code keeps working.
   ========================================================================= */
(function(){
  'use strict';
  function isAuthed(){ return !!(window.SLAuth && window.SLAuth.isAuthed()); }
  window.SLAuthGate = {
    isAuthenticated: isAuthed,
    isAuthed: isAuthed,
    require: function(label, onAuthed){
      if (isAuthed()) { if (typeof onAuthed === 'function') onAuthed(); return true; }
      if (window.SLAuthUI) window.SLAuthUI.open('login');
      return false;
    }
  };
})();