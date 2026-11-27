#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {validateEnvironment, disableExternalServices, fenceOutboundHttp, claimDatabase} = require('./guard.cjs');
const {installGate, shell, escape} = require('./gate.cjs');
const {USERS, OWNERS, VENUES, seedFixtures} = require('./fixtures.cjs');
const {script:browserScript} = require('./browser-bootstrap.cjs');
const {configure:configureVerificationMail} = require('./resend-verification.cjs');

const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(ROOT, 'web/frontend');
const ALIASES = {social:'social-feed',feed:'social-feed',saved:'my-lists',favorites:'my-lists',lists:'my-lists',
  plans:'plan-with-friends',plan:'plan-with-friends','group-planning':'plan-with-friends',group:'plan-with-friends',
  'plan-night':'plan-with-friends',friends:'profile',concierge:'contact',ai:'contact','ai-concierge':'contact'};

function installFrontend(app, config) {
  app.get('/__acceptance/', (req, res) => {
    const rows = [...USERS.map(user => [user.role,user.email]), ...OWNERS.map(owner => ['business: '+owner.status,owner.email])];
    // The overview contains a native POST form for locking the gate.
    res.set('Referrer-Policy','strict-origin');
    res.type('html').send(shell('SceneLink isolated acceptance', '<p class="note">All venues and accounts are fictional. The real API and frontend share this origin. Model calls, OAuth, uploads, third-party maps, imports and service-worker caching are disabled. Outbound mail is disabled except during the one-inbox verification pilot.</p><p>Source commit: <code>' + escape(config.sourceCommit) + '</code></p><p><a href="/">Open SceneLink</a> · <a href="/admin.html">Admin</a> · <a href="/business.html">Business portal</a> · <a href="/plan-with-friends.html">Saved plans</a></p><table><thead><tr><th>Fixture role</th><th>Sign-in email</th></tr></thead><tbody>' + rows.map(row => '<tr><td>' + escape(row[0]) + '</td><td>' + escape(row[1]) + '</td></tr>').join('') + '</tbody></table><p>Use the separately supplied generated fixture password. The pending owner must remain unable to sign in. The approved owner can switch between QA Harbor Table and QA Nightcap.</p><p>Restarts preserve edits and do not reset passwords or recreate deleted fixtures.</p><form method="post" action="/__acceptance/lock"><button>Lock this environment</button></form>'));
  });
  app.get('/__acceptance/status', (req, res) => res.json({environment:config.environmentId,sourceCommit:config.sourceCommit,
    data:'fictional-only',model:'disabled-not-tested',mail:config.verificationMail?.ready()?'one-verification-canary-only':'disabled-not-tested',imports:'disabled',serviceWorker:'disabled',
    fixtures:{users:USERS.map(({email,role})=>({email,role})),owners:OWNERS.map(({email,status})=>({email,status})),venues:VENUES.map(({id,name})=>({id,name}))}}));
  app.get('/env.js', (req, res) => res.type('application/javascript').send(browserScript(config.origin,config.sourceCommit)));
  // Never let a previously cached private shell bypass the outer gate.
  app.get('/sw.js', (req, res) => res.type('application/javascript').send("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).then(()=>self.registration.unregister())));"));
  app.use((req, res, next) => {
    let decoded;
    try { decoded=decodeURIComponent(req.path); } catch { return res.status(400).end(); }
    if (/(?:^|\/)(?:\.[^/]+|_redirects|_headers|netlify\.toml|render\.ya?ml)(?:\/|$)/i.test(decoded)) return res.status(404).end();
    if (req.method === 'GET') {
      const key = req.path.replace(/^\//,'').replace(/\.html$/,'');
      if (ALIASES[key]) return res.sendFile(path.join(FRONTEND, ALIASES[key] + '.html'));
    }
    next();
  });
  app.use(express.static(FRONTEND, {extensions:['html'], index:'index.html', dotfiles:'deny', etag:false,
    lastModified:false, maxAge:0, setHeaders:res=>res.setHeader('Cache-Control','private, no-store')}));
  app.use((req, res) => res.status(404).type('html').send(shell('Page unavailable', '<p><a href="/__acceptance/">Return to the acceptance overview</a></p>')));
}

async function start() {
  const config = validateEnvironment(process.env, ROOT);
  const verificationMail=configureVerificationMail(process.env,config);
  // Only the fixed-output adapter retains the original HTTPS client.
  config.verificationMail=verificationMail;
  disableExternalServices(process.env, config);
  fenceOutboundHttp();
  process.chdir(ROOT);
  const pool = require(path.join(ROOT,'src/config/database'));
  const client = await pool.connect();
  let api, server;
  try {
    const marker = await claimDatabase(client, config);
    if(verificationMail) require(path.join(ROOT,'src/services/mailer')).enableIsolatedVerification(verificationMail);
    api = require(path.join(ROOT,'src/server'));
    await api.locals.initializeDatabase();
    if (!marker.fixtures_seeded) await seedFixtures(client, config.fixturePassword, config.sourceCommit);
    await client.query("SELECT pg_advisory_unlock(hashtext('scenelink_acceptance_bootstrap_v1'))");
    client.release();
    const app = express();
    installGate(app, config, {health: async () => {
      let timer;
      try { return await Promise.race([pool.query({text:'SELECT 1',query_timeout:1500}).then(()=>true),
        new Promise(resolve=>{timer=setTimeout(()=>resolve(false),2000);})]); }
      catch { return false; }
      finally { clearTimeout(timer); }
    }});
    app.use('/api', (req, res, next) => {
      if (/\/forgot-password\/*$/i.test(req.path)||(/\/verification\/request\/*$/i.test(req.path)&&!verificationMail?.ready())) return res.status(503).json({error:'Email delivery is disabled in this isolated acceptance environment',code:'ACCEPTANCE_MAIL_DISABLED'});
      if (/^\/(?:auth\/(?:google|apple)|photo(?:\/|$)|media\/(?:upload|sign)|admin\/(?:reseed|seed-demo|.*import|.*source-review))/.test(req.path)) return res.status(503).json({error:'This external or import capability is disabled in isolated acceptance',code:'ACCEPTANCE_CAPABILITY_DISABLED'});
      next();
    });
    // Mount at the root: src/server owns /api paths. No path stripping or Netlify proxy.
    app.use((req,res,next)=>req.path==='/api'||req.path.startsWith('/api/') ? api(req,res,next) : next());
    installFrontend(app, config);
    app.use((error, req, res, next) => { if (!res.headersSent) res.status(500).json({error:'Acceptance request failed'}); });
    server = await new Promise((resolve, reject) => { const listening = app.listen(config.port,config.bindHost,()=>resolve(listening));listening.once('error',reject); });
    console.log('[acceptance] Ready: fictional data only; other providers disabled, verification canary '+(verificationMail?'armed':'off')+'. Source ' + config.sourceCommit);
    let stopping = false;
    const close = async () => { if(stopping)return;stopping=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end(); };
    for (const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>close().then(()=>process.exit(0)));
    return {server,close};
  } catch (error) {
    try { client.release(); } catch {}
    await pool.end();
    throw error;
  }
}

if (require.main === module) start().catch(error => {
  // Driver/config errors can carry credentials. Only known refusal messages are safe.
  console.error(error.message?.startsWith('Acceptance refused:') ? error.message : '[acceptance] Startup failed; no traffic accepted.');
  if (/^[0-9A-Z]{5}$/.test(error.code || '')) console.error('[acceptance] Database error category: ' + error.code);
  process.exitCode = 1;
});
module.exports = {ROOT, FRONTEND, installFrontend, start};
