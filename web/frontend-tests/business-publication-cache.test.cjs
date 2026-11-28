'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.join(__dirname, '../frontend');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const origin = 'https://scenelink.test';
const marker = 'connected-20261128-real-social-search';
const controller = read('business.html').match(/src="([^"]*js\/sl-business-app\.js[^"]*)"/)[1];

test('pending-review owner UI uses a fresh controller URL with the paired API release', () => {
  const metadata = JSON.parse(read('version.json'));
  assert.equal(controller, '/js/sl-business-app.js?v=' + marker);
  assert.equal(metadata.business_controller_cache_key, marker);
  assert.equal(metadata.requires_paired_backend, true);
  assert.equal(metadata.rollout_order, 'paired_backend_then_frontend');
});

test('a cached previous owner controller cannot replace the pending-review version', async () => {
  const listeners = {};
  const oldURL = origin + '/js/sl-business-app.js?v=connected-20261123-release-acceptance';
  const newURL = new URL(controller, origin).href;
  const cached = new Map([[oldURL, new Response('old-publish-on-create-ui')]]);
  let fetched = 0;
  vm.runInNewContext(read('sw.js'), {
    URL, Response,
    self: {location: {origin}, addEventListener: (name, handler) => {listeners[name] = handler;}},
    caches: {open: async () => ({
      match: async request => cached.get(request.url),
      put: async (request, response) => {cached.set(request.url, response);}
    })},
    fetch: async request => {
      assert.equal(request.url, newURL); fetched++;
      return new Response('pending-review-owner-ui');
    }
  });
  let completion;
  listeners.fetch({request: new Request(newURL), respondWith: promise => {completion = promise;}});
  assert.equal(await (await completion).text(), 'pending-review-owner-ui');
  assert.equal(fetched, 1);
  assert.equal(await cached.get(oldURL).text(), 'old-publish-on-create-ui');
});
