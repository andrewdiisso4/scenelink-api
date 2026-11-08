/* No availability or reservation confirmation is generated in this browser.
   The canonical venue detail reports in-site booking capability honestly. External links are not a completed booking. */
(function () { 'use strict';
  function open(venue) {
    var id = typeof venue === 'string' ? venue : venue && (venue.id || venue.slug);
    if (id && window.SLVenueDetail) return window.SLVenueDetail.open(id);
    if (window.SLToast) window.SLToast('Choose a venue to check its booking options. No reservation has been made.', 4000, 'info');
  }
  window.bookingSystem = {openModal:open,openBooking:open,closeModal:function(){if(window.SLVenueDetail)window.SLVenueDetail.close();}};
  window.BookingSystem = function () { return window.bookingSystem; };
})();
