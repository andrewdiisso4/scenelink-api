'use strict';

const { resolveNamedVenue } = require('./concierge-named-venue');
const { extractConstraints, parseNeighborhoods } = require('./concierge-constraints');
const { parseEventRequest, EVENT_KINDS } = require('./concierge-event-search');

// Search preferences are client-carried, public query input, never account state.
// Keep them bounded and copy only supported fields; session_id is analytics only.
const LISTS = ['cuisines', 'neighborhoods', 'vibes', 'times', 'excludedCuisines',
    'excludedNeighborhoods', 'excludedVenueTypes', 'excludedVenueNames'];
const TYPES = new Set(['restaurant', 'cocktail_bar', 'bar', 'nightlife', 'cafe']);
const BARE_AREA_ALIASES = new Set(['southie','eastie','kendall square','harvard square','central square','davis square','union square','theater district','theatre district','financial district']);
const CLEAR_LOCATION = /\b(?:anywhere|any neighborhood|any area|no (?:location|neighborhood|area) preference)\b/i;
const RESET = /\b(?:start over|reset(?: the search)?|forget (?:that|everything)|new search|new topic)\b/i;
const FOLLOW_UP = /^(?:what about|how about|and\b|but\b|instead\b|same\b|another\b|more\b|less\b|cheaper\b|closer\b|else\b|try\b|change\b|switch\b|make (?:it|them|that)\b|show (?:me )?(?:cheaper|more|other|another|different)\b|any (?:other|more)\b|(?:in|near|for|under|below)\b)|\b(?:instead|those|these|same ones|same place|same venue|keep (?:the|it))\b/i;

function cleanList(value, limit = 12, maxLength = 100) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(v => typeof v === 'string' && v.trim() &&
        v.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(v)).map(v => v.trim()))].slice(0, limit);
}

function canonicalFilters(filters = {}) {
    const result = { version: 1 };
    for (const field of LISTS) result[field] = cleanList(filters[field], 12, field === 'excludedVenueNames' ? 500 : 100);
    const price = filters.priceMax ?? filters.budget;
    const size = filters.partySize ?? filters.group_size;
    result.priceMax = Number.isInteger(price) && price >= 1 && price <= 4 ? price : null;
    result.partySize = Number.isInteger(size) && size > 0 && size <= 100 ? size : null;
    result.venueType = TYPES.has(filters.venueType) ? filters.venueType : null;
    result.venueName = typeof filters.venueName === 'string' && filters.venueName.length <= 500
        && !/[\u0000-\u001f\u007f]/.test(filters.venueName) ? filters.venueName : null;
    result.isEvent = filters.isEvent === true || filters.is_event === true;
    result.isPlan = filters.isPlan === true;
    result.isBooking = filters.isBooking === true || filters.is_booking === true;
    result.eventWindow = null;
    result.invalidEventSearch = false;
    const window = filters.eventWindow;
    if (window != null) {
        const kind = window && typeof window === 'object' && !Array.isArray(window) ? window.kind : null;
        const allowedKeys = kind === 'date' ? ['kind', 'date'] : ['kind'];
        const valid = ['today', 'weekend', 'date'].includes(kind) && Object.keys(window).every(key => allowedKeys.includes(key));
        const date = kind === 'date' && typeof window.date === 'string' ? parseEventRequest(window.date).eventWindow : null;
        if (valid && (kind !== 'date' || date?.kind === 'date' && date.date === window.date)) result.eventWindow = kind === 'date' ? date : { kind };
        else result.invalidEventSearch = true;
    }
    const kinds = filters.eventKinds;
    if (kinds != null && (!Array.isArray(kinds) || kinds.length > EVENT_KINDS.length || kinds.some(kind => !EVENT_KINDS.includes(kind)))) result.invalidEventSearch = true;
    result.eventKinds = Array.isArray(kinds) ? [...new Set(kinds.filter(kind => EVENT_KINDS.includes(kind)))].slice(0, EVENT_KINDS.length) : [];
    return result;
}

function readSearchContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context) ||
        !context.search || typeof context.search !== 'object' || Array.isArray(context.search) ||
        context.search.version !== 1) return null;
    return canonicalFilters(context.search);
}

function isFollowUp(message) {
    const text = message.trim();
    if (RESET.test(text)) return false;
    // A bare recognized area is a useful refinement; a new full request is not.
    const areas = parseNeighborhoods(text);
    const areaText = text.replace(/[?.!,]/g, '').trim().toLowerCase();
    const bareArea = areas.length === 1 && (areaText === areas[0].toLowerCase() || BARE_AREA_ALIASES.has(areaText));
    return FOLLOW_UP.test(text) || /^(?:no\b|not\b|avoid\b|except\b|excluding\b|without\b|anywhere\b|any neighborhood\b|any area\b)/i.test(text) || bareArea;
}

function comparable(value) { return String(value).toLowerCase().replace(/[_-]/g, ' '); }
function sameType(type, excluded) {
    return comparable(type) === comparable(excluded) || excluded === 'bar' && type === 'cocktail_bar';
}

function mergeTurn(current, previous, message) {
    if (!previous || !isFollowUp(message) || current.venueName !== null) return current;
    const merged = { ...previous, ...current };
    for (const field of ['cuisines', 'neighborhoods', 'vibes', 'times']) {
        merged[field] = current[field].length ? current[field] : previous[field];
    }
    for (const field of ['priceMax', 'partySize', 'venueType']) {
        merged[field] = current[field] ?? previous[field];
    }

    const changedType = current.venueType && current.venueType !== previous.venueType;
    const changedCuisine = current.cuisines.length > 0;
    const changedSearch = changedType || changedCuisine || current.isEvent;
    merged.venueName = changedSearch ? null : previous.venueName;
    if (changedType) {
        merged.vibes = current.vibes;
        // A drinks/cafe follow-up must not keep an earlier restaurant cuisine.
        if (current.venueType !== 'restaurant') merged.cuisines = current.cuisines;
    }
    if (changedCuisine && !current.venueType && ['bar', 'cocktail_bar', 'nightlife', 'cafe'].includes(previous.venueType)) {
        merged.venueType = 'restaurant';
        merged.vibes = current.vibes;
    }
    merged.isEvent = current.isEvent || (!changedType && !changedCuisine && previous.isEvent);
    merged.isPlan = current.isPlan || (!changedSearch && previous.isPlan);
    merged.isBooking = current.isBooking || (!changedSearch && previous.isBooking);
    merged.eventWindow = merged.isEvent ? current.eventWindow ?? previous.eventWindow : null;
    merged.eventKinds = merged.isEvent ? (current.eventKinds.length ? current.eventKinds : previous.eventKinds) : [];
    merged.invalidEventSearch = merged.isEvent && (current.invalidEventSearch || !current.eventWindow && previous.invalidEventSearch);
    if (current.isEvent && !previous.isEvent) {
        // Venue price tiers and food preferences are not event ticket facts.
        merged.venueType = current.venueType;
        merged.cuisines = current.cuisines;
        merged.priceMax = current.priceMax;
        merged.vibes = current.vibes;
    }
    if (previous.venueName && (/\b(?:another|different|other)\b/i.test(message) || current.excludedCuisines.length || current.excludedVenueTypes.length)) {
        merged.venueName = null;
        current = { ...current, excludedVenueNames: cleanList([...current.excludedVenueNames, previous.venueName], 12, 500) };
    }

    for (const field of LISTS.filter(f => f.startsWith('excluded'))) {
        let prior = previous[field];
        const positive = field === 'excludedCuisines' ? current.cuisines
            : field === 'excludedNeighborhoods' ? current.neighborhoods
            : field === 'excludedVenueTypes' && current.venueType ? [current.venueType] : [];
        prior = prior.filter(v => !positive.some(p => comparable(p) === comparable(v) ||
            (field === 'excludedVenueTypes' && v === 'bar' && p === 'cocktail_bar')));
        const combined = [...new Set([...prior, ...current[field]])];
        if (combined.length > 12) merged.exclusionOverflow = true;
        merged[field] = cleanList(combined, 12, field === 'excludedVenueNames' ? 500 : 100);
    }
    // A newly excluded preference overrides an inherited positive preference.
    // Explicitly contradictory constraints in this turn are clarified below.
    if (!current.cuisines.length) merged.cuisines = merged.cuisines.filter(v => !current.excludedCuisines.some(x => comparable(v) === comparable(x)));
    if (!current.neighborhoods.length) merged.neighborhoods = merged.neighborhoods.filter(v => !current.excludedNeighborhoods.some(x => comparable(v) === comparable(x)));
    if (!current.venueType && merged.venueType && current.excludedVenueTypes.some(x => sameType(merged.venueType, x))) merged.venueType = null;
    if (!current.vibes.length && current.excludedVenueTypes.length) merged.vibes = [];
    if (merged.venueName && current.excludedVenueNames.some(v => comparable(v) === comparable(merged.venueName))) merged.venueName = null;
    if (/\b(?:cheaper|less expensive)\b/i.test(message) && !current.priceMax) {
        // This selects a reviewed price tier; it never promises a dollar total.
        merged.priceMax = previous.priceMax ? Math.max(1, previous.priceMax - 1) : 2;
    }
    if (CLEAR_LOCATION.test(message)) merged.neighborhoods = [];
    return merged;
}

function applyCanonical(parsed, canonical) {
    const filters = { ...parsed, ...canonical,
        budget: canonical.priceMax, group_size: canonical.partySize,
        is_event: canonical.isEvent, is_booking: canonical.isBooking };
    if (filters.venueName === null) delete filters.venueName;
    if (Object.hasOwn(parsed, 'primary')) {
        filters.primary = filters.is_event ? 'event' : filters.venueName != null ? 'search'
            : filters.is_booking ? 'book'
            : filters.is_help ? 'help' : filters.is_greeting ? 'greet'
            : filters.cuisines.length || filters.neighborhoods.length || filters.vibes.length || filters.priceMax ? 'recommend' : 'search';
    }
    return filters;
}

async function resolveConversation({ pool, message, history = [], context = {}, parse }) {
    async function readTurn(text) {
        const reset = RESET.test(text);
        let cleanText = reset ? text.replace(RESET, ' ').replace(/^[\s:,.!-]+/, '').trim() : text;
        if (/^no (?:location|neighborhood|area) preference[.!?]*$/i.test(cleanText)) cleanText = 'anywhere';
        let constraints = extractConstraints(cleanText);
        let named = constraints.clarification ? null : await resolveNamedVenue(pool, constraints.positiveText);
        // Preserve an exact catalog name such as "Not Your Average Place".
        // Do not run the quoted-name shortcut on a quoted *exclusion*.
        if (constraints.clarification && constraints.positiveText === cleanText && !/["“”]/.test(cleanText)) {
            const exact = await pool.query('SELECT name FROM venues WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [cleanText]);
            if (exact.rows.some(row => comparable(row.name) === comparable(cleanText))) {
                named = { name: cleanText, filterText: '' };
                constraints = extractConstraints('');
            }
        }
        const filterText = named ? named.filterText.replace(/^(?:tell me about|show me|look up|lookup|find)\s*/i, '').trim() : constraints.positiveText;
        const parsed = parse(filterText);
        const event = parseEventRequest(filterText);
        if (!named && !parsed.venueType && event.eventKinds.length) parsed.isEvent = parsed.is_event = true;
        Object.assign(parsed, { eventWindow: event.eventWindow, eventKinds: event.eventKinds });
        if (reset && !cleanText) parsed.is_greeting = true;
        const filters = canonicalFilters({ ...parsed, ...constraints, venueName: named ? named.name : null });
        return { parsed, filters, named, reset, clarification: constraints.clarification || parsed.clarification || null, eventClarification: event.clarification };
    }

    const current = await readTurn(message);
    let previous = null;
    if (!current.reset && isFollowUp(message) && !current.named) {
        previous = readSearchContext(context);
        if (!previous && Array.isArray(history)) {
            for (const turn of history.slice(-6)) {
                if (!turn || turn.role !== 'user' || typeof turn.content !== 'string' ||
                    !turn.content.trim() || turn.content.length > 500) continue;
                const parsed = await readTurn(turn.content.trim());
                if (parsed.clarification || parsed.filters.isEvent && parsed.eventClarification) continue;
                previous = mergeTurn(parsed.filters, parsed.reset ? null : previous, turn.content);
            }
        }
    }
    const merged = mergeTurn(current.filters, previous, message);
    if (!current.reset && !CLEAR_LOCATION.test(message) && !merged.neighborhoods.length && context && typeof context.neighborhood === 'string') {
        merged.neighborhoods = parseNeighborhoods(context.neighborhood.slice(0, 100))
            .filter(v => !merged.excludedNeighborhoods.some(x => comparable(v) === comparable(x)));
    }
    const filters = applyCanonical(current.parsed, merged);
    filters.original = message;
    let clarification = current.clarification;
    if (!clarification && merged.isEvent) clarification = current.eventClarification || (merged.invalidEventSearch ? 'Please choose tonight, this weekend, or an exact event date in YYYY-MM-DD format.' : null);
    if (!clarification && merged.isEvent && (merged.priceMax || merged.cuisines.length || merged.venueType || merged.excludedCuisines.length || merged.excludedVenueTypes.length)) {
        clarification = 'I can match reviewed events by date, area, event type or venue name. Ticket budgets and food or venue-type preferences need confirmation with the source. Which event criteria should I use?';
    }
    if (!clarification && merged.exclusionOverflow) clarification = 'This search has more than 12 exclusions of one kind. Start a new search or use fewer exclusions.';
    if (!clarification && (current.filters.cuisines.some(v => current.filters.excludedCuisines.some(x => comparable(v) === comparable(x))) ||
        current.filters.neighborhoods.some(v => current.filters.excludedNeighborhoods.some(x => comparable(v) === comparable(x))) ||
        current.filters.venueType && current.filters.excludedVenueTypes.some(x => sameType(current.filters.venueType, x)))) {
        clarification = 'Your request both includes and excludes the same preference. Which cuisine, neighborhood, or venue type should I use?';
    }
    if (!clarification && /(?:\$\s*\d|\b\d+(?:\.\d+)?\s*dollars?\b)/i.test(message)) {
        clarification = merged.isEvent ? 'The catalog does not verify event ticket totals. Which date, area and event type should I search?'
            : 'I can filter by reviewed $–$$$$ price categories, but the catalog does not verify per-person dollar totals. Which price category should I use?';
    }
    return { filters, clarification, reset: current.reset };
}

function searchContextFor(filters, venues) {
    const canonical = canonicalFilters(filters);
    delete canonical.invalidEventSearch;
    // An unavailable exact name must not be echoed as catalog/account metadata.
    if (canonical.venueName !== null && !venues.some(v => comparable(v.name) === comparable(canonical.venueName))) return null;
    if (canonical.venueName !== null) {
        const venue = venues.find(v => comparable(v.name) === comparable(canonical.venueName));
        if (!canonical.neighborhoods.length) canonical.neighborhoods = parseNeighborhoods(venue.neighborhood || venue.city || '');
        if (!canonical.venueType && TYPES.has(venue.type)) canonical.venueType = venue.type;
        if (!canonical.cuisines.length && typeof venue.cuisine === 'string') canonical.cuisines = cleanList([venue.cuisine]);
    }
    return canonical;
}

module.exports = { resolveConversation, searchContextFor, canonicalFilters, isFollowUp };
