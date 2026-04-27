/**
 * SceneLink Concierge — OpenAI integration with function-calling
 *
 * The LLM is given tools that query the real venue DB, guaranteeing
 * responses are grounded in real Boston venues (no hallucinations).
 *
 * Flow:
 *   1. User message + tool definitions sent to OpenAI
 *   2. Model calls search_venues/search_events/build_itinerary as needed
 *   3. We execute those calls against our DB
 *   4. Model uses results to write the final natural-language response
 *   5. We return the same response shape as the rule-based endpoint
 *
 * If OPENAI_API_KEY is missing or OpenAI fails, caller should fall back.
 */

const pool = require('../config/database');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_TOOL_ITERS = 4;

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPT — SceneLink Concierge persona
// ═══════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are SceneLink Concierge — a premium AI guide to Boston's best dining and nightlife.

Your job is to help users discover great restaurants, bars, nightlife, and events in Boston.
You speak in a warm, confident, insider tone — like a well-connected local friend who knows the scene.

IMPORTANT RULES:
1. ALWAYS use the provided tools to find venues/events. Never invent venues, addresses, or events.
2. All venue data must come from search_venues, search_events, or get_venue_details tool calls.
3. Keep responses short and scannable (2-4 sentences max before the venue list).
4. When users ask for a plan/itinerary (e.g. "plan my night", "dinner then drinks"), use build_itinerary.
5. Don't list every venue — the frontend renders the venue cards. You just write a short intro.
6. For vague queries, ask ONE clarifying question (vibe/neighborhood/group size).
7. For greetings, be brief + prompt them with 2-3 concrete questions they could ask.
8. Never mention you're an AI, LLM, OpenAI, or "language model". You're the SceneLink Concierge.

Boston neighborhoods you know well: North End, South End, Back Bay, Seaport, Cambridge, Fort Point,
Somerville, Downtown, Beacon Hill, Allston, Fenway, Jamaica Plain, Chinatown, Charlestown, Brookline.`;

// ═══════════════════════════════════════════════════════════
// TOOL DEFINITIONS — what the LLM can call
// ═══════════════════════════════════════════════════════════
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'search_venues',
            description: 'Search Boston venues by cuisine, vibe, neighborhood, price, or type. Returns up to 8 matching venues with ratings, neighborhoods, and booking URLs. Use this for most user queries.',
            parameters: {
                type: 'object',
                properties: {
                    cuisines: { type: 'array', items: { type: 'string' }, description: 'e.g. ["italian","steakhouse"]' },
                    vibes: { type: 'array', items: { type: 'string' }, description: 'e.g. ["romantic","rooftop","upscale","lively","low-key","trendy"]' },
                    neighborhoods: { type: 'array', items: { type: 'string' }, description: 'e.g. ["North End","Seaport"]' },
                    venue_type: { type: 'string', enum: ['restaurant', 'bar', 'nightlife', 'cafe', 'any'], description: 'Kind of place. Use "any" to not filter.' },
                    price_max: { type: 'integer', enum: [1, 2, 3, 4], description: '1=$, 2=$$, 3=$$$, 4=$$$$' },
                    open_now: { type: 'boolean', description: 'Only currently open venues' },
                    limit: { type: 'integer', description: 'Max results (1-8), default 5' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_events',
            description: 'Search upcoming events (concerts, live music, parties, special nights). Use when user asks about events, "what\'s happening", concerts, or specific dates.',
            parameters: {
                type: 'object',
                properties: {
                    when: { type: 'string', enum: ['tonight', 'tomorrow', 'weekend', 'week'], description: 'Time window' },
                    categories: { type: 'array', items: { type: 'string' }, description: 'e.g. ["music","comedy","dance"]' },
                    neighborhoods: { type: 'array', items: { type: 'string' } },
                    limit: { type: 'integer' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'build_itinerary',
            description: 'Build a 3-stop Boston night plan: dinner → drinks → late night. Use when user asks to "plan my night", "build my night", wants a full itinerary, or says "dinner then drinks".',
            parameters: {
                type: 'object',
                properties: {
                    vibe: { type: 'string', description: 'overall vibe, e.g. "upscale","date night","lively","low-key"' },
                    neighborhood: { type: 'string', description: 'preferred neighborhood, optional' },
                    group_type: { type: 'string', enum: ['date', 'small_group', 'large_group', 'solo'], description: 'Who\'s coming' },
                    cuisines: { type: 'array', items: { type: 'string' }, description: 'Preferred dinner cuisines, optional' }
                }
            }
        }
    }
];

// ═══════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS — grounded in real DB
// ═══════════════════════════════════════════════════════════

function addBookingUrls(venues) {
    return (venues || []).map(v => {
        const query = encodeURIComponent((v.name || '') + ' Boston MA');
        if (!v.opentable_url) v.opentable_url = `https://www.opentable.com/s?covers=2&dateTime=&term=${query}&metroId=8`;
        if (!v.resy_url) v.resy_url = `https://resy.com/cities/bos/search?query=${query}`;
        if (!v.yelp_url) v.yelp_url = `https://www.yelp.com/search?find_desc=${query}&find_loc=Boston%2C+MA`;
        if (!v.reservation_url) v.reservation_url = v.opentable_url;
        if (!v.cover_image_url && !v.image_url) {
            // Leave null — frontend SLVenueImages curates a fallback by category
        }
        return v;
    });
}

async function tool_search_venues(args) {
    const cuisines = args.cuisines || [];
    const vibes = args.vibes || [];
    const neighborhoods = args.neighborhoods || [];
    const venue_type = args.venue_type && args.venue_type !== 'any' ? args.venue_type : null;
    const price_max = args.price_max || null;
    const open_now = args.open_now || false;
    const limit = Math.min(Math.max(parseInt(args.limit) || 5, 1), 8);

    const where = [];
    const params = [];

    if (cuisines.length) {
        const parts = cuisines.map(c => { params.push(`%${c}%`); return `(cuisine ILIKE $${params.length} OR description ILIKE $${params.length})`; });
        where.push(`(${parts.join(' OR ')})`);
    }
    if (vibes.length) {
        const parts = vibes.map(v => {
            params.push(`%${v}%`);
            return `(vibe_tags::text ILIKE $${params.length} OR description ILIKE $${params.length} OR why_hot ILIKE $${params.length})`;
        });
        where.push(`(${parts.join(' OR ')})`);
    }
    if (neighborhoods.length) {
        const parts = neighborhoods.map(n => { params.push(`%${n}%`); return `neighborhood ILIKE $${params.length}`; });
        where.push(`(${parts.join(' OR ')})`);
    }
    if (venue_type) {
        params.push(`%${venue_type}%`);
        where.push(`(type ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }
    if (price_max) {
        params.push(price_max);
        where.push(`(price_level IS NULL OR price_level <= $${params.length})`);
    }
    if (open_now) where.push(`(is_open_now = true OR is_open_now IS NULL)`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const sql = `
        SELECT id, slug, name, type, cuisine, category, neighborhood, city, address,
               rating, price_level, buzz_score, why_hot, pair_with, short_desc, description,
               cover_image_url, image_url, reservation_url, opentable_url, resy_url, yelp_url,
               lat, lng, is_open_now, hours_display, trending, featured,
               COALESCE(going_count, 0) AS going_count
        FROM venues
        ${whereSql}
        ORDER BY
            COALESCE(trending::int, 0) DESC,
            COALESCE(buzz_score, 0) DESC,
            COALESCE(rating, 0) DESC
        LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    return addBookingUrls(rows);
}

async function tool_search_events(args) {
    const when = args.when || 'tonight';
    const neighborhoods = args.neighborhoods || [];
    const limit = Math.min(Math.max(parseInt(args.limit) || 5, 1), 8);

    let dateCond;
    if (when === 'tonight') dateCond = `start_date::date = CURRENT_DATE`;
    else if (when === 'tomorrow') dateCond = `start_date::date = (CURRENT_DATE + INTERVAL '1 day')`;
    else if (when === 'weekend') dateCond = `start_date::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days') AND EXTRACT(DOW FROM start_date::date) IN (5,6,0)`;
    else dateCond = `start_date::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')`;

    const where = [dateCond];
    const params = [];
    if (neighborhoods.length) {
        const parts = neighborhoods.map(n => { params.push(`%${n}%`); return `neighborhood ILIKE $${params.length}`; });
        where.push(`(${parts.join(' OR ')})`);
    }
    params.push(limit);

    try {
        const sql = `
            SELECT id, title, description, start_date, end_date, venue_name, neighborhood,
                   image_url, cover_image_url, ticket_url, category, price_display
            FROM events
            WHERE ${where.join(' AND ')}
            ORDER BY start_date ASC
            LIMIT $${params.length}`;
        const { rows } = await pool.query(sql, params);
        return rows;
    } catch (err) {
        return [];
    }
}

async function tool_build_itinerary(args) {
    const hood = args.neighborhood || null;
    const vibe = (args.vibe || '').toLowerCase();
    const cuisines = args.cuisines || [];

    // Dinner
    let dinnerVibes = [];
    if (vibe.includes('upscale')) dinnerVibes.push('upscale');
    else if (vibe.includes('date') || vibe.includes('romantic')) dinnerVibes.push('romantic');
    else if (vibe.includes('low-key') || vibe.includes('chill') || vibe.includes('casual')) dinnerVibes.push('casual');

    const dinner = await tool_search_venues({
        cuisines: cuisines.length ? cuisines : [],
        vibes: dinnerVibes,
        neighborhoods: hood ? [hood] : [],
        venue_type: 'restaurant',
        limit: 3
    });

    // Drinks — cocktail bars
    const drinks = await tool_search_venues({
        vibes: vibe.includes('lively') ? ['lively', 'cocktail'] : ['cocktail', 'bar'],
        neighborhoods: hood ? [hood] : [],
        venue_type: 'bar',
        limit: 3
    });

    // Late night
    const late = await tool_search_venues({
        vibes: vibe.includes('live') ? ['live music', 'music'] : ['late night', 'nightlife'],
        neighborhoods: hood ? [hood] : [],
        venue_type: 'nightlife',
        limit: 3
    });

    return {
        dinner: dinner[0] || null,
        drinks: drinks[0] || null,
        late: late[0] || null,
        dinner_alts: dinner.slice(1),
        drinks_alts: drinks.slice(1),
        late_alts: late.slice(1)
    };
}

async function executeTool(name, args) {
    try {
        if (name === 'search_venues') return await tool_search_venues(args || {});
        if (name === 'search_events') return await tool_search_events(args || {});
        if (name === 'build_itinerary') return await tool_build_itinerary(args || {});
        return { error: `unknown tool: ${name}` };
    } catch (err) {
        console.error(`[concierge/tool:${name}]`, err.message);
        return { error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════
// OPENAI CLIENT (raw fetch — no SDK dep needed)
// ═══════════════════════════════════════════════════════════
async function callOpenAI(messages) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.6,
            max_tokens: 500
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
}

// ═══════════════════════════════════════════════════════════
// ORCHESTRATOR — multi-turn tool use loop
// ═══════════════════════════════════════════════════════════
async function aiConcierge({ message, history, context }) {
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT }
    ];
    if (context && context.page) {
        messages.push({ role: 'system', content: `User is on the ${context.page} page.` });
    }
    if (Array.isArray(history) && history.length) {
        // Limit to last 6 turns to keep tokens in check
        history.slice(-6).forEach(h => {
            if (h.role && h.content) messages.push({ role: h.role, content: String(h.content).slice(0, 500) });
        });
    }
    messages.push({ role: 'user', content: message });

    // Collected venues/events from all tool calls (dedup by id)
    const collectedVenues = new Map();
    const collectedEvents = new Map();
    let itinerary = null;
    let toolsUsed = [];

    for (let i = 0; i < MAX_TOOL_ITERS; i++) {
        const resp = await callOpenAI(messages);
        const choice = resp.choices && resp.choices[0];
        if (!choice) throw new Error('OpenAI returned no choices');

        const msg = choice.message;
        messages.push(msg);

        if (msg.tool_calls && msg.tool_calls.length) {
            // Execute every requested tool in parallel
            const results = await Promise.all(msg.tool_calls.map(async tc => {
                let args = {};
                try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
                const result = await executeTool(tc.function.name, args);
                toolsUsed.push({ name: tc.function.name, args });

                if (tc.function.name === 'search_venues' && Array.isArray(result)) {
                    result.forEach(v => { if (v && v.id) collectedVenues.set(v.id, v); });
                } else if (tc.function.name === 'search_events' && Array.isArray(result)) {
                    result.forEach(e => { if (e && e.id) collectedEvents.set(e.id, e); });
                } else if (tc.function.name === 'build_itinerary' && result && typeof result === 'object' && !result.error) {
                    itinerary = result;
                    [result.dinner, result.drinks, result.late].forEach(v => { if (v && v.id) collectedVenues.set(v.id, v); });
                }

                return { tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) };
            }));

            results.forEach(r => messages.push({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content }));
            continue;
        }

        // Final model reply — done
        const text = (msg.content || '').trim();

        const venues = Array.from(collectedVenues.values()).slice(0, 8);
        const events = Array.from(collectedEvents.values()).slice(0, 6);
        const actions = buildActions(venues, itinerary);

        return {
            ok: true,
            source: 'openai',
            response: text || "Here's what I found:",
            venues,
            events,
            itinerary,
            actions,
            tools_used: toolsUsed.map(t => t.name)
        };
    }

    // Ran out of iterations — salvage what we have
    const venues = Array.from(collectedVenues.values()).slice(0, 8);
    const events = Array.from(collectedEvents.values()).slice(0, 6);
    return {
        ok: true,
        source: 'openai',
        response: venues.length ? "Here are my picks:" : "I need a bit more info — what neighborhood or vibe?",
        venues, events, itinerary,
        actions: buildActions(venues, itinerary),
        tools_used: toolsUsed.map(t => t.name)
    };
}

function buildActions(venues, itinerary) {
    const actions = [];
    if (itinerary) {
        actions.push({ label: 'Add itinerary to plan', type: 'plan_itinerary' });
    }
    if (venues.length >= 2) {
        actions.push({ label: 'Save all to a list', type: 'save_all' });
        actions.push({ label: 'Plan this with friends', type: 'plan' });
    } else if (venues.length === 1) {
        actions.push({ label: 'Book a table', type: 'book' });
        actions.push({ label: 'Save for later', type: 'save' });
    }
    return actions;
}

module.exports = { aiConcierge, isEnabled: () => !!process.env.OPENAI_API_KEY };