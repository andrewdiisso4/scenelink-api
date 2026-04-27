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
5. Never claim a venue is "available tonight", "open right now", or "has a table" — we do not have real-time availability.
6. Never mention you are AI / GPT / OpenAI / an LLM. You are SceneLink Concierge.
7. quickReplies: 3–4 short, tappable follow-ups. Examples: "Make it more casual", "Add a late-night spot", "Show cheaper options", "Invite friends", "Earlier seating".
8. For planning questions (date night, bachelor party, birthday, "plan my night", "dinner then drinks"), build a recommendedPlan with 1–3 stops (e.g. dinner → drinks → late-night).
9. For simple lookup questions ("best italian in north end"), leave recommendedPlan null and fill recommendedVenues with the 3–6 best matches.
10. Honor the user's stated neighborhood, vibe, price, party size. If they didn't specify, pick reasonable defaults and briefly explain.

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
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['title', 'summary', 'stops'],
            properties: {
                title: { type: 'string' },
                summary: { type: 'string' },
                stops: {
                    type: 'array',
                    maxItems: 4,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['venueId', 'name', 'neighborhood', 'category', 'whyItFits'],
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
                                maxItems: 5,
                                items: { type: 'string' }
                            }
                        }
                    }
                }
            }
        },
        recommendedVenues: {
            type: 'array',
            maxItems: 8,
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
            minItems: 2,
            maxItems: 5,
            items: { type: 'string' }
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// INPUT PARSING
// ═══════════════════════════════════════════════════════════════════════════
const NEIGHBORHOODS = [
    'Allston', 'Back Bay', 'Beacon Hill', 'Boston', 'Brookline', 'Cambridge',
    'Dorchester', 'Downtown', 'Fenway', 'Jamaica Plain', 'North End',
    'Seaport', 'Somerville', 'South End'
];
const NEIGHBORHOOD_ALIASES = {
    'south boston': 'Seaport',
    'southie': 'Seaport',
    'east boston': 'Boston',
    'eastie': 'Boston',
    'charlestown': 'Boston',
    'roxbury': 'Boston',
    'mission hill': 'Fenway',
    'kendall square': 'Cambridge',
    'harvard square': 'Cambridge',
    'central square': 'Cambridge',
    'davis square': 'Somerville',
    'union square': 'Somerville',
    'chinatown': 'Downtown',
    'theater district': 'Downtown',
    'financial district': 'Downtown'
};

const VIBE_KEYWORDS = {
    romantic:  ['date', 'romantic', 'anniversary', 'intimate', 'cozy'],
    upscale:   ['upscale', 'fancy', 'elegant', 'high-end', 'fine dining', 'fine-dining'],
    trendy:    ['trendy', 'hot', 'buzzy', 'popular', 'hip', 'scene'],
    lively:    ['lively', 'fun', 'energetic', 'loud', 'happening'],
    lowkey:    ['low-key', 'lowkey', 'chill', 'casual', 'relaxed', 'quiet'],
    group:     ['group', 'friends', 'party', 'bachelor', 'bachelorette', 'birthday'],
    rooftop:   ['rooftop', 'outdoor', 'patio', 'views', 'view'],
    cocktails: ['cocktail', 'cocktails', 'speakeasy', 'mixology'],
    wine:      ['wine', 'wine bar'],
    beer:      ['beer', 'brewery', 'draft'],
    latenight: ['late night', 'late-night', 'after hours', 'dj', 'club', 'dancing']
};

const CUISINES = [
    'italian','japanese','sushi','steakhouse','steak','seafood','american','mexican',
    'french','thai','chinese','korean','indian','mediterranean','pizza','burger',
    'vietnamese','greek','spanish','tapas','bbq','southern','diner','vegan','vegetarian'
];

function parseFilters(message = '', context = {}) {
    const text = String(message || '').toLowerCase();
    const out = {
        neighborhoods: [],
        vibes: [],
        cuisines: [],
        priceMax: null,
        partySize: null,
        venueType: null,
        isPlan: false,
        isEvent: false
    };

    // Check aliases FIRST (e.g. "south boston" → Seaport) and strip them from
    // the text so the literal "Boston" scan below doesn't re-match "boston"
    // inside "south boston".
    let stripped = text;
    for (const [alias, real] of Object.entries(NEIGHBORHOOD_ALIASES)) {
        if (stripped.includes(alias)) {
            if (!out.neighborhoods.includes(real)) out.neighborhoods.push(real);
            stripped = stripped.split(alias).join(' ');
        }
    }
    // Then literal neighborhood names, word-boundary, on the stripped text
    for (const n of NEIGHBORHOODS) {
        const re = new RegExp('\\b' + n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (re.test(stripped) && !out.neighborhoods.includes(n)) out.neighborhoods.push(n);
    }

    for (const [vibe, kws] of Object.entries(VIBE_KEYWORDS)) {
        if (kws.some(kw => text.includes(kw))) out.vibes.push(vibe);
    }

    for (const c of CUISINES) {
        if (text.includes(c)) out.cuisines.push(c);
    }

    if (/\$\$\$\$|most expensive|splurge/.test(text)) out.priceMax = 4;
    else if (/\$\$\$|upscale|fine dining/.test(text)) out.priceMax = 3;
    else if (/cheap|budget|affordable|inexpensive/.test(text)) out.priceMax = 2;

    const pm = text.match(/\b(?:for|party of|table for|group of)\s+(\d+)\b/) ||
               text.match(/\b(\d+)\s+(?:people|person|friends?|of us)\b/);
    if (pm) out.partySize = parseInt(pm[1], 10);

    if (/\b(bar|cocktail|drinks|pub)\b/.test(text)) out.venueType = 'bar';
    else if (/\b(club|nightlife|dance|dj)\b/.test(text)) out.venueType = 'nightlife';
    else if (/\b(restaurant|dinner|lunch|brunch|eat|dining|food)\b/.test(text)) out.venueType = 'restaurant';
    else if (/\b(cafe|coffee)\b/.test(text)) out.venueType = 'cafe';

    if (/\b(plan|itinerary|night out|date night|dinner then|drinks after|dinner and drinks|full night|schedule)\b/.test(text)) {
        out.isPlan = true;
    }
    if (/\b(event|concert|show|live music|dj set|performing|playing tonight)\b/.test(text)) {
        out.isEvent = true;
    }

    if (context && typeof context === 'object') {
        if (context.neighborhood && !out.neighborhoods.includes(context.neighborhood)) {
            out.neighborhoods.push(context.neighborhood);
        }
        if (Array.isArray(context.vibes)) {
            for (const v of context.vibes) if (!out.vibes.includes(v)) out.vibes.push(v);
        }
    }

    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// DB QUERIES — real venue candidates only
// ═══════════════════════════════════════════════════════════════════════════
const VENUE_SELECT = `
    id, slug, name, type, category, cuisine, neighborhood, address, city,
    lat::text AS lat, lng::text AS lng,
    price_level, price_label, rating::text AS rating,
    buzz_score::text AS buzz_score, going_count,
    cover_image_url, image_url,
    vibe, highlight, why_hot, pair_with, short_desc, description,
    opentable_url, resy_url, yelp_url, google_maps_url, reservation_url,
    trending, featured, is_open_now, hours_display
`;

async function fetchCandidateVenues(filters, limit = MAX_CANDIDATE_VENUES) {
    const where = ['is_active = true'];
    const params = [];
    let i = 1;

    if (filters.neighborhoods && filters.neighborhoods.length) {
        where.push(`neighborhood = ANY($${i}::text[])`);
        params.push(filters.neighborhoods);
        i++;
    }
    if (filters.priceMax) {
        where.push(`(price_level IS NULL OR price_level <= $${i})`);
        params.push(filters.priceMax);
        i++;
    }
    if (filters.venueType === 'bar') {
        where.push(`(type IN ('bar','nightlife','cocktail') OR category ILIKE '%bar%')`);
    } else if (filters.venueType === 'nightlife') {
        where.push(`(type IN ('nightlife','club','bar') OR category ILIKE '%nightlife%' OR category ILIKE '%club%')`);
    } else if (filters.venueType === 'restaurant') {
        where.push(`(type = 'restaurant' OR category ILIKE '%restaurant%')`);
    } else if (filters.venueType === 'cafe') {
        where.push(`(type = 'cafe' OR category ILIKE '%cafe%' OR category ILIKE '%coffee%')`);
    }
    if (filters.cuisines && filters.cuisines.length) {
        const likes = filters.cuisines.map((_, idx) => `cuisine ILIKE $${i + idx}`);
        where.push(`(${likes.join(' OR ')})`);
        filters.cuisines.forEach(c => params.push(`%${c}%`));
        i += filters.cuisines.length;
    }

    let vibeBoost = '0';
    if (filters.vibes && filters.vibes.length) {
        const vibeChecks = filters.vibes.map((v) => {
            const key = String(v).toLowerCase().replace(/'/g, "''");
            return `(CASE WHEN vibe ILIKE '%${key}%' OR highlight ILIKE '%${key}%' OR why_hot ILIKE '%${key}%' THEN 1 ELSE 0 END)`;
        });
        vibeBoost = vibeChecks.join(' + ');
    }

    const sql = `
        SELECT ${VENUE_SELECT},
               (COALESCE(buzz_score, 0) + (${vibeBoost}) * 0.5) AS score
        FROM venues
        WHERE ${where.join(' AND ')}
        ORDER BY score DESC NULLS LAST, rating DESC NULLS LAST
        LIMIT ${Math.min(limit, 30)}
    `;
    const r = await pool.query(sql, params);

    // If too few after strict filters, relax
    if (r.rows.length < 5 && (filters.neighborhoods.length || filters.cuisines.length)) {
        const relaxedParams = [];
        let j = 1;
        const relaxedWhere = ['is_active = true'];
        if (filters.venueType === 'bar') {
            relaxedWhere.push(`(type IN ('bar','nightlife','cocktail') OR category ILIKE '%bar%')`);
        } else if (filters.venueType === 'restaurant') {
            relaxedWhere.push(`(type = 'restaurant' OR category ILIKE '%restaurant%')`);
        }
        if (filters.neighborhoods.length) {
            relaxedWhere.push(`neighborhood = ANY($${j}::text[])`);
            relaxedParams.push(filters.neighborhoods);
            j++;
        }
        const relax = await pool.query(
            `SELECT ${VENUE_SELECT}
             FROM venues WHERE ${relaxedWhere.join(' AND ')}
             ORDER BY buzz_score DESC NULLS LAST, rating DESC NULLS LAST
             LIMIT ${Math.min(limit, 20)}`,
            relaxedParams
        );
        const seen = new Set(r.rows.map(x => x.id));
        for (const row of relax.rows) {
            if (!seen.has(row.id)) r.rows.push(row);
            if (r.rows.length >= limit) break;
        }
    }

    return r.rows.slice(0, limit);
}

async function fetchVenuesByIds(ids) {
    if (!ids || !ids.length) return [];
    // Validate UUIDs to avoid injection + Postgres errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const clean = ids.filter(x => typeof x === 'string' && uuidRegex.test(x));
    if (!clean.length) return [];
    const r = await pool.query(
        `SELECT ${VENUE_SELECT} FROM venues WHERE id = ANY($1::uuid[])`,
        [clean]
    );
    const byId = new Map(r.rows.map(row => [String(row.id), row]));
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
        rating: v.rating ? Number(v.rating) : null,
        priceLevel: v.price_level || null,
        priceLabel: v.price_label || (v.price_level ? '$'.repeat(v.price_level) : null),
        vibe: v.vibe ? String(v.vibe).slice(0, 140) : null,
        highlight: v.highlight ? String(v.highlight).slice(0, 140) : null,
        whyHot: v.why_hot ? String(v.why_hot).slice(0, 180) : null,
        pairWith: v.pair_with ? String(v.pair_with).slice(0, 140) : null,
        trending: !!v.trending,
        featured: !!v.featured
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
            isEvent: filters.isEvent
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
async function runAIConcierge({ message, history = [], context = {}, userId = null }) {
    const startedAt = Date.now();
    const filters = parseFilters(message, context);

    const [candidates, userContext] = await Promise.all([
        fetchCandidateVenues(filters),
        fetchUserContext(userId)
    ]);

    if (!candidates.length) {
        return {
            ok: true,
            source: 'empty',
            reply: 'No live venue data is available yet. Add venues to the database before Concierge can make real recommendations.',
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
    isEnabled: () => !!process.env.OPENAI_API_KEY
};