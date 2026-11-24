'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = name => fs.readFileSync(path.join(__dirname, '../frontend/js', name), 'utf8');
const ME = '00000000-0000-4000-8000-000000000001';
const PEER = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const FRIENDSHIP = '00000000-0000-4000-8000-000000000004';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function profile(overrides = {}) {
  return { user: { id: PEER, username: 'fictional_peer', display_name: 'Fictional peer', bio: 'Shared bio', post_count: 2, friend_count: 1 }, is_me: false, can_view: true, can_message: false, friendship_status: null, ...overrides };
}
async function fixture(t, { payload = profile(), handle, legacy = false, token = 'fictional-session' } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><nav class="nav-right"><button class="sl-auth-trigger">Account</button></nav><button id="outside">Outside</button></body></html>', { url: 'https://scenelink.test/privacy', runScripts: 'outside-only' });
  const w = dom.window, calls = [], toasts = [], timers = new Map(), observers = []; let serial = 0, current = payload;
  Object.defineProperty(w.document, 'readyState', { value: 'complete' });
  w.setTimeout = (fn, ms) => { timers.set(++serial, { fn, ms }); return serial; };
  w.clearTimeout = id => timers.delete(id);
  const Observer = w.MutationObserver;
  w.MutationObserver = class extends Observer { constructor(fn) { super(fn); observers.push(this); } };
  if (token) w.localStorage.setItem('sl_jwt_token', token);
  w.SL_USER = { id: ME }; w.confirm = () => true;
  w.SLToast = (...args) => toasts.push(args);
  w.SLApi = { getToken: () => w.localStorage.getItem('sl_jwt_token') || '', isLoggedIn: () => !!w.SLApi.getToken() };
  for (const method of ['userByIdentifier', 'searchUsers', 'sendFriendRequest', 'acceptFriend', 'declineFriend', 'removeFriend', 'blockUser', 'listBlocked', 'friendsPending']) {
    w.SLApi[method] = async (...args) => {
      calls.push({ method, args });
      const result = handle && handle(method, args);
      if (result !== undefined) return result;
      if (method === 'userByIdentifier') return current;
      if (method === 'searchUsers') return { results: [] };
      if (method === 'listBlocked') return { blocked: [] };
      if (method === 'friendsPending') return { incoming: [], outgoing: [] };
      throw new Error('Unconfigured fictional mutation: ' + method);
    };
  }
  w.eval(source('sl-user-search.js'));
  if (legacy) w.eval(source('sl-phase6e-actions.js'));
  await flush();
  t.after(() => { observers.forEach(o => o.disconnect()); dom.window.close(); });
  return {
    w, calls, toasts, setProfile: p => { current = p; },
    $: selector => w.document.querySelector(selector),
    async open(id = PEER) { w.SLUserSearch.openProfile(id); await flush(); },
    async input(q) { const input = w.document.getElementById('slUSearchInput'); input.value = q; input.dispatchEvent(new w.Event('input', { bubbles: true })); await flush(); },
    async run(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } await flush(); },
    async auth(next, event = 'sl-auth-changed') { if (next) w.localStorage.setItem('sl_jwt_token', next); else w.localStorage.removeItem('sl_jwt_token'); w.dispatchEvent(new w.Event(event)); await flush(); },
    async click(action) { const button = w.document.querySelector('[data-pp-act="' + action + '"]'); assert(button, action + ' must be available'); button.click(); await flush(); }
  };
}

for (const [status, direction, expected] of [['accepted', null, ['remove']], ['pending', 'incoming', ['accept', 'decline']], ['pending', 'outgoing', ['cancel']]]) {
  test('site-wide modal honors canonical ' + status + '/' + direction + ' relationship', async t => {
    const h = await fixture(t, { payload: profile({ friendship_status: { id: FRIENDSHIP, status, direction } }) }); await h.open();
    for (const action of expected) assert(h.$('[data-pp-act="' + action + '"]'));
    assert(!h.$('[data-pp-act=request]')); assert(!h.$('[data-pp-act=message]'));
  });
}
test('message permission, self identity and private counts come from the canonical profile contract', async t => {
  const h = await fixture(t, { payload: profile({ user: { id: PEER, username: 'private_peer', display_name: 'Private fixture', bio: 'PRIVATE BIO', post_count: null, friend_count: null }, can_view: false }) }); await h.open();
  assert(!h.$('#slPPBody').textContent.includes('PRIVATE BIO')); assert(!h.$('.sl-pp-stats')); assert.match(h.$('#slPPBody').textContent, /private/i); assert(!h.$('[data-pp-act=message]'));
  h.setProfile(profile({ can_message: true })); await h.open(); assert(h.$('[data-pp-act=message]')); assert(!h.$('#slPPBody').textContent.includes('Check-ins'));
  h.setProfile(profile({ is_me: true })); await h.open(); assert(!h.$('[data-pp-act=request]')); assert.match(h.$('#slPPBody').textContent, /View my profile/i);
});
test('guest profile provides sign-in entry without friend or message mutation controls', async t => {
  const h = await fixture(t, { token: '', payload: profile({ can_message: true }) }); await h.open();
  assert(!h.$('[data-pp-act=request]')); assert(!h.$('[data-pp-act=message]')); assert(h.$('#slPPBody .sl-auth-trigger'));
});
test('older queries and cleared input cannot replace current search results', async t => {
  const old = deferred(), cleared = deferred();
  const h = await fixture(t, { handle: (method, args) => method === 'searchUsers' ? args[0] === 'old' ? old.promise : args[0] === 'clear' ? cleared.promise : { results: [{ id: PEER, username: 'new', display_name: 'NEW MATCH' }] } : undefined });
  await h.input('old'); await h.run(280); await h.input('new'); await h.run(280); old.resolve({ results: [{ id: OTHER, username: 'old', display_name: 'OLD MATCH' }] }); await flush();
  assert.match(h.$('#slUSearchResults').textContent, /NEW MATCH/); assert(!h.$('#slUSearchResults').textContent.includes('OLD MATCH'));
  await h.input('clear'); await h.run(280); await h.input(''); cleared.resolve({ results: [{ id: PEER, username: 'late', display_name: 'LATE MATCH' }] }); await flush();
  assert.match(h.$('#slUSearchResults').textContent, /at least 2/); assert(!h.$('#slUSearchResults').textContent.includes('LATE MATCH'));
});
test('out-of-order profile reads and closed profile reads cannot restore old identity', async t => {
  const old = deferred(), closing = deferred();
  const h = await fixture(t, { handle: (method, args) => method === 'userByIdentifier' && args[0] === OTHER ? old.promise : method === 'userByIdentifier' && args[0] === 'closing' ? closing.promise : undefined });
  await h.open(OTHER); await h.open(PEER); old.resolve(profile({ user: { id: OTHER, username: 'old', display_name: 'OLD PROFILE' } })); await flush();
  assert.match(h.$('#slPPBody').textContent, /Fictional peer/); assert(!h.$('#slPPBody').textContent.includes('OLD PROFILE'));
  await h.open('closing'); h.$('[data-close=slPublicProfile]').click(); closing.resolve(profile({ user: { id: OTHER, username: 'late', display_name: 'CLOSED PROFILE' } })); await flush();
  assert(!h.$('#slPublicProfile.active')); assert(!h.w.document.body.textContent.includes('CLOSED PROFILE'));
});
for (const event of ['sl-auth-change', 'sl-auth-changed', 'sl-auth-ready']) test(event + ' clears prior-account modal and pending results, including token reuse', async t => {
  const pending = deferred(); const h = await fixture(t, { handle: method => method === 'searchUsers' ? pending.promise : undefined });
  await h.open(); await h.input('fixture'); await h.run(280); await h.auth('', event);
  assert(!h.$('#slPublicProfile.active')); assert(!h.w.document.body.textContent.includes('Shared bio')); assert(!h.$('.sl-usearch-wrap'));
  await h.auth('fictional-session', event); pending.resolve({ results: [{ id: PEER, username: 'old', display_name: 'PRIOR ACCOUNT MATCH' }] }); await flush();
  assert(!h.w.document.body.textContent.includes('PRIOR ACCOUNT MATCH'));
});
test('cross-tab logout immediately clears an open profile', async t => {
  const h = await fixture(t); await h.open(); h.w.localStorage.removeItem('sl_jwt_token'); h.w.dispatchEvent(new h.w.StorageEvent('storage', { key: 'sl_jwt_token', newValue: null })); await flush();
  assert(!h.$('#slPublicProfile.active')); assert(!h.w.document.body.textContent.includes('Shared bio'));
});
for (const [action, response, expected] of [
  ['request', { friendship_id: FRIENDSHIP, status: 'pending', direction: 'outgoing' }, /request.*pending|request sent/i],
  ['request', { friendship_id: FRIENDSHIP, status: 'pending', direction: 'incoming' }, /already.*request.*accept/i],
  ['request', { friendship_id: FRIENDSHIP, status: 'accepted' }, /already friends/i],
  ['accept', { friendship_id: FRIENDSHIP, status: 'accepted' }, /accepted/i],
  ['decline', { friendship_id: FRIENDSHIP, status: 'declined' }, /declined/i],
  ['cancel', { removed: true, user_id: PEER }, /cancelled/i],
  ['remove', { removed: true, user_id: PEER }, /removed/i]
]) test(action + ' confirms canonical outcome ' + JSON.stringify(response), async t => {
  const initial = action === 'accept' || action === 'decline' ? { id: FRIENDSHIP, status: 'pending', direction: 'incoming' } : action === 'cancel' ? { id: FRIENDSHIP, status: 'pending', direction: 'outgoing' } : action === 'remove' ? { id: FRIENDSHIP, status: 'accepted' } : null;
  const h = await fixture(t, { payload: profile({ friendship_status: initial }), handle: method => ['sendFriendRequest', 'acceptFriend', 'declineFriend', 'removeFriend'].includes(method) ? response : undefined });
  await h.open(); await h.click(action); assert(h.toasts.some(x => expected.test(x[0])), 'Expected confirmed outcome, got ' + JSON.stringify(h.toasts));
  assert.equal(h.calls.filter(x => x.method === 'friendsPending').length, 0, 'The displayed request ID is the response target');
  if (['accept', 'decline'].includes(action)) assert.equal(h.calls.find(x => x.method === action + 'Friend').args[0], FRIENDSHIP);
});
for (const [action, response] of [['request', {}], ['request', { friendship_id: FRIENDSHIP, status: 'pending', direction: 'unknown' }], ['accept', { friendship_id: OTHER, status: 'accepted' }], ['decline', { friendship_id: FRIENDSHIP, status: 'accepted' }], ['remove', { removed: true, user_id: OTHER }]]) {
  test('unconfirmed ' + action + ' response never claims success: ' + JSON.stringify(response), async t => {
    const rel = action === 'accept' || action === 'decline' ? { id: FRIENDSHIP, status: 'pending', direction: 'incoming' } : action === 'remove' ? { id: FRIENDSHIP, status: 'accepted' } : null;
    const h = await fixture(t, { payload: profile({ friendship_status: rel }), handle: method => ['sendFriendRequest', 'acceptFriend', 'declineFriend', 'removeFriend'].includes(method) ? response : undefined });
    await h.open(); await h.click(action); assert(!h.toasts.some(x => x[2] === 'success')); assert.match(h.$('#slPPBody').textContent, /did not confirm/i); assert(!h.$('[data-pp-act="' + action + '"]').disabled);
  });
}
test('pending action locks conflicting controls and cannot reopen an old account profile', async t => {
  const pending = deferred(); const h = await fixture(t, { handle: method => method === 'sendFriendRequest' ? pending.promise : undefined });
  await h.open(); const button = h.$('[data-pp-act=request]'); button.click(); button.click(); await flush();
  assert.equal(h.calls.filter(x => x.method === 'sendFriendRequest').length, 1); assert([...h.w.document.querySelectorAll('#slPPBody [data-pp-act]')].every(b => b.disabled));
  await h.auth('replacement-session'); pending.resolve({ friendship_id: FRIENDSHIP, status: 'pending', direction: 'outgoing' }); await flush();
  assert(!h.$('#slPublicProfile.active')); assert.equal(h.calls.filter(x => x.method === 'userByIdentifier').length, 1); assert(!h.toasts.some(x => x[2] === 'success'));
});
test('session change before dispatch cannot send a queued mutation using the replacement account', async t => {
  const h = await fixture(t); await h.open(); h.$('[data-pp-act=request]').click();
  h.w.localStorage.setItem('sl_jwt_token', 'replacement-session'); h.w.dispatchEvent(new h.w.Event('sl-auth-changed')); await flush();
  assert.equal(h.calls.filter(x => x.method === 'sendFriendRequest').length, 0); assert(!h.$('#slPublicProfile.active'));
});
test('a profile response for a different requested account exposes no details or actions', async t => {
  const h = await fixture(t, { payload: profile({ user: { id: OTHER, username: 'wrong_account', display_name: 'WRONG ACCOUNT' } }) }); await h.open(PEER);
  assert(!h.$('#slPPBody').textContent.includes('WRONG ACCOUNT')); assert(!h.$('[data-pp-act]')); assert(h.$('[data-profile-retry]'));
});
test('search rejects malformed success and exposes an explicit retry instead of a false empty state', async t => {
  let fail = true; const h = await fixture(t, { handle: method => method === 'searchUsers' ? fail ? { ok: true } : { results: [] } : undefined });
  await h.input('fixture'); await h.run(280); assert(!h.$('#slUSearchResults').textContent.includes('No users found')); assert.match(h.$('#slUSearchResults').textContent, /could not|failed|unavailable/i);
  fail = false; const retry = h.$('#slUSearchResults button'); assert(retry); retry.click(); await h.run(280); assert.match(h.$('#slUSearchResults').textContent, /No visible matches|No users found/i);
});
test('managed modal owns blocking without stale legacy decoration, confirms target and clears profile', async t => {
  const h = await fixture(t, { legacy: true, handle: method => method === 'blockUser' ? { success: true, blocked_id: PEER } : undefined });
  await h.open(); await h.run(80); assert.equal(h.calls.filter(x => x.method === 'userByIdentifier').length, 1); assert.equal(h.calls.filter(x => x.method === 'listBlocked').length, 0);
  await h.click('block'); assert.deepEqual(h.calls.find(x => x.method === 'blockUser').args, [PEER]); assert(!h.$('#slPublicProfile.active')); assert(!h.w.document.body.textContent.includes('Shared bio')); assert(h.toasts.some(x => /blocked/i.test(x[0]) && x[2] === 'success'));
});
test('keyboard dismissal restores focus and removes profile details', async t => {
  const h = await fixture(t); h.$('#outside').focus(); await h.open(); assert.equal(h.$('#slPublicProfile').getAttribute('role'), 'dialog');
  h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush();
  assert(!h.$('#slPublicProfile.active')); assert.equal(h.w.document.activeElement.id, 'outside'); assert(!h.w.document.body.textContent.includes('Shared bio'));
});
test('signing in from a guest profile hands modal ownership over without trapping page scrolling', async t => {
  const h = await fixture(t, { token: '' }); h.w.SL_CONFIG = {}; h.w.console.log = () => {};
  h.w.fetch = async () => ({ ok: true, json: async () => ({ token: 'fictional-authenticated-session', user: { id: ME, username: 'fictional_self' } }) });
  h.w.eval(source('sl-auth-core.js')); h.w.eval(source('sl-auth-ui.js'));
  h.w.document.body.style.overflow = 'auto'; h.$('#outside').focus(); await h.open();
  h.$('#slPPBody .sl-auth-trigger').click();
  assert(!h.$('#slPublicProfile'), 'Profile must release scroll/focus before auth captures its return state');
  assert(h.$('.sl-auth-overlay.open'));
  await h.w.SLAuth.login('fictional@example.invalid', 'fictional-password');
  h.w.SLAuthUI.close(); await flush();
  assert(!h.$('.sl-auth-overlay.open')); assert.equal(h.w.document.body.style.overflow, 'auto'); assert.equal(h.w.document.activeElement.id, 'outside');
});
