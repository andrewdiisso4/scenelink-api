/* Venue fields now come from the canonical backend. Never overwrite identities,
   addresses or coordinates by name, and never wrap fetch to fabricate fields. */
(function () { 'use strict';
  window.SLVenueCorrections = {apply:v => v, applyToPayload:data => data};
})();
