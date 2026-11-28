'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = readFileSync(require.resolve('../frontend/js/ai-concierge-v5.js'), 'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await pause();
  }
  assert.fail('Expected Concierge interaction did not complete');
}
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const result = extra => ({ ok: true, source: 'rule-based', response: 'TEST ONLY constrained directory results', venues: [], events: [], ...extra });
const wrongVenue = {
  id: '00000000-0000-4000-8000-000000000099', name: 'TEST ONLY Mexican cafe',
  type: 'cafe', cuisine: 'mexican', neighborhood: 'Cambridge', slug: 'test-mexican-cafe',
  metrics_status: 'unverified', booking: { status: 'not_available' }
};
const event = {
  id: '00000000-0000-4000-8000-000000000098', title: 'TEST ONLY reviewed comedy event',
  start_date: '2099-01-01T20:00:00Z', category: 'comedy', venue_name: 'TEST ONLY stage'
};

async function browser(t, opts) {
  const calls = [], errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://scenelink.test/index.html', runScripts: 'outside-only', virtualConsole: console
  });
  const w = dom.window, d = w.document, timer = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms, ...args) => timer(fn, Math.min(ms || 0, 5), ...args);
  w.SLAuth = { getToken: () => opts.signedIn ? 'TEST_ONLY_ACCOUNT_A' : null };
  w.fetch = async (url, req = {}) => {
    assert(String(url).startsWith('/api/'), 'This test permits only intercepted first-party requests');
    const call = { url: String(url), method: req.method || 'GET', body: req.body ? JSON.parse(req.body) : null };
    calls.push(call);
    if (url === '/api/concierge/suggestions') return reply({ suggestions: [] });
    if (url === '/api/concierge/capabilities') return reply({ ai_pilot: opts.signedIn === true });
    if (url === '/api/concierge') return opts.post(calls.filter(x => x.url === '/api/concierge').length - 1, call.body);
    if (String(url).startsWith('/api/events')) return reply({ events: [event] });
    if (String(url).startsWith('/api/venues')) return reply({ venues: [wrongVenue] });
    assert.fail('Unexpected request: ' + url);
  };
  t.after(() => { assert.deepEqual(errors, []); w.close(); });
  w.eval(source);
  await until(() => w.SLConcierge);
  const button = text => [...d.querySelectorAll('button')].find(el => el.textContent.trim() === text);
  const submit = message => {
    w.SLConcierge.draft(message);
    d.querySelector('.slc-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };
  async function settled() {
    await pause();
    await until(() => !d.querySelector('.slc-typing'));
  }
  async function ask(message) { submit(message); await settled(); }
  return { w, d, calls, button, submit, settled, ask, posts: () => calls.filter(x => x.url === '/api/concierge') };
}

for (const failure of ['network', '503']) test('a transient ' + failure + ' failure does not disable later Concierge requests in the same session', async t => {
  const ui = await browser(t, { post: async i => {
    if (i === 0) {
      if (failure === 'network') throw new Error('TEST ONLY temporary disconnect');
      return reply({ error: 'TEST ONLY temporary overload' }, 503);
    }
    return reply(result({ response: 'TEST ONLY recovered canonical response' }));
  } });
  await ui.ask('Restaurants in Back Bay');
  assert.equal(ui.posts().length, 1, 'A failed prompt must not be automatically replayed');
  assert.match(ui.d.querySelector('#slcMessages').textContent, /temporarily unavailable.*try.*again/i);
  assert.equal(ui.calls.filter(x => /\/api\/(venues|events)/.test(x.url)).length, 0,
    'An outage must not start a weaker browser-side directory search');
  if (failure === '503') { ui.w.SLConcierge.close(); ui.w.SLConcierge.open(); }
  await ui.ask('Restaurants in Cambridge');
  assert.equal(ui.posts().length, 2, 'A new explicit prompt must retry the canonical backend without a page reload or auth reset');
  assert.equal(ui.posts()[1].body.ai, false);
  assert.equal(ui.posts()[0].body.session_id, ui.posts()[1].body.session_id);
  assert.match(ui.d.querySelector('#slcMessages').textContent, /recovered canonical response/);
});

test('a failed neighborhood follow-up does not replace retained cuisine and venue-type constraints with unrelated directory cards', async t => {
  const search = { version: 1, neighborhoods: ['Back Bay'], cuisines: ['italian'], venueType: 'restaurant' };
  const ui = await browser(t, { post: async i => {
    if (i === 1) throw new Error('TEST ONLY temporary disconnect on follow-up');
    return reply(result({ search_context: search }));
  } });
  await ui.ask('Italian restaurants in Back Bay');
  await ui.ask('What about Cambridge?');
  assert.deepEqual(ui.posts()[1].body.context.search, search, 'The request still owns the bounded server search context');
  assert.equal(ui.d.querySelectorAll('[data-venue-id="' + wrongVenue.id + '"]').length, 0,
    'An outage must not silently recommend a Mexican cafe for the retained Italian restaurant request');
  assert.match(ui.d.querySelector('#slcMessages').textContent, /unavailable|couldn.t|could not|try again|retry/i,
    'The failed constrained request needs an honest unavailable/retry state');
  await ui.ask('What about Cambridge?');
  assert.equal(ui.posts().length, 3);
  assert.deepEqual(ui.posts()[2].body.context.search, search, 'Explicit retry retains the last successful constraints');
  assert.deepEqual(ui.posts()[2].body.history, [
    { role: 'user', content: 'Italian restaurants in Back Bay' },
    { role: 'assistant', content: 'TEST ONLY constrained directory results' }
  ], 'A failed prompt must not advance or discard the successful conversation history');
});

test('an event outage does not announce upcoming results while dropping every event card', async t => {
  const ui = await browser(t, { post: async i => {
    if (i === 0) throw new Error('TEST ONLY temporary event outage');
    return reply(result({ events: [event] }));
  } });
  await ui.ask('Comedy events this weekend');
  const text = ui.d.querySelector('#slcMessages').textContent;
  const claimsEvents = /what.s coming up in Boston/i.test(text);
  assert(!claimsEvents || ui.d.querySelectorAll('.slc-event-card').length > 0,
    'The current client fallback loads an event but discards cs.events before rendering');
  assert(ui.d.querySelectorAll('.slc-event-card').length > 0 || /unavailable|couldn.t|could not|try again|retry/i.test(text),
    'The interface must render checked results or report that this event search failed');
  await ui.ask('Comedy events this weekend');
  assert.equal(ui.posts().length, 2);
  assert.equal(ui.d.querySelectorAll('.slc-event-card').length, 1);
  assert.match(ui.d.querySelector('.slc-event-card').textContent, /TEST ONLY reviewed comedy event/);
});

test('a failed opted-in prompt still requires fresh per-request consent on recovery', async t => {
  const ui = await browser(t, { signedIn: true, post: async i => {
    if (i === 0) throw new Error('TEST ONLY temporary opted-in outage');
    return reply(result({ response: 'TEST ONLY explicit directory recovery' }));
  } });
  ui.submit('Italian restaurants in Back Bay');
  await until(() => ui.button('Use AI once'));
  assert.equal(ui.posts().length, 0);
  ui.button('Use AI once').click();
  await ui.settled();
  assert.equal(ui.posts().length, 1);
  assert.equal(ui.posts()[0].body.ai, true);
  assert.doesNotMatch(ui.d.querySelector('#slcMessages').textContent, /AI-ranked|Showing SceneLink directory results/,
    'An unavailable request must not claim that AI or directory results were produced');
  ui.submit('What about Cambridge?');
  await ui.settled();
  assert(ui.button('Search directory'), 'A new explicit prompt should obtain current capability and present a fresh consent choice');
  assert.equal(ui.calls.filter(x => x.url === '/api/concierge/capabilities').length, 2);
  assert.equal(ui.posts().length, 1, 'Prior AI consent must not resubmit this new prompt automatically');
  ui.button('Search directory').click();
  await ui.settled();
  assert.equal(ui.posts().length, 2);
  assert.equal(ui.posts()[1].body.ai, false);
});
