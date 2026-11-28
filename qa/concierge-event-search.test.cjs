'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { parseEventRequest, queryConciergeEvents } = require('../src/services/concierge-event-search');
const { EVENT_TODAY_SQL } = require('../src/services/event-calendar');

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE venues (id uuid PRIMARY KEY, name text, slug text, neighborhood text, city text,
      lat numeric, lng numeric, is_active boolean, business_status text);
    CREATE TABLE events (id uuid PRIMARY KEY, title text, description text, category text,
      venue_id uuid, venue_name text, venue_slug text, venue_neighborhood text, image_url text,
      date date, start_time text, end_time text, price text, is_featured boolean DEFAULT false,
      is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
      event_url text, source text, external_id text, source_url text, source_review_status text, source_reviewed_at timestamptz);
    CREATE TABLE users (id uuid PRIMARY KEY, is_active boolean, is_suspended boolean, is_private boolean);
    CREATE TABLE event_rsvps (event_id uuid, user_id uuid, status text, audience text);
  `);
  async function insert(table, row) {
    const columns = Object.keys(row);
    await db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, index) => '$' + (index + 1)).join(',')})`, Object.values(row));
    return row.id;
  }
  return {
    db,
    event: changes => insert('events', {
      id: randomUUID(), title: 'ISOLATED QA concert', category: 'concert', date: '2030-01-04',
      venue_name: 'ISOLATED QA source venue', venue_neighborhood: 'Cambridge', start_time: '19:00',
      source: 'official_venue', source_url: 'https://example.com/isolated-qa-source',
      source_review_status: 'reviewed', source_reviewed_at: '2030-01-01T12:00:00Z', ...changes,
    }),
    venue: changes => insert('venues', {
      id: randomUUID(), name: 'ISOLATED QA canonical venue', slug: 'isolated-qa-canonical-venue',
      neighborhood: 'Central Square', city: 'Cambridge', is_active: true, ...changes,
    }),
    user: changes => insert('users', { id: randomUUID(), is_active: true, is_private: false, is_suspended: false, ...changes }),
  };
}

const request = (message, extra = {}) => ({ ...parseEventRequest(message), ...extra });
const ids = rows => rows.map(row => row.id).sort();

test('event parser emits small date/type constraints without inferring a date from identity text', () => {
  assert.deepEqual(parseEventRequest('concerts in Cambridge tonight'), {
    eventWindow: { kind: 'today' }, eventKinds: ['concert'], clarification: null,
  });
  assert.deepEqual(parseEventRequest('live music on 2030-01-20'), {
    eventWindow: { kind: 'date', date: '2030-01-20' }, eventKinds: ['concert'], clarification: null,
  });
  assert.deepEqual(parseEventRequest('comedy and theater this weekend'), {
    eventWindow: { kind: 'weekend' }, eventKinds: ['comedy', 'theater'], clarification: null,
  });
  assert.deepEqual(parseEventRequest('events in the Theatre District'), {
    eventWindow: null, eventKinds: [], clarification: null,
  });
  assert.deepEqual(parseEventRequest('events at "Comedy Tonight" in Theater District'), {
    eventWindow: null, eventKinds: [], clarification: null,
  });
  assert.equal(parseEventRequest('concerts on 2028-02-29').clarification, null);
});

test('unsupported, impossible, conflicting and clock-time requests ask before returning unrelated events', async () => {
  const messages = [
    'concerts on 2026-02-29', 'concerts on 2030-02-31', 'events on 0000-01-01',
    'concerts on 2030-1-4', 'events on 01/04/2030', 'events on 2030-01',
    'concerts on 2030-01-04 or 2030-01-05', 'events tonight or this weekend',
    'events tonight on 2030-01-20', 'concerts tomorrow', 'concerts next Friday',
    'events next weekend', 'concerts January 20', 'events in January',
    'events in 3 days', 'events after 2030-01-20', 'concerts tonight after 8pm',
    'concerts tonight at 20:00', 'events not concerts',
  ];
  for (const message of messages) {
    const parsed = parseEventRequest(message);
    assert.ok(parsed.clarification, message);
    assert.deepEqual(await queryConciergeEvents({ query: () => assert.fail('clarification must not query') }, parsed), [], message);
  }
});

test('January 4 Cambridge concert request cannot return January 5 Back Bay lecture; ISO dates stay exact', async t => {
  const { db, event } = await fixture(t);
  await event({ title: 'ISOLATED QA tomorrow Boston lecture', category: 'lecture', date: '2030-01-05', venue_neighborhood: 'Back Bay' });
  const tonight = request('concerts in Cambridge tonight', { neighborhoods: ['Cambridge'] });
  assert.deepEqual(await queryConciergeEvents(db, tonight, 5, { today: '2030-01-04' }), []);
  assert.deepEqual(await queryConciergeEvents(db, request('concerts in Cambridge on 2030-01-20', { neighborhoods: ['Cambridge'] }), 5, { today: '2030-01-04' }), []);

  const matching = await event({});
  await event({ title: 'ISOLATED QA misleading concert title', category: 'lecture' });
  await event({ venue_neighborhood: 'Back Bay' });
  await event({ date: '2030-01-05' });
  const exactDate = await event({ date: '2030-01-20' });
  assert.deepEqual(ids(await queryConciergeEvents(db, tonight, 5, { today: '2030-01-04' })), [matching]);
  assert.deepEqual(ids(await queryConciergeEvents(db, request('concerts in Cambridge on 2030-01-20', { neighborhoods: ['Cambridge'] }), 5, { today: '2030-01-04' })), [exactDate]);
});

test('weekends mean upcoming Friday-Sunday or the remaining current weekend', async t => {
  const { db, event } = await fixture(t);
  for (const date of ['2030-01-03', '2030-01-04', '2030-01-05', '2030-01-06', '2030-01-07', '2030-01-11', '2030-01-12', '2030-01-13']) await event({ date });
  const intent = request('concerts this weekend');
  for (const [today, expected] of [
    ['2029-12-31', ['2030-01-04', '2030-01-05', '2030-01-06']],
    ['2030-01-03', ['2030-01-04', '2030-01-05', '2030-01-06']],
    ['2030-01-04', ['2030-01-04', '2030-01-05', '2030-01-06']],
    ['2030-01-05', ['2030-01-05', '2030-01-06']],
    ['2030-01-06', ['2030-01-06']],
    ['2030-01-07', ['2030-01-11', '2030-01-12', '2030-01-13']],
  ]) assert.deepEqual((await queryConciergeEvents(db, intent, 20, { today })).map(row => row.date), expected, today);
});

test('location uses canonical linked neighborhood/city and source locality only for unlinked events', async t => {
  const { db, event, venue } = await fixture(t);
  const cambridge = await venue({});
  const boston = await venue({ neighborhood: 'Back Bay', city: 'Boston' });
  const linkedMatch = await event({ venue_id: cambridge, venue_neighborhood: 'Back Bay', venue_name: 'ISOLATED QA stale name' });
  const sourceMatch = await event({});
  const linkedBoston = await event({ venue_id: boston, venue_neighborhood: 'Cambridge' });
  await event({ venue_neighborhood: null });
  const intent = request('concerts tonight', { neighborhoods: ['cambridge'] });
  const result = await queryConciergeEvents(db, intent, 20, { today: '2030-01-04' });
  assert.deepEqual(ids(result), [linkedMatch, sourceMatch].sort());
  assert.equal(result.find(row => row.id === linkedMatch).venue_name, 'ISOLATED QA canonical venue');
  assert.equal(result.find(row => row.id === linkedMatch).venue_neighborhood, 'Central Square');
  assert.deepEqual(ids(await queryConciergeEvents(db, { ...intent, neighborhoods: ['Back Bay'] }, 20, { today: '2030-01-04' })), [linkedBoston]);
  assert.deepEqual(ids(await queryConciergeEvents(db, { ...intent, neighborhoods: [], excludedNeighborhoods: ['Boston'] }, 20, { today: '2030-01-04' })), [linkedMatch]);
});

test('public source/venue gate, RSVP privacy and honest booking projection are preserved', async t => {
  const { db, event, venue, user } = await fixture(t);
  const publicId = await event({ event_url: 'https://example.com/isolated-qa-tickets', image_url: 'javascript:alert(1)' });
  for (const changes of [
    { is_active: false }, { source_review_status: 'unreviewed' }, { source_review_status: 'rejected' },
    { source_reviewed_at: null }, { source: 'unsourced' }, { source_url: 'http://example.com/isolated-qa' },
  ]) await event(changes);
  for (const changes of [{ is_active: false }, { business_status: 'CLOSED_PERMANENTLY' }, { business_status: 'temporarily_closed' }]) {
    await event({ venue_id: await venue(changes) });
  }
  for (const [changes, audience, status] of [
    [{}, 'public', 'going'], [{}, 'private', 'going'], [{}, 'friends', 'going'],
    [{ is_private: true }, 'public', 'going'], [{ is_suspended: true }, 'public', 'going'],
    [{ is_active: false }, 'public', 'going'], [{}, 'public', 'interested'],
  ]) await db.query('INSERT INTO event_rsvps VALUES ($1,$2,$3,$4)', [publicId, await user(changes), status, audience]);
  const rows = await queryConciergeEvents(db, request('concerts tonight'), 20, { today: '2030-01-04' });
  assert.deepEqual(ids(rows), [publicId]);
  assert.equal(rows[0].attending_count, 1);
  assert.equal(rows[0].attending_count_source, 'public_scenelink_rsvps');
  assert.equal(rows[0].image_url, null);
  assert.equal(rows[0].rating, null);
  assert.equal(rows[0].is_live, false);
  assert.equal(rows[0].my_rsvp, null);
  assert.equal(rows[0].booking_status, 'not_booked');
  assert.equal(rows[0].booking.status, 'external_link');
  assert.equal(rows[0].booking.reservation_confirmed, false);
  assert.equal(rows[0].rsvp_is_reservation, false);
});

test('unspecified dates cover seven days, category aliases are exact, and limits remain bounded', async t => {
  const { db, event } = await fixture(t);
  const allowed = [];
  for (const [date, category] of [['2030-01-04', 'live_music'], ['2030-01-10', 'Music']]) allowed.push(await event({ date, category }));
  await event({ date: '2030-01-11' });
  await event({ date: '2030-01-03' });
  await event({ category: 'music lecture' });
  await event({ category: null });
  const intent = request('concerts');
  assert.deepEqual(ids(await queryConciergeEvents(db, intent, 5, { today: '2030-01-04' })), allowed.sort());
  assert.equal((await queryConciergeEvents(db, intent, 1, { today: '2030-01-04' })).length, 1);
  for (const limit of [0, -1, 51, 1.5, '5']) await assert.rejects(queryConciergeEvents(db, intent, limit), { code: 'INVALID_EVENT_SEARCH' });
});

test('malformed public context fails before SQL, and user values are always bound', async () => {
  const noQuery = { query: () => assert.fail('invalid context must not reach SQL') };
  for (const intent of [
    { eventWindow: { kind: 'date', date: '2030-02-31' } }, { eventWindow: { kind: 'next_month' } },
    { eventWindow: { kind: 'today', sql: 'injected' } }, { eventKinds: ['lecture OR true'] },
    { eventKinds: 'concert' }, { neighborhoods: ['x'.repeat(101)] }, { neighborhoods: Array(13).fill('Cambridge') },
    { neighborhoods: ['Cambridge\u0000'] }, { venueName: 'x'.repeat(501) },
  ]) await assert.rejects(queryConciergeEvents(noQuery, intent), { code: 'INVALID_EVENT_SEARCH' });
  await assert.rejects(queryConciergeEvents(noQuery, {}, 5, { today: '2030-02-31' }), { code: 'INVALID_EVENT_SEARCH' });
  const injected = "Cambridge') OR true --";
  let captured;
  await queryConciergeEvents({ query: async (sql, values) => { captured = { sql, values }; return { rows: [] }; } }, {
    eventWindow: { kind: 'today' }, eventKinds: ['concert'], neighborhoods: [injected],
  });
  assert.ok(captured.sql.includes(EVENT_TODAY_SQL));
  assert.ok(!captured.sql.includes(injected));
  assert.deepEqual(captured.values[0], [injected.toLowerCase()]);
});
