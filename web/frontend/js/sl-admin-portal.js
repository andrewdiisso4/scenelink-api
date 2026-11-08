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
    venues: { page: 1, perPage: 25, total: 0, filters: {} },
    osmCategories: [],
    osmSelected: new Set(),
    csvRows: null,
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
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'})[m]);
  const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());
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

  // ── API wrapper ──────────────────────────────
  async function api(path, opts = {}) {
    const url = path.startsWith('http') ? path : `${API}${path}`;
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Prefer JWT if present
    const token = (window.SLAuth && window.SLAuth.token) || localStorage.getItem('sl_jwt_token') || '';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Fallback: admin secret header
    if (ADMIN_SECRET) headers['x-admin-secret'] = ADMIN_SECRET;

    const resp = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string'
        ? JSON.stringify(opts.body)
        : opts.body,
      credentials: 'same-origin'
    });
    let data = null;
    const text = await resp.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!resp.ok) {
      const err = new Error((data && (data.error || data.message)) || `HTTP ${resp.status}`);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ── Auth gate ────────────────────────────────
  async function ensureAdmin() {
    // Wait for SLAuth
    await new Promise(r => {
      if (window.SLAuth && window.SLAuth.refresh) return r();
      const iv = setInterval(() => { if (window.SLAuth && window.SLAuth.refresh) { clearInterval(iv); r(); } }, 50);
      setTimeout(() => { clearInterval(iv); r(); }, 3000);
    });

    try { if (window.SLAuth && window.SLAuth.refresh) await window.SLAuth.refresh(); } catch {}

    // Check JWT role
    const user = (window.SLAuth && window.SLAuth.user) || null;
    if (user && user.role === 'admin') {
      state.me = user;
      return true;
    }

    // Try admin secret path
    if (ADMIN_SECRET) {
      try {
        await api('/admin/venues/summary');
        state.me = { username: 'admin (secret)', role: 'admin', via: 'secret' };
        return true;
      } catch (err) {
        localStorage.removeItem(LS_SECRET);
        ADMIN_SECRET = '';
      }
    }

    // If user is logged in but not admin → deny screen
    if (user) return 'deny';

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
    const email = $('#adminEmail').value.trim();
    const pwd = $('#adminPassword').value;
    const errEl = $('#gateError');
    errEl.textContent = '';
    if (!email || !pwd) { errEl.textContent = 'Email and password required.'; return; }
    try {
      if (window.SLAuth && window.SLAuth.login) {
        await window.SLAuth.login(email, pwd);
      } else {
        const r = await api('/auth/login', { method: 'POST', body: { email, password: pwd } });
        if (r && r.token) localStorage.setItem('sl_jwt_token', r.token);
        if (r && r.user) localStorage.setItem('sl_user_cache', JSON.stringify(r.user));
      }
      await bootstrap();
    } catch (err) {
      errEl.textContent = err.message || 'Login failed.';
    }
  }

  function handleUseSecret() {
    const secret = $('#adminSecret').value.trim();
    if (!secret) { $('#gateError').textContent = 'Enter admin secret.'; return; }
    ADMIN_SECRET = secret;
    localStorage.setItem(LS_SECRET, secret);
    bootstrap();
  }

  // ── Router ───────────────────────────────────
  function goto(section) {
    state.section = section;
    $$('.admin-section').forEach(s => s.classList.toggle('active', s.id === `section-${section}`));
    $$('.sidebar-nav a').forEach(a => a.classList.toggle('active', a.getAttribute('data-section') === section));

    const titles = {
      'overview': ['Overview', 'SceneLink operations dashboard'],
      'venues': ['Venues', 'Browse, filter, and edit venues'],
      'csv-import': ['CSV Import', 'Upload and import venues from CSV'],
      'osm-import': ['OSM Import', 'Import venue data from OpenStreetMap'],
      'import-history': ['Import History', 'Audit log of imports'],
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
    if (section === 'osm-import') loadOsmCategories();
    if (section === 'import-history') loadHistory();
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
      $('#stat-total-sub').textContent = `${fmtNum(s.active)} active / ${fmtNum((s.total||0) - (s.active||0))} inactive`;
      $('#stat-active').textContent = fmtNum(s.active);
      $('#stat-no-web').textContent = fmtNum(s.missing_website);
      $('#stat-no-coords').textContent = fmtNum(s.missing_coords);
      $('#stat-osm').textContent = fmtNum(s.osm || s.osm_count || 0);
      const avgQ = s.avg_quality != null ? s.avg_quality : (s.avg_quality_score != null ? s.avg_quality_score : null);
      $('#stat-quality').textContent = avgQ != null && avgQ > 0 ? Math.round(avgQ) : '—';

      // Sources table — derived from summary counts
      const sources = [];
      if (s.osm != null) sources.push({ source: 'osm', count: s.osm });
      if (s.csv != null) sources.push({ source: 'csv', count: s.csv });
      if (s.curated != null) sources.push({ source: 'curated', count: s.curated });
      // unknown / legacy
      const known = (s.osm||0) + (s.csv||0) + (s.curated||0);
      const legacy = Math.max(0, (s.total||0) - known);
      if (legacy) sources.push({ source: 'legacy/other', count: legacy });

      const rows = sources.map(r => `
        <tr>
          <td><span class="chip ${r.source === 'osm' ? 'blue' : r.source === 'csv' ? 'gold' : r.source === 'curated' ? 'good' : ''}">${esc(r.source)}</span></td>
          <td class="num">${fmtNum(r.count)}</td>
          <td class="num text-muted">—</td>
          <td class="num text-muted">—</td>
          <td class="num text-muted">—</td>
        </tr>`).join('');
      $('#sourcesTbody').innerHTML = rows || '<tr><td colspan="5" class="loading-state">No data</td></tr>';
    } catch (err) {
      toast('Failed to load overview: ' + err.message, 'error');
      $('#sourcesTbody').innerHTML = `<tr><td colspan="5" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  // ── Venues ───────────────────────────────────
  async function loadVenues() {
    const tbody = $('#venuesTbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    const { page, perPage, filters } = state.venues;
    const params = new URLSearchParams();
    params.set('limit', perPage);
    params.set('offset', (page - 1) * perPage);
    if (filters.q) params.set('q', filters.q);
    if (filters.source) params.set('source', filters.source);
    if (filters.quality) params.set('quality', filters.quality);

    try {
      const data = await api(`/admin/venues/list?${params}`);
      const venues = data.venues || [];
      state.venues.total = data.total || 0;

      if (!venues.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-state">No venues match</td></tr>';
      } else {
        tbody.innerHTML = venues.map(v => {
          const lat = v.latitude || v.lat;
          const lng = v.longitude || v.lng;
          const qualityChip = v.data_quality === 'complete' ? '<span class="chip good">complete</span>' :
                              v.data_quality === 'partial' ? '<span class="chip warn">partial</span>' :
                              v.data_quality === 'stub' ? '<span class="chip bad">stub</span>' :
                              '<span class="chip">—</span>';
          const srcKey = (v.source||'').toLowerCase();
          const isOsm = srcKey === 'osm' || srcKey === 'openstreetmap';
          const src = v.source ? `<span class="chip ${isOsm ? 'blue' : srcKey === 'csv' ? 'gold' : ''}">${esc(v.source)}</span>` : '—';
          return `<tr>
            <td><div style="font-weight:600">${esc(v.name)}</div><div class="text-muted" style="font-size:11px">${esc(v.address || v.neighborhood || '')}</div></td>
            <td>${esc(v.type || v.category || '—')}</td>
            <td>${esc(v.city || '—')}</td>
            <td>${src}</td>
            <td>${qualityChip} <span class="text-muted mono">${v.data_quality_score != null ? v.data_quality_score : ''}</span></td>
            <td>${v.website ? `<a href="${esc(v.website)}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i></a>` : '<span class="text-muted">—</span>'}</td>
            <td>${lat && lng ? '<i class="fas fa-check" style="color:var(--green)"></i>' : '<i class="fas fa-times" style="color:var(--red)"></i>'}</td>
            <td>${v.is_active ? '<span class="chip good">yes</span>' : '<span class="chip bad">no</span>'}</td>
            <td><button class="btn btn-ghost btn-xs" data-edit-venue="${v.id}"><i class="fas fa-pen"></i></button></td>
          </tr>`;
        }).join('');
        // Attach edit handlers
        $$('[data-edit-venue]').forEach(b => b.addEventListener('click', () => openVenueModal(b.getAttribute('data-edit-venue'))));
      }

      const start = (page - 1) * perPage + 1;
      const end = Math.min(page * perPage, state.venues.total);
      $('#venuesCount').textContent = state.venues.total ? `Showing ${start}–${end} of ${fmtNum(state.venues.total)}` : 'No results';
      $('#venuesPrev').disabled = page <= 1;
      $('#venuesNext').disabled = end >= state.venues.total;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  // ── Venue modal ──────────────────────────────
  async function openVenueModal(id) {
    try {
      const v = await api(`/venues/${encodeURIComponent(id)}`);
      const venue = v.venue || v;
      $('#venueModalBody').innerHTML = `
        <div class="form-row">
          <div class="form-field"><label class="form-label">Name</label><input class="form-input" data-field="name" value="${esc(venue.name || '')}"></div>
          <div class="form-field"><label class="form-label">Type</label><input class="form-input" data-field="type" value="${esc(venue.type || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="form-label">City</label><input class="form-input" data-field="city" value="${esc(venue.city || '')}"></div>
          <div class="form-field"><label class="form-label">Neighborhood</label><input class="form-input" data-field="neighborhood" value="${esc(venue.neighborhood || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="form-label">Address</label><input class="form-input" data-field="address" value="${esc(venue.address || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="form-label">Latitude</label><input class="form-input" data-field="lat" type="number" step="any" value="${venue.lat || venue.latitude || ''}"></div>
          <div class="form-field"><label class="form-label">Longitude</label><input class="form-input" data-field="lng" type="number" step="any" value="${venue.lng || venue.longitude || ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="form-label">Website</label><input class="form-input" data-field="website" value="${esc(venue.website || '')}"></div>
          <div class="form-field"><label class="form-label">Phone</label><input class="form-input" data-field="phone" value="${esc(venue.phone || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="form-label">Description</label><textarea class="form-textarea" data-field="description">${esc(venue.description || '')}</textarea></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="form-label">Active</label>
            <select class="form-select" data-field="is_active">
              <option value="true" ${venue.is_active ? 'selected' : ''}>Yes</option>
              <option value="false" ${!venue.is_active ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="form-field"><label class="form-label">Source</label><input class="form-input" data-field="source" value="${esc(venue.source || '')}" readonly></div>
        </div>
      `;
      $('#venueModal').setAttribute('data-venue-id', venue.id);
      $('#venueModal').classList.add('open');
    } catch (err) {
      toast('Failed to load venue: ' + err.message, 'error');
    }
  }

  async function saveVenueModal() {
    const id = $('#venueModal').getAttribute('data-venue-id');
    if (!id) return;
    const data = {};
    $$('#venueModalBody [data-field]').forEach(i => {
      const k = i.getAttribute('data-field');
      let v = i.value;
      if (k === 'is_active') v = v === 'true';
      if (k === 'lat' || k === 'lng' || k === 'latitude' || k === 'longitude') v = v === '' ? null : parseFloat(v);
      if (k === 'source') return; // readonly
      data[k] = v;
    });
    try {
      await api(`/admin/venues/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
      toast('Venue updated', 'success');
      $('#venueModal').classList.remove('open');
      loadVenues();
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    }
  }

  // ── CSV Import ───────────────────────────────
  function setupCsvImport() {
    const drop = $('#csvDropzone');
    const fileInput = $('#csvFile');
    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragging'); }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleCsvFile(f);
    });
    fileInput.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCsvFile(f);
    });
  }

  function handleCsvFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('File too large (max 10 MB)', 'error'); return; }
    if (!window.Papa) { toast('CSV parser not loaded', 'error'); return; }
    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: (results) => {
        const rows = results.data || [];
        const errs = results.errors || [];
        const valid = rows.filter(r => r.name && (r.city || r.address || r.neighborhood));
        state.csvRows = valid;
        renderCsvPreview(valid, rows.length, errs);
      },
      error: (err) => toast('CSV parse error: ' + err.message, 'error')
    });
  }

  function renderCsvPreview(valid, totalRows, errs) {
    const wrap = $('#csvPreviewWrap');
    wrap.classList.remove('hidden');
    $('#csvPreviewStats').textContent =
      `Parsed ${totalRows} rows. ${valid.length} look valid (have name + location). ${errs.length ? errs.length + ' parse errors.' : ''}`;
    $('#csvImportCount').textContent = `(${valid.length})`;

    const cols = valid.length ? Object.keys(valid[0]).slice(0, 10) : [];
    $('#csvPreviewHead').innerHTML = '<tr>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
    const body = valid.slice(0, 25).map(r =>
      '<tr>' + cols.map(c => `<td>${esc(r[c] || '')}</td>`).join('') + '</tr>'
    ).join('');
    $('#csvPreviewBody').innerHTML = body;
  }

  async function doCsvImport() {
    if (!state.csvRows || !state.csvRows.length) { toast('Nothing to import', 'warning'); return; }
    const btn = $('#csvImportBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing…';
    try {
      const res = await api('/admin/venues/import', { method: 'POST', body: { rows: state.csvRows, ifExists: 'update', label: 'admin-csv-' + Date.now() } });
      renderImportResult(res);
      const errCount = res.errored != null ? res.errored : (res.errors && Array.isArray(res.errors) ? res.errors.length : 0);
      toast(`Imported: +${res.inserted || 0} new, ~${res.updated || 0} updated, ${errCount} errors`, errCount ? 'warning' : 'success');
      state.csvRows = null;
      $('#csvPreviewWrap').classList.add('hidden');
      $('#csvFile').value = '';
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
      $('#csvResultWrap').innerHTML = `<div class="alert alert-error"><i class="fas fa-exclamation-triangle"></i> ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Import <span id="csvImportCount"></span> Venues';
    }
  }

  function renderImportResult(res) {
    const wrap = $('#csvResultWrap');
    wrap.classList.remove('hidden');
    const errArr = Array.isArray(res.errors) ? res.errors : (res.sample_errors || []);
    const errCount = res.errored != null ? res.errored : errArr.length;
    const sampleErrors = errArr.slice(0, 5).map(e =>
      `<li>Row ${esc(e.row)}${e.name ? ' ('+esc(e.name)+')' : ''}: ${esc((e.errors && e.errors.join(', ')) || e.message || e.error || '')}</li>`
    ).join('');
    wrap.innerHTML = `
      <div class="alert alert-success">
        <i class="fas fa-check-circle"></i>
        <div>
          <div><strong>Import complete</strong></div>
          <div>Total: ${fmtNum(res.total)} · Inserted: ${fmtNum(res.inserted)} · Updated: ${fmtNum(res.updated)} · Skipped: ${fmtNum(res.skipped)} · Errors: ${fmtNum(errCount)}</div>
          ${sampleErrors ? `<div class="text-muted" style="font-size:11px;margin-top:8px">Sample errors:</div><ul style="margin-top:4px;padding-left:20px;font-size:12px">${sampleErrors}</ul>` : ''}
        </div>
      </div>`;
  }

  function downloadCsvTemplate() {
    const headers = ['name','type','category','city','neighborhood','address','latitude','longitude','website','phone','description','price_range','vibe_tags'];
    const sample = ['The Example Lounge','bar','nightlife','Boston','Back Bay','123 Main St','42.3505','-71.0760','https://example.com','617-555-0100','A cozy craft cocktail spot','$$','cocktails, jazz, date-night'];
    const csv = headers.join(',') + '\n' + sample.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'scenelink-venue-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── OSM Import ───────────────────────────────
  async function loadOsmCategories() {
    if (state.osmCategories.length) { renderOsmCategories(); return; }
    try {
      const r = await api('/admin/venues/osm/categories');
      // Normalize: backend returns array of strings; we want objects
      const raw = r.categories || [];
      state.osmCategories = raw.map(c =>
        typeof c === 'string'
          ? { key: c, label: c.replace(/_/g,' ').replace(/\b\w/g, m=>m.toUpperCase()) }
          : c
      );
      // Also stash city presets
      state.osmPresets = r.city_presets || r.presets || null;
      renderOsmCategories();
      // Update preset dropdown with real backend presets if present
      if (state.osmPresets) {
        const sel = $('#osmPreset');
        const cur = sel.value;
        sel.innerHTML = '<option value="">— select city —</option>' +
          Object.keys(state.osmPresets).map(k => {
            const p = state.osmPresets[k];
            const name = (p && p.name) || k;
            return `<option value="${esc(k)}">${esc(name)}</option>`;
          }).join('') +
          '<option value="custom">Custom bbox…</option>';
        sel.value = cur;
      }
    } catch (err) {
      toast('Failed to load OSM categories: ' + err.message, 'error');
    }
  }

  function renderOsmCategories() {
    const wrap = $('#osmCategories');
    wrap.innerHTML = state.osmCategories.map(c => `
      <label class="cat-chip" data-cat="${esc(c.key)}">
        <input type="checkbox" value="${esc(c.key)}">
        <span>${esc(c.label || c.key)}</span>
      </label>
    `).join('');
    wrap.querySelectorAll('.cat-chip').forEach(chip => {
      const cb = chip.querySelector('input');
      cb.addEventListener('change', () => {
        chip.classList.toggle('selected', cb.checked);
        if (cb.checked) state.osmSelected.add(cb.value);
        else state.osmSelected.delete(cb.value);
        $('#osmImportBtn').disabled = state.osmSelected.size === 0 || !osmHasLocation();
      });
    });
  }

  function osmHasLocation() {
    const preset = $('#osmPreset').value;
    if (preset && preset !== 'custom') return true;
    if (preset === 'custom') return !!$('#osmBbox').value.trim();
    return false;
  }

  function buildOsmPayload() {
    const preset = $('#osmPreset').value;
    const payload = { categories: Array.from(state.osmSelected) };
    if (preset === 'custom') {
      const bbox = $('#osmBbox').value.trim();
      if (!bbox) return null;
      payload.bbox = bbox;
    } else if (preset) {
      payload.city = preset;
    } else {
      return null;
    }
    return payload;
  }

  async function osmPreview() {
    const payload = buildOsmPayload();
    if (!payload) { toast('Select a city or bbox', 'warning'); return; }
    if (!payload.categories.length) { toast('Select at least one category', 'warning'); return; }
    const btn = $('#osmPreviewBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Querying Overpass…';
    try {
      const r = await api('/admin/venues/osm/preview', { method: 'POST', body: payload });
      const count = r.total != null ? r.total : (r.count || 0);
      const wrap = $('#osmResultWrap');
      const sampleList = (r.sample || []).slice(0, 5).map(s =>
        `<li>${esc(s.name || '(unnamed)')} <span class="text-muted">— ${esc(s.category || '')}</span></li>`
      ).join('');
      wrap.innerHTML = `
        <div class="alert alert-info">
          <i class="fas fa-info-circle"></i>
          <div>
            <strong>Preview:</strong> ${fmtNum(count)} venues found in OSM.
            ${r.cached ? ' <span class="chip">cached</span>' : ''}
            ${r.endpoint ? `<div class="text-muted" style="margin-top:4px;font-size:11px">Endpoint: ${esc(r.endpoint)}</div>` : ''}
            ${sampleList ? `<div class="text-muted" style="font-size:11px;margin-top:8px">Sample:</div><ul style="padding-left:20px;font-size:12px;margin-top:4px">${sampleList}</ul>` : ''}
            ${r.attribution ? `<div class="text-muted" style="font-size:10px;margin-top:6px">${esc(r.attribution)}</div>` : ''}
          </div>
        </div>`;
      $('#osmImportBtn').disabled = count === 0;
    } catch (err) {
      $('#osmResultWrap').innerHTML = `<div class="alert alert-error"><i class="fas fa-exclamation-triangle"></i> ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-eye"></i> Preview Count';
    }
  }

  async function osmImport() {
    const payload = buildOsmPayload();
    if (!payload) return;
    if (!confirm(`Import venues from OpenStreetMap?\n\nCategories: ${payload.categories.join(', ')}\nLocation: ${payload.city || payload.bbox}\n\nThis may take 30–60 seconds.`)) return;
    const btn = $('#osmImportBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing… (may take up to 60s)';
    try {
      payload.ifExists = 'update';
      const r = await api('/admin/venues/osm/import', { method: 'POST', body: payload });
      const errCount = r.errored != null ? r.errored : 0;
      $('#osmResultWrap').innerHTML = `
        <div class="alert alert-success">
          <i class="fas fa-check-circle"></i>
          <div>
            <strong>OSM import complete</strong>
            <div>Fetched: ${fmtNum(r.total_elements || 0)} · Processed: ${fmtNum(r.processed || 0)} · Inserted: ${fmtNum(r.inserted)} · Updated: ${fmtNum(r.updated)} · Skipped: ${fmtNum(r.skipped)} · Errors: ${fmtNum(errCount)}</div>
            ${r.endpoint ? `<div class="text-muted mono" style="font-size:11px;margin-top:4px">via ${esc(r.endpoint)}${r.cached ? ' (cached)' : ''}</div>` : ''}
            ${r.attribution ? `<div class="text-muted" style="font-size:10px;margin-top:6px">${esc(r.attribution)}</div>` : ''}
          </div>
        </div>`;
      toast(`OSM import: +${r.inserted||0} new, ~${r.updated||0} updated`, 'success');
      loadOverview();
    } catch (err) {
      $('#osmResultWrap').innerHTML = `<div class="alert alert-error"><i class="fas fa-exclamation-triangle"></i> ${esc(err.message)}</div>`;
      toast('OSM import failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Import Venues';
    }
  }

  // ── Import History ───────────────────────────
  async function loadHistory() {
    const tbody = $('#historyTbody');
    tbody.innerHTML = '<tr><td colspan="10" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    try {
      const r = await api('/admin/venues/imports');
      const rows = r.imports || [];
      if (!rows.length) { tbody.innerHTML = '<tr><td colspan="10" class="loading-state">No imports yet</td></tr>'; return; }
      tbody.innerHTML = rows.map(im => {
        const errN = im.rows_errored || 0;
        return `<tr>
          <td>${fmtDate(im.started_at || im.created_at)}</td>
          <td><span class="chip ${im.source === 'osm' ? 'blue' : 'gold'}">${esc(im.source || '—')}</span></td>
          <td class="text-muted truncate" style="max-width:220px">${esc(im.label || '—')}</td>
          <td class="num">${fmtNum(im.rows_total)}</td>
          <td class="num" style="color:var(--green)">${fmtNum(im.rows_inserted)}</td>
          <td class="num" style="color:var(--blue)">${fmtNum(im.rows_updated)}</td>
          <td class="num text-muted">${fmtNum(im.rows_skipped)}</td>
          <td class="num" style="color:${errN ? 'var(--red)' : 'var(--text3)'}">${fmtNum(errN)}</td>
          <td>${esc(im.status || '—')}</td>
          <td>${errN ? `<button class="btn btn-ghost btn-xs" data-errors="${im.id}">View</button>` : ''}</td>
        </tr>`;
      }).join('');
      $$('[data-errors]').forEach(b => b.addEventListener('click', () => showImportErrors(b.getAttribute('data-errors'))));
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="10" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  async function showImportErrors(id) {
    try {
      const r = await api(`/admin/venues/imports/${encodeURIComponent(id)}/errors`);
      const errs = r.errors || [];
      alert(errs.length
        ? `Errors (${errs.length}):\n\n` + errs.slice(0, 30).map(e => `Row ${e.row}: ${e.message || e.error}`).join('\n')
        : 'No errors recorded.');
    } catch (err) {
      toast('Failed to load errors: ' + err.message, 'error');
    }
  }

  // ── Data Quality ─────────────────────────────
  async function loadDataQuality(filter) {
    const tbody = $('#dqTbody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    try {
      // Fetch quality bucket counts in parallel — using actual status names
      const [complete, needsImage, needsNhood, lowQ, summary] = await Promise.all([
        api('/admin/venues/list?quality=complete&limit=1').catch(()=>({total:0})),
        api('/admin/venues/list?quality=needs_image&limit=1').catch(()=>({total:0})),
        api('/admin/venues/list?quality=needs_neighborhood&limit=1').catch(()=>({total:0})),
        api('/admin/venues/list?quality=low_quality&limit=1').catch(()=>({total:0})),
        api('/admin/venues/summary').catch(()=>({missing_website:0}))
      ]);
      $('#dq-complete').textContent = fmtNum(complete.total || 0);
      $('#dq-no-image').textContent = fmtNum(needsImage.total || 0);
      $('#dq-no-website').textContent = fmtNum(summary.missing_website || 0);
      $('#dq-no-nhood').textContent = fmtNum(needsNhood.total || 0);
      $('#dq-low').textContent = fmtNum(lowQ.total || 0);

      // Map filter button keys to actual quality statuses where supported
      const qualityMap = {
        'stub': 'low_quality',
        'no_image': 'needs_image',
        'no_neighborhood': 'needs_neighborhood',
        'no_type': 'needs_category'
      };
      const q = new URLSearchParams({ limit: '50' });
      if (filter && qualityMap[filter]) {
        q.set('quality', qualityMap[filter]);
      } else if (filter && filter !== 'stub') {
        // For filters not mapped to backend quality (no_website, no_coords, no_phone),
        // fetch a larger page and filter client-side
        q.set('limit', '200');
      }
      const v = await api(`/admin/venues/list?${q}`);
      let rows = v.venues || [];
      if (filter && filter !== 'stub') {
        rows = rows.filter(ven => {
          if (filter === 'no_website') return !ven.website;
          if (filter === 'no_coords') return !(ven.lat || ven.latitude) || !(ven.lng || ven.longitude);
          if (filter === 'no_phone') return !ven.phone;
          if (filter === 'no_type') return !ven.type && !ven.category;
          if (filter === 'no_neighborhood') return !ven.neighborhood;
          return true;
        }).slice(0, 50);
      }
      if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading-state">No venues match</td></tr>'; return; }
      tbody.innerHTML = rows.map(venue => {
        const lat = venue.lat || venue.latitude;
        const lng = venue.lng || venue.longitude;
        const issues = [];
        if (!venue.website) issues.push('<span class="chip bad">no website</span>');
        if (!lat || !lng) issues.push('<span class="chip bad">no coords</span>');
        if (!venue.phone) issues.push('<span class="chip warn">no phone</span>');
        if (!venue.neighborhood) issues.push('<span class="chip warn">no neighborhood</span>');
        if (!venue.type && !venue.category) issues.push('<span class="chip warn">no type</span>');
        const scoreColor = venue.data_quality_score >= 80 ? 'var(--green)' :
                          venue.data_quality_score >= 40 ? 'var(--orange)' : 'var(--red)';
        return `<tr>
          <td><div style="font-weight:600">${esc(venue.name)}</div><div class="text-muted" style="font-size:11px">${esc(venue.source || '—')}</div></td>
          <td>${esc(venue.city || '—')}</td>
          <td>${esc(venue.source || '—')}</td>
          <td><span class="mono" style="color:${scoreColor};font-weight:700">${venue.data_quality_score != null ? venue.data_quality_score : '—'}</span></td>
          <td>${issues.join(' ') || '<span class="chip good">OK</span>'}</td>
          <td><button class="btn btn-ghost btn-xs" data-edit-venue="${venue.id}"><i class="fas fa-pen"></i></button></td>
        </tr>`;
      }).join('');
      $$('[data-edit-venue]').forEach(b => b.addEventListener('click', () => openVenueModal(b.getAttribute('data-edit-venue'))));
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  async function recomputeQuality() {
    if (!confirm('Recompute data quality scores for all venues? This may take a minute.')) return;
    try {
      toast('Recomputing quality scores…', 'info');
      const r = await api('/admin/venues/recompute-quality', { method: 'POST' });
      toast(`Updated ${fmtNum(r.updated)} venues`, 'success');
      loadOverview();
      if (state.section === 'data-quality') loadDataQuality();
    } catch (err) {
      toast('Recompute failed: ' + err.message, 'error');
    }
  }

  // ── Users ────────────────────────────────────
  // ── Users (paginated + search) ──────────────────────────────────────────
  let _usersState = { page: 1, limit: 25, total: 0, search: '' };

  async function loadUsers(page, search) {
    if (page != null) _usersState.page = page;
    if (search != null) _usersState.search = search;
    const tbody = $('#usersTbody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="loading-spinner"></div></td></tr>';
    try {
      const offset = (_usersState.page - 1) * _usersState.limit;
      const qs = `/admin/users?limit=${_usersState.limit}&offset=${offset}` +
        (_usersState.search ? `&search=${encodeURIComponent(_usersState.search)}` : '');
      const r = await api(qs);
      const users = r.users || [];
      _usersState.total = r.total || users.length;
      if (!users.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading-state">No users found</td></tr>'; return; }
      tbody.innerHTML = users.map(u => `
        <tr>
          <td><strong>${esc(u.display_name || u.username || '—')}</strong></td>
          <td><a href="mailto:${esc(u.email)}" style="color:var(--gold)">${esc(u.email || '—')}</a></td>
          <td class="mono">${esc(u.username || '—')}</td>
          <td>${u.role === 'admin' ? '<span class="chip gold">admin</span>' : `<span class="chip">${esc(u.role || 'user')}</span>`}</td>
          <td class="num">${fmtNum(u.favorite_count || 0)}</td>
          <td class="num">${fmtNum(u.checkin_count || 0)}</td>
          <td>${fmtDate(u.created_at)}</td>
        </tr>`).join('');
      const start = offset + 1, end = Math.min(offset + users.length, _usersState.total);
      const countEl = $('#usersCount');
      if (countEl) countEl.textContent = `Showing ${start}–${end} of ${fmtNum(_usersState.total)} users`;
      const sbBadge = $('#sb-users-count');
      if (sbBadge) { sbBadge.textContent = fmtNum(_usersState.total); sbBadge.style.display = ''; }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
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
      tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  // ── API Status ───────────────────────────────
  async function loadApiStatus() {
    const body = $('#apiStatusBody');
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
    try {
      const r = await fetch(`${API.replace(/\/api$/, '')}/health`).then(x => x.json()).catch(() => ({}));
      const h = await fetch(`${API}/health`).then(x => x.json()).catch(() => null);
      const s = await api('/admin/venues/summary').catch(() => null);
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

    // Users search + pagination
    const usersSearchBtn = $('#usersSearchBtn');
    const usersSearchInput = $('#usersSearch');
    if (usersSearchBtn) usersSearchBtn.addEventListener('click', () => loadUsers(1, usersSearchInput ? usersSearchInput.value : ''));
    if (usersSearchInput) usersSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadUsers(1, usersSearchInput.value); });
    const usersPrev = $('#usersPrev');
    const usersNext = $('#usersNext');
    if (usersPrev) usersPrev.addEventListener('click', () => { if (_usersState.page > 1) loadUsers(_usersState.page - 1); });
    if (usersNext) usersNext.addEventListener('click', () => { if (_usersState.page * _usersState.limit < _usersState.total) loadUsers(_usersState.page + 1); });

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
    $('#denyLogout').addEventListener('click', async () => {
      if (window.SLAuth && window.SLAuth.logout) await window.SLAuth.logout();
      localStorage.removeItem(LS_SECRET);
      window.location.reload();
    });
    $('#sbLogout').addEventListener('click', async () => {
      if (window.SLAuth && window.SLAuth.logout) await window.SLAuth.logout();
      localStorage.removeItem(LS_SECRET);
      window.location.reload();
    });

    // Venues filters
    $('#venuesApplyFilters').addEventListener('click', () => {
      state.venues.filters = {
        q: $('#venuesSearch').value.trim(),
        source: $('#venuesSource').value,
        quality: $('#venuesQuality').value
      };
      state.venues.page = 1;
      loadVenues();
    });
    $('#venuesSearch').addEventListener('keydown', e => { if (e.key === 'Enter') $('#venuesApplyFilters').click(); });
    $('#venuesPrev').addEventListener('click', () => { if (state.venues.page > 1) { state.venues.page--; loadVenues(); } });
    $('#venuesNext').addEventListener('click', () => { state.venues.page++; loadVenues(); });

    // Venue modal
    $('#venueModalClose').addEventListener('click', () => $('#venueModal').classList.remove('open'));
    $('#venueModalCancel').addEventListener('click', () => $('#venueModal').classList.remove('open'));
    $('#venueModalSave').addEventListener('click', saveVenueModal);

    // CSV
    setupCsvImport();
    $('#csvClearBtn').addEventListener('click', () => {
      state.csvRows = null;
      $('#csvPreviewWrap').classList.add('hidden');
      $('#csvFile').value = '';
    });
    $('#csvImportBtn').addEventListener('click', doCsvImport);
    $('#downloadTemplateBtn').addEventListener('click', downloadCsvTemplate);

    // OSM
    $('#osmPreset').addEventListener('change', e => {
      $('#osmBboxWrap').style.display = e.target.value === 'custom' ? '' : 'none';
      $('#osmImportBtn').disabled = state.osmSelected.size === 0 || !osmHasLocation();
    });
    $('#osmBbox').addEventListener('input', () => {
      $('#osmImportBtn').disabled = state.osmSelected.size === 0 || !osmHasLocation();
    });
    $('#osmPreviewBtn').addEventListener('click', osmPreview);
    $('#osmImportBtn').addEventListener('click', osmImport);

    // Data quality filters
    $$('[data-dq-filter]').forEach(b => b.addEventListener('click', () => {
      $$('[data-dq-filter]').forEach(x => x.classList.remove('btn-primary'));
      $$('[data-dq-filter]').forEach(x => x.classList.add('btn-ghost'));
      b.classList.remove('btn-ghost');
      b.classList.add('btn-primary');
      loadDataQuality(b.getAttribute('data-dq-filter'));
    }));

    // Recompute
    $('#recomputeQualityBtn').addEventListener('click', recomputeQuality);
    $('#recomputeQualityBtn2').addEventListener('click', recomputeQuality);
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
      tbody.innerHTML = `<tr><td colspan="6" class="loading-state">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  function openEventModal(ev) {
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
    wireVenueSearch();
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
      toast('Failed: ' + err.message, 'error');
    }
  }

  let _venueSearchTimer = null;
  function wireVenueSearch() {
    const input = document.getElementById('evVenueSearch');
    const results = document.getElementById('evVenueResults');
    if (!input || !results || input.dataset.wired === '1') return;
    input.dataset.wired = '1';
    input.addEventListener('input', () => {
      clearTimeout(_venueSearchTimer);
      const q = (input.value || '').trim();
      if (!q || q.length < 2) { results.innerHTML = ''; return; }
      _venueSearchTimer = setTimeout(async () => {
        try {
          const r = await api('/admin/venues?search=' + encodeURIComponent(q) + '&limit=8');
          const vs = r.venues || [];
          results.innerHTML = vs.length ? vs.map(v => {
            const nm = (v.name || '').replace(/'/g, "\\'");
            const nb = (v.neighborhood || '').replace(/'/g, "\\'");
            return `<div style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer;font-size:12px" onclick="window.SLAdmin.pickVenue('${v.id}','${nm}','${nb}')"><strong>${esc(v.name || '')}</strong> <span class="text-muted">${esc(v.neighborhood || '')}</span></div>`;
          }).join('') : '<div class="text-muted" style="font-size:11px">No matches</div>';
        } catch (_) {}
      }, 250);
    });
  }

  // ── Bootstrap ────────────────────────────────
  async function bootstrap() {
    $('#sl-admin-loading').style.display = 'flex';
    const status = await ensureAdmin();
    if (status === true) {
      showApp();
      wireEvents();
      goto('overview');
    } else if (status === 'deny') {
      showDeny();
    } else {
      showGate();
    }
  }

  // ── Expose global helpers (called from inline onclick) ──────────────────
  window.SLAdmin = {
    markContact: async function(id, status) {
      try {
        await api('/admin/contacts/' + id, { method: 'PATCH', body: { status } });
        toast('Contact marked as ' + status, 'success');
        const filter = document.getElementById('contactsFilter');
        loadContacts(filter ? filter.value : '');
      } catch (err) {
        toast('Failed: ' + err.message, 'error');
      }
    },
    setBusinessStatus: async function(id, status) {
      try {
        await api('/admin/business-users/' + id, { method: 'PATCH', body: { status } });
        toast('Business account ' + status, 'success');
        loadBusiness();
      } catch (err) {
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
        toast('Failed: ' + err.message, 'error');
      }
    },
    pickVenue: function(id, name, neighborhood) {
      const setV = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v || ''; };
      setV('evVenueId', id);
      setV('evVenueName', name);
      setV('evVenueNeighborhood', neighborhood);
      const results = document.getElementById('evVenueResults');
      if (results) results.innerHTML = '<div class="text-muted" style="font-size:11px">\u2713 ' + (name || '') + '</div>';
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
          <div class="stat-card" id="stat-users-card">
            <div class="stat-label">Total Users</div>
            <div class="stat-value">${fmtNum(r.users && r.users.total)}</div>
            <div class="stat-sub">${fmtNum(r.users && r.users.this_week)} this week · ${fmtNum(r.users && r.users.today)} today</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Plans</div>
            <div class="stat-value">${fmtNum(r.plans)}</div>
            <div class="stat-sub">night plans created</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Check-ins</div>
            <div class="stat-value">${fmtNum(r.checkins)}</div>
            <div class="stat-sub">venue check-ins</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Reviews</div>
            <div class="stat-value">${fmtNum(r.reviews)}</div>
            <div class="stat-sub">user reviews</div>
          </div>
          <div class="stat-card">
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
      } catch (_) {}
      // Load user count for sidebar badge
      const sbBadge = document.getElementById('sb-users-count');
      if (sbBadge && r.users) { sbBadge.textContent = fmtNum(r.users.total); }
    } catch (err) {
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