/**
 * SceneLink Concierge — OpenAI Responses API integration
 * ─────────────────────────────────────────────────────────────────────────
 * Backend-only. Reads OPENAI_API_KEY from env. Never exposed to frontend.
 *
 * Flow:
 *   1. Parse user message into filters (neighborhood/vibe/cuisine/price/party).
 *   2. Pre-query real venue candidates from DB based on those filters.
 *      → this is the ONLY set the LLM is allowed to recommend.
 *   3. Send user message + candidates to OpenAI Responses API with a strict
 *      JSON schema for structured output.
 *   4. LLM picks from the real candidates and writes copy.
 *   5. We validate every venueId is in the allowed set; drop any that aren't.
 *   6. Return structured JSON matching the spec.
 *
 * If OPENAI_API_KEY is missing, OpenAI errors, times out, or returns invalid
 * JSON, caller (concierge.js) falls back to rule-based mode which uses the
 * same real DB venues.
 */

const pool = require('../config/database');
const { classifyIntent } = require('../services/concierge-intent');
const { parseNeighborhoods } = require('../services/concierge-constraints');
const { resolveConversation } = require('../services/concierge-conversation');
const { venueTypeSQL, exclusionSQL } = require('../services/concierge-query-constraints');
const {publicVenue,availableVenueSQL} = require('../services/venue-helpers');
const {visibleDiscoveryVenueSQL} = require('../services/venue-duplicate-discovery');
const {reviewedPriceSQL} = require('../services/venue-facts');

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_OUTPUT_TOKENS = parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS || '700', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.OPENAI_TIMEOUT_MS || '15000', 10);
const MAX_CANDIDATE_VENUES = 20;
const MAX_CONTEXT_HISTORY = 6;

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are SceneLink Concierge — a premium Boston dining & nightlife guide.
You sound like a well-connected local friend: warm, confident, concise.

HARD RULES (never break these):
1. You MUST recommend ONLY venues from the "Available venues" list provided in the user message.
2. Never invent or imagine venues, addresses, ratings, reviews, hours, prices, menus, or availability.
3. Every stop.venueId MUST be an id that appears verbatim in the Available venues list. If nothing matches the user's request, return an empty stops array and be honest in the reply.
4. Keep reply text to 1–3 sentences. Friendly, insider tone. No emojis unless the user uses one first.
5. Never claim a venue is "available tonight", "open right now", or "has a table" — we do not have real-time availability. Never claim to book, reserve, purchase tickets, hold a table, or confirm an RSVP. Booking links only open an external site; confirmation must come from that provider.
6. Never mention you are AI / GPT / OpenAI / an LLM. You are SceneLink Concierge.
7. quickReplies: 3–4 short, tappable follow-ups. Examples: "Make it more casual", "Add a late-night spot", "Show cheaper options", "Invite friends", "Earlier seating".
8. For planning questions (date night, bachelor party, birthday, "plan my night", "dinner then drinks"), build a recommendedPlan with 1–3 stops (e.g. dinner → drinks → late-night).
9. For simple lookup questions ("best italian in north end"), leave recommendedPlan null and fill recommendedVenues with the 3–6 best matches.
10. Honor the user's stated neighborhood, vibe, price, party size. If they didn't specify, pick reasonable defaults and briefly explain.
11. recommendedPlan.stops: 1 to 3 items max. recommendedVenues: max 6. quickReplies: 3 to 4 items.
12. For every stop: include bestTime as null because opening hours and seating are unverified. Include priceLevel only when provided in the candidate facts; use null otherwise. Include only supported vibeTags, or an empty array.
13. Parsed filters describe the current search. Earlier conversation turns must not reintroduce excluded venues, cuisines, types or neighborhoods. A group size is a preference, not verified venue capacity.

OUTPUT: JSON only, enforced by schema. No prose outside JSON.`;

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════
const RESPONSE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'intent', 'recommendedPlan', 'recommendedVenues', 'quickReplies'],
    properties: {
        reply: {
            type: 'string',
            description: '1-3 sentence reply. Warm, concise, insider tone.'
        },
        intent: {
            type: 'string',
            enum: ['plan_night', 'find_venue', 'find_event', 'greeting', 'clarify', 'other']
        },
        recommendedPlan: {
            // OpenAI strict schema requires every property to be in `required`.
            // Use `null` as the sentinel for optional fields.
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['title', 'summary', 'stops'],
            properties: {
                title: { type: 'string' },
                summary: { type: 'string' },
                stops: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['venueId', 'name', 'neighborhood', 'category', 'whyItFits', 'bestTime', 'priceLevel', 'vibeTags'],
                        properties: {
                            venueId: { type: 'string' },
                            name: { type: 'string' },
                            neighborhood: { type: 'string' },
                            category: { type: 'string' },
                            whyItFits: { type: 'string' },
                            bestTime: { type: ['string', 'null'] },
                            priceLevel: { type: ['string', 'null'] },
                            vibeTags: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        }
                    }
                }
            }
        },
        recommendedVenues: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['venueId', 'whyItFits'],
                properties: {
                    venueId: { type: 'string' },
                    whyItFits: { type: 'string' }
                }
            }
        },
        quickReplies: {
            type: 'array',
            items: { type: 'string' }
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// INPUT PARSING
// ═══════════════════════════════════════════════════════════════════════════
function parseFilters(message = '', context = {}) {
    const intent = classifyIntent(message);
    if (!intent.neighborhoods.length && context && typeof context.neighborhood === 'string') {
        intent.neighborhoods = parseNeighborhoods(context.neighborhood.slice(0, 100));
    }
    return { ...intent, priceMax: intent.budget, partySize: intent.group_size, isEvent: intent.is_event };
}

// ═══════════════════════════════════════════════════════════════════════════
// DB QUERIES — real venue candidates only
// ═══════════════════════════════════════════════════════════════════════════
const VENUE_SELECT = `
    id, slug, name, type, category, cuisine, neighborhood, address, city,
    lat::text AS lat, lng::text AS lng,
    source, price_level, price_label, to_jsonb(venues)->'field_provenance' AS field_provenance, NULL::numeric AS rating,
    NULL::numeric AS buzz_score, NULL::integer AS going_count,
    cover_image_url, image_url,
    vibe, highlight, NULL::text AS why_hot, pair_with, short_desc, description,
    opentable_url, resy_url, yelp_url, google_maps_url, reservation_url,
    NULL::boolean AS trending, NULL::boolean AS featured, NULL::boolean AS is_open_now, hours_display
`;

async function fetchCandidateVenues(filters, limit = MAX_CANDIDATE_VENUES) {
    const where = [availableVenueSQL(''), visibleDiscoveryVenueSQL('venues')];
    const params = [];
    let i = 1;

    if (filters.venueName != null) {
        where.push(`lower(name) = lower($${i++})`);
        params.push(filters.venueName);
    }
    if (filters.neighborhoods && filters.neighborhoods.length) {
        where.push(`(neighborhood = ANY($${i}::text[]) OR city = ANY($${i}::text[]))`);
        params.push(filters.neighborhoods);
        i++;
    }
    if (filters.priceMax) {
        const price = reviewedPriceSQL('venues');
        where.push(`${price} <= $${i}`);
        params.push(filters.priceMax);
        i++;
    }
    const placeConstraint = filters.venueName == null ? venueTypeSQL(filters.venueType) : null;
    if (placeConstraint) where.push(placeConstraint);
    if (filters.cuisines && filters.cuisines.length) {
        const likes = filters.cuisines.map((_, idx) => `cuisine ILIKE $${i + idx}`);
        where.push(`(${likes.join(' OR ')})`);
        filters.cuisines.forEach(c => params.push(`%${c}%`));
        i += filters.cuisines.length;
    }

    const excluded = exclusionSQL(filters, i);
    where.push(...excluded.conditions);
    params.push(...excluded.values);

    // Search constraints come from facts; seed popularity, random order and
    // unreviewed marketing copy never become a recommendation score.
    const sql = `
        SELECT ${VENUE_SELECT}
        FROM venues
        WHERE ${where.join(' AND ')}
        ORDER BY lower(name), id
        LIMIT ${Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 20, 30))}
    `;
    const r = await pool.query(sql, params);

    // Never silently drop cuisine, neighborhood or price constraints.
    return r.rows.slice(0, limit).map(publicVenue);
}

async function fetchVenuesByIds(ids) {
    if (!ids || !ids.length) return [];
    // Validate UUIDs to avoid injection + Postgres errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const clean = ids.filter(x => typeof x === 'string' && uuidRegex.test(x));
    if (!clean.length) return [];
    const r = await pool.query(
        `SELECT ${VENUE_SELECT} FROM venues WHERE id = ANY($1::uuid[]) AND ${availableVenueSQL('')}`,
        [clean]
    );
    const byId = new Map(r.rows.map(row => [String(row.id), publicVenue(row)]));
    return clean.map(id => byId.get(String(id))).filter(Boolean);
}

async function fetchUserContext(userId) {
    if (!userId) return null;
    try {
        const [prefs, favs, plans] = await Promise.all([
            pool.query('SELECT display_name, neighborhood, city FROM users WHERE id=$1', [userId]),
            pool.query(
                `SELECT v.name, v.neighborhood, v.cuisine, v.type
                 FROM favorites f JOIN venues v ON f.venue_id = v.id
                 WHERE f.user_id=$1 ORDER BY f.created_at DESC LIMIT 8`,
                [userId]
            ),
            pool.query(
                `SELECT name FROM plans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 3`,
                [userId]
            )
        ]);
        return {
            displayName: prefs.rows[0]?.display_name || null,
            homeNeighborhood: prefs.rows[0]?.neighborhood || null,
            savedVenues: favs.rows.map(r => ({
                name: r.name,
                neighborhood: r.neighborhood,
                cuisine: r.cuisine,
                type: r.type
            })),
            recentPlans: plans.rows.map(p => p.name)
        };
    } catch (e) {
        console.warn('[conciergeAI] fetchUserContext failed:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// OPENAI RESPONSES API CALL
// ═══════════════════════════════════════════════════════════════════════════
function summarizeVenueForLLM(v) {
    return {
        id: v.id,
        name: v.name,
        neighborhood: v.neighborhood,
        type: v.type,
        category: v.category,
        cuisine: v.cuisine,
        rating: null,
        priceLevel: v.price_level || null,
        priceLabel: v.price_label || (v.price_level ? '$'.repeat(v.price_level) : null),
        vibe: v.vibe ? String(v.vibe).slice(0, 140) : null,
        highlight: v.highlight ? String(v.highlight).slice(0, 140) : null,
        whyHot: null,
        pairWith: v.pair_with ? String(v.pair_with).slice(0, 140) : null,
        trending: null,
        featured: null,
        availability: 'unknown',
        bookingStatus: v.booking?.status || 'not_available',
        reservationConfirmed: false
    };
}

async function callOpenAI({ message, history, filters, candidates, userContext }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const candidateSummaries = candidates.map(summarizeVenueForLLM);

    const userInput = [
        `User message: ${message}`,
        ``,
        `Parsed filters: ${JSON.stringify({
            neighborhoods: filters.neighborhoods,
            vibes: filters.vibes,
            cuisines: filters.cuisines,
            priceMax: filters.priceMax,
            partySize: filters.partySize,
            venueType: filters.venueType,
            isPlan: filters.isPlan,
            isEvent: filters.isEvent,
            excludedCuisines: filters.excludedCuisines,
            excludedNeighborhoods: filters.excludedNeighborhoods,
            excludedVenueTypes: filters.excludedVenueTypes,
            excludedVenueNames: filters.excludedVenueNames
        })}`,
        ``,
        userContext
            ? `User profile: ${JSON.stringify({
                  name: userContext.displayName,
                  home: userContext.homeNeighborhood,
                  savedVenuesCount: userContext.savedVenues.length,
                  recentlySaved: userContext.savedVenues.slice(0, 5)
              })}`
            : `User: not logged in (general recommendations only, no personalization).`,
        ``,
        `Available venues (ONLY recommend from this list — use these exact ids):`,
        JSON.stringify(candidateSummaries)
    ].join('\n');

    const input = [];
    if (Array.isArray(history)) {
        for (const turn of history.slice(-MAX_CONTEXT_HISTORY)) {
            if (!turn || !turn.role || !turn.content) continue;
            if (turn.role === 'user') {
                input.push({
                    role: 'user',
                    content: [{ type: 'input_text', text: String(turn.content).slice(0, 500) }]
                });
            } else if (turn.role === 'assistant') {
                input.push({
                    role: 'assistant',
                    content: [{ type: 'output_text', text: String(turn.content).slice(0, 500) }]
                });
            }
        }
    }
    input.push({
        role: 'user',
        content: [{ type: 'input_text', text: userInput }]
    });

    const body = {
        model: DEFAULT_MODEL,
        instructions: SYSTEM_PROMPT,
        input,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        text: {
            format: {
                type: 'json_schema',
                name: 'scenelink_concierge_response',
                strict: true,
                schema: RESPONSE_SCHEMA
            }
        }
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let resp;
    try {
        resp = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        // Never log the key; strip any sk-* token from the snippet before throwing
        const snippet = errText.slice(0, 300).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
        const err = new Error(`OpenAI ${resp.status}`);
        err.status = resp.status;
        err.snippet = snippet;
        throw err;
    }

    return await resp.json();
}

function extractStructured(resp) {
    if (!resp) throw new Error('OpenAI response missing');
    if (typeof resp.output_text === 'string' && resp.output_text.trim()) {
        try { return JSON.parse(resp.output_text); } catch (_) {}
    }
    if (Array.isArray(resp.output)) {
        for (const item of resp.output) {
            if (item.type === 'message' && Array.isArray(item.content)) {
                for (const c of item.content) {
                    if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') {
                        try { return JSON.parse(c.text); } catch (_) {}
                    }
                }
            }
        }
    }
    throw new Error('Could not parse structured JSON from OpenAI response');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════
async function runAIConcierge({ message, history = [], context = {}, resolvedRequest = null }) {
    const startedAt = Date.now();
    const request = resolvedRequest || await resolveConversation({ pool, message, history, context, parse: parseFilters });
    const filters = request.filters;
    if (request.clarification) {
        return { ok: true, source: 'clarify', reply: request.clarification, intent: 'clarify',
            recommendedPlan: null, recommendedVenues: [], quickReplies: [], candidates: [], filters, tokensUsed: 0, ms: Date.now() - startedAt };
    }

    const [candidates, userContext] = await Promise.all([
        fetchCandidateVenues(filters),
        null // No saved profile/favorites are sent to an external model without a separate opt-in.
    ]);

    if (!candidates.length) {
        return {
            ok: true,
            source: 'empty',
            reply: 'No matching venues were found. Try changing the neighborhood, cuisine or budget.',
            intent: 'other',
            recommendedPlan: null,
            recommendedVenues: [],
            quickReplies: ["Show tonight's picks", 'Explore neighborhoods', 'Browse by cuisine'],
            candidates: [],
            filters,
            tokensUsed: 0,
            ms: Date.now() - startedAt
        };
    }

    const raw = await callOpenAI({ message, history, filters, candidates, userContext });
    const structured = extractStructured(raw);

    const allowedIds = new Set(candidates.map(c => String(c.id)));

    if (structured.recommendedPlan && Array.isArray(structured.recommendedPlan.stops)) {
        structured.recommendedPlan.stops = structured.recommendedPlan.stops.filter(
            s => s && s.venueId && allowedIds.has(String(s.venueId))
        );
        if (!structured.recommendedPlan.stops.length) {
            structured.recommendedPlan = null;
        }
    }
    if (Array.isArray(structured.recommendedVenues)) {
        structured.recommendedVenues = structured.recommendedVenues.filter(
            v => v && v.venueId && allowedIds.has(String(v.venueId))
        );
    }

    const tokensUsed =
        (raw.usage && (raw.usage.total_tokens || raw.usage.output_tokens)) || 0;

    return {
        ok: true,
        source: 'openai',
        reply: String(structured.reply || '').slice(0, 600),
        intent: structured.intent || 'other',
        recommendedPlan: structured.recommendedPlan || null,
        recommendedVenues: structured.recommendedVenues || [],
        quickReplies: (structured.quickReplies || []).slice(0, 5),
        candidates,
        filters,
        tokensUsed,
        ms: Date.now() - startedAt
    };
}

module.exports = {
    runAIConcierge,
    fetchCandidateVenues,
    fetchVenuesByIds,
    parseFilters,
    summarizeVenueForLLM,
    isEnabled: () => !!process.env.OPENAI_API_KEY
};
