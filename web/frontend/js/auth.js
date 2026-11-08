/* =========================================================================
   DEPRECATED: auth.js
   This file was a legacy Supabase auth module and is no longer used.
   SceneLink now uses sl-auth-core.js as the single source of truth.
   Left as a no-op so any stale <script> tags don't 404.
   ========================================================================= */
(function(){
  if (window.SLAuth) return;
  console.warn('[auth.js] deprecated — using SLAuth core.');
})();