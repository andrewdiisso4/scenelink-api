/**
 * SceneLink Concierge Mock Venue Data
 * Realistic Boston area venues for recommendation system
 */

const mockVenues = [
    {
        id: 'club-nova',
        name: 'Club Nova',
        description: 'High-energy nightclub with VIP bottle service and celebrity DJs',
        price: '$$$',
        neighborhood: 'Downtown',
        hours: 'Open until 2am',
        tags: ['Nightclub', ' Dancing', 'VIP', 'Big Night Out'],
        vibe: 'Big night out',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.2,
        features: ['Full Bar', 'DJ', 'Dance Floor', 'VIP Tables']
    },
    {
        id: 'bistro-27',
        name: 'Bistro 27',
        description: 'Cozy Italian restaurant with romantic ambiance and craft cocktails',
        price: '$$',
        neighborhood: 'Back Bay',
        hours: 'Open until 1am',
        tags: ['Italian', 'Date Night', 'Romantic', 'Cocktails'],
        vibe: 'Date night',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.6,
        features: ['Wine Bar', 'Full Menu', 'Reservations', 'Outdoor Seating']
    },
    {
        id: 'garden-terrace',
        name: 'The Garden Terrace',
        description: 'Rooftop lounge with city views and relaxed outdoor seating',
        price: '$$',
        neighborhood: 'Seaport',
        hours: 'Open until midnight',
        tags: ['Rooftop', 'Outdoor', 'Views', 'Chill'],
        vibe: 'Chill',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.4,
        features: ['Outdoor Bar', 'City Views', 'Heated', 'Fire Pits']
    },
    {
        id: 'sports-grill',
        name: 'Faneuil Hall Sports Grill',
        description: 'Lively sports bar with 20+ TVs and game-day specials',
        price: '$',
        neighborhood: 'Downtown',
        hours: 'Open until 1am',
        tags: ['Sports', 'TVs', 'Bar', 'Group Hang'],
        vibe: 'Sports & TVs',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.0,
        features: ['20+ TVs', 'Game Specials', 'Full Bar', 'Pub Food']
    },
    {
        id: 'live-venue',
        name: 'The Music Hall',
        description: 'Intimate live music venue featuring local bands and acoustic sets',
        price: '$$',
        neighborhood: 'Cambridge',
        hours: 'Open until midnight',
        tags: ['Live Music', 'Acoustic', 'Local Bands', 'Intimate'],
        vibe: 'Live music',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.3,
        features: ['Live Music', 'Full Bar', 'Small Stage', 'Dancing']
    },
    {
        id: 'brewery-tap',
        name: 'South Station Brew Tap',
        description: 'Craft beer taproom with rotating local brews and casual atmosphere',
        price: '$',
        neighborhood: 'South Boston',
        hours: 'Open until 11pm',
        tags: ['Craft Beer', 'Casual', 'Local', 'Group Hang'],
        vibe: 'Chill',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.1,
        features: ['20+ Taps', 'Local Brews', 'Casual', 'Pet Friendly']
    },
    {
        id: 'cocktail-lounge',
        name: 'The Alchemist Lounge',
        description: 'Speakeasy-style cocktail bar with mixologist-crafted drinks',
        price: '$$$',
        neighborhood: 'Beacon Hill',
        hours: 'Open until 1am',
        tags: ['Cocktails', 'Speakeasy', 'Upscale', 'Date Night'],
        vibe: 'Date night',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.7,
        features: ['Craft Cocktails', 'Speakeasy', 'Reservations', 'Small Plates']
    },
    {
        id: 'dance-club',
        name: 'Pulse Nightclub',
        description: 'Multi-level dance club with different music genres nightly',
        price: '$$',
        neighborhood: 'Fenway',
        hours: 'Open until 2am',
        tags: ['Dancing', 'Multi-level', 'DJ', 'Big Night Out'],
        vibe: 'Big night out',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.0,
        features: ['2 Dance Floors', 'VIP', 'Theme Nights', 'Full Bar']
    },
    {
        id: 'rooftop-bar',
        name: 'Skyline Rooftop Bar',
        description: 'Elevated outdoor bar with panoramic city views and premium drinks',
        price: '$$$',
        neighborhood: 'Back Bay',
        hours: 'Open until midnight',
        tags: ['Rooftop', 'Views', 'Upscale', 'Cocktails'],
        vibe: 'Chill',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.5,
        features: ['360° Views', 'Premium Bar', 'Small Plates', 'Reservations']
    },
    {
        id: 'game-day-spot',
        name: 'TD Garden District',
        description: 'Pre-game sports bar perfect for Celtics and Bruins fans',
        price: '$$',
        neighborhood: 'West End',
        hours: 'Open until 1am',
        tags: ['Sports', 'Game Day', 'Celtics', 'Bruins'],
        vibe: 'Sports & TVs',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.2,
        features: ['30+ TVs', 'Team Gear', 'Game Specials', 'Standing Room']
    },
    {
        id: 'casual-pub',
        name: 'The North End Pub',
        description: 'Traditional neighborhood pub with board games and craft beers',
        price: '$',
        neighborhood: 'North End',
        hours: 'Open until midnight',
        tags: ['Pub', 'Casual', 'Board Games', 'Local'],
        vibe: 'Chill',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.3,
        features: ['Board Games', 'Craft Beer', 'Pub Food', 'Cozy']
    },
    {
        id: 'wine-bar',
        name: 'Vine & Dine Wine Bar',
        description: 'Sophisticated wine bar with cheese pairings and live jazz',
        price: '$$',
        neighborhood: 'South End',
        hours: 'Open until 11pm',
        tags: ['Wine Bar', 'Jazz', 'Cheese', 'Date Night'],
        vibe: 'Date night',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.6,
        features: ['200+ Wines', 'Live Jazz', 'Cheese Plates', 'Intimate']
    },
    {
        id: 'brew-hall',
        name: 'Allston Brew Hall',
        description: 'Spacious brewery hall perfect for groups and events',
        price: '$',
        neighborhood: 'Allston',
        hours: 'Open until midnight',
        tags: ['Brewery', 'Groups', 'Events', 'Casual'],
        vibe: 'Group hang',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.1,
        features: ['Group Seating', 'Event Space', 'Food Trucks', 'Games']
    },
    {
        id: 'lounge-club',
        name: 'The Velvet Lounge',
        description: 'Upscale lounge with bottle service and sophisticated crowd',
        price: '$$$',
        neighborhood: 'Downtown',
        hours: 'Open until 2am',
        tags: ['Lounge', 'Upscale', 'Bottle Service', 'VIP'],
        vibe: 'Big night out',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.4,
        features: ['Bottle Service', 'VIP Tables', 'Dress Code', 'Mixologist']
    },
    {
        id: 'outdoor-garden',
        name: 'Secret Garden Café',
        description: 'Hidden outdoor garden with string lights and casual dining',
        price: '$$',
        neighborhood: 'Jamaica Plain',
        hours: 'Open until 10pm',
        tags: ['Garden', 'Hidden', 'Outdoor', 'Casual'],
        vibe: 'Chill',
        image: '/assets/img/placeholder-venue.svg',
        rating: 4.5,
        features: ['Garden Seating', 'String Lights', 'Local Food', 'Quiet']
    }
];

// Venue helper functions
const venueHelpers = {
    // Get all venues
    getAllVenues: () => [...mockVenues],

    // Get venue by ID
    getVenueById: (id) => mockVenues.find(venue => venue.id === id),

    // Get venues by neighborhood
    getVenuesByNeighborhood: (neighborhood) => 
        mockVenues.filter(venue => 
            venue.neighborhood.toLowerCase().includes(neighborhood.toLowerCase())
        ),

    // Get venues by vibe
    getVenuesByVibe: (vibe) => 
        mockVenues.filter(venue => venue.vibe === vibe),

    // Get venues by price range
    getVenuesByPrice: (price) => 
        mockVenues.filter(venue => venue.price === price),

    // Search venues by text
    searchVenues: (query) => {
        const lowerQuery = query.toLowerCase();
        return mockVenues.filter(venue =>
            venue.name.toLowerCase().includes(lowerQuery) ||
            venue.description.toLowerCase().includes(lowerQuery) ||
            venue.neighborhood.toLowerCase().includes(lowerQuery) ||
            venue.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    },

    // Get venue categories
    getVibes: () => [...new Set(mockVenues.map(venue => venue.vibe))],

    // Get neighborhoods
    getNeighborhoods: () => [...new Set(mockVenues.map(venue => venue.neighborhood))],

    // Get price ranges
    getPriceRanges: () => [...new Set(mockVenues.map(venue => venue.price))],

    // Get random venues for sampling
    getRandomVenues: (count = 3) => {
        const shuffled = [...mockVenues].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    },

    // Get featured venues (high-rated)
    getFeaturedVenues: (count = 5) => 
        [...mockVenues]
            .sort((a, b) => b.rating - a.rating)
            .slice(0, count),

    // Get trending venues (newer/most popular)
    getTrendingVenues: (count = 5) => {
        // For demo, return high-rated venues that aren't the absolute highest
        return [...mockVenues]
            .filter(venue => venue.rating >= 4.0 && venue.rating <= 4.5)
            .sort(() => 0.5 - Math.random())
            .slice(0, count);
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mockVenues, venueHelpers };
}

// Global assignment
window.mockVenues = mockVenues;
window.venueHelpers = venueHelpers;