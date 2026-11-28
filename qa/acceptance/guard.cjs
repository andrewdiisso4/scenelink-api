'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const ENVIRONMENT_ID = 'scenelink-release-qa-20261123';
const DATABASE_PATTERN = /^scenelink_release_qa_20261123(?:_[a-z0-9]{1,16})?$/;
const refuse = reason => { throw new Error('Acceptance refused: ' + reason); };

function validateEnvironment(env, root) {
  if (env.ACCEPTANCE_MODE !== 'isolated-synthetic' || env.ACCEPTANCE_ENVIRONMENT_ID !== ENVIRONMENT_ID) refuse('explicit isolated environment required');
  if (fs.existsSync(path.join(root, '.env')) || fs.existsSync(path.join(process.cwd(), '.env'))) refuse('.env files are not permitted');
  if (!DATABASE_PATTERN.test(env.ACCEPTANCE_DB_NAME || '')) refuse('dedicated QA database name required');
  let db;
  try { db = new URL(env.DATABASE_URL); } catch { refuse('invalid database target'); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname || db.hostname !== env.ACCEPTANCE_DB_HOST
      || db.pathname !== '/' + env.ACCEPTANCE_DB_NAME || db.search || db.hash || /[?#]/.test(env.DATABASE_URL)
      || /(?:^|[.-])prod(?:uction)?(?:[.-]|$)/i.test(db.hostname)) refuse('database must match the dedicated host and name, without URL overrides');
  const local = env.NODE_ENV === 'test';
  if (local) {
    if (!['127.0.0.1', '[::1]'].includes(db.hostname) || !db.port) refuse('local smoke requires literal loopback and an explicit database port');
  } else if (env.NODE_ENV !== 'production' || !/^scenelink-release-qa-20261123(?:-[a-z0-9-]{1,48})?$/.test(env.RENDER_SERVICE_NAME || '')
      || ['127.0.0.1', '[::1]', 'localhost'].includes(db.hostname)) refuse('dedicated Render QA service required');
  let origin;
  try { origin = new URL(env.ACCEPTANCE_PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL); } catch { refuse('explicit QA public origin required'); }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
      || (!local && origin.protocol !== 'https:')
      || (local && (origin.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(origin.hostname) || !origin.port))
      || /(^|\.)scenelink\.app$/i.test(origin.hostname)
      || /(?:^|[.-])prod(?:uction)?(?:[.-]|$)/i.test(origin.hostname)) refuse('isolated public origin required');
  if (!local && (!/^[0-9a-f]{40}$/i.test(env.RENDER_GIT_COMMIT || '')
      || !/^scenelink-release-qa-20261123(?:-[a-z0-9-]{1,48})?\.onrender\.com$/.test(origin.hostname))) refuse('dedicated Render origin and source commit required');
  for (const name of ['JWT_SECRET', 'ACCEPTANCE_ACCESS_SECRET']) {
    if (typeof env[name] !== 'string' || Buffer.byteLength(env[name]) < 32 || /change.?me|replace.?me|placeholder/i.test(env[name])) refuse('generated secrets are required');
  }
  const passwordBytes = Buffer.byteLength(env.ACCEPTANCE_FIXTURE_PASSWORD || '');
  if (passwordBytes < 20 || passwordBytes > 72) refuse('fixture password must contain 20–72 UTF-8 bytes');
  if (new Set([env.JWT_SECRET, env.ACCEPTANCE_ACCESS_SECRET, env.ACCEPTANCE_FIXTURE_PASSWORD]).size !== 3) refuse('gate, account and JWT credentials must be separate');
  const port = Number(env.PORT || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) refuse('invalid listening port');
  const bindHost = local ? (db.hostname === '[::1]' ? '::1' : '127.0.0.1') : '0.0.0.0';
  return {root, environmentId: ENVIRONMENT_ID, databaseName: env.ACCEPTANCE_DB_NAME,
    databaseHost: db.hostname, connectionString: env.DATABASE_URL, local, origin: origin.origin,
    port, bindHost, accessSecret: env.ACCEPTANCE_ACCESS_SECRET, fixturePassword: env.ACCEPTANCE_FIXTURE_PASSWORD,
    sourceCommit: env.RENDER_GIT_COMMIT || 'local-unpublished',
    binding: createHash('sha256').update(ENVIRONMENT_ID + '\n' + db.hostname + '\n' + env.ACCEPTANCE_DB_NAME).digest('hex')};
}

function disableExternalServices(env, config) {
  for (const key of Object.keys(env)) {
    if (/^(SMTP_|OPENAI_|GOOGLE_|APPLE_|APNS_|FCM_|CLOUDINARY_|SENTRY_|TICKETMASTER_|RESEND_|SENDGRID_|MAILGUN_)/.test(key)
        || ['ADMIN_SECRET', 'ADMIN_NOTIFY_EMAIL', 'CONTACT_FORWARD_TO', 'RUN_ALL_SQL_MIGRATIONS'].includes(key)) delete env[key];
  }
  Object.assign(env, {EMAIL_PROVIDER:'disabled', ALLOW_DEMO_SEED:'false', FORCE_RESEED:'false',
    ENABLE_PROVIDER_FETCH:'false', CONCIERGE_AI_PILOT_ENABLED:'false', CONCIERGE_AI_PILOT_USER_IDS:'',
    SCENELINK_ALLOW_LOCAL_IMPORT:'no', SCENELINK_CORRECTIONS_LOCAL_ONLY:'no',
    APP_BASE_URL:config.origin, CORS_ORIGINS:config.origin, FROM_EMAIL:'no-mail@example.invalid', SUPPORT_EMAIL:'no-mail@example.invalid'});
}

// No provider HTTP requests are part of this initial acceptance scope. Database
// sockets are unaffected; the application's normal HTTP server is unaffected.
function fenceOutboundHttp() {
  const fail = () => { const error = new Error('External HTTP is disabled in isolated acceptance'); error.code = 'ACCEPTANCE_EXTERNAL_DISABLED'; throw error; };
  for (const scheme of ['node:http', 'node:https']) {
    const client = require(scheme);
    client.request = fail;
    client.get = fail;
  }
  globalThis.fetch = async () => fail();
}

async function claimDatabase(client, config) {
  await client.query("SELECT pg_advisory_lock(hashtext('scenelink_acceptance_bootstrap_v1'))");
  const current = (await client.query('SELECT current_database() AS name')).rows[0];
  if (current.name !== config.databaseName) refuse('connected database differs from approved QA target');
  const marker = (await client.query("SELECT to_regclass('public.scenelink_acceptance_environment') AS marker")).rows[0].marker;
  if (!marker) {
    const count = (await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'")).rows[0].count;
    if (count !== 0) refuse('first boot requires an empty public schema');
    await client.query(`CREATE TABLE public.scenelink_acceptance_environment(
      singleton boolean PRIMARY KEY CHECK(singleton), environment_id text NOT NULL,
      target_binding text NOT NULL, fixtures_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), source_commit text)`);
    await client.query('INSERT INTO public.scenelink_acceptance_environment(singleton,environment_id,target_binding,source_commit) VALUES(true,$1,$2,$3)',
      [config.environmentId, config.binding, config.sourceCommit]);
  }
  const rows = (await client.query('SELECT * FROM public.scenelink_acceptance_environment')).rows;
  if (rows.length !== 1 || rows[0].singleton !== true || rows[0].environment_id !== config.environmentId || rows[0].target_binding !== config.binding) refuse('foreign or malformed acceptance environment marker');
  return rows[0];
}

module.exports = {ENVIRONMENT_ID, DATABASE_PATTERN, validateEnvironment, disableExternalServices, fenceOutboundHttp, claimDatabase};
