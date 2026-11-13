'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {publicVenue} = require('../../src/services/venue-helpers');
const root = path.resolve(__dirname, '../frontend');

function setup(t, supplied = {}) {
  const calls = [];
  const dom = new JSDOM('<!doctype html><button id="origin">Venue</button>', {
    url: 'https://scenelink.test/explore?q=dinner', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.AbortController = AbortController;
  w.fetch = async (url, options) => {
    calls.push({url, method: options?.method || 'GET'});
    return {ok: true, status: 200, json: async () => url.includes('/reviews') ? {reviews: []} : {
      id: 'reservation-fixture', name: 'Fictional reservation test venue',
      website: 'https://example.com/fictional-venue', ...supplied
    }};
  };
  for (const script of ['sl-connected-api', 'sl-venue-detail', 'booking-system']) {
    w.eval(fs.readFileSync(path.join(root, 'js', script + '.js'), 'utf8'));
  }
  return {w, calls};
}

for (const status of ['external_link', 'confirmed', 'in_site', 'available']) {
  test('unintegrated venue cannot become bookable from untrusted booking status ' + status, async t => {
    const {w, calls} = setup(t, {
      reservation_live: true, reservation_is_confirmed: true,
      booking: {status, url: 'https://resy.com/cities/boston-ma/venues/fictional-only',
        reservation_confirmed: true, available_times: ['19:00'], confirmation_number: 'NOT-A-RESERVATION'}
    });
    await w.SLVenueDetail.open('reservation-fixture');
    const detail = w.document.querySelector('.sl-vd-content');
    assert.match(detail.textContent, /In-site reservations are unavailable/);
    assert.match(detail.textContent, /No reservation has been made/);
    assert(!detail.textContent.includes('NOT-A-RESERVATION'));
    assert(!detail.textContent.includes('19:00'));
    assert.equal(detail.querySelectorAll('form, iframe, input, select').length, 0);
    assert.equal(detail.querySelectorAll('a[href*="resy.com"], a[href*="opentable.com"]').length, 0);
    assert(calls.every(call => call.method === 'GET' && call.url.startsWith('/api/')));
    assert(calls.every(call => !/booking|reservation|availability/.test(call.url.replace('reservation-fixture', 'fixture'))));
  });
}

test('both legacy booking entry points use canonical detail without sending a booking or redirecting', async t => {
  const {w, calls} = setup(t);
  let opened = 0;
  w.open = () => { opened++; };
  await w.bookingSystem.openBooking({id: 'reservation-fixture'});
  await new w.BookingSystem().openModal('reservation-fixture');
  assert.equal(opened, 0);
  assert.equal(w.location.origin, 'https://scenelink.test');
  assert.equal(w.location.search, '?q=dinner');
  assert.equal(w.document.querySelectorAll('#sl-venue-detail').length, 1);
  assert(calls.every(call => call.method === 'GET'));
  w.bookingSystem.closeModal();
  assert(!w.document.getElementById('sl-venue-detail').classList.contains('sl-open'));
});

test('missing venue identity never attempts a booking', t => {
  const {w, calls} = setup(t);
  const notices = [];
  w.SLToast = text => notices.push(text);
  w.bookingSystem.openBooking({});
  assert.equal(calls.length, 0);
  assert.equal(w.document.querySelector('#sl-venue-detail'), null);
  assert.match(notices[0], /No reservation has been made/);
});

test('backend catalog and frontend normalization both reject manufactured confirmations', t => {
  const {w} = setup(t);
  const raw = {id: 'reservation-fixture', name: 'Fictional reservation test venue',
    reservation_url: 'https://www.sevenrooms.com/reservations/fictional-only',
    reservation_live: true, reservation_is_confirmed: true,
    booking: {status: 'confirmed', reservation_confirmed: true}};
  const backend = publicVenue(raw);
  const frontend = w.SLVenueData.normalize(backend);
  for (const venue of [backend, frontend]) {
    assert.equal(venue.booking.status, 'external_link');
    assert.equal(venue.booking.reservation_confirmed, false);
    assert.equal(venue.booking.requires_external_confirmation, true);
    assert.equal(venue.reservation_live, null);
    assert.equal(venue.reservation_is_confirmed, false);
  }
});
