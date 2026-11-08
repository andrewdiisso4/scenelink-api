const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stageTicketmaster } = require('../src/services/ticketmaster-staging');
const fixture = (id, code = 'onsale', start = {}) => ({ id, name: `Fictional fixture ${id}`,
  dates: { status: { code }, timezone: 'America/New_York', start: { localDate: '2026-11-10', localTime: '20:00:00', ...start } } });
const options = { apiKey: 'fixture-only-not-a-credential', startDateTime: '2026-11-01T00:00:00Z', endDateTime: '2026-12-01T00:00:00Z',
  now: () => new Date('2026-11-01T12:00:00Z'), pause: async () => {} };
const response = (events, pages = 1) => ({ ok: true, json: async () => ({ page: { totalPages: pages }, _embedded: { events } }) });

test('paginates, deduplicates stable provider IDs and retains later cancellation without activating', async () => {
  const calls = [];
  const result = await stageTicketmaster({ ...options, fetchImpl: async (url, init) => {
    const u = new URL(url); calls.push(u.searchParams.get('page'));
    assert.equal(u.hostname, 'app.ticketmaster.com'); assert.equal(u.searchParams.get('stateCode'), 'MA');
    assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    return calls.length === 1 ? response([fixture('a'), fixture('b')], 2) : response([fixture('a', 'cancelled')], 2);
  }});
  assert.deepEqual(calls, ['0', '1']); assert.equal(result.duplicates, 1);
  assert.equal(result.records.length, 2); assert.equal(result.records[0].cancelled, true);
  assert.ok(result.records.every(r => !r.is_active && r.requires_review && r.fetched_at === '2026-11-01T12:00:00.000Z'));
  assert.equal(result.missing_records_are_cancelled, false);
});

test('preserves unknown times, postponed status and raw source without invented hours', async () => {
  const event = fixture('tbd', 'postponed', { dateTBD: true, timeTBA: true, dateTime: '2026-11-10T01:00:00Z' });
  const result = await stageTicketmaster({ ...options, fetchImpl: async () => response([event, { id: 'invalid' }]) });
  const r = result.records[0];
  assert.equal(result.skipped, 1); assert.equal(r.local_date, null); assert.equal(r.local_time, null);
  assert.equal(r.start_at, null); assert.equal(r.provider_status, 'postponed'); assert.equal(r.raw, event);
});

test('reports truncation at provider deep paging limit', async () => {
  let count = 0;
  const result = await stageTicketmaster({ ...options, fetchImpl: async () => response([fixture(String(count++))], 6) });
  assert.equal(count, 5); assert.equal(result.complete, false); assert.equal(result.truncated, true);
});

test('empty successful search cannot imply cancellations', async () => {
  const result = await stageTicketmaster({ ...options, fetchImpl: async () => response([], 0) });
  assert.deepEqual(result.records, []); assert.equal(result.complete, true); assert.equal(result.missing_records_are_cancelled, false);
});

test('429 surfaces retry-after without retrying or leaking a key', async () => {
  let calls = 0;
  await assert.rejects(stageTicketmaster({ ...options, fetchImpl: async () => {
    calls++; return { ok: false, status: 429, headers: { get: () => '60' } };
  }}), e => e.retryAfter === '60' && /429/.test(e.message) && !e.message.includes(options.apiKey));
  assert.equal(calls, 1);
});

test('partial failure never returns a complete batch; network error text cannot leak a key', async () => {
  let calls = 0;
  await assert.rejects(stageTicketmaster({ ...options, fetchImpl: async () => {
    if (++calls === 1) return response([fixture('one')], 2);
    throw new Error(`failed url?apikey=${options.apiKey}`);
  }}), e => /incomplete/.test(e.message) && !e.message.includes(options.apiKey));
});

test('rejects malformed pages and invalid configuration before network use', async () => {
  await assert.rejects(stageTicketmaster({ ...options, apiKey: '', fetchImpl: () => assert.fail('network') }));
  await assert.rejects(stageTicketmaster({ ...options, endDateTime: 'invalid', fetchImpl: () => assert.fail('network') }));
  for (const data of [null, {}, { page: { totalPages: 1 }, _embedded: { events: {} } }, { page: { totalPages: 1 } }]) {
    await assert.rejects(stageTicketmaster({ ...options, fetchImpl: async () => ({ ok: true, json: async () => data }) }));
  }
});

test('retired synthetic and legacy direct-import handlers return 410 without database or provider calls', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousKey = process.env.TICKETMASTER_API_KEY;
  process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('hex');
  process.env.TICKETMASTER_API_KEY = 'fictional-never-sent';
  const pool = require('../src/config/database');
  const originalQuery = pool.query, originalFetch = global.fetch;
  pool.query = () => assert.fail('Retired writer must not query or write database');
  global.fetch = () => assert.fail('Retired writer must not call a provider');
  try {
    const router = require('../src/routes/adminEvents');
    for (const path of ['/seed/curated', '/import/ticketmaster']) {
      const route = router.stack.find(layer => layer.route?.path === path).route;
      let status, body;
      await route.stack[0].handle({}, { status(code) { status = code; return this; }, json(value) { body = value; } });
      assert.equal(status, 410); assert.equal(body.ok, false);
    }
  } finally {
    pool.query = originalQuery; global.fetch = originalFetch; await pool.end();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.TICKETMASTER_API_KEY; else process.env.TICKETMASTER_API_KEY = previousKey;
  }
});

test('skipped malformed events and changing page counts cannot produce a complete batch', async () => {
  const malformed = await stageTicketmaster({ ...options, fetchImpl: async () => response([fixture('kept'), null, {}]) });
  assert.equal(malformed.skipped, 2); assert.equal(malformed.complete, false);
  let page = 0;
  const changing = await stageTicketmaster({ ...options, fetchImpl: async () => response([fixture(String(page))], ++page === 1 ? 2 : 1) });
  assert.equal(changing.complete, false);
  await assert.rejects(stageTicketmaster({ ...options, fetchImpl: async () => response([fixture('inconsistent')], 0) }));
});
