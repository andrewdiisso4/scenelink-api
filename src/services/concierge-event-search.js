'use strict';

const { PUBLIC_EVENT, EVENT_COLUMNS, publicEvent } = require('../launch/events');
const { EVENT_TODAY_SQL } = require('./event-calendar');

// Public conversation state stores only these small, declarative constraints.
// Relative windows are resolved against the Boston calendar on every request.
const EVENT_KINDS = Object.freeze(['concert', 'comedy', 'theater', 'dj', 'festival', 'lecture']);
const CATEGORY_ALIASES = Object.freeze({
  concert: ['concert', 'concerts', 'music', 'live music'],
  comedy: ['comedy', 'comedy show', 'standup', 'stand up', 'stand up comedy'],
  theater: ['theater', 'theatre', 'musical', 'musical theater', 'musical theatre'],
  dj: ['dj', 'dj set', 'dj night'],
  festival: ['festival', 'festivals'],
  lecture: ['lecture', 'lectures', 'talk', 'talks', 'panel', 'discussion'],
});
const DATE_CLARIFICATION = 'Which date should I use? I can search tonight, this weekend, or an exact date in YYYY-MM-DD format.';

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseEventRequest(message) {
  // A quoted venue/event name and the geographic Theater District are identities,
  // not requests to change the date or event category.
  const text = (typeof message === 'string' ? message : '').toLowerCase()
    .replace(/"[^"\n]*"|“[^”\n]*”|(?<!\w)'[^'\n]+'(?!\w)/g, ' ')
    .replace(/\btheat(?:er|re)\s+district\b/g, ' ');
  const result = { eventWindow: null, eventKinds: [], clarification: null };
  const patterns = {
    concert: /\b(?:concerts?|live\s+music)\b/,
    comedy: /\b(?:comedy|stand[-\s]?up)\b/,
    theater: /\b(?:theater|theatre|musicals?)\b/,
    dj: /\bdj(?:s|\s+sets?)?\b/,
    festival: /\bfestivals?\b/,
    lecture: /\b(?:lectures?|talks?|panels?)\b/,
  };
  for (const kind of EVENT_KINDS) if (patterns[kind].test(text)) result.eventKinds.push(kind);

  // Event exclusions have no public context representation yet. Ask rather than
  // reversing a negative request into a positive category filter.
  if (/\b(?:not|no|avoid|except|excluding|without)\s+(?:any\s+)?(?:concerts?|live\s+music|comedy|stand[-\s]?up|theater|theatre|musicals?|djs?|festivals?|lectures?|talks?|panels?)\b/.test(text)) {
    result.clarification = 'Which event type should I search for: concerts, comedy, theater, DJ sets, festivals, or lectures?';
  }

  const dates = [...text.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b/g)].map(match => match[0]);
  const today = /\b(?:tonight|today|this\s+evening)\b/.test(text);
  const weekend = /\bweekend\b/.test(text);
  const distinctDates = [...new Set(dates)];
  const withoutDates = text.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ');
  const unsupportedDate = /\b(?:tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekdays?|daily|weekly)\b/.test(withoutDates)
    || /\b(?:next|last)\s+(?:weekend|week|month|year)\b|\bthis\s+(?:week|month|year)\b/.test(text)
    || /\b(?:in|within|over|for)\s+(?:the\s+next\s+)?(?:\d+|a|an|one|two|three|four|few)\s+(?:days?|weeks?|months?|years?)\b/.test(text)
    || /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/.test(text)
    || /\b(?:on|in|this|next)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|halloween|christmas|thanksgiving|new\s+year(?:'s)?(?:\s+eve|\s+day)?|valentine(?:'s)?\s+day)\b/.test(text)
    || /\b\d{1,4}[/.]\d{1,2}(?:[/.]\d{1,4})?\b|\b\d{4}-\d{1,2}\b/.test(withoutDates)
    || /\b(?:after|before|from|until|through|between|since|by|starting)\s+(?:on\s+)?(?:\d{4}-\d{1,2}-\d{1,2}|tonight|today|this\s+weekend)\b/.test(text);
  const unsupportedClock = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:at|after|before|between|from)\s+\d{1,2}:\d{2}\b|\b(?:after|before|at)\s+(?:midnight|noon)\b/.test(text);
  if (dates.some(date => !validDate(date)) || distinctDates.length > 1 || Number(today) + Number(weekend) + Number(distinctDates.length > 0) > 1 || unsupportedDate) {
    result.clarification = DATE_CLARIFICATION;
  } else if (unsupportedClock) {
    result.clarification = 'I can search an event date, but stored start times do not support a reliable clock-time filter. Which date should I search?';
  } else if (distinctDates.length) result.eventWindow = { kind: 'date', date: distinctDates[0] };
  else if (today) result.eventWindow = { kind: 'today' };
  else if (weekend) result.eventWindow = { kind: 'weekend' };
  return result;
}

function invalidSearch() {
  return Object.assign(new Error('Invalid event search constraints'), { status: 400, code: 'INVALID_EVENT_SEARCH' });
}

function textList(value, maximumLength = 100) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 12 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > maximumLength || /[\u0000-\u001f\u007f]/.test(item))) throw invalidSearch();
  return [...new Set(value.map(item => item.trim().toLowerCase()))];
}

async function queryConciergeEvents(pool, intent = {}, limit = 5, { today } = {}) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw invalidSearch();
  if (intent.clarification) return [];
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw invalidSearch();
  const window = intent.eventWindow;
  if (window != null && (typeof window !== 'object' || Array.isArray(window)
    || !['today', 'date', 'weekend'].includes(window.kind)
    || Object.keys(window).some(key => !['kind', ...(window.kind === 'date' ? ['date'] : [])].includes(key))
    || (window.kind === 'date' && !validDate(window.date)))) throw invalidSearch();
  const kinds = intent.eventKinds == null ? [] : intent.eventKinds;
  if (!Array.isArray(kinds) || kinds.length > EVENT_KINDS.length || kinds.some(kind => !EVENT_KINDS.includes(kind))) throw invalidSearch();
  const areas = textList(intent.neighborhoods);
  const excludedAreas = textList(intent.excludedNeighborhoods);
  const excludedNames = textList(intent.excludedVenueNames, 500);
  if (intent.venueName != null && (typeof intent.venueName !== 'string' || !intent.venueName.trim() || intent.venueName.length > 500 || /[\u0000-\u001f\u007f]/.test(intent.venueName))) throw invalidSearch();
  if (today !== undefined && !validDate(today)) throw invalidSearch();

  const values = [];
  const bind = value => { values.push(value); return '$' + values.length; };
  const day = today === undefined || window?.kind === 'date' ? EVENT_TODAY_SQL : bind(today) + '::date';
  const conditions = [PUBLIC_EVENT()];
  if (window?.kind === 'date') conditions.push(`e.date = ${bind(window.date)}::date`);
  else if (window?.kind === 'today') conditions.push(`e.date = ${day}`);
  else if (window?.kind === 'weekend') {
    const dow = `EXTRACT(ISODOW FROM ${day})::integer`;
    conditions.push(`e.date BETWEEN (${day} + GREATEST(5 - ${dow}, 0)) AND (${day} + (7 - ${dow}))`);
  } else conditions.push(`e.date BETWEEN ${day} AND (${day} + 6)`);

  const neighborhood = "lower(btrim(CASE WHEN e.venue_id IS NOT NULL THEN v.neighborhood ELSE e.venue_neighborhood END))";
  const city = "lower(btrim(CASE WHEN e.venue_id IS NOT NULL THEN v.city ELSE NULL END))";
  const venueName = "lower(btrim(CASE WHEN e.venue_id IS NOT NULL THEN v.name ELSE e.venue_name END))";
  if (areas.length) {
    const parameter = bind(areas);
    conditions.push(`(${neighborhood} = ANY(${parameter}::text[]) OR ${city} = ANY(${parameter}::text[]))`);
  }
  if (excludedAreas.length) {
    const parameter = bind(excludedAreas);
    // An unlinked source has no city column. Do not assert a geographic exclusion
    // when the canonical neighborhood/city pair is unavailable.
    conditions.push(`(e.venue_id IS NOT NULL AND NULLIF(${neighborhood}, '') IS NOT NULL AND NULLIF(${city}, '') IS NOT NULL
      AND NOT (${neighborhood} = ANY(${parameter}::text[]) OR ${city} = ANY(${parameter}::text[])))`);
  }
  if (intent.venueName) conditions.push(`${venueName} = ${bind(intent.venueName.trim().toLowerCase())}`);
  if (excludedNames.length) conditions.push(`${venueName} <> ALL(${bind(excludedNames)}::text[])`);
  if (kinds.length) {
    const categories = [...new Set(kinds.flatMap(kind => CATEGORY_ALIASES[kind]))];
    conditions.push(`regexp_replace(lower(btrim(COALESCE(e.category, ''))), '[ _-]+', ' ', 'g') = ANY(${bind(categories)}::text[])`);
  }
  const result = await pool.query(`SELECT ${EVENT_COLUMNS}
    FROM events e LEFT JOIN venues v ON v.id=e.venue_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY e.date, e.start_time NULLS LAST, e.id LIMIT ${bind(limit)}`, values);
  return result.rows.map(publicEvent);
}

module.exports = { parseEventRequest, queryConciergeEvents, EVENT_KINDS };
