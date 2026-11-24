/**
 * SceneLink Admin Portal
 * ─────────────────────
 * Full client for /admin.html
 * Uses window.SLAuth (JWT admin role) OR x-admin-secret header fallback.
 */
(function(){
  'use strict';

  const API = (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) || '/api';
  const LS_SECRET = 'sl_admin_secret';
  let ADMIN_SECRET = localStorage.getItem(LS_SECRET) || '';

  // ── State ────────────────────────────────────
  const state = {
    section: 'overview',
    venues: { page: 1, perPage: 25, total: 0, request: 0 },
    me: null
  };

  // ── Utils ────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const el = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
  const isCount = (n) => (typeof n === 'number' || typeof n === 'string' && /^[0-9]+$/.test(n)) && Number.isSafeInteger(Number(n)) && Number(n) >= 0;
  const fmtNum = (n) => isCount(n) ? Number(n).toLocaleString() : '—';
  function safeWebLink(value) {
    try { const u = new URL(value); return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? u.href : null; } catch (_) { return null; }
  }
  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString(); } catch { return String(d); }
  };

  // ── Toast ────────────────────────────────────
  function toast(msg, kind = 'info', ttl = 3500) {
    const stack = $('#toastStack');
    if (!stack) { console.log(`[${kind}]`, msg); return; }
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };
    const t = el('div', { class: `toast ${kind}` }, [
      el('i', { class: `fas ${icons[kind] || icons.info}` }),
      el('div', {}, msg)
    ]);
    stack.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(120%)'; setTimeout(() => t.remove(), 300); }, ttl);
  }

  // A successful response belongs only to the session that started it.
  let accessEpoch = 0, authorized = null, loginPending = false;
  function authToken() {
    try {
      const value = typeof window.SLAuth?.token === 'function'
        ? window.SLAuth.token() : localStorage.getItem('sl_jwt_token');
      return typeof value === 'string' ? value : '';
    } catch (_) { return ''; }
  }
  let observedToken = authToken();
  function sessionChanged() {
    const err = new Error('Your admin session changed. Sign in again to continue.');
    err.code = 'ADMIN_SESSION_CHANGED';
    return err;
  }
  function clearAccess() {
    ++accessEpoch;
    authorized = null;
    state.me = null;
    state.section = 'overview';
    state.venues.request++;
    state.venues.page = 1;
    state.venues.total = 0;
    _usersState.request++;
    _usersState.page = 1;
    _usersState.pages = 0;
    _usersState.search = '';
    qualityRead++;
    venueDraft = null;
    venueSavePending = false;
    _evState.list = [];
    $('#sl-admin-app').style.display = 'none';
    $('#venueModal').classList.remove('open');
    $('#venueModalBody').textContent = '';
    $('#venueModalSave').disabled = false;
    closeEventModal();
    $$('#eventModal input, #eventModal textarea').forEach(e => { e.value = ''; e.checked = false; });
    $$('[data-admin-stat]').forEach(e => e.remove());
    $$('#sl-admin-app tbody, #sl-admin-app .stat-value, #sl-admin-app .stat-sub').forEach(e => { e.textContent = ''; });
    ['venuesCount', 'usersCount', 'contactsCount', 'businessCount', 'eventsCount', 'sb-users-count', 'sb-contacts-count', 'sbUsername', 'sbAvatar', 'apiStatusBody', 'evVenueResults', 'toastStack'].forEach(id => {
      const e = document.getElementById(id); if (e) e.textContent = '';
    });
    $('#usersSearch').value = '';
    updateUserSearch(false);
    $('#usersPrev').disabled = $('#usersNext').disabled = $('#venuesPrev').disabled = $('#venuesNext').disabled = true;
  }
  function currentRequest(epoch, token, secret) {
    return epoch === accessEpoch && token === authToken() && secret === ADMIN_SECRET;
  }

  // ── API wrapper ──────────────────────────────
  async function api(path, opts = {}) {
    const epoch = accessEpoch, token = authToken(), secret = ADMIN_SECRET;
    if (!opts.authProbe && (!state.me || !authorized)) throw sessionChanged();
    if (!opts.authProbe && (authorized.token !== token || authorized.secret !== secret)) { clearAccess(); showGate(); throw sessionChanged(); }
    const url = path.startsWith('http') ? path : `${API}${path}`;
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (secret) headers['x-admin-secret'] = secret;
    let resp;
    try {
      resp = await fetch(url, {
        method: opts.method || 'GET', headers,
        body: opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string'
          ? JSON.stringify(opts.body) : opts.body,
        credentials: 'same-origin', cache: 'no-store'
      });
    } catch (err) {
      if (!currentRequest(epoch, token, secret)) throw sessionChanged();
      throw err;
    }
    let data = null;
    let text;
    try { text = await resp.text(); }
    catch (err) { if (!currentRequest(epoch, token, secret)) throw sessionChanged(); throw err; }
    if (!currentRequest(epoch, token, secret)) throw sessionChanged();
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!resp.ok || data?.ok === false) {
      const err = new Error((data && (data.error || data.message)) || `HTTP ${resp.status}`);
      err.status = resp.status;
      err.data = data;
      if (!opts.authProbe && (resp.status === 401 || resp.status === 403) && data?.code !== 'EMAIL_VERIFICATION_REQUIRED') {
        clearAccess();
        if (resp.status === 401) {
          ADMIN_SECRET = ''; localStorage.removeItem(LS_SECRET);
          if (typeof window.SLAuth?.logout === 'function') window.SLAuth.logout({reload:false}).catch(() => {});
          else { localStorage.removeItem('sl_jwt_token'); localStorage.removeItem('sl_user_cache'); }
          showGate();
          $('#gateError').textContent = 'Your admin session expired. Sign in again.';
        } else showDeny();
        throw sessionChanged();
      }
      throw err;
    }
    return data;
  }

  // ── Auth gate ────────────────────────────────
  async function ensureAdmin(epoch) {
    const token = authToken(), secret = ADMIN_SECRET;
    let user = null;
    if (token) {
      try {
        // refresh() deliberately returns null on an outage while preserving the
        // consumer cache. Only its confirmed result can unlock this portal.
        user = typeof window.SLAuth?.refresh === 'function'
          ? await window.SLAuth.refresh()
          : (await api('/auth/me', {authProbe:true}))?.user;
      } catch (err) {
        if (err.code === 'ADMIN_SESSION_CHANGED') throw err;
      }
      if (!currentRequest(epoch, token, secret)) throw sessionChanged();
      if (user && user.role === 'admin') return {user, token, secret};
    }
    if (secret) {
      try {
        await api('/admin/venues/summary', {authProbe:true});
        return {user:{username:'admin (secret)', role:'admin', via:'secret'}, token, secret};
      } catch (err) {
        if (err.code === 'ADMIN_SESSION_CHANGED') throw err;
        if (err.status === 401 || err.status === 403) {
          ADMIN_SECRET = ''; localStorage.removeItem(LS_SECRET);
          $('#gateError').textContent = 'The admin secret was not accepted.';
        } else $('#gateError').textContent = 'Admin access could not be verified. Please retry.';
      }
    }
    if (user) return 'deny';
    if (token) $('#gateError').textContent = 'Admin access could not be verified. Sign in again or retry when the service is available.';
    return false;
  }

  function showGate() {
    $('#sl-admin-loading').style.display = 'none';
    $('#sl-admin-gate').style.display = 'flex';
    $('#sl-admin-deny').style.display = 'none';
    $('#sl-admin-app').style.display = 'none';
  }
  function showDeny() {
    $('#sl-admin-loading').style.display = 'none';
    $('#sl-admin-gate').style.display = 'none';
    $('#sl-admin-deny').style.display = 'flex';
    $('#sl-admin-app').style.display = 'none';
  }
  function showApp() {
    $('#sl-admin-loading').style.display = 'none';
    $('#sl-admin-gate').style.display = 'none';
    $('#sl-admin-deny').style.display = 'none';
    $('#sl-admin-app').style.display = 'block';

    // Populate sidebar user
    const u = state.me || {};
    const name = u.username || u.email || 'admin';
    $('#sbUsername').textContent = name;
    $('#sbAvatar').textContent = (name[0] || 'A').toUpperCase();
  }

  async function handleLogin() {
    if (loginPending) return;
    const email = $('#adminEmail').value.trim();
    const pwd = $('#adminPassword').value;
    const errEl = $('#gateError');
    errEl.textContent = '';
    if (!email || !pwd) { errEl.textContent = 'Email and password required.'; return; }
    loginPending = true;
    $('#adminLoginBtn').disabled = true;
    try {
      if (typeof window.SLAuth?.login !== 'function') throw new Error('Sign-in is still loading. Refresh this page and try again.');
      await window.SLAuth.login(email, pwd);
      $('#adminPassword').value = '';
      await bootstrap();
    } catch (err) {
      if (err.code !== 'ADMIN_SESSION_CHANGED' && err.code !== 'AUTH_SUPERSEDED') errEl.textContent = err.message || 'Login failed.';
    } finally {
      loginPending = false;
      $('#adminLoginBtn').disabled = false;
    }
  }

  function handleUseSecret() {
    if (loginPending) return;
    const secret = $('#adminSecret').value.trim();
    if (!secret) { $('#gateError').textContent = 'Enter admin secret.'; return; }
    ADMIN_SECRET = secret;
    localStorage.setItem(LS_SECRET, secret);
    $('#adminSecret').value = '';
    bootstrap();
  }

  async function logout() {
    ADMIN_SECRET = '';
    localStorage.removeItem(LS_SECRET);
    $('#adminPassword').value = '';
    $('#adminSecret').value = '';
    clearAccess();
    showGate();
    $('#gateError').textContent = '';
    if (typeof window.SLAuth?.logout === 'function') await window.SLAuth.logout({reload:false});
    else { localStorage.removeItem('sl_jwt_token'); localStorage.removeItem('sl_user_cache'); }
  }

  // ── Router ───────────────────────────────────
  function goto(section) {
    if (!state.me || !authorized) return;
    state.section = section;
    $$('.admin-section').forEach(s => s.classList.toggle('active', s.id === `section-${section}`));
    $$('.sidebar-nav a').forEach(a => a.classList.toggle('active', a.getAttribute('data-section') === section));

    const titles = {
      'overview': ['Overview', 'SceneLink operations dashboard'],
      'venues': ['Venues', 'Browse, filter, and edit venues'],
      'csv-import': ['CSV Import', 'Unavailable in this admin build'],
      'osm-import': ['OSM Import', 'Unavailable in this admin build'],
      'import-history': ['Import History', 'Published audit history is unavailable'],
      'data-quality': ['Data Quality', 'Identify and fix data issues'],
      'users': ['Users', 'Registered users (read-only)'],
      'contacts': ['Contact Messages', 'Inbound messages from the contact form'],
      'business': ['Business Accounts', 'Claimed venue owner accounts'],
      'events': ['Events', 'Curate events shown on /events.html'],
      'api-status': ['API Status', 'Backend health']
    };
    const [t, sub] = titles[section] || [section, ''];
    $('#pageTitle').textContent = t;
    $('#pageSub').textContent = sub;

    // Lazy load data
    if (section === 'overview') loadOverview();
    if (section === 'venues') loadVenues();
    if (section === 'data-quality') loadDataQuality();
    if (section === 'overview') loadOverviewStats();
    if (section === 'users') { loadUserStats(); loadUsers(1, ''); }
    if (section === 'contacts') loadContacts();
    if (section === 'business') loadBusiness();
    if (section === 'events') loadEvents();
    if (section === 'api-status') loadApiStatus();

    if (window.innerWidth < 900) $('#adminSidebar').classList.remove('open');
  }

  // ── Overview ─────────────────────────────────
  async function loadOverview() {
    try {
      const s = await api('/admin/venues/summary');
      $('#stat-total').textContent = fmtNum(s.total);
      $('#stat-total-sub').textContent = 'Admin inventory count';
      $('#stat-active').textContent = fmtNum(s.active);
      $('#stat-no-web').textContent = fmtNum(s.missing_website);
      $('#stat-no-coords').textContent = fmtNum(s.missing_coords);
      $('#stat-osm').textContent = fmtNum(s.osm ?? s.osm_count);
      const avgQ = s.avg_quality != null ? s.avg_quality : (s.avg_quality_score != null ? s.avg_quality_score : null);
      $('#stat-quality').textContent = avgQ != null && avgQ > 0 ? Math.round(avgQ) : '—';

      $('#sourcesTbody').innerHTML = '<tr><td colspan="5" class="loading-state">Source breakdown unavailable in the current API.</td></tr>';
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      toast('Failed to load overview: ' + err.message, 'error');
      $('#sourcesTbody').innerHTML = `<tr><td colspan="5" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  // ── Venues ───────────────────────────────────
  async function loadVenues(page = state.venues.page) {
    const s = state.venues, request = ++s.request, tbody = $('#venuesTbody');
    $('#venuesPrev').disabled = $('#venuesNext').disabled = true;
    $('#venuesCount').textContent = 'Loading…';
    tbody.innerHTML = '<tr><td colspan="6" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    const offset = (page - 1) * s.perPage;
    try {
      const data = await api(`/admin/venues/list?limit=${s.perPage}&offset=${offset}`);
      if (request !== s.request) return;
      if (!Array.isArray(data?.venues) || !isCount(data.total) || data.offset !== offset || data.limit !== s.perPage || data.venues.length > s.perPage) throw Error('Venue list response was not confirmed.');
      const venues = data.venues;
      s.total = Number(data.total); s.page = page;
      tbody.innerHTML = venues.length ? venues.map((v, i) => {
        const website = safeWebLink(v.website);
        const active = v.is_active === true ? '<span class="chip good">yes</span>' : v.is_active === false ? '<span class="chip bad">no</span>' : '—';
        return `<tr>
          <td><strong>${esc(v.name)}</strong><div class="text-muted">${esc(v.neighborhood || '—')}</div></td>
          <td>${esc(v.type || '—')}</td><td>${v.is_featured === true ? 'Yes' : v.is_featured === false ? 'No' : '—'}</td><td>${v.is_trending === true ? 'Yes' : v.is_trending === false ? 'No' : '—'}</td>
          <td>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : '—'}</td>
          <td>${active} <button type="button" class="btn btn-ghost btn-xs" data-edit-index="${i}" aria-label="Edit venue flags"><i class="fas fa-pen"></i></button></td></tr>`;
      }).join('') : '<tr><td colspan="6" class="loading-state">No venues on this page.</td></tr>';
      tbody.querySelectorAll('[data-edit-index]').forEach(b => b.addEventListener('click', () => openVenueModal(venues[Number(b.dataset.editIndex)])));
      const end = offset + venues.length;
      $('#venuesCount').textContent = venues.length ? `Showing ${offset + 1}–${end} of ${fmtNum(s.total)}` : 'No results on this page';
      $('#venuesPrev').disabled = page <= 1;
      $('#venuesNext').disabled = !venues.length || end >= s.total;
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      if (request !== s.request) return;
      $('#venuesCount').textContent = 'Venue list unavailable';
      tbody.innerHTML = `<tr><td colspan="6" class="loading-state">Error: ${esc(err.message)}. Use Refresh to try again.</td></tr>`;
    }
  }

  // Use the admin row even for inactive venues; public venue details intentionally exclude them.
  let venueDraft = null, venueSavePending = false;
  function closeVenueModal() {
    if (venueSavePending) return;
    venueDraft = null;
    $('#venueModal').classList.remove('open');
  }
  function openVenueModal(venue) {
    if (venueSavePending || !venue || typeof venue.id !== 'string' || !venue.id) return;
    const {id, is_featured, is_trending} = venue;
    if (typeof is_featured !== 'boolean' || typeof is_trending !== 'boolean') { toast('Live venue flags could not be verified. Refresh the venue list first.', 'error'); return; }
    venueDraft = {id, featured:is_featured, trending:is_trending};
    $('#venueModalBody').innerHTML = `<h3>${esc(venue.name)}</h3><p class="text-muted">Only Featured and Trending are editable here. Venue facts, activation and source approvals use a separate review process.</p>
      <p>Type: ${esc(venue.type || '—')} · Neighborhood: ${esc(venue.neighborhood || '—')} · Active: ${venue.is_active === true ? 'Yes' : venue.is_active === false ? 'No' : 'Unavailable'}</p>
      <label><input type="checkbox" data-venue-flag="featured" ${is_featured ? 'checked' : ''}> Featured</label>
      <label><input type="checkbox" data-venue-flag="trending" ${is_trending ? 'checked' : ''}> Trending</label>`;
    $('#venueModal').classList.add('open');
  }

  async function saveVenueModal() {
    if (!state.me || !venueDraft || venueSavePending) return;
    const epoch = accessEpoch, entry = venueDraft, data = {}, controls = [];
    for (const field of ['featured','trending']) {
      const el = $(`#venueModalBody [data-venue-flag="${field}"]`);
      if (!el) return;
      controls.push(el);
      if (el.checked !== entry[field]) data[field] = el.checked;
    }
    if (!Object.keys(data).length) { toast('No venue flag changes to save.', 'info'); return; }
    const save = $('#venueModalSave');
    venueSavePending = true; save.disabled = true; controls.forEach(el => el.disabled = true);
    try {
      const result = await api(`/admin/venues/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: data });
      const returned = result?.venue;
      if (returned?.id !== entry.id || Object.keys(data).some(key => returned[key] !== data[key])) throw Error('The API did not confirm the selected flags. Refresh to verify before retrying.');
      toast('Venue flags updated.', 'success');
      venueDraft = null;
      $('#venueModal').classList.remove('open');
      loadVenues();
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      toast('Save not confirmed: ' + err.message, 'error');
    } finally {
      if (epoch === accessEpoch) { venueSavePending = false; save.disabled = false; controls.forEach(el => el.disabled = false); }
    }
  }

  // Only the three documented summary fields are available. No inferred quality scores, source labels or coordinates.
  let qualityRead = 0;
  async function loadDataQuality() {
    const read = ++qualityRead;
    const fields = [['dq-no-image','missing_image'],['dq-no-website','missing_website'],['dq-no-nhood','missing_neighborhood']];
    fields.forEach(([id]) => { document.getElementById(id).textContent = '—'; });
    $('#dq-status').textContent = 'Loading catalog summary…';
    try {
      const summary = await api('/admin/venues/summary');
      if (read !== qualityRead) return;
      fields.forEach(([id,key]) => { document.getElementById(id).textContent = fmtNum(summary?.[key]); });
      $('#dq-status').textContent = 'Catalog totals reported by the current API. Quality scores, detailed issue filters and source review are unavailable here.';
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      if (read === qualityRead) $('#dq-status').textContent = 'Catalog summary unavailable: ' + err.message;
    }
  }

  // Users GET uses page and limit, not offset. Old servers omit search_supported.
  const _usersState = { page: 1, limit: 25, pages: 0, request: 0, search: '', searchSupported: false };
  function updateUserSearch(supported) {
    _usersState.searchSupported = supported;
    $('#usersSearch').disabled = $('#usersSearchBtn').disabled = !supported;
    $('#usersSearchNote').textContent = supported ? 'Search by email, display name, or username.' : 'User search is unavailable in this admin build. Browse by page below.';
  }
  async function loadUsers(page = _usersState.page, search = _usersState.search) {
    const s = _usersState, request = ++s.request, tbody = $('#usersTbody');
    search = s.searchSupported ? search.trim().slice(0,100) : '';
    $('#usersSearch').value = search;
    $('#usersPrev').disabled = $('#usersNext').disabled = true;
    $('#usersCount').textContent = 'Loading…';
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    try {
      const params = new URLSearchParams({page,limit:s.limit});
      if (search) params.set('search',search);
      const r = await api(`/admin/users?${params}`);
      if (request !== s.request) return;
      if (!Array.isArray(r?.users) || !isCount(r.total) || r.page !== page || r.limit !== s.limit || r.pages !== Math.ceil(Number(r.total) / s.limit) || r.users.length > s.limit) throw Error('User list response was not confirmed.');
      if (page === 1 && !search) updateUserSearch(r.search_supported === true);
      if (search && r.search_supported !== true) {
        updateUserSearch(false);
        return loadUsers(1, '');
      }
      s.page = page; s.pages = r.pages; s.search = search;
      tbody.innerHTML = r.users.length ? r.users.map(u => `
        <tr>
          <td><strong>${esc(u.display_name || u.username || '—')}</strong></td><td>${esc(u.email || '—')}</td><td class="mono">${esc(u.username || '—')}</td>
          <td>${u.role === 'admin' ? '<span class="chip gold">admin</span>' : `<span class="chip">${esc(u.role || 'user')}</span>`}</td>
          <td class="num">${fmtNum(u.favorite_count)}</td><td class="num">${fmtNum(u.checkin_count)}</td><td>${esc(fmtDate(u.created_at))}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="loading-state">No users on this page.</td></tr>';
      const offset = (page - 1) * s.limit;
      $('#usersCount').textContent = r.users.length ? `Showing ${offset + 1}–${offset + r.users.length} of ${fmtNum(r.total)} users` : 'No results on this page';
      $('#usersPrev').disabled = page <= 1;
      $('#usersNext').disabled = !r.users.length || page >= r.pages;
      const badge = $('#sb-users-count'); if (badge && !search) badge.textContent = fmtNum(r.total);
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      if (request !== s.request) return;
      if (search) {
        // A backend rollback can reject filtered requests. A verified, unfiltered
        // page is safe to show, but never present it as search results.
        toast('User search failed. Returning to the full list.', 'warning');
        return loadUsers(1, '');
      }
      $('#usersCount').textContent = 'User list unavailable';
      tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Error: ${esc(err.message)}. Use Refresh to try again.</td></tr>`;
    }
  }

  async function loadUserStats() {
    try {
      const r = await api('/admin/stats');
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = fmtNum(v); };
      set('ustat-total', r.users && r.users.total);
      set('ustat-week',  r.users && r.users.this_week);
      set('ustat-today', r.users && r.users.today);
      set('ustat-favs',  r.favorites);
    } catch (_) {}
  }

  // ── Contacts ─────────────────────────────────────────────────────────────
  async function loadContacts(status) {
    const tbody = $('#contactsTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    try {
      const qs = `/admin/contacts?limit=100` + (status ? `&status=${status}` : '');
      const r = await api(qs);
      const msgs = r.messages || [];
      const total = r.total || msgs.length;
      const countEl = $('#contactsCount');
      if (countEl) countEl.textContent = `${fmtNum(total)} message${total !== 1 ? 's' : ''}`;
      const newCount = msgs.filter(m => m.status === 'new').length;
      const badge = $('#sb-contacts-count');
      if (badge) { badge.textContent = newCount || ''; badge.style.display = newCount ? '' : 'none'; }
      if (!msgs.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading-state">No messages</td></tr>'; return; }
      tbody.innerHTML = msgs.map(m => `
        <tr>
          <td><strong>${esc(m.name)}</strong></td>
          <td><a href="mailto:${esc(m.email)}" style="color:var(--gold)">${esc(m.email)}</a></td>
          <td>${esc(m.subject || '—')}</td>
          <td class="truncate" style="max-width:220px;color:var(--text2)">${esc(m.preview || '')}</td>
          <td>${m.status === 'new' ? '<span class="chip gold">new</span>' : m.status === 'resolved' ? '<span class="chip" style="color:var(--green)">resolved</span>' : '<span class="chip">read</span>'}</td>
          <td>${fmtDate(m.created_at)}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="window.SLAdmin.markContact('${m.id}','read')">Mark read</button>
            <button class="btn btn-ghost btn-sm" onclick="window.SLAdmin.markContact('${m.id}','resolved')">Resolve</button>
            <a href="mailto:${esc(m.email)}?subject=Re: ${encodeURIComponent(m.subject||'Your message')}" class="btn btn-ghost btn-sm" style="text-decoration:none">Reply</a>
          </td>
        </tr>`).join('');
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  // ── Business users ────────────────────────────────────────────────────────
  async function loadBusiness() {
    const tbody = $('#businessTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    try {
      const r = await api('/admin/business?limit=100');
      const bizUsers = r.business_users || [];
      const total = r.total || bizUsers.length;
      const countEl = $('#businessCount');
      if (countEl) countEl.textContent = `${fmtNum(total)} business account${total !== 1 ? 's' : ''}`;
      if (!bizUsers.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading-state">No business accounts yet</td></tr>'; return; }
      tbody.innerHTML = bizUsers.map(u => {
        const act = u.status === 'active';
        return `
        <tr>
          <td><a href="mailto:${esc(u.email)}" style="color:var(--gold)">${esc(u.email)}</a></td>
          <td><strong>${esc(u.venue_name)}</strong></td>
          <td>${u.tier === 'professional' ? '<span class="chip gold">professional</span>' : u.tier === 'enterprise' ? '<span class="chip gold">enterprise</span>' : '<span class="chip">starter</span>'}</td>
          <td>${act ? '<span class="chip" style="color:var(--green)">active</span>' : '<span class="chip" style="color:var(--red)">'+esc(u.status)+'</span>'}</td>
          <td>${u.venue_id ? '<i class="fas fa-check" style="color:var(--green)"></i> linked' : '<span class="text-muted">unlinked</span>'}</td>
          <td>${fmtDate(u.created_at)}</td>
          <td>
            ${act
              ? `<button class="btn btn-ghost btn-sm" onclick="window.SLAdmin.setBusinessStatus('${u.id}','disabled')">Disable</button>`
              : `<button class="btn btn-ghost btn-sm" onclick="window.SLAdmin.setBusinessStatus('${u.id}','active')">Enable</button>`}
          </td>
        </tr>`;
      }).join('');
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  // ── API Status ───────────────────────────────
  async function loadApiStatus() {
    const epoch = accessEpoch;
    const body = $('#apiStatusBody');
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
    try {
      const r = await fetch(`${API.replace(/\/api$/, '')}/health`).then(x => x.json()).catch(() => ({}));
      const h = await fetch(`${API}/health`).then(x => x.json()).catch(() => null);
      const s = await api('/admin/venues/summary').catch(() => null);
      if (epoch !== accessEpoch) return;
      body.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">API</div><div class="stat-value" style="color:var(--green);font-size:18px">${h ? 'ONLINE' : 'UNKNOWN'}</div><div class="stat-sub">${esc(API)}</div></div>
          <div class="stat-card"><div class="stat-label">DB</div><div class="stat-value" style="color:var(--green);font-size:18px">${s ? 'CONNECTED' : 'ERROR'}</div><div class="stat-sub">PostgreSQL</div></div>
          <div class="stat-card"><div class="stat-label">Venues</div><div class="stat-value">${s ? fmtNum(s.total) : '—'}</div><div class="stat-sub">in database</div></div>
        </div>
        <div class="panel" style="margin-top:16px">
          <div class="panel-title">Health payload</div>
          <pre class="mono" style="background:var(--bg3);padding:12px;border-radius:8px;overflow-x:auto;font-size:11px;margin-top:8px">${esc(JSON.stringify(h || {}, null, 2))}</pre>
        </div>`;
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      body.innerHTML = `<div class="alert alert-error"><i class="fas fa-exclamation-triangle"></i> ${esc(err.message)}</div>`;
    }
  }

  // ── Event wiring ─────────────────────────────
  function wireEvents() {
    // Sidebar nav
    $$('.sidebar-nav a').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const s = a.getAttribute('data-section');
      if (s) goto(s);
    }));

    // User pages are supplied by the server, including the last-page boundary.
    const searchUsers = () => { if (_usersState.searchSupported) loadUsers(1,$('#usersSearch').value); };
    $('#usersSearchBtn').addEventListener('click',searchUsers);
    $('#usersSearch').addEventListener('keydown',e => { if (e.key === 'Enter') { e.preventDefault(); searchUsers(); } });
    $('#usersPrev').addEventListener('click', () => { if (_usersState.page > 1) loadUsers(_usersState.page - 1); });
    $('#usersNext').addEventListener('click', () => { if (_usersState.page < _usersState.pages) loadUsers(_usersState.page + 1); });

    // Contacts filter
    const contactsFilter = $('#contactsFilter');
    if (contactsFilter) contactsFilter.addEventListener('change', () => loadContacts(contactsFilter.value));
    const contactsRefreshBtn = $('#contactsRefreshBtn');
    if (contactsRefreshBtn) contactsRefreshBtn.addEventListener('click', () => loadContacts(contactsFilter ? contactsFilter.value : ''));

    // Business refresh
    const businessRefreshBtn = $('#businessRefreshBtn');
    if (businessRefreshBtn) businessRefreshBtn.addEventListener('click', loadBusiness);

    // Events curation
    const eventsRefreshBtn = $('#eventsRefreshBtn');
    if (eventsRefreshBtn) eventsRefreshBtn.addEventListener('click', loadEvents);
    const eventsNewBtn = $('#eventsNewBtn');
    if (eventsNewBtn) eventsNewBtn.addEventListener('click', () => openEventModal(null));
    const eventModalCancel = $('#eventModalCancel');
    if (eventModalCancel) eventModalCancel.addEventListener('click', closeEventModal);
    const eventModalSave = $('#eventModalSave');
    if (eventModalSave) eventModalSave.addEventListener('click', saveEvent);
    const eventModal = $('#eventModal');
    if (eventModal) eventModal.addEventListener('click', (e) => { if (e.target === eventModal) closeEventModal(); });

    // Goto buttons
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => goto(b.getAttribute('data-goto'))));

    // Refresh
    $('#refreshBtn').addEventListener('click', () => goto(state.section));

    // Login gate
    $('#adminLoginBtn').addEventListener('click', handleLogin);
    $('#adminPassword').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    $('#useSecretLink').addEventListener('click', e => {
      e.preventDefault();
      $('#secretGate').classList.remove('hidden');
    });
    $('#useSecretBtn').addEventListener('click', handleUseSecret);
    $('#adminSecret').addEventListener('keydown', e => { if (e.key === 'Enter') handleUseSecret(); });

    // Deny / Logout
    $('#denyLogout').addEventListener('click', logout);
    $('#sbLogout').addEventListener('click', logout);

    $('#venuesPrev').addEventListener('click', () => { if (state.venues.page > 1) loadVenues(state.venues.page - 1); });
    $('#venuesNext').addEventListener('click', () => { if (state.venues.page * state.venues.perPage < state.venues.total) loadVenues(state.venues.page + 1); });
    $('#venueModalClose').addEventListener('click', closeVenueModal);
    $('#venueModalCancel').addEventListener('click', closeVenueModal);
    $('#venueModalSave').addEventListener('click', saveVenueModal);
  }

  // \u2500\u2500 Events Curation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  let _evState = { list: [] };

  async function loadEvents() {
    const tbody = $('#eventsTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    try {
      const r = await api('/admin/events?all=1');
      const events = r.events || [];
      _evState.list = events;
      const countEl = $('#eventsCount');
      if (countEl) countEl.textContent = `${fmtNum(events.length)} event${events.length !== 1 ? 's' : ''}`;
      if (!events.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">No events yet. Click "New Event" to create one.</td></tr>';
        return;
      }
      tbody.innerHTML = events.map(ev => {
        const dt = ev.date ? fmtDate(ev.date) : '\u2014';
        const venue = ev.venue_name ? esc(ev.venue_name) : '<span class="text-muted">\u2014</span>';
        const cat = ev.category ? `<span class="chip">${esc(ev.category)}</span>` : '';
        const feat = ev.is_featured
          ? '<span class="chip gold">\u2605 featured</span>'
          : '<span class="text-muted">\u2014</span>';
        return `
        <tr>
          <td>${dt}</td>
          <td><strong>${esc(ev.title || '')}</strong></td>
          <td>${venue}</td>
          <td>${cat}</td>
          <td>${feat}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" onclick="window.SLAdmin.editEvent('${ev.id}')"><i class="fas fa-pen"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="window.SLAdmin.toggleFeatured('${ev.id}', ${ev.is_featured ? 'false' : 'true'})"><i class="fas fa-star" style="color:${ev.is_featured ? 'var(--gold)' : 'var(--text3)'}"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="window.SLAdmin.deleteEvent('${ev.id}')" style="color:var(--red)"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('');
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      tbody.innerHTML = `<tr><td colspan="6" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  function openEventModal(ev) {
    if (!state.me || !authorized) return;
    const m = $('#eventModal');
    if (!m) return;
    const fill = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
    const check = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    ev = ev || {};
    const titleEl = document.getElementById('eventModalTitle');
    if (titleEl) titleEl.textContent = ev.id ? 'Edit Event' : 'New Event';
    fill('evId', ev.id || '');
    fill('evTitle', ev.title || '');
    let d = ev.date || '';
    if (typeof d === 'string' && d.length > 10) d = d.slice(0, 10);
    fill('evDate', d);
    fill('evCategory', ev.category || '');
    fill('evStartTime', ev.start_time || '');
    fill('evPrice', ev.price || '');
    fill('evVenueId', ev.venue_id || '');
    fill('evVenueName', ev.venue_name || '');
    fill('evVenueNeighborhood', ev.venue_neighborhood || '');
    fill('evImageUrl', ev.image_url || '');
    fill('evDescription', ev.description || '');
    fill('evEventUrl', ev.event_url || '');
    check('evFeatured', ev.is_featured);
    fill('evVenueSearch', '');
    const results = document.getElementById('evVenueResults');
    if (results) results.innerHTML = '';
    m.style.display = 'flex';

  }

  function closeEventModal() {
    const m = $('#eventModal');
    if (m) m.style.display = 'none';
  }

  async function saveEvent() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
    const getCheck = (id) => { const el = document.getElementById(id); return el ? !!el.checked : false; };
    const id = getVal('evId');
    const payload = {
      title: getVal('evTitle'),
      date: getVal('evDate'),
      category: getVal('evCategory') || null,
      start_time: getVal('evStartTime') || null,
      price: getVal('evPrice') || null,
      venue_id: getVal('evVenueId') || null,
      venue_name: getVal('evVenueName') || null,
      venue_neighborhood: getVal('evVenueNeighborhood') || null,
      image_url: getVal('evImageUrl') || null,
      description: getVal('evDescription') || null,
      event_url: getVal('evEventUrl') || null,
      is_featured: getCheck('evFeatured')
    };
    if (!payload.title || !payload.date) {
      toast('Title and date are required', 'error');
      return;
    }
    try {
      if (id) {
        await api('/admin/events/' + id, { method: 'PATCH', body: payload });
        toast('Event updated', 'success');
      } else {
        await api('/admin/events', { method: 'POST', body: payload });
        toast('Event created', 'success');
      }
      closeEventModal();
      loadEvents();
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      toast('Failed: ' + err.message, 'error');
    }
  }

  // ── Bootstrap ────────────────────────────────
  let wired = false;
  async function bootstrap() {
    if (!wired) { wireEvents(); wired = true; }
    clearAccess();
    const epoch = accessEpoch;
    $('#gateError').textContent = '';
    $('#sl-admin-loading').style.display = 'flex';
    $('#sl-admin-gate').style.display = $('#sl-admin-deny').style.display = 'none';
    let result;
    try { result = await ensureAdmin(epoch); }
    catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      if (epoch === accessEpoch) { showGate(); $('#gateError').textContent = 'Admin access could not be verified. Please retry.'; }
      return;
    }
    if (epoch !== accessEpoch) return;
    if (result && typeof result === 'object') {
      authorized = result;
      state.me = result.user;
      showApp();
      goto('overview');
    } else if (result === 'deny') showDeny();
    else showGate();
  }

  // Refresh emits this event too: only a changed session or lost role should
  // invalidate access. Re-running refresh on its own event would recurse.
  window.addEventListener('sl-auth-changed', event => {
    const token = authToken(), user = event.detail?.user;
    const changed = token !== observedToken;
    const lostRole = authorized && authorized.user.via !== 'secret' && (!user || user.role !== 'admin' || user.id !== authorized.user.id);
    observedToken = token;
    if (!changed && !lostRole) return;
    clearAccess();
    showGate();
    if (!loginPending && (token || ADMIN_SECRET)) bootstrap();
  });
  window.addEventListener('storage', event => {
    // Every cross-tab token transition invalidates outstanding reads, even if
    // several storage events arrive after the token changed A → B → A.
    if (event.key === 'sl_jwt_token') { observedToken = authToken(); bootstrap(); return; }
    if (event.key !== LS_SECRET && event.key !== null) return;
    const secret = localStorage.getItem(LS_SECRET) || '';
    if (secret === ADMIN_SECRET && event.key !== null) return;
    ADMIN_SECRET = secret;
    bootstrap();
  });

  // ── Expose global helpers (called from inline onclick) ──────────────────
  window.SLAdmin = {
    markContact: async function(id, status) {
      try {
        await api('/admin/contacts/' + id, { method: 'PATCH', body: { status } });
        toast('Contact marked as ' + status, 'success');
        const filter = document.getElementById('contactsFilter');
        loadContacts(filter ? filter.value : '');
      } catch (err) {
        if (err.code === 'ADMIN_SESSION_CHANGED') return;
        toast('Failed: ' + err.message, 'error');
      }
    },
    setBusinessStatus: async function(id, status) {
      try {
        await api('/admin/business-users/' + id, { method: 'PATCH', body: { status } });
        toast('Business account ' + status, 'success');
        loadBusiness();
      } catch (err) {
        if (err.code === 'ADMIN_SESSION_CHANGED') return;
        toast('Failed: ' + err.message, 'error');
      }
    },
    editEvent: function(id) {
      const ev = (_evState.list || []).find(e => String(e.id) === String(id));
      if (ev) openEventModal(ev);
    },
    toggleFeatured: async function(id, makeFeatured) {
      try {
        await api('/admin/events/' + id, { method: 'PATCH', body: { is_featured: !!makeFeatured } });
        toast(makeFeatured ? 'Featured' : 'Unfeatured', 'success');
        loadEvents();
      } catch (err) {
        if (err.code === 'ADMIN_SESSION_CHANGED') return;
        toast('Failed: ' + err.message, 'error');
      }
    },
    deleteEvent: async function(id) {
      if (!confirm('Delete this event? This cannot be undone.')) return;
      try {
        await api('/admin/events/' + id, { method: 'DELETE' });
        toast('Event deleted', 'success');
        loadEvents();
      } catch (err) {
        if (err.code === 'ADMIN_SESSION_CHANGED') return;
        toast('Failed: ' + err.message, 'error');
      }
    },
    pickVenue: function(id, name, neighborhood) {
      const setV = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v || ''; };
      setV('evVenueId', id);
      setV('evVenueName', name);
      setV('evVenueNeighborhood', neighborhood);
      const results = document.getElementById('evVenueResults');
      if (results) results.textContent = 'Selected: ' + (name || '');
      const search = document.getElementById('evVenueSearch');
      if (search) search.value = name || '';
    }
  };

  // ── Wire overview stats to real API ──────────────────────────────────────
  async function loadOverviewStats() {
    try {
      const r = await api('/admin/stats');
      const set = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.textContent = fmtNum(v); };
      // real user+venue stats
      set('stat-total',  r.venues && r.venues.total);
      set('stat-active', r.venues && r.venues.active);
      const sub = document.getElementById('stat-total-sub');
      if (sub) sub.textContent = `${fmtNum(r.venues && r.venues.featured)} featured · ${fmtNum(r.venues && r.venues.trending)} trending`;
      // inject user stats row into overview
      const sg = document.getElementById('statsGrid');
      if (sg && !document.getElementById('stat-users-card')) {
        const userCard = `
          <div class="stat-card" data-admin-stat id="stat-users-card">
            <div class="stat-label">Total Users</div>
            <div class="stat-value">${fmtNum(r.users && r.users.total)}</div>
            <div class="stat-sub">${fmtNum(r.users && r.users.this_week)} this week · ${fmtNum(r.users && r.users.today)} today</div>
          </div>
          <div class="stat-card" data-admin-stat>
            <div class="stat-label">Plans</div>
            <div class="stat-value">${fmtNum(r.plans)}</div>
            <div class="stat-sub">night plans created</div>
          </div>
          <div class="stat-card" data-admin-stat>
            <div class="stat-label">Check-ins</div>
            <div class="stat-value">${fmtNum(r.checkins)}</div>
            <div class="stat-sub">venue check-ins</div>
          </div>
          <div class="stat-card" data-admin-stat>
            <div class="stat-label">Reviews</div>
            <div class="stat-value">${fmtNum(r.reviews)}</div>
            <div class="stat-sub">user reviews</div>
          </div>
          <div class="stat-card" data-admin-stat>
            <div class="stat-label">Favorites</div>
            <div class="stat-value">${fmtNum(r.favorites)}</div>
            <div class="stat-sub">saved venues</div>
          </div>`;
        sg.insertAdjacentHTML('beforeend', userCard);
      }
      // Load new contacts count for sidebar badge
      try {
        const cr = await api('/admin/contacts?limit=1&status=new');
        const badge = document.getElementById('sb-contacts-count');
        if (badge) { badge.textContent = cr.total || ''; badge.style.display = cr.total ? '' : 'none'; }
      } catch (err) { if (err.code === 'ADMIN_SESSION_CHANGED') return; }
      // Load user count for sidebar badge
      const sbBadge = document.getElementById('sb-users-count');
      if (sbBadge && r.users) { sbBadge.textContent = fmtNum(r.users.total); }
    } catch (err) {
      if (err.code === 'ADMIN_SESSION_CHANGED') return;
      console.warn('[admin] stats load failed:', err.message);
    }
  }

  // Kickoff
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
