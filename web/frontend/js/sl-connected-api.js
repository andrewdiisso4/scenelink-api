/* SceneLink connected contract. Same-origin only; no optimistic persistence or provider booking claims. */
(function (root) {
  'use strict';
  const pending = new Map();
  const token = () => { try { return root.localStorage.getItem('sl_jwt_token') || ''; } catch (_) { return ''; } };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function safeUrl(value, local) {
    if (typeof value !== 'string' || /[\x00-\x20\\]/.test(value)) return null;
    if (local && /^\/(?!\/)/.test(value)) return value;
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch (_) { return null; }
  }
  function error(message, status, code) { const e = new Error(message); e.status = status; e.code = code; return e; }
  async function request(path, opts) {
    opts = opts || {};
    if (!/^\/[a-z]/i.test(path) || path.includes('://') || path.startsWith('//')) throw error('Invalid API path', 400);
    const session = token(), method = opts.method || 'GET';
    if (method !== 'GET' && !session) throw error('Sign in to save this change.', 401, 'AUTH_REQUIRED');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    const abort = () => controller.abort();
    if (opts.signal) { if (opts.signal.aborted) abort(); else opts.signal.addEventListener('abort', abort, {once:true}); }
    try {
      const headers = {'Accept':'application/json'};
      if (session) headers.Authorization = 'Bearer ' + session;
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await root.fetch('/api' + path, {method, headers, credentials:'omit', cache:'no-store', signal:controller.signal,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)});
      let data;
      try { data = await response.json(); } catch (_) { throw error('The service returned an unreadable response. Please retry.', response.status); }
      if (session !== token()) throw error('Your session changed. Refresh before continuing.', 401, 'SESSION_CHANGED');
      if (!response.ok || data && data.ok === false) throw error(data && (data.error || data.message) || 'The service could not complete this request.', response.status, data && data.code);
      if (!data || typeof data !== 'object') throw error('The service did not confirm this request.', response.status);
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw error(method === 'GET' ? 'Loading timed out. Please retry.' : 'Confirmation timed out. Refresh to check whether your change was saved before retrying.', 408, 'TIMEOUT');
      throw e;
    } finally { clearTimeout(timer); if (opts.signal) opts.signal.removeEventListener('abort', abort); }
  }
  function once(key, action) {
    const id = token() + ':' + key;
    if (pending.has(id)) return pending.get(id);
    const promise = Promise.resolve().then(action).finally(() => pending.delete(id)); pending.set(id, promise); return promise;
  }
  function coordinate(value, limit) {
    // Do not coerce booleans, arrays, objects or blank strings into invented pins.
    if (typeof value === 'string') {
      value = value.trim();
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null;
      value = Number(value);
    }
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
  }
  // Reviewed licensed detail-only pilot. Not a provider response or a fuzzy name match.
  const licensedPhotoRegistry = {
  "db32c169-e07a-4de5-bae0-63ae59a4eaf7": {
    "name": "The Alley Bar",
    "address": "14 Pi Alley",
    "city": "Boston",
    "lat": 42.358109,
    "lng": -71.058716,
    "url": "/images/venues/2a7bd0697c6a2d0eae7d87aee86a9ef4c4f5a06adb5c08aba3d8d1c4a83ea5bd.jpg",
    "author": "4300streetcar",
    "title": "The Alley Bar Boston front March 2025.jpg",
    "source": "https://commons.wikimedia.org/wiki/File:The_Alley_Bar_Boston_front_March_2025.jpg",
    "license": "CC-BY-4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "date": "2025-03-11",
    "changes": "Resized; no crop.",
    "sha256": "2a7bd0697c6a2d0eae7d87aee86a9ef4c4f5a06adb5c08aba3d8d1c4a83ea5bd",
    "originalSha256": "ea39517dc042329c518115976d15a2ab983db73b8f2061ebcc513cf33ff7de9f"
  },
  "7cc80886-1a90-4404-953b-608a51a9d7d2": {
    "name": "Sullivan's Tap",
    "address": "168 Canal Street",
    "city": "Boston",
    "lat": 42.365106,
    "lng": -71.060995,
    "url": "/images/venues/6bdead242454944ba41f00b3e8bd32a9e1727636ae34231b4f874ad9e9b9d47a.jpg",
    "author": "Ethan Long",
    "title": "Sullivan's Tap on Friend Street with new State Street tower looming overhead, Boston (53232570616).jpg",
    "source": "https://commons.wikimedia.org/wiki/File:Sullivan's_Tap_on_Friend_Street_with_new_State_Street_tower_looming_overhead,_Boston_(53232570616).jpg",
    "license": "CC-BY-SA-2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/",
    "date": "2022-11-05",
    "changes": "Original image; no modifications.",
    "sha256": "6bdead242454944ba41f00b3e8bd32a9e1727636ae34231b4f874ad9e9b9d47a",
    "originalSha256": "6bdead242454944ba41f00b3e8bd32a9e1727636ae34231b4f874ad9e9b9d47a"
  }
};
  function licensedPhoto(v) {
    if (!v || v.is_active === false) return null;
    if (!Object.prototype.hasOwnProperty.call(licensedPhotoRegistry,v.id)) return null;
    const p = licensedPhotoRegistry[v.id];
    const norm = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
    if (!p || ['name','address','city'].some(key => norm(v[key]) !== norm(p[key]))) return null;
    if (coordinate(v.lat,90) === null || coordinate(v.lng,180) === null ||
      Math.abs(Number(v.lat)-p.lat)>0.000001 || Math.abs(Number(v.lng)-p.lng)>0.000001) return null;
    return Object.assign({},p);
  }
  function normalize(v) {
    if (!v || typeof v !== 'object' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,179}$/.test(String(v.id||'')) || typeof v.name !== 'string' || !v.name) throw error('Incomplete venue record', 502);
    const out = Object.assign({}, v);
    // Imported aggregates and provider confidence are not community ratings.
    ['rating','review_count','buzz_score','going_count','friends_going','attending_count','is_open_now','reservation_live'].forEach(k => out[k] = null);
    ['trending','featured','spotlight'].forEach(k => out[k] = false);
    out.metrics_status = 'unverified';
    out.lat = coordinate(v.lat, 90); out.lng = coordinate(v.lng, 180);
    if (out.lat === null || out.lng === null) out.lat = out.lng = null;
    ['website','reservation_url','opentable_url','resy_url','google_maps_url'].forEach(k => out[k] = safeUrl(v[k]));
    const b = v.booking || {}, bookingUrl = b.status === 'external_link' ? safeUrl(b.url) : null;
    out.booking = {status:bookingUrl ? 'external_link':'not_available', url:bookingUrl, provider:bookingUrl ? new URL(bookingUrl).hostname.replace(/^www\./,'') : null,
      requires_external_confirmation:true, reservation_confirmed:false};
    out.reservation_is_confirmed = false;
    // No stock photo is presented as a photo of this venue.
    out.thumbnail_url = safeUrl(v.thumbnail_url, true) || '/assets/img/placeholder-venue.svg';
    if (/unsplash\.com|pexels\.com/i.test(out.thumbnail_url)) out.thumbnail_url = '/assets/img/placeholder-venue.svg';
    out.image_url=out.cover_image_url=out.thumbnail_url;
    out.image_urls=out.thumbnail_url.includes('placeholder-')?[]:[out.thumbnail_url];
    out.badges=[];
    out.tags = (Array.isArray(v.tags) ? v.tags : []).filter(t => typeof t === 'string' && !/trending|popular|top.?rated|top pick|featured|spotlight|hot tonight/i.test(t));
    return out;
  }
  async function list(params) {
    params = Object.assign({limit:100,offset:0,view:'detail'},params || {});
    const mode = params.mode; delete params.mode;
    if (params.sort == null || params.sort === '') params.sort = String(params.q ?? params.search ?? '').trim() ? 'relevance' : 'name';
    const q = new URLSearchParams(); Object.keys(params).forEach(k => { if (params[k] != null && params[k] !== '') q.set(k, String(params[k])); });
    const data = await request((mode === 'nightlife' ? '/venues/nightlife' : '/venues') + '?' + q);
    if (!Array.isArray(data.venues)) throw error('Invalid venue response', 502);
    const venues = data.venues.map(normalize);
    return Object.assign({}, data, {venues, has_more:data.has_more === true || Number(data.total) > Number(params.offset) + data.venues.length});
  }
  async function detail(id) { const data = await request('/venues/' + encodeURIComponent(id)); return normalize(data.venue || data); }
  function sourceText(v) {
    const source = typeof v.source === 'string' ? v.source : 'Source not provided';
    const stamp = v.last_enriched_at || v.enriched_at;
    const date = stamp && Number.isFinite(new Date(stamp).getTime()) ? new Date(stamp).toLocaleDateString() : null;
    return source + (date ? ' · data updated ' + date : ' · update date unavailable') + (v.needs_manual_review ? ' · review needed' : '') + '. Confirm hours and details with the venue.';
  }
  root.SLConnected = {request,once,token,esc,safeUrl,error};
  root.SLVenueData = {list,detail,normalize,sourceText,licensedPhoto};
})(window);
