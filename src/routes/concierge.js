/**
 * SceneLink AI Concierge Backend
 * 
 * Intent classifier + real database queries + structured response.
 * Endpoint: POST /api/concierge
 * Request: { message, session_id, context }
 * Response: { response, venues, events, actions, intent, confidence }
 * 
 * This is a deterministic rule-based classifier (no external AI API required).
 * Can be upgraded later to call OpenAI/Claude/etc. by swapping generateResponse().
 */

const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const { aiConcierge, isEnabled: aiEnabled } = require('./conciergeAI');

const router = express.Router();

// ═════════════════════════════════════════════════════════════
// INTENT CLASSIFIER
// ═════════════════════════════════════════════════════════════
const CUISINES = {
    italian: ['italian','pasta','pizza','trattoria','osteria'],
    japanese: ['japanese','sushi','ramen','izakaya'],
    mexican: ['mexican','taco','burrito','taqueria'],
    chinese: ['chinese','dim sum','szechuan'],
    thai: ['thai','pad thai'],
    indian: ['indian','curry','tandoor'],
    french: ['french','brasserie','bistro'],
    mediterranean: ['mediterranean','greek','lebanese','hummus'],
    seafood: ['seafood','oyster','lobster','fish','raw bar'],
    steakhouse: ['steak','steakhouse','chophouse'],
    american: ['american','burger','diner','grill'],
    cafe: ['cafe','coffee','espresso','café']
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

const NEIGHBORHOODS = [
    'back bay','south end','north end','seaport','downtown','cambridge','beacon hill',
    'fort point','fenway','somerville','allston','brookline','jamaica plain','charlestown',
    'chinatown','west end','east boston','dorchester','roslindale','brighton','hyde park',
    'mission hill','roxbury','mattapan'
];

const TIME_HINTS = {
    tonight: ['tonight','this evening','right now'],
    weekend: ['weekend','saturday night','friday night','this weekend'],
    lunch: ['lunch','midday','noon'],
    brunch: ['brunch','saturday morning','sunday morning'],
    latenight: ['late night','after midnight','2am','closing time']
};

function classifyIntent(message) {
    const m = (message || '').toLowerCase().trim();
    const intent = {
        primary: 'search',
        cuisines: [],
        vibes: [],
        neighborhoods: [],
        times: [],
        group_size: null,
        budget: null,
        is_booking: false,
        is_event: false,
        is_help: false,
        is_greeting: false,
        original: message
    };

    // Greeting/help
    if (/^(hi|hey|hello|what's up|yo|sup)\b/i.test(message)) intent.is_greeting = true;
    if (/\b(help|how does|what can|who are|what is scenelink)\b/i.test(m)) intent.is_help = true;

    // Cuisine detection
    Object.keys(CUISINES).forEach(function(key){
        CUISINES[key].forEach(function(kw){
            if (m.indexOf(kw) !== -1 && intent.cuisines.indexOf(key) === -1) intent.cuisines.push(key);
        });
    });

    // Vibe detection
    Object.keys(VIBES).forEach(function(key){
        VIBES[key].forEach(function(kw){
            if (m.indexOf(kw) !== -1 && intent.vibes.indexOf(key) === -1) intent.vibes.push(key);
        });
    });

    // Neighborhood detection
    NEIGHBORHOODS.forEach(function(n){
        if (m.indexOf(n) !== -1 && intent.neighborhoods.indexOf(n) === -1) intent.neighborhoods.push(n);
    });

    // Time detection
    Object.keys(TIME_HINTS).forEach(function(key){
        TIME_HINTS[key].forEach(function(kw){
            if (m.indexOf(kw) !== -1 && intent.times.indexOf(key) === -1) intent.times.push(key);
        });
    });

    // Group size - matches "for 4", "table for 6", "party of 8", "4 people", etc.
    const groupMatch = m.match(/\b(?:for|party of|table for|group of)\s+(\d+)\b/) ||
                       m.match(/\b(\d+)\s*(people|person|friends?|guys|ppl|of us|top)\b/);
    if (groupMatch) intent.group_size = parseInt(groupMatch[1]);
    if (/\bdate\b|\btwo of us\b|\bmy (partner|girlfriend|boyfriend|wife|husband)\b/.test(m)) intent.group_size = intent.group_size || 2;

    // Budget
    if (/\$\$\$\$|splurge|expensive|upscale/.test(m)) intent.budget = 4;
    else if (/\$\$\$/.test(m)) intent.budget = 3;
    else if (/cheap|budget|affordable|\$\$/.test(m)) intent.budget = 2;

    // Event intent
    if (/\b(event|concert|show|live music|tonight's event|what's happening)\b/.test(m)) intent.is_event = true;

    // Booking intent
    if (/\b(book|reserve|reservation|table for|make a reservation)\b/.test(m)) intent.is_booking = true;

    // Primary intent
    if (intent.is_booking) intent.primary = 'book';
    else if (intent.is_event) intent.primary = 'event';
    else if (intent.is_help) intent.primary = 'help';
    else if (intent.is_greeting) intent.primary = 'greet';
    else if (intent.cuisines.length || intent.vibes.length || intent.neighborhoods.length) intent.primary = 'recommend';
    else intent.primary = 'search';

    return intent;
}

// ═════════════════════════════════════════════════════════════
// VENUE QUERY BUILDER
// ═════════════════════════════════════════════════════════════
async function queryVenues(intent, limit) {
    limit = limit || 5;
    const conditions = [];
    const values = [];
    let i = 1;

    // Cuisine filter
    if (intent.cuisines.length) {
        const cs = intent.cuisines.map(function(c){ return '%' + c + '%'; });
        conditions.push(`(LOWER(cuisine) ILIKE ANY($${i}) OR LOWER(type) ILIKE ANY($${i}))`);
        values.push(cs);
        i++;
    }

    // Vibe → type mapping
    const typeFilters = [];
    if (intent.vibes.indexOf('rooftop') !== -1) typeFilters.push('rooftop');
    if (intent.vibes.indexOf('cocktail') !== -1) typeFilters.push('cocktail','bar','lounge');
    if (intent.vibes.indexOf('nightclub') !== -1) typeFilters.push('nightclub','club');
    if (intent.vibes.indexOf('livemusic') !== -1) typeFilters.push('live music','music','jazz');
    if (intent.vibes.indexOf('brunch') !== -1) typeFilters.push('cafe','restaurant');
    if (intent.vibes.indexOf('sports') !== -1) typeFilters.push('sports bar','bar');
    if (typeFilters.length) {
        const tf = typeFilters.map(function(t){ return '%' + t + '%'; });
        conditions.push(`(LOWER(type) ILIKE ANY($${i}) OR LOWER(subcategory) ILIKE ANY($${i}))`);
        values.push(tf);
        i++;
    }

    // Neighborhood filter
    if (intent.neighborhoods.length) {
        const nbs = intent.neighborhoods.map(function(n){ return '%' + n + '%'; });
        conditions.push(`LOWER(neighborhood) ILIKE ANY($${i})`);
        values.push(nbs);
        i++;
    }

    // Budget filter
    if (intent.budget) {
        conditions.push(`(price_level <= $${i} OR price_level IS NULL)`);
        values.push(intent.budget);
        i++;
    }

    // Time: tonight → is_open_now if available
    if (intent.times.indexOf('tonight') !== -1) {
        // Soft filter — prefer trending/hot venues for "tonight"
        conditions.push(`(buzz_score >= 50 OR is_open_now = true OR 1=1)`);
    }

    const whereClause = conditions.length ? ('WHERE ' + conditions.join(' AND ')) : '';
    const sql = `
        SELECT id, slug, name, type, cuisine, category, neighborhood, city, address,
               rating, price_level, buzz_score, why_hot, pair_with, short_desc, description,
               cover_image_url, image_url, reservation_url, opentable_url, resy_url, yelp_url,
               google_maps_url, lat, lng, is_open_now, hours_display,
               trending, featured, going_count
        FROM venues
        ${whereClause}
        ORDER BY
            CASE WHEN trending = true THEN 1 ELSE 0 END DESC,
            COALESCE(buzz_score, 0) DESC,
            COALESCE(rating, 0) DESC,
            RANDOM()
        LIMIT $${i}
    `;
    values.push(limit);

    try {
        const result = await pool.query(sql, values);
        return result.rows;
    } catch (err) {
        console.error('[concierge/queryVenues]', err.message);
        // Fallback: just return top trending venues
        try {
            const fb = await pool.query(
                `SELECT id, slug, name, type, cuisine, neighborhood, rating, price_level, buzz_score,
                        why_hot, short_desc, cover_image_url, image_url, reservation_url, opentable_url,
                        resy_url, yelp_url, google_maps_url, lat, lng
                 FROM venues
                 ORDER BY COALESCE(buzz_score,0) DESC, COALESCE(rating,0) DESC
                 LIMIT $1`, [limit]);
            return fb.rows;
        } catch(_){ return []; }
    }
}

// ═════════════════════════════════════════════════════════════
// EVENT QUERY
// ═════════════════════════════════════════════════════════════
async function queryEvents(intent, limit) {
    limit = limit || 5;
    try {
        const now = new Date();
        const end = new Date();
        if (intent.times.indexOf('weekend') !== -1) {
            end.setDate(end.getDate() + 7);
        } else {
            end.setDate(end.getDate() + 1); // tonight/tomorrow
        }
        const result = await pool.query(
            `SELECT id, slug, name, description, event_date, start_time, end_time,
                    venue_name, venue_neighborhood, category, image_url, cover_image_url,
                    ticket_url, ticket_price, price_range
             FROM events
             WHERE event_date >= $1 AND event_date <= $2
             ORDER BY event_date ASC, start_time ASC
             LIMIT $3`,
            [now.toISOString(), end.toISOString(), limit]
        );
        return result.rows;
    } catch (err) {
        console.error('[concierge/queryEvents]', err.message);
        return [];
    }
}

// ═════════════════════════════════════════════════════════════
// RESPONSE GENERATION
// ═════════════════════════════════════════════════════════════
function generateResponse(intent, venues, events) {
    if (intent.is_greeting) {
        return "Hey! I'm your SceneLink AI Concierge. I know every venue in Boston — ask me anything! Try: 'romantic Italian in the North End' or 'rooftop bars open tonight' or 'where's the best sushi in Back Bay?'";
    }
    if (intent.is_help) {
        return "I can help you find the perfect Boston venue for any occasion. I know cuisines, vibes, neighborhoods, and what's trending right now. I can also help you **book a table**, **plan a night with friends**, or **save venues** to your lists. What are you in the mood for?";
    }

    // Build descriptive intro based on detected intent
    const parts = [];
    if (intent.cuisines.length) parts.push(intent.cuisines.map(cap).join('/'));
    if (intent.vibes.length) parts.push(intent.vibes.map(cap).join('/'));
    const location = intent.neighborhoods.length
        ? 'in ' + intent.neighborhoods.map(capWords).join('/')
        : 'in Boston';
    const timing = intent.times.length
        ? (intent.times[0] === 'tonight' ? 'tonight' : intent.times[0] === 'weekend' ? 'this weekend' : intent.times[0])
        : '';

    if (intent.primary === 'event') {
        if (!events.length) return `I don't see any events ${timing || 'coming up'} that match. Try browsing the events page or check back soon!`;
        const s = events.length === 1 ? 'event' : 'events';
        return `Here ${events.length === 1 ? "'s an" : "are"} ${events.length} ${s} ${timing || 'coming up'}:`;
    }

    if (!venues.length) {
        return `I couldn't find exact matches for that. Try a different cuisine, neighborhood, or vibe — I know 520+ venues across Boston.`;
    }

    const descParts = parts.length ? parts.join(' · ') + ' ' : '';
    let leadIn;
    if (intent.is_booking) {
        leadIn = `Perfect — here are top ${descParts}spots ${location} where you can book a table${timing ? ' ' + timing : ''}:`;
    } else if (intent.primary === 'recommend') {
        leadIn = `${venues.length} top ${descParts}spots ${location}${timing ? ' ' + timing : ''}:`;
    } else {
        leadIn = `Here's what I found:`;
    }
    return leadIn;
}

// ═════════════════════════════════════════════════════════════
// SUGGESTED ACTIONS
// ═════════════════════════════════════════════════════════════
function generateActions(intent, venues) {
    const actions = [];
    if (!venues.length) {
        actions.push({ label: 'Browse all venues', type: 'link', href: 'explore.html' });
        actions.push({ label: "Tonight's Picks", type: 'link', href: 'tonight.html' });
        return actions;
    }
    if (intent.is_booking && venues[0] && (venues[0].reservation_url || venues[0].opentable_url || venues[0].resy_url)) {
        actions.push({ label: 'Book ' + venues[0].name, type: 'book', venue_id: venues[0].id });
    }
    actions.push({ label: 'Save all to a list', type: 'save_all' });
    actions.push({ label: 'Plan this with friends', type: 'plan' });
    if (intent.cuisines.length === 0 && intent.vibes.length === 0) {
        actions.push({ label: 'Refine by cuisine', type: 'refine_cuisine' });
    }
    return actions;
}

// ═════════════════════════════════════════════════════════════
// MAIN ROUTE: POST /api/concierge
// ═════════════════════════════════════════════════════════════
router.post('/', optionalAuth, async (req, res) => {
    const startedAt = Date.now();
    try {
        const message = (req.body.message || '').trim();
        const context = req.body.context || {};
        const history = Array.isArray(req.body.history) ? req.body.history : [];
        const session_id = req.body.session_id || ('sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6));

        if (!message) return res.status(400).json({ error: 'message required' });
        if (message.length > 500) return res.status(400).json({ error: 'message too long' });

        // ─── Try OpenAI first if enabled ───────────────────────────
        if (aiEnabled() && req.body.ai !== false) {
            try {
                const ai = await aiConcierge({ message, history, context });
                const intent = classifyIntent(message); // keep for analytics + client hints
                pool.query(
                    `INSERT INTO analytics_events (event, user_id, anon, session_id, properties)
                     VALUES ($1, $2, $3, $4, $5)`,
                    ['concierge_query', req.user ? req.user.id : null, !req.user, session_id,
                     JSON.stringify({
                         message: message.slice(0, 200),
                         source: 'openai',
                         tools_used: ai.tools_used,
                         matches: ai.venues.length,
                         events: ai.events.length,
                         ms: Date.now() - startedAt
                     })]
                ).catch(()=>{});
                return res.json({
                    ok: true,
                    source: 'openai',
                    response: ai.response,
                    venues: ai.venues,
                    events: ai.events,
                    itinerary: ai.itinerary || null,
                    actions: ai.actions,
                    intent: {
                        primary: intent.primary,
                        cuisines: intent.cuisines,
                        vibes: intent.vibes,
                        neighborhoods: intent.neighborhoods,
                        times: intent.times,
                        is_booking: intent.is_booking,
                        is_event: intent.is_event
                    },
                    tools_used: ai.tools_used,
                    session_id
                });
            } catch (aiErr) {
                console.warn('[concierge] AI failed, falling back to rule-based:', aiErr.message);
                // fall through to rule-based
            }
        }

        // ─── Fallback: rule-based classifier ───────────────────────
        const intent = classifyIntent(message);
        const limit = Math.min(parseInt(req.body.limit) || 5, 10);

        let venues = [];
        let events = [];
        if (intent.primary === 'event') {
            events = await queryEvents(intent, limit);
            if (!events.length) venues = await queryVenues(intent, limit);
        } else if (intent.primary === 'recommend' || intent.primary === 'search' || intent.primary === 'book') {
            venues = await queryVenues(intent, limit);
        }

        const response = generateResponse(intent, venues, events);
        const actions = generateActions(intent, venues);

        pool.query(
            `INSERT INTO analytics_events (event, user_id, anon, session_id, properties)
             VALUES ($1, $2, $3, $4, $5)`,
            ['concierge_query', req.user ? req.user.id : null, !req.user, session_id,
             JSON.stringify({ message: message.slice(0, 200), source: 'rule-based', intent: intent.primary, matches: venues.length, events: events.length, ms: Date.now() - startedAt })]
        ).catch(()=>{});

        res.json({
            ok: true,
            source: 'rule-based',
            response,
            venues,
            events,
            itinerary: null,
            actions,
            intent: {
                primary: intent.primary,
                cuisines: intent.cuisines,
                vibes: intent.vibes,
                neighborhoods: intent.neighborhoods,
                times: intent.times,
                is_booking: intent.is_booking,
                is_event: intent.is_event
            },
            session_id
        });
    } catch (err) {
        console.error('[concierge]', err);
        res.status(500).json({
            ok: false,
            error: 'Concierge service error',
            response: "Sorry, I had trouble with that. Try browsing Explore or Tonight for picks!"
        });
    }
});

// ═════════════════════════════════════════════════════════════
// GET /api/concierge/suggestions — dynamic quick-action chips
// ═════════════════════════════════════════════════════════════
router.get('/suggestions', async (req, res) => {
    try {
        const dow = new Date().getDay(); // 0 Sun – 6 Sat
        const hour = new Date().getHours();

        // Time-aware suggestions
        let suggestions;
        if (hour >= 5 && hour < 11) {
            suggestions = [
                'Best brunch spots in Boston',
                'Coffee shops to work from',
                'Breakfast near me'
            ];
        } else if (hour >= 11 && hour < 15) {
            suggestions = [
                'Lunch spots downtown',
                'Quick bites in the Seaport',
                'Best sandwiches in Boston'
            ];
        } else if (hour >= 15 && hour < 18) {
            suggestions = [
                'Rooftop bars open now',
                'Happy hour deals',
                'Cafes open late'
            ];
        } else if (hour >= 18 && hour < 22) {
            // Prime dinner time
            if (dow === 5 || dow === 6) {
                suggestions = [
                    'Romantic Italian for date night',
                    'Trendy cocktail bars tonight',
                    'Live music this weekend',
                    'Rooftop with a view'
                ];
            } else {
                suggestions = [
                    'Dinner spots tonight',
                    'Best sushi in Back Bay',
                    'Cozy restaurants for tonight'
                ];
            }
        } else {
            // Late night
            suggestions = [
                'Nightclubs open late',
                'Bars open past midnight',
                'Late night food near me'
            ];
        }

        res.json({ suggestions });
    } catch (err) {
        res.json({
            suggestions: [
                'Romantic Italian in the North End',
                'Rooftop bars with a view',
                'Best sushi in Back Bay',
                'Where is everyone going tonight?'
            ]
        });
    }
});

// Helpers
function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function capWords(s){ return s.split(' ').map(cap).join(' '); }

module.exports = router;