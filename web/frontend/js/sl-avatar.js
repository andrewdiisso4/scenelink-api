/**
 * SL-AVATAR — single helper for local SVG initial avatars.
 * Replaces external api.dicebear.com which fails (ERR_FAILED) and adds latency.
 * Works as data: URI, no network request.
 */
(function(global){
  'use strict';
  function localInitialAvatar(name){
    var n = String(name||'?').trim();
    var initials = n.split(/\s+/).slice(0,2).map(function(p){return (p[0]||'').toUpperCase();}).join('') || '?';
    initials = initials.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">'+
              '<rect width="80" height="80" fill="#1a1a1a"/>'+
              '<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui,Arial" font-size="30" font-weight="700" fill="#d4af37">'+initials+'</text>'+
              '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  // Idempotent define: never clobber an existing valid impl; always guarantee .local is a function.
  if (!global.SL_AVATAR || typeof global.SL_AVATAR.local !== 'function') {
    global.SL_AVATAR = global.SL_AVATAR || {};
    global.SL_AVATAR.local = localInitialAvatar;
  }
})(window);
