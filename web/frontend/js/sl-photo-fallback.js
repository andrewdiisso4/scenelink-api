/**
 * Phase 6B §6 — Category-branded photo fallbacks.
 * Single source of truth for selecting the right SceneLink-branded SVG
 * when a venue has no real photo. Honest, never claims to be a venue photo.
 *
 * Usage: window.SLPhoto.fallbackFor(venue) → URL string
 */
(function (w) {
  var BASE = '/assets/img/';
  var MAP = {
    restaurant: 'category-restaurant.svg',
    bar: 'category-bar.svg',
    'bar & lounge': 'category-bar.svg',
    cocktail: 'category-bar.svg',
    'cocktail bar': 'category-bar.svg',
    'cocktail lounge': 'category-bar.svg',
    'rooftop bar': 'category-bar.svg',
    nightclub: 'category-bar.svg',
    club: 'category-bar.svg',
    speakeasy: 'category-bar.svg',
    cafe: 'category-cafe.svg',
    coffee: 'category-cafe.svg',
    coffee_shop: 'category-cafe.svg',
    bakery: 'category-cafe.svg',
    pub: 'category-pub.svg',
    sports_bar: 'category-pub.svg',
    'sports bar': 'category-pub.svg',
    brewery: 'category-pub.svg',
    theatre: 'category-theatre.svg',
    theater: 'category-theatre.svg',
    'live music': 'category-theatre.svg',
    music: 'category-theatre.svg',
    venue: 'category-theatre.svg',
  };
  function norm(s) { return String(s || '').toLowerCase().trim(); }
  function fallbackFor(venue) {
    if (!venue) return BASE + 'placeholder-venue.svg';
    var keys = [venue.category, venue.type, venue.venue_type, venue.cuisine].filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var k = norm(keys[i]);
      if (MAP[k]) return BASE + MAP[k];
      // try first token (e.g. "italian;pizza" → "italian", but italian isn't mapped)
      // try partial: any key contained within
      for (var mk in MAP) {
        if (k === mk || k.indexOf(mk) !== -1) return BASE + MAP[mk];
      }
    }
    return BASE + 'placeholder-venue.svg';
  }
  // Resolve final image src: real if present, else category fallback.
  function resolve(venue) {
    if (!venue) return BASE + 'placeholder-venue.svg';
    var url = venue.thumbnail_url || venue.cover_image_url || venue.image_url || venue.cover_image || '';
    if (url && String(url).indexOf('placeholder') === -1) return url;
    return fallbackFor(venue);
  }
  w.SLPhoto = { fallbackFor: fallbackFor, resolve: resolve };
})(window);
