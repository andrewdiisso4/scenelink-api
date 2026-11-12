'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validIdToken, verifyProvider } = require('../src/services/oauth-errors');

test('ID tokens must be nonempty bounded strings before reaching a provider', () => {
  for (const token of [undefined, null, {}, [], 42, '', 'x'.repeat(16385)]) assert.equal(validIdToken(token), false);
  assert.equal(validIdToken('fictional-token'), true);
  assert.equal(validIdToken('x'.repeat(16384)), true);
});

test('provider verification preserves its successful result', async () => {
  const fixture = { sub: 'fictional-subject' };
  assert.equal(await verifyProvider(async () => fixture), fixture);
});

for (const source of [
  new Error('malformed token secret-sentinel'),
  Object.assign(new Error('signature secret-sentinel'), { name: 'JsonWebTokenError' }),
  Object.assign(new Error('expired secret-sentinel'), { name: 'TokenExpiredError' }),
  Object.assign(new Error('unknown key secret-sentinel'), { name: 'SigningKeyNotFoundError' }),
]) test(`invalid provider credential ${source.name} is a sanitized 401`, async () => {
  await assert.rejects(verifyProvider(async () => { throw source; }), err => {
    assert.equal(err.status, 401); assert.equal(err.code, 'OAUTH_TOKEN_INVALID');
    assert.doesNotMatch(String(err), /secret-sentinel/); return true;
  });
});

for (const extra of [
  ...['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','TimeoutError','AbortError'].map(code => ({code})),
  ...['FetchError','AbortError','TimeoutError','JwksError','JwksRateLimitError'].map(name => ({name})),
  { response: { status: 503 } }, { cause: { code: 'ECONNRESET' } },
]) test(`provider outage ${JSON.stringify(extra)} is a sanitized 503`, async () => {
  const source = Object.assign(new Error('upstream secret-sentinel'), extra);
  await assert.rejects(verifyProvider(async () => { throw source; }), err => {
    assert.equal(err.status, 503); assert.equal(err.code, 'OAUTH_PROVIDER_UNAVAILABLE');
    assert.doesNotMatch(String(err), /secret-sentinel/); return true;
  });
});
