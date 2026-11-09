'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('homepage menu reserves its own row after search at the shared mobile breakpoint', () => {
  const css = read('css/sl-phase8f-polish.css').split('/* The homepage has its own header:')[1];
  assert(css.includes('@media (max-width: 860px)'));
  assert(!css.includes('.sl-phase8-actions .sl-phase8-btn.dark'), 'Do not extend legacy <=760px guest login hiding to tablet widths');
  assert(css.includes('grid-template-areas: "brand actions" "search search" "links links"'));
  assert(css.includes('grid-area: links; position: static; display: none'));
  assert(css.includes('.sl-phase8-links.open { display: flex; }'));
  assert(css.includes('overflow-y: auto; overscroll-behavior: contain'));
  assert(css.includes('min-height: 44px; box-sizing: border-box; flex-shrink: 0'));
  assert(css.includes(':has(.sl-phase8-links.open) .slus-panel { display: none; }'));
});

test('real homepage menu supports repeated toggles, Escape, link and outside dismissal', async () => {
  const doc = new JSDOM(read('index.html'), { url: 'https://scenelink.test/', runScripts: 'outside-only' });
  const w = doc.window;
  // Disconnect observers before jsdom teardown, just as unloading a browser document would.
  const observers = [], Observer = w.MutationObserver;
  w.MutationObserver = class extends Observer { constructor(callback) { super(callback); observers.push(this); } };
  // No network or production interactions. These two scripts own menu interaction.
  w.fetch = async () => ({ ok: true, text: async () => '{"venues":[]}' });
  await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  w.eval(read('js/sl-phase8d-recovery.js'));
  w.eval(read('js/sl-phase8-completion.js'));
  const button = w.document.querySelector('[data-phase8-menu]');
  const links = w.document.getElementById('phase8NavLinks');
  try {
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('aria-controls'), links.id);
    for (let repeat = 0; repeat < 3; repeat++) {
      button.click(); assert(links.classList.contains('open'));
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      button.click(); assert(!links.classList.contains('open'));
      assert.equal(button.getAttribute('aria-expanded'), 'false');
    }
    button.click();
    links.querySelector('a').focus();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!links.classList.contains('open'));
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(w.document.activeElement, button);
    button.click();
    links.querySelector('a').addEventListener('click', event => event.preventDefault());
    links.querySelector('a').click(); assert(!links.classList.contains('open'));
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    button.click(); w.document.querySelector('main').click(); assert(!links.classList.contains('open'));
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(w.location.href, 'https://scenelink.test/');
  } finally { observers.forEach(observer => observer.disconnect()); w.close(); }
});

test('provider badge lane shifts only app controls and preserves the iframe', () => {
  const css = read('css/sl-phase8f-polish.css').split('/* The provider\'s 64px badge')[1];
  assert(css.includes('@media (max-width: 860px)'));
  assert(css.includes('body:has(iframe#nl-badge-frame) .sl-bottom-tabs { bottom: 80px !important; }'));
  assert(css.includes('padding-bottom: calc(144px + env(safe-area-inset-bottom, 0px))'));
  assert(!/iframe#nl-badge-frame\s*\{/.test(css));
  assert(!/(visibility|pointer-events|z-index|display)\s*:/.test(css));
});
