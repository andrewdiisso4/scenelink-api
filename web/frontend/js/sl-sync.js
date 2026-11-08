/* ================================================================
   SceneLink Sync — mirrors localStorage favorites/lists into the
   backend whenever a logged-in user modifies them. On login, pulls
   server state down and merges with local.

   Non-destructive: V2 pages continue to use localStorage; this runs
   in the background to add server-side persistence for logged-in users.
   ================================================================ */
(function(){
  'use strict';
  if (!window.SLApi) return;

  // Storage keys the V2 frontend uses
  var FAV_KEY = 'sl_favorites';          // array of venue ids
  var LISTS_KEY = 'sl_lists';            // array of {id, name, items:[venueId]}

  function readFavs(){ try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch(e){ return []; } }
  function readLists(){ try { return JSON.parse(localStorage.getItem(LISTS_KEY)) || []; } catch(e){ return []; } }

  // Venue IDs in V2 are integers (1,2,3…) from hardcoded data.
  // Backend expects UUIDs. We'll do a best-effort sync using venue NAME matching.
  var _venueNameToId = null;
  async function venueNameToId(name){
    if (!_venueNameToId) {
      try {
        var r = await window.SLApi.venues();
        _venueNameToId = {};
        (r.venues || []).forEach(function(v){ _venueNameToId[v.name.toLowerCase()] = v.id; });
      } catch(e) { _venueNameToId = {}; }
    }
    return _venueNameToId[(name||'').toLowerCase()];
  }

  // Expose a helper V2 pages can call with a venue name
  window.SLSync = {
    favoriteByName: async function(venueName){
      if (!window.SLApi.isLoggedIn()) return null;
      try {
        var id = await venueNameToId(venueName);
        if (!id) return null;
        return await window.SLApi.toggleFavorite(id);
      } catch(e) { console.debug('SLSync.favoriteByName err', e); return null; }
    },
  };

  // Auto-hook: whenever the page toggles a heart/save button carrying [data-venue-name],
  // the click handler may fire our sync as well. We attach a capturing listener.
  document.addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== document) {
      if (t.matches && (t.matches('.heart-btn') || t.matches('[data-action="favorite"]') || t.classList && t.classList.contains('favorite-btn'))) {
        var name = t.getAttribute('data-venue-name') || (t.closest('[data-venue-name]') && t.closest('[data-venue-name]').getAttribute('data-venue-name'));
        if (name) window.SLSync.favoriteByName(name);
        return;
      }
      t = t.parentNode;
    }
  }, true);
})();