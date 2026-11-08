/* SceneLink Phase 8 launch compatibility guard.
   Keeps legacy static pages functional while the V1 launch surface is narrowed. */
(function(){
  'use strict';
  window.SL_PHASE8_LAUNCH_SHIM = true;

  function installApiCompat(){
    var api = window.SLApi;
    if (!api) return;
    if (!api.addToPlan && api.addVenueToPlan) {
      api.addToPlan = function(planId, venueId){ return api.addVenueToPlan(planId, venueId); };
    }
    if (!api.saveVenue && api.saveFavorite) {
      api.saveVenue = function(venueId){ return api.saveFavorite(venueId); };
    }
    if (!api.unsaveVenue && api.unsaveFavorite) {
      api.unsaveVenue = function(venueId){ return api.unsaveFavorite(venueId); };
    }
    if (!api.subscribeNewsletter && api.newsletterSubscribe) {
      api.subscribeNewsletter = function(email, source){ return api.newsletterSubscribe(email, source); };
    }
  }

  installApiCompat();
  document.addEventListener('DOMContentLoaded', installApiCompat);
  window.addEventListener('sl-auth-ready', installApiCompat);
  setTimeout(installApiCompat, 250);
})();
