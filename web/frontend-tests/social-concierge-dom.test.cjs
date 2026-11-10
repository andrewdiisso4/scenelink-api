'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const status of [200, 429]) test(`Social Ask AI preserves styled interaction and ${status === 200 ? 'responses' : 'retry feedback'}`, async t => {
  const errors = [], calls = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(read('social-feed.html'), {
    url: 'https://scenelink.test/social-feed', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window, doc = w.document;
  t.after(() => w.close());
  let complete;
  w.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    assert(String(url).startsWith('/api/'), 'fixture must never use a live service');
    if (url === '/api/concierge/suggestions') return new Response('{"suggestions":[]}');
    assert.equal(url, '/api/concierge');
    return new Promise(resolve => { complete = () => resolve(new Response(JSON.stringify(
      status === 200 ? { ok: true, reply: 'TEST ONLY catalog response', venueCards: [] }
        : { reply: 'TEST ONLY retry in a moment' }
    ), { status, headers: { 'Content-Type': 'application/json' } })); });
  };
  w.eval(read('js/sl-phase8d-recovery.js'));
  await tick(0);
  assert.equal(doc.querySelectorAll('.sl-concierge-panel,.sl-concierge-fab').length, 0);
  const trigger = doc.querySelector('[data-ai-concierge-nav][data-sl-concierge]');
  trigger.click();
  const script = doc.querySelector('script[src*="ai-concierge-v5.js"]');
  assert(script);
  // JSDOM has no automatic resource loading. Load only the exact local CSS and
  // script requested by the shared handler; API replies above are test-only.
  for (const link of doc.querySelectorAll('link[href*="ai-concierge"]')) {
    const style = doc.createElement('style');
    style.textContent = read(new URL(link.href).pathname.slice(1));
    doc.head.appendChild(style);
  }
  w.eval(read('js/ai-concierge-v5.js'));
  script.dispatchEvent(new w.Event('load'));
  const panel = doc.querySelector('.sl-concierge-panel');
  assert(panel.classList.contains('slc-panel-visible'));
  assert.equal(w.getComputedStyle(panel).position, 'fixed');
  assert.equal(w.getComputedStyle(panel).opacity, '1');
  assert.match(panel.textContent, /venues listed on SceneLink/);
  assert.doesNotMatch(panel.textContent, /I know every bar, restaurant and venue in Boston/);
  await tick(320);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  assert.equal(JSON.parse(calls.find(call => call.options.method === 'POST').options.body).message, trigger.getAttribute('data-sl-concierge'));
  assert(panel.querySelector('.slc-typing'), 'loading feedback remains visible while waiting');
  complete();
  await tick(650);
  assert.equal(panel.querySelector('.slc-typing'), null);
  assert.match(panel.textContent, status === 200 ? /TEST ONLY catalog response/ : /TEST ONLY retry in a moment/);
  assert.equal(panel.querySelectorAll('.slc-venue-card').length, 0, 'empty responses never become invented venues');
  for (let repeat = 0; repeat < 2; repeat++) {
    panel.querySelector('.slc-close').click();
    assert.equal(w.getComputedStyle(panel).opacity, '0');
    assert.equal(w.getComputedStyle(panel).pointerEvents, 'none');
    doc.querySelector('.sl-concierge-fab').click();
    assert.equal(w.getComputedStyle(panel).opacity, '1');
    assert.equal(doc.querySelectorAll('.sl-concierge-panel').length, 1);
  }
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(w.getComputedStyle(panel).opacity, '0');
  assert.deepEqual(errors, []);
});
