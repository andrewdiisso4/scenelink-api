import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { localTarget, localFetch } from './local-target.mjs';

test('mutation suites require explicit isolation acknowledgement and target', () => {
  assert.throws(() => localTarget({}));
  assert.throws(() => localTarget({ BASE: 'http://127.0.0.1:3001/api' }));
  assert.throws(() => localTarget({ QA_ISOLATED_DATABASE: 'true' }));
  for (const BASE of ['https://scenelink-api-prod.onrender.com/api', 'http://example.com:3001/api',
    'http://localhost:3001/api', 'http://127.0.0.1:3001/api?next=production',
    'http://user:pass@127.0.0.1:3001/api', 'http://127.0.0.1:3001/api#x',
    'http://127.0.0.1/api', 'http://127.0.0.1:3001/other']) {
    assert.throws(() => localTarget({ BASE, QA_ISOLATED_DATABASE: 'true' }));
  }
  for (const BASE of ['http://127.0.0.1:3001/api/', 'http://[::1]:3001/api']) {
    assert.equal(localTarget({ BASE, QA_ISOLATED_DATABASE: 'true' }), BASE.replace(/\/$/, ''));
  }
});

test('both CLI suites reject missing or remote targets before signup', () => {
  for (const script of ['phase9a-social-api-smoke.mjs', 'phase9a-social-e2e.mjs']) {
    for (const BASE of ['', 'https://scenelink-api-prod.onrender.com/api']) {
      const result = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname], {
        env: { ...process.env, BASE, QA_ISOLATED_DATABASE: 'true' }, encoding: 'utf8', timeout: 5000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /BASE must/);
      assert.doesNotMatch(result.stdout, /signup|Social API Smoke @|Social E2E @/);
    }
  }
});

test('local requests succeed but redirects cannot send mutations elsewhere', async () => {
  let destinationHits = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/redirect') { res.writeHead(307, { Location: '/api/destination' }); res.end(); }
    else { if (req.url === '/api/destination') destinationHits++; res.end('ok'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = localTarget({ BASE: `http://127.0.0.1:${server.address().port}/api`, QA_ISOLATED_DATABASE: 'true' });
    assert.equal(await (await localFetch(base, '/health')).text(), 'ok');
    await assert.rejects(localFetch(base, '/redirect', { method: 'POST', body: 'fictional', redirect: 'follow' }));
    assert.equal(destinationHits, 0);
    assert.throws(() => localFetch(base, '/../outside'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
