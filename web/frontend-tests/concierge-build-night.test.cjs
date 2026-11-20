'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../frontend/js/ai-concierge-v5.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await tick();
  }
  assert.fail('Concierge interaction did not finish');
}
const venue = (number, name) => ({
  id: '00000000-0000-4000-8000-' + String(number).padStart(12, '0'),
  name: name || 'TEST ONLY venue ' + number, slug: 'fixture-' + number,
  type: number === 1 ? 'restaurant' : 'bar', neighborhood: 'Back Bay',
  rating: null, price_level: null, image_url: null, hours_display: null,
  is_open_now: null, metrics_status: 'unverified', booking: { status: 'not_available' }
});
const payload = rows => ({
  ok: true, source: 'rule-based', response: 'TEST ONLY unsupported copy: reservation confirmed, open until 2 AM.',
  venues: rows, events: [], itinerary: null
});

async function setup(t, respond) {
  const errors = [], calls = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://scenelink.test/index.html', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: console
  });
  const w = dom.window, d = w.document, nativeTimeout = w.setTimeout.bind(w);
  // Advance presentation delays without replacing any Concierge functions.
  w.setTimeout = (fn, ms, ...args) => nativeTimeout(fn, Math.min(ms || 0, 5), ...args);
  w.fetch = async (url, options = {}) => {
    assert(String(url).startsWith('/api/'), 'No provider or live-service calls in this fixture');
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url === '/api/concierge/suggestions') return { ok: true, status: 200, json: async () => ({ suggestions: [] }) };
    if (url !== '/api/concierge') {
      // A failed backend can return broad client-fallback directory results.
      // These must not be promoted into a constrained itinerary segment.
      return { ok: true, status: 200, json: async () => ({ venues: [venue(99, 'TEST ONLY unrelated fallback')] }) };
    }
    const result = await respond(calls.filter(call => call.url === '/api/concierge').length - 1, JSON.parse(options.body));
    if (result instanceof Error) throw result;
    const status = result.status || 200;
    return { ok: status >= 200 && status < 300, status, json: async () => result.data || result };
  };
  t.after(() => { assert.deepEqual(errors, []); w.close(); });
  w.eval(source);
  await until(() => w.SLConcierge);
  const ask = async message => {
    w.SLConcierge.draft(message);
    d.querySelector('.slc-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => !d.querySelector('.slc-typing'));
  };
  const ids = () => Array.from(d.querySelectorAll('.slc-venue-card'), card => card.dataset.venueId);
  return { w, d, calls, ask, ids };
}

test('Build My Night renders actual normalized venueCards without claiming hours or reservations', async t => {
  const rows = [venue(1), venue(2), venue(3)];
  const ui = await setup(t, i => i === 1
    ? { ok: true, source: 'rule-based', reply: 'TEST ONLY legacy envelope', venueCards: [rows[i]] }
    : payload([rows[i]]));
  await ui.ask('Build my night');
  function choose(text) {
    const button = Array.from(ui.d.querySelectorAll('.slc-choice-chips button')).find(b => !b.disabled && b.textContent.includes(text));
    assert(button, 'Expected active choice: ' + text); button.click();
  }
  choose('Lively & social'); choose('Back Bay'); choose('Small group');
  await until(() => ui.calls.filter(c => c.url === '/api/concierge').length === 3 && !ui.d.querySelector('.slc-typing'));
  assert.deepEqual(ui.ids(), rows.map(row => row.id));
  assert.match(ui.d.querySelector('#slcMessages').textContent, /hours.*confirmation|confirm.*hours/i);
  assert.match(ui.d.querySelector('#slcMessages').textContent, /no reservation has been made/i);
  assert.doesNotMatch(ui.d.querySelector('#slcMessages').textContent, /reservation confirmed|open until|2 AM|undefined|TEST ONLY unsupported copy/);
  assert(ui.calls.filter(c => c.url === '/api/concierge').every(c => c.body.message.includes('Back Bay')));
});

for (const scenario of ['empty', 'rate-limit', 'duplicate', 'invalid']) test('Dinner then drinks leaves a ' + scenario + ' segment unfilled and keeps real distinct options', async t => {
  const a = venue(1), c = venue(3);
  const middle = scenario === 'empty' ? payload([])
    : scenario === 'rate-limit' ? { status: 429, data: { reply: 'TEST ONLY retry later' } }
    : scenario === 'invalid' ? payload([null, { name: 'TEST ONLY missing identity' }, { id: 'empty-name', name: '' }])
    : payload([a]);
  const ui = await setup(t, i => [payload([a]), middle, payload([a, c])][i]);
  await ui.ask('Dinner then drinks');
  assert.deepEqual(ui.ids(), [a.id, c.id]);
  assert.equal(ui.d.querySelectorAll('.slc-msg-empty').length, 1);
  assert.match(ui.d.querySelector('#slcMessages').textContent, /partial/i);
  assert.doesNotMatch(ui.d.querySelector('#slcMessages').textContent, /undefined|TEST ONLY missing identity|reservation confirmed|open until/);
  assert.equal(ui.d.querySelectorAll('[aria-label="Add to Plan"]').length, 2);
});

test('backend failure does not turn broad client fallback results into itinerary stops', async t => {
  const a = venue(1);
  const ui = await setup(t, i => i === 0 ? payload([a]) : new Error('TEST ONLY network failure'));
  await ui.ask('Dinner then drinks');
  assert.deepEqual(ui.ids(), [a.id]);
  assert.equal(ui.d.querySelectorAll('.slc-msg-empty').length, 2);
  assert.doesNotMatch(ui.d.querySelector('#slcMessages').textContent, /unrelated fallback|undefined|reservation confirmed|open until/);
});

test('an entirely empty plan does not announce a completed itinerary or saveable stops', async t => {
  const ui = await setup(t, () => payload([]));
  await ui.ask('Dinner then drinks');
  assert.deepEqual(ui.ids(), []);
  assert.equal(ui.d.querySelectorAll('[aria-label="Add to Plan"]').length, 0);
  assert.doesNotMatch(ui.d.querySelector('#slcMessages').textContent, /your itinerary|tap.*add to plan|undefined/i);
  assert.match(ui.d.querySelector('#slcMessages').textContent, /couldn.t.*plan|no venue options/i);
});

test('reset during a pending itinerary discards its results and remaining requests', async t => {
  let complete;
  const ui = await setup(t, () => new Promise(resolve => { complete = resolve; }));
  ui.w.SLConcierge.draft('Dinner then drinks');
  ui.d.querySelector('.slc-input').dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await until(() => complete);
  ui.w.SLConcierge.resetSession(); complete(payload([venue(1)]));
  await tick(); await tick();
  assert.equal(ui.calls.filter(c => c.url === '/api/concierge').length, 1);
  assert.deepEqual(ui.ids(), []);
  assert.equal(ui.d.querySelector('#slcMessages').textContent, '');
});

test('bounded server search context survives the six-turn history window and clears with the session', async t => {
  const search = { neighborhoods: ['Back Bay'], cuisines: ['italian'], venueType: 'restaurant' };
  const ui = await setup(t, () => ({ ...payload([]), search_context: search }));
  await ui.ask('Italian restaurants in Back Bay');
  for (let i = 0; i < 7; i++) await ui.ask('Another option ' + i);
  const posts = ui.calls.filter(c => c.url === '/api/concierge');
  assert.equal(posts[0].body.context.search, undefined);
  assert.deepEqual(posts.at(-1).body.context.search, search);
  assert(posts.at(-1).body.history.length <= 6);
  assert(!posts.at(-1).body.history.some(turn => turn.content === 'Italian restaurants in Back Bay'));
  ui.w.SLConcierge.resetSession();
  await ui.ask('A fresh search');
  const last = ui.calls.filter(c => c.url === '/api/concierge').at(-1);
  assert.equal(last.body.context.search, undefined);
  assert.deepEqual(last.body.history, []);
});

test('an overlapping follow-up waits for the preceding bounded context instead of racing it', async t => {
  const firstSearch = { neighborhoods: ['Back Bay'], cuisines: ['italian'] };
  const nextSearch = { ...firstSearch, priceMax: 2 };
  let completeFirst;
  const ui = await setup(t, i => i === 0
    ? new Promise(resolve => { completeFirst = resolve; })
    : { ...payload([]), search_context: nextSearch });
  function send(message) {
    ui.w.SLConcierge.draft(message);
    ui.d.querySelector('.slc-input').dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  send('Italian restaurants in Back Bay');
  await until(() => completeFirst);
  send('Make it cheaper');
  await tick();
  assert.equal(ui.calls.filter(c => c.url === '/api/concierge').length, 1);
  completeFirst({ ...payload([]), search_context: firstSearch });
  await until(() => ui.calls.filter(c => c.url === '/api/concierge').length === 2 && !ui.d.querySelector('.slc-typing'));
  const followUp = ui.calls.filter(c => c.url === '/api/concierge')[1];
  assert.deepEqual(followUp.body.context.search, firstSearch);
  assert(followUp.body.history.some(turn => turn.content === 'Italian restaurants in Back Bay'));
  await ui.ask('Another option');
  assert.deepEqual(ui.calls.filter(c => c.url === '/api/concierge').at(-1).body.context.search, nextSearch);
});

test('session reset discards stale transport failures and allows a fresh backend attempt', async t => {
  let failOld;
  const ui = await setup(t, i => i === 0
    ? new Promise(resolve => { failOld = resolve; })
    : i === 2 ? new Error('TEST ONLY current-session outage')
    : { ...payload([]), search_context: { neighborhoods: ['Cambridge'] } });
  ui.w.SLConcierge.draft('Old session request');
  ui.d.querySelector('.slc-input').dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await until(() => failOld);
  ui.w.SLConcierge.resetSession();
  failOld(new Error('TEST ONLY stale-session outage'));
  await tick(); await tick();
  await ui.ask('Fresh session request');
  let posts = ui.calls.filter(call => call.url === '/api/concierge');
  assert.equal(posts.length, 2, 'A stale failure must not disable the next session backend');
  assert.notEqual(posts[0].body.session_id, posts[1].body.session_id);
  assert.deepEqual(posts[1].body.history, []);
  assert.equal(posts[1].body.context.search, undefined);

  await ui.ask('Current session outage');
  assert.equal(ui.calls.filter(call => call.url === '/api/concierge').length, 3);
  ui.w.SLConcierge.resetSession();
  await ui.ask('Retry in a fresh session');
  posts = ui.calls.filter(call => call.url === '/api/concierge');
  assert.equal(posts.length, 4, 'Reset must clear a completed session transport failure too');
  assert.deepEqual(posts[3].body.history, []);
  assert.equal(posts[3].body.context.search, undefined);
});
