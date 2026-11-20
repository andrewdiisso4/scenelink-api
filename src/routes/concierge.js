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
const { classifyIntent } = require('../services/concierge-intent');
const { resolveConversation, searchContextFor } = require('../services/concierge-conversation');
const { venueTypeSQL, exclusionSQL } = require('../services/concierge-query-constraints');
const {publicVenue,availableVenueSQL} = require('../services/venue-helpers');
const {visibleDiscoveryVenueSQL} = require('../services/venue-duplicate-discovery');
const {reviewedPriceSQL} = require('../services/venue-facts');
const { queryConciergeEvents } = require('../services/concierge-event-search');
const { optionalAuth } = require('../middleware/auth');
const { runAIConcierge, isEnabled: aiEnabled } = require('./conciergeAI');

const router = express.Router();
const { aiLimiter } = require('../middleware/rateLimits');

// ═════════════════════════════════════════════════════════════
// INTENT CLASSIFIER
// ═════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
// VENUE QUERY BUILDER
// ═════════════════════════════════════════════════════════════
async function queryVenues(intent, limit) {
    limit = limit || 5;
    const conditions = [availableVenueSQL(''), visibleDiscoveryVenueSQL('venues')];
    const values = [];
    let i = 1;

    if (intent.venueName != null) {
        conditions.push(`lower(name) = lower($${i++})`);
        values.push(intent.venueName);
    }

    // Cuisine filter
    if (intent.cuisines.length) {
        const cs = intent.cuisines.map(function(c){ return '%' + c + '%'; });
        conditions.push(`(LOWER(cuisine) ILIKE ANY($${i}) OR LOWER(type) ILIKE ANY($${i}))`);
        values.push(cs);
        i++;
    }

    const placeType = intent.venueName == null ? intent.venueType : null;
    const placeConstraint = venueTypeSQL(placeType);
    if (placeConstraint) conditions.push(placeConstraint);

    // Vibe → type mapping
    const typeFilters = [];
    if (intent.vibes.indexOf('rooftop') !== -1) typeFilters.push('rooftop');
    if (intent.vibes.indexOf('cocktail') !== -1 && placeType !== 'cocktail_bar') typeFilters.push('cocktail','bar','lounge');
    if (intent.vibes.indexOf('nightclub') !== -1) typeFilters.push('nightclub','club');
    if (intent.vibes.indexOf('livemusic') !== -1) typeFilters.push('live music','music','jazz');
    if (intent.vibes.indexOf('brunch') !== -1) typeFilters.push('cafe','restaurant');
    if (intent.vibes.indexOf('sports') !== -1) typeFilters.push('sports bar','bar');
    if (typeFilters.length) {
        const tf = typeFilters.map(function(t){ return '%' + t + '%'; });
        conditions.push(`(LOWER(type) ILIKE ANY($${i}) OR LOWER(category) ILIKE ANY($${i}))`);
        values.push(tf);
        i++;
    }

    // Neighborhood filter
    if (intent.neighborhoods.length) {
        const nbs = intent.neighborhoods.map(function(n){ return '%' + n + '%'; });
        conditions.push(`(neighborhood ILIKE ANY($${i}) OR city ILIKE ANY($${i}))`);
        values.push(nbs);
        i++;
    }

    // Budget filter
    if (intent.budget) {
        const price = reviewedPriceSQL('venues');
        conditions.push(`${price} <= $${i}`);
        values.push(intent.budget);
        i++;
    }

    const excluded = exclusionSQL(intent, i);
    conditions.push(...excluded.conditions);
    values.push(...excluded.values);
    i = excluded.nextIndex;

    const whereClause = conditions.length ? ('WHERE ' + conditions.join(' AND ')) : '';
    const sql = `
        SELECT id, slug, name, type, cuisine, category, neighborhood, city, address,
               source, to_jsonb(venues)->'field_provenance' AS field_provenance, NULL::numeric AS rating, price_level, NULL::numeric AS buzz_score, NULL::text AS why_hot, pair_with, short_desc, description,
               cover_image_url, image_url, reservation_url, opentable_url, resy_url, yelp_url,
               google_maps_url, lat, lng, NULL::boolean AS is_open_now, hours_display,
               NULL::boolean AS trending, NULL::boolean AS featured, NULL::integer AS going_count
        FROM venues
        ${whereClause}
        ORDER BY lower(name), id
        LIMIT $${i}
    `;
    values.push(limit);

    const result = await pool.query(sql, values);
    return result.rows.map(publicVenue); // Database failure must not become unrelated successful recommendations.
}

// ═════════════════════════════════════════════════════════════
// EVENT QUERY
// ═════════════════════════════════════════════════════════════
async function queryEvents(intent, limit) {
    return queryConciergeEvents(pool, intent, limit || 5);
}

// ═════════════════════════════════════════════════════════════
// RESPONSE GENERATION
// ═════════════════════════════════════════════════════════════
function generateResponse(intent, venues, events) {
    if (intent.is_greeting) {
        return "Hi! I can help you explore Boston venues by neighborhood, cuisine and budget. Hours and table availability need confirmation with the venue.";
    }
    if (intent.is_help) {
        return "I can help you find the perfect Boston venue for any occasion. I can search stored venue information by cuisine and neighborhood, help you **plan a night with friends**, or **save venues** to your lists. Booking links open an external site; availability and reservations must be confirmed there. What are you in the mood for?";
    }

    // Build descriptive intro based on detected intent
    const parts = [];
    if (intent.cuisines.length) parts.push(intent.cuisines.map(cap).join('/'));
    const location = intent.neighborhoods.length
        ? 'in ' + intent.neighborhoods.map(capWords).join('/')
        : 'in Boston';
    const timing = intent.times.length
        ? (intent.times[0] === 'tonight' ? 'tonight' : intent.times[0] === 'weekend' ? 'this weekend' : intent.times[0])
        : '';

    if (intent.primary === 'event') {
        const when = intent.eventWindow?.kind === 'date' ? 'on ' + intent.eventWindow.date
            : intent.eventWindow?.kind === 'today' ? 'today'
            : intent.eventWindow?.kind === 'weekend' ? 'this weekend' : 'in the next seven days';
        if (!events.length) return `I don't see any reviewed events ${when} that match those filters. Try another date, area or event type.`;
        const s = events.length === 1 ? 'event' : 'events';
        return `${events.length} matching ${s} ${location} ${when}. Check the event's source for tickets and current details.`;
    }

    if (!venues.length) {
        return `I couldn't find exact matches for that. Try a different cuisine, neighborhood, or vibe — Availability and opening hours need confirmation with the venue.`;
    }

    const descParts = parts.length ? parts.join(' · ') + ' ' : '';
    let leadIn;
    if (intent.is_booking) {
        leadIn = `Here are ${descParts}spots ${location} to explore booking options${timing ? ' ' + timing : ''}:`;
    } else if (intent.primary === 'recommend') {
        leadIn = `${venues.length} matching ${descParts}spots ${location}${timing ? ' ' + timing : ''}:`;
    } else {
        leadIn = `Here's what I found:`;
    }
    if (intent.venueName == null && intent.venueType === 'cocktail_bar') {
        return `${venues.length} bar ${venues.length === 1 ? 'match' : 'matches'} ${location}. Cocktail menus aren't verified; check with the venue.`;
    }
    return timing || intent.group_size ? leadIn + ' Opening hours and space for your group need confirmation with the venue.' : leadIn;
}

// ═════════════════════════════════════════════════════════════
// SUGGESTED ACTIONS
// ═════════════════════════════════════════════════════════════
function generateActions(intent, venues) {
    const actions = [];
    if (intent.is_event) return [{ label: 'Browse events', type: 'link', href: 'events.html' }];
    if (!venues.length) {
        actions.push({ label: 'Browse all venues', type: 'link', href: 'explore.html' });
        actions.push({ label: "Tonight's Picks", type: 'link', href: 'tonight.html' });
        return actions;
    }
    if (intent.is_booking && venues[0] && (venues[0].reservation_url || venues[0].opentable_url || venues[0].resy_url)) {
        actions.push({ label: 'Check booking options for ' + venues[0].name, type: 'book', venue_id: venues[0].id, href:venues[0].booking.url, reservation_confirmed:false });
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
router.post('/', aiLimiter, optionalAuth, async (req, res) => {
    const startedAt = Date.now();
    try {
        if(typeof req.body?.message!=='string')return res.status(400).json({error:'message must be text'});
        const message = req.body.message.trim();
        res.setHeader('Cache-Control','private, no-store');
        const context = req.body.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context) ? req.body.context : {};
        const history = Array.isArray(req.body.history) ? req.body.history : [];
        const session_id = req.body.session_id || ('sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6));

        if (!message) return res.status(400).json({ error: 'message required' });
        if (message.length > 500) return res.status(400).json({ error: 'message too long' });

        const request = await resolveConversation({ pool, message, history, context, parse: classifyIntent });
        const intent = request.filters;
        if (request.clarification) {
            return res.json({ ok: true, source: 'rule-based', response: request.clarification,
                venues: [], events: [], itinerary: null, actions: [], tools_used: [],
                intent: { primary: 'clarify' }, search_context: null, session_id });
        }

        // ─── Try OpenAI first if enabled ───────────────────────────
        if (aiEnabled() && req.body.ai !== false && !intent.is_event && !intent.is_help && !intent.is_greeting && !request.reset) {
            try {
                const result = await runAIConcierge({ message, history, context, resolvedRequest: request });
                const byId = new Map(result.candidates.map(v => [String(v.id),v]));
                const stops = result.recommendedPlan?.stops || [];
                const ids = [...new Set([...result.recommendedVenues.map(v=>String(v.venueId)), ...stops.map(v=>String(v.venueId))])];
                const ai = {
                    source: result.source, response: result.reply,
                    venues: ids.map(id=>byId.get(id)).filter(Boolean).map(v=>({...v,is_open_now:null})), events: [],
                    itinerary: result.recommendedPlan ? {...result.recommendedPlan,stops:stops.map(stop=>{
                        const v=byId.get(String(stop.venueId));
                        return {...stop,name:v.name,neighborhood:v.neighborhood,category:v.category||v.type,
                            priceLevel:v.price_level?'$'.repeat(v.price_level):null,bestTime:null,vibeTags:[]};
                    })} : null,
                    actions: [], tools_used: ['venue_database']
                };
                pool.query(
                    `INSERT INTO analytics_events (event, user_id, anon, session_id, properties)
                     VALUES ($1, $2, $3, $4, $5)`,
                    ['concierge_query', req.user ? req.user.id : null, !req.user, session_id,
                     JSON.stringify({
                         message_length: message.length,
                         source: ai.source,
                         tools_used: ai.tools_used,
                         matches: ai.venues.length,
                         events: ai.events.length,
                         ms: Date.now() - startedAt
                     })]
                ).catch(()=>{});
                return res.json({
                    ok: true,
                    source: ai.source,
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
                    search_context: searchContextFor(intent, ai.venues),
                    session_id
                });
            } catch (aiErr) {
                console.warn('[concierge] AI unavailable; using database fallback');
                // fall through to rule-based
            }
        }

        // ─── Fallback: rule-based classifier ───────────────────────
        const limit = Math.max(1, Math.min(parseInt(req.body.limit) || 5, 10));

        let venues = [];
        let events = [];
        if (intent.primary === 'event') {
            events = await queryEvents(intent, limit);
        } else if (intent.primary === 'recommend' || intent.primary === 'search' || intent.primary === 'book') {
            venues = await queryVenues(intent, limit);
        }

        const response = generateResponse(intent, venues, events);
        const actions = generateActions(intent, venues);

        pool.query(
            `INSERT INTO analytics_events (event, user_id, anon, session_id, properties)
             VALUES ($1, $2, $3, $4, $5)`,
            ['concierge_query', req.user ? req.user.id : null, !req.user, session_id,
             JSON.stringify({ message_length: message.length, source: 'rule-based', intent: intent.primary, matches: venues.length, events: events.length, ms: Date.now() - startedAt })]
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
            search_context: searchContextFor(intent, intent.is_event
                ? events.map(event => ({ name: event.venue_name, neighborhood: event.venue_neighborhood })) : venues),
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
