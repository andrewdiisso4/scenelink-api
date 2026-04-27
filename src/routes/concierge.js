/**
 * SceneLink AI Concierge — HTTP routes
 *
 * POST /api/concierge
 *   Body: {
 *     message: string (required, 1..500 chars),
 *     context: { neighborhood?, vibes?[], pageId?, planId? },
 *     history: [{ role: 'user'|'assistant', content: string }],
 *     filters: { neighborhood?, vibe?, priceLevel?, partySize?, cuisines? }, // optional, merged into parsing
 *     ai: boolean (default true; set false to force rule-based)
 *   }
 *   Returns:
 *   {
 *     ok, source ('openai' | 'rule-based' | 'empty'),
 *     reply, intent,
 *     recommendedPlan: { title, summary, stops: [{venueId,...,actions}] } | null,
 *     recommendedVenues: [{ venueId, whyItFits }],
 *     venueCards: [ full venue rows for every venueId referenced above ],
 *     quickReplies: [string],
 *     requiresLogin: boolean,  // true if actions (save/plan) require login
 *     isLoggedIn: boolean,
 *     notice: string | null    // e.g. "SceneLink Concierge is having trouble connecting..."
 *   }
 *
 * GET /api/concierge/suggestions
 *   Returns time-aware starter chips.
 */

const express = require('express');
const pool = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const {
    runAIConcierge,
    fetchCandidateVenues,
    fetchVenuesByIds,
    parseFilters,
    isEnabled: aiEnabled
} = require('./conciergeAI');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING — simple in-memory, per IP+user
// ═══════════════════════════════════════════════════════════════════════════
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = parseInt(process.env.CONCIERGE_RATE_MAX || '20', 10);
const rateMap = new Map(); // key -> { count, resetAt }

function rateLimit(req, res, next) {
    const userId = req.user && req.user.id ? req.user.id : null;
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
    const key = userId ? `u:${userId}` : `ip:${ip}`;
    const now = Date.now();
    const entry = rateMap.get(key);
    if (!entry || entry.resetAt <= now) {
        rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return next();
    }
    if (entry.count >= RATE_MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
            ok: false,
            error: 'rate_limited',
            reply: 'Whoa — slow down for a moment. Try again in a few seconds.',
            retryAfter
        });
    }
    entry.count++;
    next();
}

// Cleanup old rate entries every 5 min
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateMap.entries()) if (v.resetAt <= now) rateMap.delete(k);
}, 5 * 60 * 1000).unref?.();

// ═══════════════════════════════════════════════════════════════════════════
// HYDRATION + ACTION BUILDING
// ═══════════════════════════════════════════════════════════════════════════
function buildVenueActions(venue, isLoggedIn) {
    // Actions are instructions for the frontend, which will wire them to real
    // app endpoints (/api/favorites/toggle, /api/plans, etc.)
    return [
        { key: 'view_details', label: 'View Details', requiresLogin: false, href: `/venue.html?slug=${encodeURIComponent(venue.slug || venue.id)}` },
        { key: 'save', label: isLoggedIn ? 'Save' : 'Save (log in)', requiresLogin: true, venueId: venue.id },
        { key: 'add_to_plan', label: isLoggedIn ? 'Add to Plan' : 'Add to Plan (log in)', requiresLogin: true, venueId: venue.id },
        { key: 'directions', label: 'Directions', requiresLogin: false,
          href: venue.google_maps_url ||
                (venue.lat && venue.lng
                    ? `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((venue.name||'') + ' ' + (venue.address||'Boston MA'))}`) },
        ...(venue.opentable_url || venue.resy_url || venue.reservation_url ? [
            { key: 'book', label: 'Book a Table', requiresLogin: false,
              href: venue.opentable_url || venue.resy_url || venue.reservation_url }
        ] : [])
    ];
}

function toVenueCard(v, isLoggedIn) {
    return {
        id: v.id,
        slug: v.slug,
        name: v.name,
        type: v.type,
        category: v.category,
        cuisine: v.cuisine,
        neighborhood: v.neighborhood,
        city: v.city,
        address: v.address,
        lat: v.lat ? Number(v.lat) : null,
        lng: v.lng ? Number(v.lng) : null,
        rating: v.rating ? Number(v.rating) : null,
        priceLevel: v.price_level || null,
        priceLabel: v.price_label || (v.price_level ? '$'.repeat(v.price_level) : null),
        buzzScore: v.buzz_score ? Number(v.buzz_score) : null,
        goingCount: v.going_count || 0,
        imageUrl: v.cover_image_url || v.image_url || null,
        coverImageUrl: v.cover_image_url || v.image_url || null,
        shortDesc: v.short_desc,
        description: v.description,
        vibe: v.vibe,
        highlight: v.highlight,
        whyHot: v.why_hot,
        pairWith: v.pair_with,
        trending: !!v.trending,
        featured: !!v.featured,
        isOpenNow: !!v.is_open_now,
        hoursDisplay: v.hours_display,
        opentableUrl: v.opentable_url,
        resyUrl: v.resy_url,
        yelpUrl: v.yelp_url,
        reservationUrl: v.reservation_url || v.opentable_url || v.resy_url,
        googleMapsUrl: v.google_maps_url,
        actions: buildVenueActions(v, isLoggedIn)
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE-BASED FALLBACK — uses the same real DB candidates, no fake data
// ═══════════════════════════════════════════════════════════════════════════
function generateFallbackReply(filters, hasVenues, noticeMode = false) {
    if (!hasVenues) {
        return "I couldn't find live venues matching that. Try a different neighborhood, vibe, or cuisine.";
    }
    const parts = [];
    if (filters.cuisines.length) parts.push(filters.cuisines.map(cap).join(' / '));
    if (filters.vibes.length) parts.push(filters.vibes.join(' / '));
    const loc = filters.neighborhoods.length ? ` in ${filters.neighborhoods.join(', ')}` : ' in Boston';
    const descPart = parts.length ? parts.join(' · ') : 'top';
    const pre = noticeMode
        ? 'SceneLink Concierge is having trouble connecting — here are curated picks from live SceneLink venue data. '
        : '';
    return `${pre}${capFirst(descPart)} spots${loc}:`;
}

function generateFallback({ filters, candidates, isLoggedIn, noticeMode = false }) {
    const hasVenues = candidates && candidates.length > 0;
    const topVenues = (candidates || []).slice(0, 6);

    let recommendedPlan = null;
    if (filters.isPlan && topVenues.length >= 2) {
        // Simple heuristic itinerary: split into dinner → drinks → (late night)
        const dinner = topVenues.find(v => v.type === 'restaurant' || /restaurant/i.test(v.category || '')) || topVenues[0];
        const bar    = topVenues.find(v => v.id !== dinner.id && (v.type === 'bar' || /bar|cocktail|lounge/i.test(v.category || ''))) || topVenues[1];
        const late   = topVenues.find(v =>
            v.id !== dinner.id && (!bar || v.id !== bar.id) &&
            (v.type === 'nightlife' || /club|nightlife|lounge/i.test(v.category || ''))
        );
        const stops = [];
        if (dinner) stops.push({
            venueId: dinner.id, name: dinner.name, neighborhood: dinner.neighborhood || '',
            category: 'Dinner', whyItFits: dinner.why_hot || dinner.highlight || 'A strong match for your vibe.',
            bestTime: '7:30 PM', priceLevel: dinner.price_label || (dinner.price_level ? '$'.repeat(dinner.price_level) : null),
            vibeTags: filters.vibes.slice(0, 3)
        });
        if (bar) stops.push({
            venueId: bar.id, name: bar.name, neighborhood: bar.neighborhood || '',
            category: 'Drinks', whyItFits: bar.why_hot || bar.highlight || 'Great follow-up spot nearby.',
            bestTime: '9:30 PM', priceLevel: bar.price_label || (bar.price_level ? '$'.repeat(bar.price_level) : null),
            vibeTags: filters.vibes.slice(0, 3)
        });
        if (late) stops.push({
            venueId: late.id, name: late.name, neighborhood: late.neighborhood || '',
            category: 'Late Night', whyItFits: late.why_hot || late.highlight || 'To keep the night going.',
            bestTime: '11:30 PM', priceLevel: late.price_label || (late.price_level ? '$'.repeat(late.price_level) : null),
            vibeTags: filters.vibes.slice(0, 3)
        });
        if (stops.length) {
            recommendedPlan = {
                title: filters.neighborhoods[0]
                    ? `${filters.neighborhoods[0]} Night Out`
                    : 'Your Boston Night Out',
                summary: 'A curated flow from dinner into drinks — built from top SceneLink venues.',
                stops
            };
        }
    }

    const recommendedVenues = recommendedPlan
        ? []
        : topVenues.slice(0, 5).map(v => ({
              venueId: v.id,
              whyItFits: v.why_hot || v.highlight || v.pair_with || `Top-rated ${v.cuisine || v.type || 'spot'} in ${v.neighborhood || 'Boston'}.`
          }));

    const quickReplies = filters.isPlan
        ? ['Make it more casual', 'Add a late-night spot', 'Show cheaper options', 'Invite friends']
        : ['Plan my night', 'Show cheaper options', 'Only upscale spots', 'Different neighborhood'];

    return {
        ok: true,
        source: noticeMode ? 'rule-based-fallback' : 'rule-based',
        reply: generateFallbackReply(filters, hasVenues, noticeMode),
        intent: filters.isPlan ? 'plan_night' : (filters.isEvent ? 'find_event' : 'find_venue'),
        recommendedPlan,
        recommendedVenues,
        quickReplies,
        candidates: topVenues
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ROUTE: POST /api/concierge
// ═══════════════════════════════════════════════════════════════════════════
router.post('/', optionalAuth, rateLimit, async (req, res) => {
    const startedAt = Date.now();

    // ─── Input validation ──────────────────────────────────────────────
    const body = req.body || {};
    const rawMessage = typeof body.message === 'string' ? body.message : '';
    const message = rawMessage.trim();
    if (!message) return res.status(400).json({ ok: false, error: 'message required' });
    if (message.length > 500) return res.status(400).json({ ok: false, error: 'message too long (max 500 chars)' });

    const context = (body.context && typeof body.context === 'object') ? body.context : {};
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
    const session_id = typeof body.session_id === 'string' && body.session_id.length <= 64
        ? body.session_id
        : 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const allowAI = body.ai !== false;

    const userId = req.user ? req.user.id : null;
    const isLoggedIn = !!userId;

    let result = null;
    let notice = null;

    try {
        // ─── 1. Try OpenAI ──────────────────────────────────────────────
        if (allowAI && aiEnabled()) {
            try {
                const ai = await runAIConcierge({ message, history, context, userId });
                result = ai;
            } catch (aiErr) {
                // Never expose the key; log status only
                console.warn('[concierge] AI path failed:', aiErr.status || '?', aiErr.message, aiErr.snippet || '');
                notice = 'SceneLink Concierge is having trouble connecting, but here are curated picks from live SceneLink venue data.';
            }
        }

        // ─── 2. Fallback: rule-based using same real DB candidates ─────
        if (!result) {
            const filters = parseFilters(message, context);
            const candidates = await fetchCandidateVenues(filters);
            if (!candidates.length) {
                return res.json({
                    ok: true,
                    source: 'empty',
                    reply: 'No live venue data is available yet. Add venues to the database before Concierge can make real recommendations.',
                    intent: 'other',
                    recommendedPlan: null,
                    recommendedVenues: [],
                    venueCards: [],
                    quickReplies: ["Show tonight's picks", 'Explore neighborhoods', 'Browse by cuisine'],
                    requiresLogin: !isLoggedIn,
                    isLoggedIn,
                    notice,
                    session_id
                });
            }
            result = generateFallback({ filters, candidates, isLoggedIn, noticeMode: !!notice });
        }

        // ─── 3. Hydrate all referenced venueIds with full DB rows ──────
        const neededIds = new Set();
        if (result.recommendedPlan) {
            for (const s of (result.recommendedPlan.stops || [])) {
                if (s && s.venueId) neededIds.add(String(s.venueId));
            }
        }
        for (const v of (result.recommendedVenues || [])) {
            if (v && v.venueId) neededIds.add(String(v.venueId));
        }

        // Try to pull from candidates first (already fetched), then DB for any missing
        const byId = new Map();
        for (const c of (result.candidates || [])) byId.set(String(c.id), c);
        const missing = [...neededIds].filter(id => !byId.has(id));
        if (missing.length) {
            const rows = await fetchVenuesByIds(missing);
            for (const r of rows) byId.set(String(r.id), r);
        }

        // Drop any references that couldn't be hydrated (shouldn't happen after
        // the allowedIds filter in runAIConcierge, but defensive):
        if (result.recommendedPlan) {
            result.recommendedPlan.stops = (result.recommendedPlan.stops || []).filter(
                s => s && s.venueId && byId.has(String(s.venueId))
            );
            if (!result.recommendedPlan.stops.length) result.recommendedPlan = null;
        }
        result.recommendedVenues = (result.recommendedVenues || []).filter(
            v => v && v.venueId && byId.has(String(v.venueId))
        );

        // If plan has no stops and no venues, surface the candidates so UI still renders
        if (!result.recommendedPlan && !result.recommendedVenues.length && result.candidates && result.candidates.length) {
            result.recommendedVenues = result.candidates.slice(0, 5).map(v => ({
                venueId: v.id,
                whyItFits: v.why_hot || v.highlight || v.pair_with || `Top pick in ${v.neighborhood || 'Boston'}.`
            }));
            for (const v of result.candidates.slice(0, 5)) byId.set(String(v.id), v);
        }

        // Build venueCards: every venue referenced, fully hydrated
        const referencedIds = new Set();
        if (result.recommendedPlan) {
            for (const s of result.recommendedPlan.stops) referencedIds.add(String(s.venueId));
        }
        for (const v of result.recommendedVenues) referencedIds.add(String(v.venueId));
        const venueCards = [];
        for (const id of referencedIds) {
            const row = byId.get(id);
            if (row) venueCards.push(toVenueCard(row, isLoggedIn));
        }

        // Enrich stops with actions
        if (result.recommendedPlan) {
            result.recommendedPlan.stops = result.recommendedPlan.stops.map(s => ({
                ...s,
                actions: ['view_details', 'add_to_plan', 'save', 'directions']
            }));
        }

        // Analytics (async, never blocks response; no key/PII logged)
        pool.query(
            `INSERT INTO analytics_events (event, user_id, anon, session_id, properties)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                'concierge_query',
                userId,
                !userId,
                session_id,
                JSON.stringify({
                    message: message.slice(0, 200),
                    source: result.source,
                    intent: result.intent,
                    matches: venueCards.length,
                    ms: Date.now() - startedAt,
                    tokens: result.tokensUsed || 0
                })
            ]
        ).catch(() => {});

        return res.json({
            ok: true,
            source: notice ? 'rule-based-fallback' : result.source,
            reply: result.reply,
            intent: result.intent,
            recommendedPlan: result.recommendedPlan,
            recommendedVenues: result.recommendedVenues,
            venueCards,
            quickReplies: result.quickReplies || [],
            requiresLogin: !isLoggedIn,
            isLoggedIn,
            notice,
            session_id
        });
    } catch (err) {
        console.error('[concierge] unexpected error:', err.message);
        return res.status(500).json({
            ok: false,
            error: 'Concierge service error',
            reply: "Sorry, I had trouble with that. Try browsing Explore or Tonight for picks!",
            session_id
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/concierge/suggestions — starter chips
// ═══════════════════════════════════════════════════════════════════════════
router.get('/suggestions', (req, res) => {
    try {
        const dow = new Date().getDay();
        const hour = new Date().getHours();
        let suggestions;
        if (hour >= 5 && hour < 11) {
            suggestions = ['Best brunch in Boston', 'Coffee shops to work from', 'Breakfast near me'];
        } else if (hour >= 11 && hour < 15) {
            suggestions = ['Lunch spots downtown', 'Quick bites in the Seaport', 'Best sandwiches in Boston'];
        } else if (hour >= 15 && hour < 18) {
            suggestions = ['Rooftop bars open now', 'Happy hour deals', 'Cafes open late'];
        } else if (hour >= 18 && hour < 22) {
            suggestions = (dow === 5 || dow === 6)
                ? ['Romantic Italian for date night', 'Trendy cocktail bars tonight', 'Live music this weekend', 'Rooftop with a view']
                : ['Plan a date night', 'Best sushi in Back Bay', 'Cozy restaurants tonight', 'Dinner then drinks'];
        } else {
            suggestions = ['Nightclubs open late', 'Bars open past midnight', 'Late night food near me'];
        }
        res.json({ suggestions });
    } catch (err) {
        res.json({
            suggestions: [
                'Romantic Italian in the North End',
                'Rooftop bars with a view',
                'Best sushi in Back Bay',
                'Plan my night'
            ]
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/concierge/health — for QA
// ═══════════════════════════════════════════════════════════════════════════
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        ai_enabled: aiEnabled(),
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        venues_endpoint: true,
        rate_limit: { windowMs: RATE_WINDOW_MS, max: RATE_MAX_REQUESTS }
    });
});

// Helpers
function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function capFirst(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

module.exports = router;