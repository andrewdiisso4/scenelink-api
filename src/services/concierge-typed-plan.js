'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const { canonicalFilters } = require('./concierge-conversation');

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TTL_MS = 10 * 60 * 1000;
const MAX_TOKEN_CHARS = 14000;
const INITIAL = /\bdinner\s+(?:then|and then|followed by|and)\s+(?:cocktails|drinks)\b/i;
const SWAP = /^(?:please\s+)?(?:swap|change|replace)\s+(?:out\s+)?(?:the\s+)?(?:drinks|cocktails?)\s+(?:spot|stop|venue)[.!?]*$/i;
const BROAD_SWAP = /^(?:please\s+)?(?:swap|change|replace)\b.*\b(?:drinks|cocktails?)\b/i;
const MORE_STOPS = /\b(?:drinks|cocktails)\b.*\b(?:then|followed by|after that)\b/i;

function modeFor(message) {
    if (SWAP.test(message)) return 'swap';
    if (BROAD_SWAP.test(message)) return 'unsupported';
    if (INITIAL.test(message)) return MORE_STOPS.test(message) ? 'unsupported' : 'initial';
    return null;
}

function stateFor(filters, dinnerId, drinksId) {
    return { version: 1, dinnerId, drinksId, filters: canonicalFilters(filters) };
}

// A separate token domain prevents these continuation envelopes from being used
// as login tokens. It is an integrity envelope, not storage or encryption.
const macFor = payload => createHmac('sha256', process.env.JWT_SECRET)
    .update('scenelink-concierge-typed-plan-v1\0' + payload).digest();
function signState(state, userId) {
    if (!process.env.JWT_SECRET || !ID.test(userId)) throw new Error('Itinerary state signing unavailable');
    const body = Buffer.from(JSON.stringify({ ...state, userId, expires: Date.now() + TTL_MS })).toString('base64url');
    const token = body + '.' + macFor(body).toString('base64url');
    if (token.length > MAX_TOKEN_CHARS) throw new Error('Itinerary state exceeded bounds');
    return token;
}
function parseState(token, userId) {
    if (!process.env.JWT_SECRET || !ID.test(userId) || typeof token !== 'string' ||
        token.length > MAX_TOKEN_CHARS || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [body, sig] = token.split('.');
    const mac = Buffer.from(sig, 'base64url');
    if (mac.length !== 32 || !timingSafeEqual(macFor(body), mac)) return null;
    let value; try { value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { return null; }
    if (!value || value.version !== 1 || value.userId !== userId || !Number.isSafeInteger(value.expires) ||
        value.expires <= Date.now() || value.expires > Date.now() + TTL_MS ||
        typeof value.dinnerId !== 'string' || typeof value.drinksId !== 'string' ||
        !ID.test(value.dinnerId) || !ID.test(value.drinksId) || value.dinnerId === value.drinksId ||
        !value.filters || typeof value.filters !== 'object' || value.filters.version !== 1) return null;
    const state = stateFor(value.filters, value.dinnerId, value.drinksId);
    if (!state.filters.isPlan || state.filters.isEvent || state.filters.isBooking || state.filters.venueName !== null) return null;
    return state;
}

function stopFilters(filters, role, excludeIds = []) {
    return { ...filters, venueName: null, venueType: null, role, excludeIds,
        // A cuisine requirement describes the dinner stage, never evidence of bar suitability.
        cuisines: role === 'dinner' ? filters.cuisines : [] };
}

async function runTypedPlan({ mode, message, filters, context, userId, fetchCandidates, ask, read }) {
    if (!process.env.JWT_SECRET || !ID.test(userId)) throw new Error('Itinerary state signing unavailable');
    if (mode === 'unsupported') throw new Error('Unsupported itinerary edit');
    const swap = mode === 'swap';
    const state = swap ? parseState(context?.typedPlan, userId) : null;
    if (swap && !state) throw new Error('No two-stop plan to revise');
    const constraints = state?.filters || canonicalFilters(filters);
    if (constraints.isEvent || constraints.isBooking || constraints.venueName) throw new Error('Unsupported itinerary criteria');
    const dinner = stopFilters(constraints, 'dinner');
    const drinks = stopFilters(constraints, 'drinks', swap ? [state.dinnerId, state.drinksId] : []);
    const looksUp = (f, ids = null) => fetchCandidates(f, 10, ids);
    if (swap) {
        const [kept, old] = await Promise.all([
            looksUp(dinner, [state.dinnerId]),
            looksUp(stopFilters(constraints, 'drinks'), [state.drinksId])
        ]);
        if (!kept.length || !old.length) throw new Error('Original itinerary is no longer current');
    }
    const [dinnerOptions, drinksOptions] = await Promise.all([
        swap ? [] : looksUp(dinner), looksUp(drinks)
    ]);
    if ((!swap && !dinnerOptions.length) || !drinksOptions.length) throw new Error('No matching itinerary choices');

    // Send only new choices. The prior plan's IDs and raw prior chat never leave SceneLink.
    const raw = await ask({
        message,
        filters: swap ? { ...constraints, cuisines: [] } : constraints,
        candidates: [...dinnerOptions, ...drinksOptions],
        groups: { dinner: dinnerOptions.map(v => String(v.id)), drinks: drinksOptions.map(v => String(v.id)), swap }
    });
    const proposed = read(raw)?.recommendedPlan?.stops;
    if (!Array.isArray(proposed) || proposed.length !== (swap ? 1 : 2)) throw new Error('Wrong itinerary shape');
    const dinnerId = swap ? state.dinnerId : proposed[0]?.venueId;
    const drinksId = swap ? proposed[0]?.venueId : proposed[1]?.venueId;
    if (dinnerId === drinksId || (!swap && !dinnerOptions.some(v => String(v.id) === dinnerId))
        || !drinksOptions.some(v => String(v.id) === drinksId)) throw new Error('Wrong itinerary role');
    const [confirmedDinner, confirmedDrinks] = await Promise.all([
        looksUp(dinner, [dinnerId]), looksUp(drinks, [drinksId])
    ]);
    if (confirmedDinner.length !== 1 || confirmedDrinks.length !== 1) throw new Error('Itinerary choices changed before display');
    return { raw, candidates: [confirmedDinner[0], confirmedDrinks[0]],
        stops: [{ venueId: dinnerId, role: 'dinner' }, { venueId: drinksId, role: 'drinks' }],
        state: signState(stateFor({ ...constraints, isPlan: true }, dinnerId, drinksId), userId) };
}

module.exports = { modeFor, runTypedPlan };
