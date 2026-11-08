// These mutation suites are only for disposable local databases and fictional users.
export function localTarget(env = process.env) {
  if (env.QA_ISOLATED_DATABASE !== 'true') {
    throw new Error('Set QA_ISOLATED_DATABASE=true only after verifying the server uses a disposable local database and disables external side effects.');
  }
  let url;
  try { url = new URL(env.BASE); } catch {
    throw new Error('BASE must explicitly identify a local test API.');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash
      || !url.port || !['/api', '/api/'].includes(url.pathname)) {
    throw new Error('BASE must be http://127.0.0.1:<port>/api or http://[::1]:<port>/api, without credentials or query parameters.');
  }
  return url.href.replace(/\/$/, '');
}

export function localFetch(base, path, options = {}) {
  const target = new URL(base + path);
  if (!path.startsWith('/') || target.origin !== new URL(base).origin
      || !target.pathname.startsWith('/api/')) {
    throw new Error('QA requests must remain on the configured local API.');
  }
  return fetch(target, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(15000) });
}
