'use strict';
// Admin HTML/auth/portal DOM + real local HTTP and SQL. This is not a physical-browser test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function ({api, pool, check, crypto, req, root, base}) {
  const {JSDOM, VirtualConsole} = require(path.join(root, 'web/node_modules/jsdom'));
  const origin = new URL(base).origin;
  assert.equal(new URL(origin).hostname, '127.0.0.1', 'Admin acceptance requires the guarded loopback API');
  assert.equal(process.env.NODE_ENV, 'test');
  const frontend = path.join(root, 'web/frontend');
  const html = fs.readFileSync(path.join(frontend, 'admin.html'), 'utf8');
  const scripts = ['js/sl-auth-core.js', 'js/sl-admin-portal.js'];
  for (const script of scripts) assert(html.includes(script), 'Acceptance must use the shipped admin script: ' + script);
  const scriptSources = Object.fromEntries(scripts.map(script => [script, fs.readFileSync(path.join(frontend, script), 'utf8')]));
  const sourceFiles = ['web/frontend/admin.html', ...scripts.map(script => 'web/frontend/' + script),
    'qa/admin-portal-dom-integration.cjs', 'qa/connected-launch-integration.cjs'];
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  const sourceSha256 = Object.fromEntries(sourceFiles.map(file => [file, digest(file)]));
  const suffix = crypto.randomBytes(5).toString('hex');
  const password = 'Isolated admin acceptance password ' + suffix;
  const passwordHash = await req('bcryptjs').hash(password, 4);
  const windows = [], audit = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, label) {
    for (let attempt = 0; attempt < 240; attempt++) {
      if (predicate()) return;
      await delay(25);
    }
    throw Error('Admin DOM timeout: ' + label);
  }
  async function makeUser(label, role = 'user') {
    const email = 'admin-dom.' + label + '.' + suffix + '@example.invalid';
    return (await pool.query(`INSERT INTO users(email, username, display_name, password_hash, role,
      email_verified_at, verified_email) VALUES($1::text,$2,$3,$4,$5,NOW(),$1::text)
      RETURNING id,email,username,display_name,role,auth_version`,
    [email, 'admin_dom_' + label + '_' + suffix, 'Admin DOM ' + label + ' ' + suffix, passwordHash, role])).rows[0];
  }
  const admin = await makeUser('operator', 'admin');
  const member = await makeUser('member');
  const searchable = [];
  for (let i = 0; i < 28; i++) searchable.push(await makeUser('page_' + String(i).padStart(2, '0')));
  const venueId = crypto.randomUUID();
  const venueName = 'Admin DOM fictional venue ' + suffix;
  await pool.query(`INSERT INTO venues(id,name,slug,type,is_active,featured,trending)
    VALUES($1,$2,$3,'cafe',false,false,false)`, [venueId, venueName, 'admin-dom-' + suffix]);
  // Separate these synthetic operator logins from earlier provider/auth limiter fixtures.
  const limiter = req('./src/middleware/rateLimits').authLimiter;
  limiter.resetKey('127.0.0.1');

  async function page({token, cachedUser} = {}) {
    const errors = [], calls = [], pending = new Set(), vc = new VirtualConsole();
    vc.on('jsdomError', error => {
      if (!/Not implemented: navigation/.test(error.message)) errors.push(error.message);
    });
    const dom = new JSDOM(html, {url: origin + '/admin.html', runScripts: 'outside-only',
      pretendToBeVisual: true, virtualConsole: vc});
    const w = dom.window;
    windows.push(w);
    Object.assign(w, {Response, Request, Headers, AbortController, confirm: () => true});
    w.SL_CONFIG = {API_BASE_URL: '/api'};
    if (token) w.localStorage.setItem('sl_jwt_token', token);
    if (cachedUser) w.localStorage.setItem('sl_user_cache', JSON.stringify({user: cachedUser}));
    w.fetch = (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, w.location.href);
      assert.equal(url.origin, origin, 'External fetch forbidden in admin acceptance');
      assert(url.pathname.startsWith('/api/'), 'Only local API calls are expected');
      const method = options.method || 'GET';
      const headers = new Headers(options.headers);
      const authorization = headers.get('authorization');
      const call = {path: url.pathname, query: Object.fromEntries(url.searchParams), method,
        bearer: authorization ? /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization) : false,
        secretHeader: headers.has('x-admin-secret')};
      if (method === 'PATCH') call.body = JSON.parse(options.body);
      calls.push(call); audit.push(call);
      const request = fetch(url.href, {...options, redirect: 'error'}).then(response => {
        call.status = response.status;
        return response;
      });
      pending.add(request);
      request.then(() => pending.delete(request), () => pending.delete(request));
      return request;
    };
    for (const script of scripts) w.eval(scriptSources[script]);
    const p = {w, errors, calls, pending, $: selector => w.document.querySelector(selector),
      click(selector) {const el = this.$(selector); assert(el, selector); el.click();}};
    await until(() => ['#sl-admin-gate', '#sl-admin-app', '#sl-admin-deny'].some(selector => {
      const display = p.$(selector).style.display;
      return display === 'flex' || display === 'block';
    }), 'initial auth resolution');
    await settle(p);
    return p;
  }
  async function settle(p) {
    await until(() => p.pending.size === 0, 'local requests settle');
    await delay(30);
    await until(() => p.pending.size === 0, 'chained local requests settle');
    assert.deepEqual(p.errors, []);
  }
  function displayed(p, selector) {return ['block', 'flex'].includes(p.$(selector).style.display);}
  async function signIn(p, account) {
    p.$('#adminEmail').value = account.email;
    p.$('#adminPassword').value = password;
    p.click('#adminLoginBtn');
    await until(() => displayed(p, '#sl-admin-app'), 'real admin login');
    await settle(p);
  }
  async function search(p, term, count) {
    p.$('#usersSearch').value = term;
    p.click('#usersSearchBtn');
    await until(() => p.calls.some(call => call.path === '/api/admin/users' && call.query.search === term && call.status === 200)
      && p.$('#usersCount').textContent.includes('of ' + count + ' users'), 'user search ' + count);
    await settle(p);
  }
  async function openFixtureVenue(p) {
    p.click('[data-section="venues"]');
    await until(() => p.$('#venuesTbody').textContent.includes(venueName), 'synthetic inactive venue inventory');
    const row = [...p.$('#venuesTbody').querySelectorAll('tr')].find(row => row.textContent.includes(venueName));
    assert(row, 'Synthetic venue must be visible in admin inventory');
    row.querySelector('[data-edit-index]').click();
    assert(p.$('#venueModal').classList.contains('open'));
    assert(p.$('#venueModalBody').textContent.includes('Active: No'));
  }
  async function saveFlag(p, name, value) {
    await openFixtureVenue(p);
    p.$('[data-venue-flag="' + name + '"]').checked = value;
    p.click('#venueModalSave');
    await until(() => !p.$('#venueModal').classList.contains('open'), 'confirmed ' + name + ' save');
    await settle(p);
    const actual = (await pool.query('SELECT featured,trending,is_active FROM venues WHERE id=$1', [venueId])).rows[0];
    assert.equal(actual[name], value);
    assert.equal(actual.is_active, false, 'Admin flag acceptance must not activate its fixture');
    return actual;
  }
  let p, token;
  try {
    await check('admin DOM: clean session shows sign-in and real account login sends a JWT', async () => {
      p = await page();
      assert(displayed(p, '#sl-admin-gate'));
      assert.equal(p.calls.filter(call => call.path.startsWith('/api/admin/')).length, 0);
      await signIn(p, admin);
      token = p.w.SLAuth.token();
      assert.equal(p.w.SLAuth.user().id, admin.id);
      assert(p.calls.some(call => call.path === '/api/auth/login' && call.status === 200));
      assert(p.calls.some(call => call.path === '/api/admin/venues/summary' && call.status === 200));
      assert(p.calls.filter(call => call.path.startsWith('/api/admin/')).every(call => call.bearer && !call.secretHeader));
    });
    await check('admin DOM: native user search covers all three identity fields and both pages', async () => {
      p.click('[data-section="users"]');
      await until(() => !p.$('#usersSearch').disabled && p.$('#usersTbody').querySelectorAll('tr').length === 25, 'first user page');
      await search(p, suffix, 30);
      assert.equal(p.$('#usersTbody').querySelectorAll('tr').length, 25);
      assert.equal(p.$('#usersPrev').disabled, true);
      p.click('#usersNext');
      await until(() => p.$('#usersCount').textContent === 'Showing 26–30 of 30 users', 'last filtered user page');
      assert.equal(p.$('#usersTbody').querySelectorAll('tr').length, 5);
      assert.equal(p.$('#usersNext').disabled, true);
      for (const field of ['email', 'display_name', 'username']) {
        await search(p, searchable[7][field], 1);
        assert(p.$('#usersTbody').textContent.includes(searchable[7].email));
        assert.equal(p.$('#usersTbody').querySelectorAll('tr').length, 1);
      }
      const reloaded = await page({token});
      assert(displayed(reloaded, '#sl-admin-app'));
      reloaded.click('[data-section="users"]');
      await until(() => !reloaded.$('#usersSearch').disabled, 'fresh-window protected users');
      await search(reloaded, admin.email, 1);
      reloaded.w.close();
    });
    await check('admin DOM: Featured and Trending persist separately and remain inactive after a fresh session', async () => {
      assert.deepEqual(await saveFlag(p, 'featured', true), {featured: true, trending: false, is_active: false});
      assert.deepEqual(await saveFlag(p, 'trending', true), {featured: true, trending: true, is_active: false});
      const fresh = await page({token});
      await openFixtureVenue(fresh);
      assert.equal(fresh.$('[data-venue-flag="featured"]').checked, true);
      assert.equal(fresh.$('[data-venue-flag="trending"]').checked, true);
      fresh.click('#venueModalCancel');
      await saveFlag(fresh, 'featured', false);
      assert.deepEqual(await saveFlag(fresh, 'trending', false), {featured: false, trending: false, is_active: false});
      fresh.w.close();
      const writes = audit.filter(call => call.method === 'PATCH');
      assert.deepEqual(writes.map(({path, body, status}) => ({path, body, status})), [
        {path: '/api/admin/venues/' + venueId, body: {featured: true}, status: 200},
        {path: '/api/admin/venues/' + venueId, body: {trending: true}, status: 200},
        {path: '/api/admin/venues/' + venueId, body: {featured: false}, status: 200},
        {path: '/api/admin/venues/' + venueId, body: {trending: false}, status: 200}
      ]);
    });
    await check('admin DOM: a member with a forged cached admin role is denied by current session state', async () => {
      const login = await api('POST', '/auth/login', {email: member.email, password});
      const denied = await page({token: login.token, cachedUser: {...member, role: 'admin'}});
      assert(displayed(denied, '#sl-admin-deny'));
      assert.equal(denied.calls.filter(call => call.path.startsWith('/api/admin/')).length, 0);
      await api('GET', '/admin/users', undefined, login.token, 403);
      denied.w.close();
    });
    await check('admin DOM: revoked session removes protected data and cannot reopen the portal', async () => {
      p.click('[data-section="users"]');
      await until(() => !p.$('#usersSearch').disabled, 'users before revocation');
      await search(p, admin.email, 1);
      await pool.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [admin.id]);
      p.click('#refreshBtn');
      await until(() => displayed(p, '#sl-admin-gate'), 'revocation gates existing window');
      await settle(p);
      assert(!p.$('#usersTbody').textContent.includes(admin.email));
      await api('GET', '/admin/stats', undefined, token, 401);
      const revoked = await page({token, cachedUser: admin});
      assert(displayed(revoked, '#sl-admin-gate'));
      assert.equal(revoked.calls.filter(call => call.path.startsWith('/api/admin/')).length, 0);
      assert.equal(revoked.w.SLAuth.token(), '');
      revoked.w.close();
    });
    await check('admin DOM: expired JWT is discarded before any protected read', async () => {
      const version = (await pool.query('SELECT auth_version FROM users WHERE id=$1', [admin.id])).rows[0].auth_version;
      const expired = req('jsonwebtoken').sign({id: admin.id, role: 'admin', v: version,
        jti: crypto.randomUUID()}, process.env.JWT_SECRET, {algorithm: 'HS256', expiresIn: -10});
      const gated = await page({token: expired, cachedUser: admin});
      assert(displayed(gated, '#sl-admin-gate'));
      assert.equal(gated.calls.filter(call => call.path.startsWith('/api/admin/')).length, 0);
      assert.equal(gated.w.SLAuth.token(), '');
      gated.w.close();
    });
    await check('admin DOM: logout clears the local dashboard and revokes the real server session', async () => {
      const session = await page();
      await signIn(session, admin);
      const activeToken = session.w.SLAuth.token();
      session.click('[data-section="users"]');
      await until(() => !session.$('#usersSearch').disabled, 'users before logout');
      await search(session, admin.email, 1);
      session.click('#sbLogout');
      await until(() => displayed(session, '#sl-admin-gate'), 'logout gate');
      await settle(session);
      assert.equal(session.w.SLAuth.token(), '');
      assert(!session.$('#usersTbody').textContent.includes(admin.email));
      assert(session.calls.some(call => call.path === '/api/auth/logout' && call.status === 200));
      await api('GET', '/admin/stats', undefined, activeToken, 401);
      session.w.close();
    });
    assert(audit.filter(call => call.method !== 'GET').every(call =>
      ['/api/auth/login', '/api/auth/logout'].includes(call.path) ||
      call.path === '/api/admin/venues/' + venueId && call.method === 'PATCH'));
    assert.deepEqual(Object.fromEntries(sourceFiles.map(file => [file, digest(file)])), sourceSha256,
      'Admin acceptance sources changed during the run; rerun the final candidate');
    console.log('ADMIN_DOM_EVIDENCE ' + JSON.stringify({
      scope: 'Shipped admin HTML/auth/portal scripts in JSDOM with real loopback Express HTTP and SQL; not visual browser or physical-device acceptance',
      engine: process.env.SCENELINK_TEST_ENGINE === 'pglite' ? 'PGlite supplemental' : 'native PostgreSQL',
      syntheticAccounts: 30, syntheticVenues: 1, apiRequests: audit.length,
      venueFlagWrites: 4, publicActivation: false, externalFetchAllowed: false, redirectsAllowed: false,
      productionTouched: false, sourceSha256
    }));
  } finally {
    windows.forEach(w => w.close());
    limiter.resetKey('127.0.0.1');
  }
};
