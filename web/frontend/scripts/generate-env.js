#!/usr/bin/env node
/**
 * Writes /env.js at Netlify build time from environment variables.
 * Values are READ from Netlify env (never committed).
 * Safe to ship to browser: Sentry frontend DSN and GA4 Measurement ID are
 * public identifiers by design (they live in the browser anyway).
 */
const fs = require('fs');
const path = require('path');

const env = {
  sentryDsn: process.env.VITE_SENTRY_DSN || '',
  env: process.env.VITE_ENV || 'production',
  gaId: process.env.VITE_GA_MEASUREMENT_ID || '',
  tracesSampleRate: parseFloat(process.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  release: process.env.COMMIT_REF || process.env.VITE_RELEASE || 'dev',
  buildTime: new Date().toISOString(),
};

const out = `/* Auto-generated at build time. Do not edit. */
window.__SL_ENV = ${JSON.stringify(env, null, 2)};
`;

const outPath = path.join(__dirname, '..', 'env.js');
fs.writeFileSync(outPath, out, 'utf8');

// Never log DSN values. Only log which keys are present.
const report = Object.keys(env).reduce((acc, k) => {
  const v = env[k];
  acc[k] = v ? (typeof v === 'string' && v.length > 10 ? `<set:${v.length}>` : v) : '<empty>';
  return acc;
}, {});
console.log('[generate-env] wrote', outPath);
console.log('[generate-env] keys:', report);