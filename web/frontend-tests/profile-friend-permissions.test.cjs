'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ID = '00000000-0000-4000-8000-000000000001', PEER = '00000000-0000-4000-8000-000000000002';
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
for (const permission of [false, true, undefined]) test('friends and people results use explicit message permission: ' + permission, async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body data-sl-social-profile><main id="slSocialProfile"></main></body></html>', { url: 'https://scenelink.test/profile#friends', runScripts: 'outside-only' });
  const w = dom.window; t.after(() => w.close()); w.localStorage.setItem('sl_jwt_token', 'fictional-session');
  const peer = { id: PEER, username: 'fictional_peer', display_name: 'Fictional friend', can_message: permission, friendship_status: { id: '00000000-0000-4000-8000-000000000003', status: 'accepted' } };
  w.fetch = async url => {
    const route = String(url); let body;
    if (route === '/api/users/me') body = { user: { id: ID, username: 'fictional_self', display_name: 'Fictional self', profile_revision: 1, social_links: [], allow_messages: 'friends' } };
    else if (route === '/api/users/me/achievements') body = { source: 'persisted_scenelink_activity', counts: {}, badges: [], points: null };
    else if (route.startsWith('/api/friends?')) body = { friends: [peer], has_more: false };
    else if (route === '/api/friends/pending') body = { incoming: [], outgoing: [] };
    else if (route.startsWith('/api/users/search')) body = { results: [peer], has_more: false };
    else throw new Error('Unexpected fictional request ' + route);
    return { ok: true, status: 200, json: async () => body };
  };
  for (const name of ['sl-connected-api.js', 'sl-social-profile.js']) w.eval(fs.readFileSync(path.join(__dirname, '../frontend/js', name), 'utf8'));
  await flush();
  assert.equal(!!w.document.querySelector('#slspFriends a[href^="/messages"]'), permission === true);
  w.document.getElementById('slspSearchInput').value = 'fictional'; w.document.getElementById('slspSearchForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.equal(!!w.document.querySelector('#slspSearchResults a[href^="/messages"]'), permission === true);
});
