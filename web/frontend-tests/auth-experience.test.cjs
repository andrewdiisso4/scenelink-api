'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const sourceRoot = process.env.SCENELINK_AUTH_UI_ROOT || path.resolve(__dirname, '../frontend/js');
const source = name => fs.readFileSync(path.join(sourceRoot, name), 'utf8');
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => Promise.withResolvers();
function fixture(t, { core = false } = {}) {
  const dom = new JSDOM('<body><main id="background"><button id="opener">Sign in</button></main><aside id="alreadyInert" inert></aside></body>', {
    url: 'https://scenelink.example.invalid/', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const w = dom.window, calls = [], timers = new Map(); let sequence = 1000;
  w.console.log = () => {};
  w.AbortController = AbortController;
  const nativeTimeout = w.setTimeout.bind(w), nativeClear = w.clearTimeout.bind(w);
  w.setTimeout = (fn, ms) => {
    if ([50, 15000, 400, 500].includes(ms)) { const id = ++sequence; timers.set(id, { fn, ms }); return id; }
    return nativeTimeout(fn, ms);
  };
  w.clearTimeout = id => { timers.delete(id); nativeClear(id); };
  w.SL_CONFIG = {};
  w.fetch = (url, options) => { const pending = deferred(); calls.push({ url, options, ...pending }); return pending.promise; };
  if (core) w.eval(source('sl-auth-core.js'));
  else w.SLAuth = {
    login(...args) { const pending = deferred(); calls.push({ kind: 'login', args, ...pending }); return pending.promise; },
    signup(...args) { const pending = deferred(); calls.push({ kind: 'signup', args, ...pending }); return pending.promise; },
    forgotPassword(...args) { const pending = deferred(); calls.push({ kind: 'forgot', args, ...pending }); return pending.promise; }
  };
  w.eval(source('sl-auth-ui.js'));
  const q = selector => w.document.querySelector(selector);
  const open = mode => { q('#opener').focus(); w.SLAuthUI.open(mode); };
  const fill = (mode, overrides = {}) => {
    const form = q('[data-form="' + mode + '"]');
    const values = { email: 'person@example.invalid', password: 'fictional-password', display_name: 'Casey', username: 'casey_test', ...overrides };
    for (const [name, value] of Object.entries(values)) { const input = form.elements.namedItem(name); if (input) input.value = value; }
    return form;
  };
  const submit = form => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const fire = ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } };
  return { w, q, open, fill, submit, calls, timers, fire };
}

test('password controls preserve values and closing clears secrets while restoring background and focus', t => {
  const f = fixture(t); f.w.document.body.style.overflow = 'auto'; f.open();
  const password = f.q('#slLoginPassword'); password.value = 'fictional-secret';
  const toggle = f.q('[data-password-toggle="slLoginPassword"]'); assert(toggle, 'Visible password control');
  toggle.click(); assert.equal(password.type, 'text'); assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(password.value, 'fictional-secret');
  assert.equal(f.q('#background').hasAttribute('inert'), true);
  f.w.SLAuthUI.close();
  assert.equal(password.value, ''); assert.equal(password.type, 'password');
  assert.equal(f.q('#background').hasAttribute('inert'), false);
  assert.equal(f.q('#alreadyInert').hasAttribute('inert'), true);
  assert.equal(f.w.document.body.style.overflow, 'auto');
  assert.equal(f.w.document.activeElement, f.q('#opener'));
});

for (const mode of ['login', 'signup']) test(mode + ' rejects malformed email before any request, with field focus and accessible error', t => {
  const f = fixture(t); f.open(mode); const form = f.fill(mode, { email: 'not-an-email' }); f.submit(form);
  assert.equal(f.calls.length, 0);
  const input = form.elements.namedItem('email');
  assert.equal(input.getAttribute('aria-invalid'), 'true'); assert.equal(f.w.document.activeElement, input);
  assert.match(input.getAttribute('aria-describedby'), /slAuthError/);
  assert.match(f.q('[data-sl-error]').textContent, /valid email/);
  input.value = 'fixed@example.invalid'; input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(input.hasAttribute('aria-invalid'), false);
});

test('signup enforces the server UTF-8 password limit without a request', t => {
  const f = fixture(t); f.open('signup'); const form = f.fill('signup', { password: 'é'.repeat(37) }); f.submit(form);
  assert.equal(f.calls.length, 0); assert.equal(form.elements.namedItem('password').getAttribute('aria-invalid'), 'true');
});

test('keyboard navigation contains focus and selects account tabs with the correct active panel', t => {
  const f = fixture(t); f.open(); f.fire(50);
  const close = f.q('.sl-auth-close'), last = f.q('[data-action="forgot"]');
  close.focus(); close.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(f.w.document.activeElement, last);
  last.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(f.w.document.activeElement, close);
  const login = f.q('[data-tab="login"]'); login.focus();
  login.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); f.fire(50);
  const signup = f.q('[data-tab="signup"]');
  assert.equal(signup.getAttribute('aria-selected'), 'true'); assert.equal(signup.tabIndex, 0);
  assert.equal(login.getAttribute('aria-selected'), 'false'); assert.equal(login.tabIndex, -1);
  assert.equal(f.w.document.activeElement, signup);
  assert.equal(f.q('[data-form="login"]').hidden, true); assert.equal(f.q('[data-form="signup"]').hidden, false);
  signup.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(f.q('.sl-auth-overlay').classList.contains('open'), false);
});

test('forgot-password transition carries the entered email and excludes hidden account tabs from focus', t => {
  const f = fixture(t); f.open(); f.q('#slLoginEmail').value = 'casey@example.invalid';
  f.q('[data-action="forgot"]').click(); f.fire(50);
  assert.equal(f.q('#slRecoveryEmail').value, 'casey@example.invalid');
  assert.equal(f.q('[data-sl-tabs]').hidden, true);
  assert.equal(f.w.document.activeElement, f.q('#slRecoveryEmail'));
  assert.equal(f.calls.length, 0);
});

for (const result of [{}, { ok: false }, { ok: 'true' }, { ok: true }]) test('recovery uses an explicit server confirmation: ' + JSON.stringify(result), async t => {
  const f = fixture(t, { core: true }); f.open('forgot'); const form = f.fill('forgot'); f.submit(form); await tick();
  assert.equal(f.calls.length, 1); assert.match(f.calls[0].url, /\/auth\/forgot-password$/);
  f.calls[0].resolve({ ok: true, json: async () => result }); await tick();
  assert.equal(form.querySelector('.sl-auth-submit').disabled, false);
  assert.equal(f.q('[data-sl-success]').classList.contains('show'), result.ok === true);
  assert.equal(f.q('[data-sl-error]').classList.contains('show'), result.ok !== true);
  assert.equal(f.w.SLAuth.isAuthed(), false);
});

test('email request is single-flight, exposes busy state, and recovers honestly from a failed request', async t => {
  const f = fixture(t); f.open(); const form = f.fill('login'); f.submit(form); f.submit(form);
  assert.equal(f.calls.length, 1); assert.equal(form.getAttribute('aria-busy'), 'true');
  f.calls[0].reject(new Error('Network unavailable')); await tick();
  assert.equal(form.hasAttribute('aria-busy'), false); assert.equal(form.querySelector('.sl-auth-submit').disabled, false);
  assert.match(f.q('[data-sl-error]').textContent, /Network unavailable/);
  assert.equal(form.elements.namedItem('email').value, 'person@example.invalid');
  assert.equal(f.q('[data-sl-success]').classList.contains('show'), false);
});

test('a synchronous sign-in failure restores the usable form', async t => {
  const f = fixture(t); f.w.SLAuth.login = () => { throw new Error('Sign-in unavailable'); };
  f.open(); const form = f.fill('login'); f.submit(form); await tick();
  assert.equal(form.querySelector('.sl-auth-submit').disabled, false);
  assert.match(f.q('[data-sl-error]').textContent, /Sign-in unavailable/);
});

test('stalled login times out, aborts, and cannot install a later arriving session', async t => {
  const f = fixture(t, { core: true }); f.open(); const form = f.fill('login'); f.submit(form);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.credentials, 'omit'); assert.equal(f.calls[0].options.cache, 'no-store');
  f.fire(15000); await tick();
  assert.equal(f.calls[0].options.signal.aborted, true);
  assert.equal(form.querySelector('.sl-auth-submit').disabled, false);
  assert.match(f.q('[data-sl-error]').textContent, /too long/);
  f.calls[0].resolve({ ok: true, json: async () => ({ token: 'late-fixture', user: { id: 'late-person' } }) }); await tick();
  assert.equal(f.w.SLAuth.token(), ''); assert.equal(f.w.SLAuth.user(), null);
});

test('auth timeout includes a response body that never completes', async t => {
  const f = fixture(t, { core: true }), body = deferred();
  const pending = f.w.SLAuth.login('casey@example.invalid', 'fictional-password');
  f.calls[0].resolve({ ok: true, json: () => body.promise }); await tick();
  const rejected = assert.rejects(pending, error => error.code === 'AUTH_TIMEOUT'); f.fire(15000); await rejected;
  body.resolve({ token: 'late-body', user: { id: 'late-person' } }); await tick();
  assert.equal(f.w.SLAuth.token(), '');
});

for (const body of [{ token: 'token-only' }, { token: 7, user: { id: 'person' } }, { token: 'token', user: {} }]) {
  test('malformed account response cannot report a successful session: ' + JSON.stringify(body), async t => {
    const f = fixture(t, { core: true }); const pending = f.w.SLAuth.login('casey@example.invalid', 'fictional-password');
    f.calls[0].resolve({ ok: true, json: async () => body }); await assert.rejects(pending, /could not be confirmed/);
    assert.equal(f.w.SLAuth.token(), ''); assert.equal(f.w.localStorage.getItem('sl_user_cache'), null);
  });
}

test('unavailable browser storage does not produce a false sign-in success', async t => {
  const f = fixture(t, { core: true });
  const original = f.w.Storage.prototype.setItem;
  f.w.Storage.prototype.setItem = function () { throw new Error('Storage disabled'); };
  t.after(() => { f.w.Storage.prototype.setItem = original; });
  const pending = f.w.SLAuth.login('casey@example.invalid', 'fictional-password');
  f.calls[0].resolve({ ok: true, json: async () => ({ token: 'fixture', user: { id: 'person' } }) });
  await assert.rejects(pending, /Allow site storage/);
  assert.equal(f.w.SLAuth.isAuthed(), false); assert.equal(f.w.SLAuth.user(), null);
});
