'use strict';

// Both provider-backed and catalog-only Concierge use this same request parser.
const { extractConstraints, inferVenueType, parseNeighborhoods, isEventRequest } = require('./concierge-constraints');

const CUISINES = {
    italian: ['italian','pasta','pizza','trattoria','osteria'],
    japanese: ['japanese','sushi','ramen','izakaya'],
    mexican: ['mexican','taco','burrito','taqueria'],
    chinese: ['chinese','dim sum','szechuan'],
    thai: ['thai','pad thai'],
    indian: ['indian','curry','tandoor'],
    french: ['french','brasserie','bistro'],
    mediterranean: ['mediterranean','hummus'],
    greek: ['greek'],
    lebanese: ['lebanese'],
    korean: ['korean'],
    vietnamese: ['vietnamese'],
    spanish: ['spanish','tapas'],
    bbq: ['bbq','barbecue'],
    southern: ['southern'],
    vegan: ['vegan'],
    vegetarian: ['vegetarian'],
    seafood: ['seafood','oyster','lobster','fish','raw bar'],
    steakhouse: ['steak','steakhouse','chophouse'],
    american: ['american','burger','diner','grill']
};

const VIBES = {
    romantic: ['date','romantic','anniversary','intimate','date night','dating'],
    rooftop: ['rooftop','view','skyline','terrace'],
    cocktail: ['cocktail','speakeasy','mixology','craft drinks'],
    nightclub: ['club','nightclub','dance','dancing','dj'],
    livemusic: ['live music','band','concert','jazz','acoustic'],
    casual: ['casual','chill','relaxed','laid back'],
    fine: ['fine dining','upscale','fancy','special occasion','tasting menu'],
    brunch: ['brunch','breakfast','mimosa','eggs benedict'],
    sports: ['sports bar','sports','game','watch the game'],
    lgbtq: ['lgbtq','gay','queer','pride'],
    hiddengem: ['hidden gem','off the beaten','secret','under the radar']
};

const TIME_HINTS = {
    tonight: ['tonight','this evening','right now'],
    weekend: ['weekend','saturday night','friday night','this weekend'],
    lunch: ['lunch','midday','noon'],
    brunch: ['brunch','saturday morning','sunday morning'],
    latenight: ['late night','after midnight','2am','closing time']
};

function classifyIntent(message) {
    const constraints = extractConstraints(message);
    const m = constraints.positiveText.toLowerCase().trim();
    const intent = {
        primary: 'search',
        cuisines: [],
        vibes: [],
        neighborhoods: [],
        times: [],
        group_size: null,
        budget: null,
        venueType: null,
        is_booking: false,
        is_event: false,
        is_help: false,
        is_greeting: false,
        original: message,
        ...constraints
    };

    // Greeting/help
    if (/^(hi|hey|hello|what's up|yo|sup)[\s!.?]*$/i.test(m)) intent.is_greeting = true;
    if (/^help[\s!.?]*$|\b(how does|what can you|who are you|what is scenelink)\b/i.test(m)) intent.is_help = true;

    const hasTerm = kw => new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?\\b', 'i').test(m);

    // Cuisine detection
    Object.keys(CUISINES).forEach(function(key){
        CUISINES[key].forEach(function(kw){
            if (hasTerm(kw) && intent.cuisines.indexOf(key) === -1) intent.cuisines.push(key);
        });
    });

    // Vibe detection
    Object.keys(VIBES).forEach(function(key){
        VIBES[key].forEach(function(kw){
            if (hasTerm(kw) && intent.vibes.indexOf(key) === -1) intent.vibes.push(key);
        });
    });

    // Neighborhood detection
    intent.neighborhoods = parseNeighborhoods(m);

    // Time detection
    Object.keys(TIME_HINTS).forEach(function(key){
        TIME_HINTS[key].forEach(function(kw){
            if (hasTerm(kw) && intent.times.indexOf(key) === -1) intent.times.push(key);
        });
    });

    // Group size - matches "for 4", "table for 6", "party of 8", "4 people", etc.
    const groupMatch = m.match(/\b(?:for|party of|table for|group of)\s+(\d+)\b/) ||
                       m.match(/\b(\d+)\s*(people|person|friends?|guys|ppl|of us|top)\b/);
    if (groupMatch) intent.group_size = parseInt(groupMatch[1]);
    if (/\bdate\b|\btwo of us\b|\bmy (partner|girlfriend|boyfriend|wife|husband)\b/.test(m)) intent.group_size = intent.group_size || 2;

    // Budget
    if (/\$\$\$\$|\b(?:splurge|expensive)\b/.test(m)) intent.budget = 4;
    else if (/\$\$\$|\b(?:upscale|fine dining)\b/.test(m)) intent.budget = 3;
    else if (/\b(?:cheap|budget|affordable|inexpensive)\b|\$\$/.test(m)) intent.budget = 2;
    else if (/\$(?![\d$])/.test(m)) intent.budget = 1;

    // Event intent
    intent.is_event = isEventRequest(m);

    // Booking intent
    if (/\b(book|reserve|reservation|table for|make a reservation)\b/.test(m)) intent.is_booking = true;

    // A clearly requested place type is a hard constraint, not a guessed vibe.
    // Leave generic, named, and mixed requests on their existing retrieval path.
    if (!intent.is_event) intent.venueType = inferVenueType(m);
    intent.isPlan = /\b(?:plan|itinerary|night out|date night|dinner then|drinks after|dinner and drinks|full night|schedule)\b/.test(m);
    if (intent.cuisines.length || intent.neighborhoods.length || intent.venueType || intent.isPlan) intent.is_help = false;

    // Primary intent
    if (intent.is_booking) intent.primary = 'book';
    else if (intent.is_event) intent.primary = 'event';
    else if (intent.is_help) intent.primary = 'help';
    else if (intent.is_greeting) intent.primary = 'greet';
    else if (intent.cuisines.length || intent.vibes.length || intent.neighborhoods.length) intent.primary = 'recommend';
    else intent.primary = 'search';

    return intent;
}

module.exports = { classifyIntent };
