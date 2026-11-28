'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const token = 'a'.repeat(64);
const tick = () => new Promise(setImmediate);
async function fixture(t, page) {
  const html = fs.readFileSync(path.join(root, page + '.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://scenelink.example.invalid/' + page + '.html#token=' + token, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, calls = [], timers = [];
  w.TextEncoder = TextEncoder; w.AbortController = AbortController;
  w.setTimeout = (fn, ms) => { assert.equal(ms, 15000); timers.push(fn); return timers.length; }; w.clearTimeout = () => {};
  w.fetch = (url, options) => { const pending = Promise.withResolvers(); calls.push({ url, options, ...pending }); return pending.promise; };
  const script = page === 'verify-email' ? 'sl-email-verification.js' : 'sl-reset-password.js';
  w.eval(fs.readFileSync(path.join(root, 'js', script), 'utf8')); await tick();
  const q = selector => w.document.querySelector(selector);
  const submit = () => {
    if (page === 'verify-email') q('#verifySubmit').click();
    else { q('#newPassword').value = 'fictional-new-password'; q('#confirmPassword').value = 'fictional-new-password'; q('#resetForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
  };
  return { w, q, calls, timers, submit, status: () => q(page === 'verify-email' ? '#verifyStatus' : '#resetStatus') };
}

for (const page of ['reset-password', 'business-reset-password', 'verify-email']) {
  test(page + ': success requires a confirmed server response and remains a single explicit operation', async t => {
    const f = await fixture(t, page); assert.equal(f.w.location.hash, ''); assert.equal(f.calls.length, 0);
    f.submit(); f.submit(); await tick(); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].options.credentials, 'omit'); assert.equal(f.calls[0].options.referrerPolicy, 'no-referrer');
    f.calls[0].resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }); await tick();
    assert.equal(f.status().dataset.kind, 'success'); f.submit(); await tick(); assert.equal(f.calls.length, 1);
  });
  test(page + ': empty or malformed success payload is not shown as account confirmation', async t => {
    const f = await fixture(t, page); f.submit(); await tick();
    f.calls[0].resolve({ ok: true, status: 200, json: async () => ({}) }); await tick();
    assert.equal(f.status().dataset.kind, 'error'); assert.match(f.status().textContent, /could not be confirmed/);
    assert.equal(f.q(page === 'verify-email' ? '#verifySubmit' : '#resetSubmit').disabled, false);
  });
  test(page + ': timeout restores a usable state and a late response cannot claim success', async t => {
    const f = await fixture(t, page); f.submit(); await tick();
    assert.equal(f.timers.length, 1); f.timers[0](); await tick();
    assert.equal(f.calls[0].options.signal.aborted, true); assert.equal(f.status().dataset.kind, 'error');
    assert.equal(f.q(page === 'verify-email' ? '#verifySubmit' : '#resetSubmit').disabled, false);
    f.calls[0].resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }); await tick();
    assert.equal(f.status().dataset.kind, 'error');
  });
}

test('reset password visibility controls are labeled, preserve content, and disable while saving', async t => {
  const f = await fixture(t, 'reset-password'); const input = f.q('#newPassword'), toggle = f.q('[data-password-toggle="newPassword"]');
  input.value = 'fictional-secret'; toggle.click(); assert.equal(input.type, 'text'); assert.equal(input.value, 'fictional-secret');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true'); toggle.click(); assert.equal(input.type, 'password');
  f.submit(); assert.equal(toggle.disabled, true); await tick();
  f.calls[0].resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }); await tick();
  assert.equal(input.value, ''); assert.equal(toggle.disabled, true);
});

test('recovery and verification pages share branding and load token scrubbing before all assets', () => {
  for (const page of ['reset-password', 'business-reset-password', 'verify-email']) {
    const html = fs.readFileSync(path.join(root, page + '.html'), 'utf8');
    assert.match(html, /class="sl-account-entry"/); assert.match(html, /sl-account-entry\.css/);
    assert.match(html, /images\/brand\/scenelink-full\.png/);
    assert(!/sl-bundle|sl-observability|sl-analytics/.test(html), 'Sensitive page stays isolated');
    assert(html.indexOf('<script') < html.indexOf('<link'), 'URL scrubber executes before styles and images');
  }
});
