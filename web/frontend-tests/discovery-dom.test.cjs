'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
const reply = body => ({ ok: true, status: 200, json: async () => body });
const venue = (id, name = id) => ({ id, name, type: 'bar', lat: 42.35, lng: -71.06, source: 'Synthetic test fixture' });
function leaflet() {
  const state = { maps: 0, markers: new Set(), tileOptions: null, zooms: 0, bounds: [], pans: [], cameraEvents: [] };
  const events = {}, tileEvents = {};
  state.viewport = [42.3,-71.2,42.4,-71]; state.move = () => events.moveend && events.moveend(); state.tileFail = () => tileEvents.tileerror();
  const map = { on(name, fn) { events[name] = fn; }, getBounds() { const b = state.viewport; return {getSouth:()=>b[0],getWest:()=>b[1],getNorth:()=>b[2],getEast:()=>b[3]}; }, removeLayer: marker => state.markers.delete(marker), invalidateSize() { state.cameraEvents.push('resize'); }, fitBounds(points) { state.cameraEvents.push('fit'); state.bounds.push(points.map(point => Array.from(point))); }, panTo(point) { state.cameraEvents.push('pan'); state.pans.push(Array.from(point)); }, setView() {}, remove() {}, zoomIn() { state.zooms++; }, zoomOut() {} };
  const L = {
    map() { state.maps++; return map; },
    tileLayer(url, options) { state.tileUrl = url; state.tileOptions = options; return { addTo() { return this; }, on(name, fn) { tileEvents[name] = fn; return this; }, redraw() { state.redraws = (state.redraws || 0) + 1; } }; },
    divIcon: x => x,
    marker(point, options) { const marker = { options, point, addTo() { state.markers.add(marker); return marker; }, on() {} }; return marker; },
    latLngBounds: x => x
  };
  return { L, state };
}
function harness(page, fetch, search = '', withMap = true) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(read(page + '.html'), { url: 'https://scenelink.test/' + page + search, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, fake = leaflet();
  w.fetch = fetch; w.AbortController = AbortController;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  if (withMap) {
    w.L = fake.L;
    const css = w.document.createElement('link'); css.rel = 'stylesheet'; css.dataset.slLeaflet = 'true'; css.dataset.slLeafletState = 'ready';
    w.document.head.appendChild(css);
  }
  for (const script of ['sl-connected-api', 'sl-perf-loader', 'sl-discovery-map', 'sl-discovery-filters', 'sl-venue-detail', page === 'explore' ? 'explore-premium' : 'nightlife-explore-match']) w.eval(read('js/' + script + '.js'));
  return { dom, w, errors, fake };
}
for (const page of ['explore', 'nightlife']) {
  test(page + ': actual map movement before venue loading is not replaced by initial result bounds', async () => {
    let finish;
    const h = harness(page, () => new Promise(resolve => { finish = resolve; }));
    try {
      await tick();
      h.w.document.getElementById('slMapCanvas').dispatchEvent(new h.w.Event('pointerdown'));
      finish(reply({ venues: [{ ...venue('quincy'), lat: 42.2529, lng: -71.0023 }], total: 1 })); await tick();
      h.w.document.querySelector('[data-view="list"]').click(); h.w.document.querySelector('[data-view="map"]').click(); await tick();
      assert.equal(h.fake.state.bounds.length, 0);
      h.w.__slExploreData.showVenue('quincy');
      assert.deepEqual(h.fake.state.pans, [[42.2529, -71.0023]], 'a later explicit venue selection remains actionable');
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': List during map loading defers the Quincy camera until Map is shown', async () => {
    const h = harness(page, async () => reply({ venues: [{ ...venue('quincy'), lat: 42.2529, lng: -71.0023 }], total: 1 }), '', false);
    try {
      await tick(); h.w.document.querySelector('[data-view="list"]').click();
      h.w.L = h.fake.L;
      h.w.document.querySelector('script[data-sl-leaflet]').dispatchEvent(new h.w.Event('load'));
      h.w.document.querySelector('link[data-sl-leaflet]').dispatchEvent(new h.w.Event('load')); await tick();
      assert(h.w.document.getElementById('slListView').classList.contains('active'));
      assert.equal(h.fake.state.bounds.length, 0);
      h.w.document.querySelector('[data-view="map"]').click(); await tick();
      assert.deepEqual(JSON.parse(JSON.stringify(h.fake.state.bounds)), [[[42.2529, -71.0023]]]);
      const fitted = h.fake.state.cameraEvents.indexOf('fit');
      assert.equal(h.fake.state.cameraEvents[fitted - 1], 'resize');
      h.w.document.getElementById('slMapCanvas').dispatchEvent(new h.w.Event('pointerdown'));
      h.w.document.querySelector('[data-view="list"]').click(); h.w.document.querySelector('[data-view="map"]').click(); await tick();
      assert.equal(h.fake.state.bounds.length, 1, 'returning to Map respects an established or manually moved camera');
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  for (const selectInList of [false, true]) test(page + ': a venue selected before map readiness is centered ' + (selectInList ? 'on return from List' : 'when Map becomes ready'), async () => {
    const h = harness(page, async () => reply({ venues: [venue('downtown'), { ...venue('quincy'), lat: 42.2529, lng: -71.0023 }], total: 2 }), '', false);
    try {
      await tick();
      if (selectInList) h.w.document.querySelector('[data-view="list"]').click();
      h.w.__slExploreData.showVenue('quincy');
      h.w.L = h.fake.L;
      h.w.document.querySelector('script[data-sl-leaflet]').dispatchEvent(new h.w.Event('load'));
      h.w.document.querySelector('link[data-sl-leaflet]').dispatchEvent(new h.w.Event('load')); await tick();
      if (selectInList) {
        assert.equal(h.fake.state.pans.length, 0);
        h.w.document.querySelector('[data-view="map"]').click(); await tick();
      }
      assert.deepEqual(h.fake.state.pans, [[42.2529, -71.0023]]);
      assert.equal(h.fake.state.bounds.length, 0, 'the selected venue wins over the full result bounds');
      const panned = h.fake.state.cameraEvents.indexOf('pan'); assert.equal(h.fake.state.cameraEvents[panned - 1], 'resize');
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': delayed map fits the latest located results, not an earlier downtown result', async () => {
    const h = harness(page, async url => reply({ venues: [new URL(url, 'https://scenelink.test').searchParams.get('q') ?
      { ...venue('quincy'), lat: 42.2529, lng: -71.0023 } : venue('downtown')], total: 1 }), '', false);
    try {
      await tick();
      h.w.__slExploreData.showVenue('downtown');
      h.w.document.getElementById('slSearchInput').value = 'Quincy'; h.w.document.getElementById('slSearchBtn').click(); await tick();
      assert.equal(h.fake.state.bounds.length, 0);
      h.w.L = h.fake.L;
      h.w.document.querySelector('script[data-sl-leaflet]').dispatchEvent(new h.w.Event('load'));
      h.w.document.querySelector('link[data-sl-leaflet]').dispatchEvent(new h.w.Event('load')); await tick();
      assert.equal(h.fake.state.markers.size, 1);
      assert.equal(h.fake.state.pans.length, 0, 'a selection discarded by a newer query is not restored');
      assert.deepEqual(JSON.parse(JSON.stringify(h.fake.state.bounds)), [[[42.2529, -71.0023]]]);
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': delayed map never fits empty or invalid coordinate bounds', async () => {
    const h = harness(page, async () => reply({ venues: [{ ...venue('unlocated'), lat: null, lng: null }, { ...venue('invalid'), lat: 999, lng: -71 }], total: 2 }), '', false);
    try {
      await tick(); h.w.L = h.fake.L;
      h.w.document.querySelector('script[data-sl-leaflet]').dispatchEvent(new h.w.Event('load'));
      h.w.document.querySelector('link[data-sl-leaflet]').dispatchEvent(new h.w.Event('load')); await tick();
      assert.equal(h.fake.state.markers.size, 0); assert.equal(h.fake.state.bounds.length, 0);
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': canonical category filters find later-page venues and modal apply/clear controls the same query', async () => {
    const calls = [];
    const h = harness(page, async url => {
      const query = new URL(url, 'https://scenelink.test').searchParams;
      calls.push(Object.fromEntries(query));
      return reply(query.get('type') && query.get('type') !== 'all' ? { venues: [venue('after-first-100', 'Matching venue')], total: 1 } :
        { venues: Array.from({ length: 100 }, (_, i) => venue('base-' + i)), total: 200, has_more: true });
    }, '?q=dinner');
    try {
      await tick();
      h.w.document.querySelector('[data-cat="bar"]').click(); await tick();
      assert.equal(calls.at(-1).type, 'bar'); assert.equal(calls.at(-1).offset, '0');
      assert.equal(h.w.document.querySelector('.sl-list-card').dataset.id, 'after-first-100');
      assert.match(h.w.document.getElementById('slListCount').textContent, /1 of 1 matching venues/);
      assert.equal(h.fake.state.markers.size, 1);
      h.w.document.getElementById('slFilterBtn').click();
      const form = h.w.document.getElementById('slDiscoveryFilters');
      form.elements.namedItem('price_level').value = '2';
      form.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(calls.length, 2, 'cancelled drafts do not issue a query');
      h.w.document.getElementById('slFilterBtn').click();
      assert.equal(form.elements.namedItem('price_level').value, '');
      for (const [key, value] of Object.entries({ type: 'lounge', cuisine: 'Italian', neighborhood: 'Back Bay', vibe: 'cozy', price_level: '2' })) form.elements.namedItem(key).value = value;
      form.dispatchEvent(new h.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
      const query = calls.at(-1);
      assert.equal(query.type, 'lounge'); assert.equal(query.cuisine.toLowerCase(), 'italian');
      assert.equal(query.neighborhood, 'Back Bay'); assert.equal(query.vibe, 'cozy'); assert.equal(query.price_level, '2'); assert.equal(query.q, 'dinner'); assert.equal(query.offset, '0');
      assert(h.w.document.querySelector('[data-cat="lounge"]').classList.contains('active'));
      h.w.document.getElementById('slFilterBtn').click(); h.w.document.getElementById('slFilterReset').click(); await tick();
      assert(['all', undefined].includes(calls.at(-1).type));
      for (const key of ['cuisine', 'neighborhood', 'vibe', 'price_level']) assert.equal(calls.at(-1)[key], undefined);
      assert.equal(calls.at(-1).q, 'dinner'); assert.equal(calls.at(-1).offset, '0');
      assert.equal(h.w.document.querySelectorAll('.sl-list-card').length, 100);
      assert.match(form.querySelector('.sl-filter-unavailable').textContent, /Distance, verified ratings, music genres, open-now status, live attendance and booking availability filters are unavailable/);
      assert.equal(h.w.document.querySelectorAll('[data-genre],#slDistFilters,#slRatFilters,#slVibeFilters,[data-dist],[data-vibe]').length, 0);
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': a changed filter resets pagination and discards old page and filter responses', async () => {
    const pending = [];
    const h = harness(page, url => new Promise(resolve => pending.push({ query: Object.fromEntries(new URL(url, 'https://scenelink.test').searchParams), resolve })));
    try {
      await tick(); pending[0].resolve(reply({ venues: [venue('old')], total: 2, has_more: true })); await tick();
      [...h.w.document.querySelectorAll('#slListCards button')].find(button => button.textContent === 'Load more venues').click(); await tick();
      assert.equal(pending[1].query.offset, '1');
      h.w.document.querySelector('[data-cat="bar"]').click();
      assert.equal(h.fake.state.markers.size, 0, 'outdated pins are cleared while the new filter loads');
      h.w.document.querySelector('[data-cat="lounge"]').click(); await tick();
      assert.equal(pending[2].query.offset, '0'); assert.equal(pending[3].query.offset, '0');
      pending[3].resolve(reply({ venues: [venue('newest')], total: 1 })); await tick();
      pending[1].resolve(reply({ venues: [venue('old-page')], total: 2 })); pending[2].resolve(reply({ venues: [venue('old-filter')], total: 1 })); await tick();
      assert.equal(h.w.document.querySelectorAll('.sl-list-card').length, 1);
      assert.equal(h.w.document.querySelector('.sl-list-card').dataset.id, 'newest');
      assert.match(h.w.document.getElementById('slListCount').textContent, /1 of 1 matching venues/);
      assert.equal(h.fake.state.markers.size, 1); assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  for (const withMap of [false, true]) test(page + ': card selection and detail button work ' + (withMap ? 'with a map' : 'without a map'), async () => {
    const h = harness(page, async url => reply(url.includes('/reviews') ? { reviews: [] } : /\/venues\/selected$/.test(url) ? venue('selected') : { venues: [venue('selected')], total: 1 }), '', withMap);
    try {
      await tick();
      h.w.document.querySelector('[data-view="list"]').click();
      h.w.document.querySelector('.sl-list-card-name').click();
      if (withMap) {
        assert(h.w.document.getElementById('slVenueWrap').classList.contains('visible'));
        h.w.document.getElementById('slCardDetailBtn').click();
      }
      await tick();
      assert(h.w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));
      assert.equal(h.w.document.querySelector('.sl-vd-content h1').textContent, 'selected');
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': search finds canonical results beyond first 100 and clears the initial URL query', async () => {
    const calls = [];
    const h = harness(page, async url => {
      const q = new URL(url, 'https://scenelink.test').searchParams.get('q') || '';
      calls.push(q);
      return reply({ venues: q ? [venue('beyond-100', 'Contessa')] : Array.from({ length: 100 }, (_, i) => venue('first-' + i)), total: q ? 1 : 250, has_more: !q });
    }, '?q=Contessa');
    try {
      await tick();
      assert(h.w.document.getElementById('slListCards').textContent.includes('Contessa'));
      const input = h.w.document.getElementById('slSearchInput');
      input.value = '';
      h.w.document.getElementById('slSearchBtn').click();
      await tick();
      assert.equal(calls.at(-1), '');
      assert.equal(h.w.document.querySelectorAll('.sl-list-card').length, 100);
      input.value = 'canonical alias';
      input.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await tick();
      assert.equal(calls.at(-1), 'canonical alias');
      assert(h.w.document.getElementById('slListCards').textContent.includes('Contessa'), 'server alias results must not be filtered by the local name');
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': a slow initial request cannot replace a newer query or restore its input', async () => {
    const pending = [];
    const h = harness(page, url => new Promise(resolve => pending.push({ url, resolve })), '?q=old');
    try {
      await tick();
      const input = h.w.document.getElementById('slSearchInput');
      input.value = 'new'; h.w.document.getElementById('slSearchBtn').click();
      await tick();
      assert.equal(pending.length, 2);
      pending[1].resolve(reply({ venues: [venue('new', 'New result')], total: 1 }));
      await tick();
      pending[0].resolve(reply({ venues: [venue('old', 'Old result')], total: 1 }));
      await tick();
      assert.equal(input.value, 'new');
      assert.equal(h.w.document.querySelector('.sl-list-card').dataset.id, 'new');
      assert.equal(h.fake.state.markers.size, 1);
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': empty search removes old pins and later pages remain reachable', async () => {
    const calls = [];
    const h = harness(page, async url => {
      const p = new URL(url, 'https://scenelink.test').searchParams;
      calls.push({ q: p.get('q'), offset: p.get('offset') });
      return reply(p.get('q') === 'missing' ? { venues: [], total: 0 } : Number(p.get('offset')) > 0 ?
        { venues: [venue('next-page')], total: 2, has_more: false } : { venues: [venue('first-page')], total: 2, has_more: true });
    });
    try {
      await tick();
      const more = [...h.w.document.querySelectorAll('#slListCards button')].find(button => button.textContent === 'Load more venues');
      assert(more); more.click(); await tick();
      assert.equal(calls.at(-1).offset, '1');
      assert.equal(h.w.document.querySelectorAll('.sl-list-card').length, 2);
      assert.equal(h.fake.state.markers.size, 2);
      h.w.document.getElementById('slSearchInput').value = 'missing'; h.w.document.getElementById('slSearchBtn').click();
      await tick();
      assert.equal(h.fake.state.markers.size, 0);
      assert.equal(h.w.document.querySelectorAll('.sl-list-card').length, 0);
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': late Leaflet initializes once, has attribution, and list/search work through failure and retry', async () => {
    const h = harness(page, async () => reply({ venues: [venue('ready')], total: 1 }), '', false);
    try {
      await tick();
      const w = h.w, scripts = () => w.document.querySelectorAll('script[data-sl-leaflet]');
      assert.equal(scripts().length, 1, 'no observer or scroll is needed on the full-screen page');
      assert.equal(w.document.getElementById('slZoomIn').disabled, true);
      assert.equal(w.document.querySelectorAll('.sl-list-card').length, 1);
      w.document.querySelector('[data-map-list]').click();
      assert(w.document.getElementById('slListView').classList.contains('active'));
      scripts()[0].dispatchEvent(new w.Event('error')); await tick();
      assert.match(w.document.querySelector('.sl-map-status').textContent, /Map unavailable/);
      w.document.querySelector('[data-map-retry]').click(); await tick();
      assert.equal(scripts().length, 1);
      w.L = h.fake.L; scripts()[0].dispatchEvent(new w.Event('load')); await tick();
      assert.equal(h.fake.state.maps, 0, 'JavaScript alone is not map readiness');
      w.document.querySelector('link[data-sl-leaflet]').dispatchEvent(new w.Event('load')); await tick();
      assert.equal(h.fake.state.maps, 1);
      assert.equal(h.fake.state.markers.size, 1);
      assert.equal(h.fake.state.bounds.length, 0, 'late loading respects the user-chosen List view');
      assert.match(h.fake.state.tileOptions.attribution, /OpenStreetMap/);
      assert.equal(h.fake.state.tileUrl, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      assert.equal(h.fake.state.tileOptions.keepBuffer, 0);
      assert.equal(h.fake.state.tileOptions.updateWhenIdle, true);
      assert.equal(h.fake.state.tileOptions.referrerPolicy, 'strict-origin-when-cross-origin');
      assert.match(h.fake.state.tileOptions.attribution, /https:\/\/www.openstreetmap.org\/copyright/);
      assert(w.document.querySelector('.sl-map-status').hidden);
      assert(w.document.getElementById('slListView').classList.contains('active'), 'loading does not interrupt the chosen view');
      w.document.querySelector('[data-view="map"]').click();
      w.document.getElementById('slZoomIn').click();
      assert.equal(h.fake.state.zooms, 1);
      assert.deepEqual(h.errors, []);
    } finally { h.dom.window.close(); }
  });
  test(page + ': scoped split-layout and bounded card photos are loaded without global legacy overrides', () => {
    const dom = new JSDOM(read(page + '.html'));
    try {
      assert(dom.window.document.querySelector('link[href*="sl-recovery-layout.css"]'));
      assert(dom.window.document.querySelector('#slMapCanvas[data-needs-leaflet]'));
      const style = dom.window.document.createElement('style'); style.textContent = read('css/explore-premium.css') + '\n' + read('css/sl-recovery-layout.css'); dom.window.document.head.appendChild(style);
      const split = dom.window.document.querySelector('.sl-split-layout');
      assert.equal(dom.window.getComputedStyle(split).display, 'flex');
      const image = dom.window.document.createElement('img'); image.className = 'sl-rp-card-img'; split.appendChild(image);
      const computed = dom.window.getComputedStyle(image);
      assert.equal(computed.width, '88px'); assert.equal(computed.height, '88px');
      const list = dom.window.document.getElementById('slListView'); list.classList.add('active');
      assert.equal(dom.window.getComputedStyle(list).position, 'relative');
      assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.sl-map-toolbar')).position, 'relative');
      assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.sl-right-panel')).display, 'none');
      assert.equal(dom.window.document.getElementById('slSearchInput').getAttribute('aria-label'), 'Search venues');
    } finally { dom.window.close(); }
  });
}
test('Leaflet stylesheet failure cannot report a ready map and CSS-only retry reuses the loaded library', async () => {
  const h = harness('explore', async () => reply({ venues: [venue('ready')], total: 1 }), '', false);
  try {
    await tick();
    h.w.L = h.fake.L;
    h.w.document.querySelector('script[data-sl-leaflet]').dispatchEvent(new h.w.Event('load')); await tick();
    assert.equal(h.fake.state.maps, 0);
    h.w.document.querySelector('link[data-sl-leaflet]').dispatchEvent(new h.w.Event('error')); await tick();
    assert.match(h.w.document.querySelector('.sl-map-status').textContent, /Map unavailable/);
    h.w.document.querySelector('[data-map-retry]').click(); await tick();
    assert.equal(h.w.document.querySelectorAll('script[data-sl-leaflet]').length, 0, 'loaded JavaScript is reused');
    assert.equal(h.fake.state.maps, 0, 'an existing window.L does not bypass the stylesheet');
    h.w.document.querySelector('link[data-sl-leaflet]').dispatchEvent(new h.w.Event('load')); await tick();
    assert.equal(h.fake.state.maps, 1); assert.equal(h.fake.state.markers.size, 1);
    assert(h.w.document.querySelector('.sl-map-status').hidden); assert.deepEqual(h.errors, []);
  } finally { h.dom.window.close(); }
});
test('sidebar, list and map counts follow the same server filter and clear stale sidebar cards', async () => {
  const h = harness('explore', async url => reply(new URL(url, 'https://scenelink.test').searchParams.get('type') ?
    { venues: [{ ...venue('filtered'), lat: null, lng: null }], total: 1 } : { venues: [venue('initial')], total: 25, has_more: true }));
  try {
    h.w.eval(read('js/sl-right-panel.js'));
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.match(h.w.document.getElementById('slRightPanelCount').textContent, /1 of 25 matching venues/);
    h.w.document.querySelector('[data-cat="bar"]').click(); await tick();
    assert.match(h.w.document.getElementById('slRightPanelCount').textContent, /1 of 1 matching venues/);
    assert.match(h.w.document.getElementById('slListCount').textContent, /1 of 1 matching venues/);
    assert.match(h.w.document.getElementById('slCrowdCount').textContent, /1 of 1 venues · 0 mapped/);
    assert.equal(h.w.document.querySelector('#slRightPanelCards .sl-rp-card').dataset.venueId, 'filtered');
    assert.equal(h.fake.state.markers.size, 0); assert.deepEqual(h.errors, []);
  } finally { h.dom.window.close(); }
});

for (const page of ['explore', 'nightlife']) {
  test(page + ': explicit area search retains query/filters, paginates within bounds, and never refits after pan', async () => {
    const calls = [];
    const h = harness(page, async url => {
      const p = Object.fromEntries(new URL(url, 'https://scenelink.test').searchParams); calls.push(p);
      return reply({venues:[venue(p.offset === '0' ? 'first' : 'second')], total:2, has_more:p.offset === '0'});
    }, '?q=dinner&type=bar');
    try {
      await tick(); const initialFits = h.fake.state.bounds.length;
      h.fake.state.move(); await tick();
      assert.equal(calls.length,1, 'movement must not fetch');
      assert.match(h.w.document.querySelector('[data-area-status]').textContent, /Map moved/);
      h.w.document.querySelector('[data-area-search]').click(); await tick();
      assert.equal(calls.at(-1).bbox, '42.3,-71.2,42.4,-71');
      assert.equal(calls.at(-1).q,'dinner'); assert.equal(calls.at(-1).type,'bar');
      assert.equal(new URL(h.w.location.href).searchParams.get('bbox'),calls.at(-1).bbox);
      assert.equal(h.fake.state.bounds.length,initialFits);
      [...h.w.document.querySelectorAll('#slListCards button')].find(b=>b.textContent==='Load more venues').click(); await tick();
      assert.equal(calls.at(-1).offset,'1'); assert.equal(calls.at(-1).bbox,calls.at(-2).bbox);
      assert.equal(h.fake.state.markers.size,2);
      h.w.document.querySelector('[data-cat="lounge"]').click(); await tick();
      assert.equal(calls.at(-1).offset,'0'); assert.equal(calls.at(-1).type,'lounge'); assert(calls.at(-1).bbox);
      h.w.document.querySelector('[data-area-clear]').click(); await tick();
      assert(!calls.at(-1).bbox); assert(!new URL(h.w.location.href).searchParams.has('bbox'));
      assert.deepEqual(h.errors,[]);
    } finally { h.dom.window.close(); }
  });
  test(page + ': latest area wins over stale failed request, retry preserves area, and names identify keyboard markers', async () => {
    const pending=[];
    const h=harness(page,url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject})));
    try {
      await tick(); pending[0].resolve(reply({venues:[venue('initial')],total:1})); await tick();
      h.w.document.querySelector('[data-area-search]').click(); await tick();
      h.fake.state.viewport=[42.2,-71.1,42.3,-71]; h.fake.state.move();
      h.w.document.querySelector('[data-area-search]').click(); await tick();
      pending[2].resolve(reply({venues:[venue('named','Actual Venue Name'),{...venue('invalid'),lat:999},{...venue('missing'),lat:null}],total:3})); await tick();
      pending[1].reject(new Error('old failure')); await tick();
      assert.equal(h.fake.state.markers.size,1);
      const marker=[...h.fake.state.markers][0]; assert.equal(marker.options.title,'Actual Venue Name'); assert.equal(marker.options.alt,'Actual Venue Name'); assert.equal(marker.options.keyboard,true);
      assert.match(h.w.document.getElementById('slListCount').textContent,/3 of 3/);
      assert.equal(new URL(h.w.location.href).searchParams.get('bbox'),'42.2,-71.1,42.3,-71');
      h.w.document.querySelector('[data-area-search]').click(); await tick(); pending[3].reject(new Error('current failure')); await tick();
      assert.equal(h.fake.state.markers.size,0);
      [...h.w.document.querySelectorAll('#slListCards button')].find(b=>/Retry/.test(b.textContent)).click(); await tick();
      assert.equal(new URL(pending[4].url,'https://scenelink.test').searchParams.get('bbox'),'42.2,-71.1,42.3,-71');
      pending[4].resolve(reply({venues:[venue('recovered')],total:1})); await tick();
      assert.equal(h.fake.state.markers.size,1); assert.deepEqual(h.errors,[]);
    } finally {h.dom.window.close();}
  });
  test(page + ': tile errors offer list and explicit retry without replacing provider or requesting location', async () => {
    const h=harness(page,async()=>reply({venues:[venue('one')],total:1}));
    try {
      let locations=0; h.w.navigator.geolocation={getCurrentPosition(){locations++;}};
      await tick(); h.fake.state.tileFail();
      assert.match(h.w.document.querySelector('.sl-map-status').textContent,/Map tiles unavailable/);
      h.w.document.querySelector('[data-map-list]').click();
      assert(h.w.document.getElementById('slListView').classList.contains('active'));
      h.w.document.querySelector('[data-map-retry]').click(); assert.equal(h.fake.state.redraws,1);
      assert.equal(h.fake.state.maps,1); assert.equal(locations,0); assert.equal(h.fake.state.markers.size,1);
      assert.deepEqual(h.errors,[]);
    } finally {h.dom.window.close();}
  });
  test(page + ': URL bounds restore the selected area and venue detail close/back retain it', async () => {
    const calls=[];
    const h=harness(page,async url=>{calls.push(url);return reply(url.includes('/reviews')?{reviews:[]}:url.includes('/venues/one')?venue('one'):{venues:[venue('one')],total:1});},'?bbox=42.3,-71.2,42.4,-71');
    try {
      await tick(); assert.equal(h.fake.state.bounds.length,1);
      assert.equal(new URL(calls[0],'https://scenelink.test').searchParams.get('bbox'),'42.3,-71.2,42.4,-71');
      await h.w.SLVenueDetail.open('one'); await tick();
      assert(h.w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));
      h.w.history.back(); await tick();
      assert(!h.w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));
      assert.equal(new URL(h.w.location.href).searchParams.get('bbox'),'42.3,-71.2,42.4,-71');
      await h.w.SLVenueDetail.open('one'); await tick(); h.w.SLVenueDetail.close(); await tick();
      assert(!h.w.document.querySelector('.sl-vd-overlay').classList.contains('sl-open'));
      assert.equal(new URL(h.w.location.href).searchParams.get('bbox'),'42.3,-71.2,42.4,-71'); assert.deepEqual(h.errors,[]);
    } finally {h.dom.window.close();}
  });
}
for (const page of ['explore','nightlife']) test(page + ': history restores query and area together; malformed bounds never reach API', async () => {
  const calls=[];
  const h=harness(page,async url=>{calls.push(Object.fromEntries(new URL(url,'https://scenelink.test').searchParams));return reply({venues:[venue('history')],total:1});},'?bbox=bad');
  try {
    await tick(); assert(!calls[0].bbox);
    h.w.history.pushState({},'', '?q=new&type=lounge&bbox=42.2,-71.2,42.4,-71');
    h.w.dispatchEvent(new h.w.PopStateEvent('popstate')); await tick();
    assert.equal(calls.at(-1).q,'new'); assert.equal(calls.at(-1).type,'lounge'); assert.equal(calls.at(-1).bbox,'42.2,-71.2,42.4,-71');
    assert.equal(h.w.document.getElementById('slSearchInput').value,'new');
    h.w.history.back(); await tick();
    assert(!calls.at(-1).bbox); assert(!calls.at(-1).q);
    const count=calls.length; h.fake.state.viewport=[42.3,181,42.4,182];
    h.w.document.querySelector('[data-area-search]').click(); await tick();
    assert.equal(calls.length,count); assert.match(h.w.document.querySelector('[data-area-status]').textContent,/world boundary/);
    assert.deepEqual(h.errors,[]);
  } finally {h.dom.window.close();}
});
for (const page of ['explore','nightlife']) test(page + ': canonical coordinate pipeline rejects coercion and range errors, preserves real decimal/zero coordinates', async () => {
  const invalid = [null, undefined, '', ' ', '\t\n', true, false, [], [42], {}, {valueOf:()=>42}, '0x2a', '0b10', '0o10', '42north', 'Infinity', 'NaN', '1e999', NaN, Infinity, -Infinity];
  const records = invalid.flatMap((value,i) => [{...venue('bad-lat-'+i),lat:value}, {...venue('bad-lng-'+i),lng:value}]);
  records.push(...[{lat:90.01,lng:0},{lat:-90.01,lng:0},{lat:0,lng:180.01},{lat:0,lng:-180.01},{lat:'91',lng:'0'},{lat:'0',lng:'-181'}].map((point,i)=>({...venue('range-'+i),...point})));
  const valid = [
    {id:'zero',lat:0,lng:0}, {id:'decimal',lat:' 42.3500 ',lng:' -71.0600 '},
    {id:'boundary',lat:'90',lng:'180'}, {id:'negative-boundary',lat:-90,lng:-180},
    {id:'fraction',lat:'.5',lng:'-.5'}, {id:'exponent',lat:'4.235e1',lng:'-7.106e1'},
    {id:'signed-zero',lat:'+0',lng:'-0'}
  ];
  records.push(...valid.map(point=>({...venue(point.id),...point})));
  const h=harness(page,async()=>reply({venues:records,total:records.length}));
  try {
    await tick();
    const markers=[...h.fake.state.markers]; assert.equal(markers.length,valid.length);
    assert.deepEqual(markers.map(m=>m.options.title).sort(),valid.map(v=>v.id).sort());
    for (const point of valid) {
      const marker=markers.find(m=>m.options.title===point.id);
      assert(marker.point[0] === Number(point.lat) && marker.point[1] === Number(point.lng), point.id);
    }
    assert.equal(h.w.document.querySelectorAll('.sl-list-card').length,records.length,'unlocated records remain available in the list');
    const normalized = h.w.__slExploreData.getVenues();
    for (const v of normalized.filter(v=>v.id.startsWith('bad-')||v.id.startsWith('range-'))) {
      assert.equal(v.lat,null,v.id); assert.equal(v.lng,null,v.id);
    }
    assert.match(h.w.document.getElementById('slCrowdCount').textContent,/7 mapped/);
    assert.deepEqual(h.errors,[]);
  } finally {h.dom.window.close();}
});
