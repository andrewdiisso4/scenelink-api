/**
 * SceneLink Venue Image Curator
 * 
 * Maps venue type/cuisine/category → curated high-quality Unsplash images.
 * This provides visually distinctive, attractive imagery without Google Places API costs.
 * 
 * Strategy:
 * 1. Use venue.cover_image_url / venue.image_url if available (and not a generic default)
 * 2. Otherwise, deterministically pick a curated image based on venue characteristics
 * 3. Deterministic = same venue always gets same image (stable caching)
 */
(function(){
    'use strict';

    // High-quality, cuisine/category-specific Unsplash photos (CC0/free commercial use)
    // Organized by category → curated array. Each image is ~800px wide, optimized.
    var IMAGE_POOL = {
        // ─── Restaurants by cuisine ───
        italian: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        american: [
            '/assets/img/placeholder-event.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        japanese: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        sushi: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        chinese: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        mexican: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        thai: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        indian: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        french: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        mediterranean: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        seafood: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        steakhouse: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        pizza: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        cafe: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        coffee: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        bakery: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        dessert: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        icecream: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],

        // ─── Bars & Nightlife ───
        bar: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        cocktail: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        pub: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        brewery: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        wine: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        lounge: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        nightclub: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        club: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        rooftop: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],

        // ─── Music & Entertainment ───
        music: [
            '/assets/img/placeholder-event.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        livemusic: [
            '/assets/img/placeholder-event.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        jazz: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-event.svg'
        ],
        venue: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-event.svg'
        ],

        // ─── Generic fallback (attractive Boston-vibe restaurant/bar) ───
        default: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ]
    };

    // Deterministic hash: same venue name → same image pick
    function hashName(str){
        var h = 0, s = String(str||'');
        for (var i = 0; i < s.length; i++){
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
    }

    function categorize(v){
        var hints = [
            v.cuisine, v.cuisine_type, v.type, v.category, v.subcategory,
            v.genre, v.vibe, v.name
        ].map(function(x){ return (x||'').toString().toLowerCase(); }).join(' ');

        // Specific cuisines first (more specific wins)
        if (/\b(sushi|ramen)\b/.test(hints)) return 'sushi';
        if (/\b(japanese)\b/.test(hints)) return 'japanese';
        if (/\b(italian|pasta|trattoria|osteria)\b/.test(hints)) return 'italian';
        if (/\b(pizza|pizzeria)\b/.test(hints)) return 'pizza';
        if (/\b(mexican|taco|taqueria|burrito)\b/.test(hints)) return 'mexican';
        if (/\b(thai)\b/.test(hints)) return 'thai';
        if (/\b(indian|curry|tandoor)\b/.test(hints)) return 'indian';
        if (/\b(chinese|dim sum|szechuan|cantonese)\b/.test(hints)) return 'chinese';
        if (/\b(french|brasserie|bistro)\b/.test(hints)) return 'french';
        if (/\b(mediterranean|greek|turkish|lebanese)\b/.test(hints)) return 'mediterranean';
        if (/\b(seafood|oyster|lobster)\b/.test(hints)) return 'seafood';
        if (/\b(steakhouse|steak house)\b/.test(hints)) return 'steakhouse';
        if (/\b(bakery|patisserie|pastries)\b/.test(hints)) return 'bakery';
        if (/\b(ice[-\s]?cream|gelato|creamery)\b/.test(hints)) return 'icecream';
        if (/\b(dessert)\b/.test(hints)) return 'dessert';
        if (/\b(coffee|espresso)\b/.test(hints)) return 'coffee';
        if (/\b(cafe|café)\b/.test(hints)) return 'cafe';

        // Nightlife categories
        if (/\b(nightclub|night_club|discoteca)\b/.test(hints)) return 'nightclub';
        if (/\b(rooftop)\b/.test(hints)) return 'rooftop';
        if (/\b(brewery|beer garden|taproom)\b/.test(hints)) return 'brewery';
        if (/\b(pub|tavern)\b/.test(hints)) return 'pub';
        if (/\b(wine bar|winery)\b/.test(hints)) return 'wine';
        if (/\b(cocktail|speakeasy)\b/.test(hints)) return 'cocktail';
        if (/\b(lounge)\b/.test(hints)) return 'lounge';
        if (/\b(jazz)\b/.test(hints)) return 'jazz';
        if (/\b(live[-\s]?music)\b/.test(hints)) return 'livemusic';
        if (/\b(music)\b/.test(hints)) return 'music';
        if (/\b(club)\b/.test(hints)) return 'club';
        if (/\b(bar)\b/.test(hints)) return 'bar';
        if (/\b(american|burger|diner|grill)\b/.test(hints)) return 'american';
        if (/\b(venue)\b/.test(hints)) return 'venue';
        if (/\b(restaurant)\b/.test(hints)) return 'american'; // restaurant default

        return 'default';
    }

    // Detect if an image URL is a generic stock fallback that should be replaced
    function isGenericFallback(url){
        if (!url) return true;
        // Old default fallback from various JS files
        if (url.indexOf('photo-1414235077428-338989a2e8c0') !== -1) return true;
        return false;
    }

    function pickImage(venue){
        if (!venue) return IMAGE_POOL.default[0];

        // Prefer existing real image if it's not the generic stock fallback.
        // thumbnail_url is the canonical field returned by /api/venues?view=card
        // (Phase 2D — resolves via Netlify /api/photo proxy to Google Places photos).
        var existing = venue.thumbnail_url || venue.cover_image_url || venue.image_url ||
                       (venue.image_urls && venue.image_urls[0]);
        if (existing && !isGenericFallback(existing)) return existing;

        // Otherwise pick deterministically from category pool
        var cat = categorize(venue);
        var pool = IMAGE_POOL[cat] || IMAGE_POOL.default;
        var idx = hashName(venue.name || venue.id || '') % pool.length;
        return pool[idx];
    }

    // Expose globally for all frontend pages
    window.SLVenueImages = {
        pick: pickImage,
        categorize: categorize,
        pool: IMAGE_POOL
    };
})();