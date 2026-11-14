'use strict';

// Keep raw provider exceptions out of logs: some include the complete ID token.
const NETWORK_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT', 'TimeoutError', 'AbortError',
]);
const UNAVAILABLE_NAMES = new Set([
  'FetchError', 'AbortError', 'TimeoutError', 'JwksError', 'JwksRateLimitError',
]);

function validIdToken(token) {
  return typeof token === 'string' && token.length > 0 && token.length <= 16384;
}

function oauthError(status, code) {
  return Object.assign(new Error(code), { status, code });
}

function providerUnavailable(err) {
  return Boolean(err && (
    NETWORK_CODES.has(err.code) || UNAVAILABLE_NAMES.has(err.name) || err.response ||
    (err.cause && NETWORK_CODES.has(err.cause.code))
  ));
}

async function verifyProvider(operation) {
  try { return await operation(); }
  catch (err) {
    throw oauthError(providerUnavailable(err) ? 503 : 401,
      providerUnavailable(err) ? 'OAUTH_PROVIDER_UNAVAILABLE' : 'OAUTH_TOKEN_INVALID');
  }
}

module.exports = { validIdToken, oauthError, providerUnavailable, verifyProvider };
