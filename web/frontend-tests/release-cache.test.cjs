'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../frontend');
const tag = 'connected-20261110-3';
const version = 'sl-' + tag;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function filesIn(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    return entry.isDirectory() ? filesIn(path.join(dir, entry.name), relative + '/') : [relative];
  }).sort();
}

test('release marker, service-worker shell and every published asset hash agree', () => {
  const metadata = JSON.parse(read('version.json'));
  assert.equal(metadata.sw_version, version);
  assert.equal(metadata.status, 'local_candidate_not_deployed');
  assert.equal(metadata.requires_paired_backend, true);
  assert.equal(metadata.required_migration, '016_private_list_invitations.sql');
  assert.equal(metadata.rollout_order, 'backend_migrations_and_API_before_frontend');
  assert.equal(metadata.phase, 'integrated-design-lists');
  assert(read('js/sl-version-marker.js').includes("backend_change: 'private-list-invitations-016'"));
  for (const file of ['version.json', 'js/sl-version-marker.js', 'sw.js']) {
    assert(!/social-candidate|paired-local-candidate-required|local_not_deployed/.test(read(file)), file);
  }
  assert(read('js/sl-version-marker.js').includes("sw_version: '" + version + "'"));
  assert(read('js/sl-version-marker.js').includes("deploy: '" + tag + "'"));
  assert(read('js/sl-version-marker.js').includes("built: '" + metadata.timestamp + "'"));
  const worker = read('sw.js');
  assert(worker.includes("const VERSION = '" + version + "'"));
  const shell = worker.match(/const SHELL_URLS = \[([\s\S]*?)\];/)[1];
  const urls = [...shell.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert(urls.length > 20);
  for (const url of urls) {
    assert(fs.existsSync(path.join(root, url.split('?')[0])), url);
    if (/\.(?:js|css)(?:\?|$)/.test(url)) assert(url.endsWith('?v=' + tag), url);
  }
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../frontend-evidence/candidate-sha256.json')));
  assert.deepEqual(Object.keys(manifest).sort(), filesIn(root));
  for (const [file, expected] of Object.entries(manifest)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), expected, file);
    if (/\.(?:html|js|json)$/.test(file)) assert(!read(file).includes('connected-20261108-7'), file);
  }
});

test('service-worker install and activation evict the previous release without removing unrelated caches', async () => {
  const listeners = {}, deleted = [], fetched = [], cached = [], messages = [];
  const current = 'sl-shell-' + version;
  const previous = 'sl-shell-sl-connected-20261108-7';
  const names = new Set([current, previous, 'unrelated-app-cache']);
  let claimed = 0, skipped = 0;
  const context = {
    self: {
      addEventListener: (name, handler) => { listeners[name] = handler; },
      skipWaiting: async () => { skipped++; },
      clients: {
        claim: async () => { claimed++; },
        matchAll: async () => [{ postMessage: value => messages.push(value) }],
      },
    },
    caches: {
      keys: async () => [...names],
      delete: async name => { deleted.push(name); return names.delete(name); },
      open: async name => {
        assert.equal(name, current);
        return { put: async url => cached.push(url) };
      },
    },
    fetch: async (url, options) => { fetched.push(url); assert.equal(options.cache, 'reload'); return { ok: true }; },
  };
  vm.runInNewContext(read('sw.js'), context);
  let completion;
  listeners.install({ waitUntil: promise => { completion = promise; } });
  await completion;
  assert.deepEqual(deleted, [previous]);
  assert.equal(skipped, 1);
  assert.equal(fetched.length, cached.length);
  assert(fetched.includes('/js/sl-social-integration-9a.js?v=' + tag));
  assert(fetched.includes('/js/sl-connected-plans.js?v=' + tag));
  // An old tab may create an old-version runtime cache before activation.
  names.add('sl-runtime-sl-connected-20261108-7');
  listeners.activate({ waitUntil: promise => { completion = promise; } });
  await completion;
  assert.equal(claimed, 1);
  assert.deepEqual([...names].sort(), [current, 'unrelated-app-cache'].sort());
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'SW_UPDATED');
  assert.equal(messages[0].version, version);
});

test('service worker does not cache API requests or mutations in the finalized release', () => {
  const listeners = {};
  vm.runInNewContext(read('sw.js'), {
    URL,
    self: { location: { origin: 'https://scenelink.invalid' }, addEventListener: (name, handler) => { listeners[name] = handler; } },
  });
  for (const request of [
    { method: 'GET', url: 'https://scenelink.invalid/api/notifications' },
    { method: 'GET', url: 'https://scenelink-api-prod.onrender.com/api/rooms' },
    { method: 'POST', url: 'https://scenelink.invalid/api/rooms' },
    { method: 'GET', url: 'https://cdn.invalid/asset.js' },
  ]) {
    listeners.fetch({ request, respondWith: () => assert.fail('unexpected interception: ' + request.url) });
  }
});

test('Netlify build entrypoint generates only its expected public fields in an isolated copy', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scenelink-build-check-'));
  try {
    fs.mkdirSync(path.join(temp, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts/generate-env.js'), path.join(temp, 'scripts/generate-env.js'));
    const deployment = fs.readFileSync(path.resolve(root, '../../netlify.toml'), 'utf8');
    assert(deployment.includes('base = "web/frontend"'));
    assert(deployment.includes('publish = "."'));
    assert(deployment.includes('command = "node scripts/generate-env.js"'));
    execFileSync(process.execPath, ['scripts/generate-env.js'], {
      cwd: temp,
      env: { VITE_ENV: 'test', COMMIT_REF: 'release-cache-fixture', PRIVATE_BUILD_SENTINEL: 'must-not-enter-client-code' },
      stdio: 'pipe',
    });
    const output = fs.readFileSync(path.join(temp, 'env.js'), 'utf8');
    const context = { window: {} };
    vm.runInNewContext(output, context);
    const actual = context.window.__SL_ENV;
    assert.deepEqual(Object.keys(actual).sort(), ['buildTime', 'env', 'gaId', 'release', 'sentryDsn', 'tracesSampleRate']);
    assert.equal(actual.env, 'test');
    assert.equal(actual.release, 'release-cache-fixture');
    assert.equal(actual.gaId, '');
    assert.equal(actual.sentryDsn, '');
    assert(Number.isFinite(Date.parse(actual.buildTime)));
    assert(!output.includes('must-not-enter-client-code'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
