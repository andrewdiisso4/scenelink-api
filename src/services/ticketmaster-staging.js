'use strict';

// Read-only adapter. Output is review staging, never availability or a booking.
// Caller owns durable storage, scheduling, locking and existing-ID refresh.
async function stageTicketmaster({ apiKey, startDateTime, endDateTime, city = 'Boston',
  fetchImpl = fetch, now = () => new Date(), pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!apiKey) throw new Error('Ticketmaster Discovery API key required');
  if (!Number.isFinite(Date.parse(startDateTime)) || !Number.isFinite(Date.parse(endDateTime))
      || Date.parse(startDateTime) >= Date.parse(endDateTime)) throw new Error('Valid increasing date window required');
  const records = new Map();
  let totalPages = 1, skipped = 0, duplicates = 0, pageCountChanged = false;
  let firstTotalPages;
  const fetchedAt = now().toISOString();
  for (let page = 0; page < Math.min(totalPages, 5); page++) {
    if (page) await pause(550);
    const query = new URLSearchParams({ apikey: apiKey, city, stateCode: 'MA', countryCode: 'US',
      startDateTime, endDateTime, size: '200', page: String(page), sort: 'date,asc' });
    let response;
    try {
      response = await fetchImpl(`https://app.ticketmaster.com/discovery/v2/events.json?${query}`, {
        headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error('Ticketmaster request failed; staging run incomplete'); }
    if (!response.ok) {
      const error = new Error(`Ticketmaster HTTP ${response.status}; staging run incomplete`);
      error.retryAfter = response.headers?.get('retry-after') || null;
      throw error;
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('Invalid Ticketmaster JSON'); }
    if (!data || !Number.isInteger(data.page?.totalPages) || data.page.totalPages < 0
        || (data._embedded?.events !== undefined && !Array.isArray(data._embedded.events))) {
      throw new Error('Invalid Ticketmaster page shape');
    }
    if (firstTotalPages === undefined) firstTotalPages = data.page.totalPages;
    else if (firstTotalPages !== data.page.totalPages) pageCountChanged = true;
    if (data.page.number !== undefined && data.page.number !== page) throw new Error('Unexpected Ticketmaster page number');
    totalPages = data.page.totalPages;
    const events = data._embedded?.events || [];
    if (events.length && totalPages === 0) throw new Error('Inconsistent empty Ticketmaster page');
    if (events.length === 0 && totalPages > page) throw new Error('Missing Ticketmaster events on a nonempty page');
    for (const event of events) {
      if (!event || typeof event.id !== 'string' || !event.id.trim() || typeof event.name !== 'string' || !event.name.trim()) {
        skipped++; continue;
      }
      if (records.has(event.id)) duplicates++;
      records.set(event.id, normalizeEvent(event, fetchedAt));
    }
  }
  return { records: [...records.values()], skipped, duplicates, fetched_at: fetchedAt,
    complete: totalPages <= 5 && skipped === 0 && !pageCountChanged, truncated: totalPages > 5,
    // Missing from a date-window search does NOT establish cancellation.
    missing_records_are_cancelled: false };
}


function normalizeEvent(event, fetchedAt) {
  const status = event.dates?.status?.code || 'unknown';
  const start = event.dates?.start || {};
  return {
    source: 'ticketmaster', external_id: event.id, title: event.name,
    source_url: event.url || null, fetched_at: fetchedAt, provider_status: status,
    local_date: start.dateTBD || start.dateTBA ? null : start.localDate || null,
    local_time: start.timeTBA || start.noSpecificTime ? null : start.localTime || null,
    start_at: start.dateTBD || start.dateTBA || start.timeTBA || start.noSpecificTime ? null : start.dateTime || null,
    timezone: event.dates?.timezone || null,
    requires_review: true, is_active: false,
    cancelled: status === 'cancelled',
    raw: event,
  };
}

module.exports = { stageTicketmaster, normalizeEvent };
