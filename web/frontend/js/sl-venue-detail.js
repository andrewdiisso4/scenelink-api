/* One canonical venue detail on every page. API data is escaped; newer navigation wins. */
(function () {
  'use strict';
  let overlay, generation = 0, previousFocus, previousOverflow, openedId;
  const C = () => window.SLConnected, E = value => C().esc(value);
  function build() {
    if (overlay) return overlay;
    overlay = document.createElement('div'); overlay.id = 'sl-venue-detail'; overlay.className = 'sl-vd-overlay';
    overlay.innerHTML = '<section class="sl-connected" role="dialog" aria-modal="true" aria-label="Venue details" tabindex="-1"><button type="button" class="sl-secondary sl-vd-close" aria-label="Close venue details">Close</button><div class="sl-vd-content" aria-live="polite"></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.sl-vd-close')) close(); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const all = Array.from(overlay.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')).filter(el => !el.hidden);
        if (!all.length) return;
        if (e.shiftKey && document.activeElement === all[0]) { e.preventDefault(); all[all.length-1].focus(); }
        else if (!e.shiftKey && document.activeElement === all[all.length-1]) { e.preventDefault(); all[0].focus(); }
      }
    });
    return overlay;
  }
  function hide() {
    ++generation; openedId = null;
    if (overlay) overlay.classList.remove('sl-open');
    document.body.style.overflow = previousOverflow || '';
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function close() {
    hide();
    const url = new URL(location.href);
    if (history.state && history.state.slVenue) { history.back(); return; }
    if (url.hash.startsWith('#venue=')) url.hash = '';
    url.searchParams.delete('venue'); url.searchParams.delete('venue_id');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  async function open(id, fromUrl) {
    if (!id || !window.SLVenueData) return;
    window.dispatchEvent(new CustomEvent('sl:explicit-modal'));
    const seq = ++generation; openedId = String(id); build();
    if (!overlay.classList.contains('sl-open')) { previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; }
    overlay.classList.add('sl-open'); document.body.style.overflow = 'hidden';
    overlay.querySelector('.sl-vd-close').focus();
    const content = overlay.querySelector('.sl-vd-content'); content.textContent = 'Loading venue details…';
    if (!fromUrl) {
      const url = new URL(location.href); url.hash = 'venue=' + encodeURIComponent(id);
      if (history.state && history.state.slVenue) history.replaceState({slVenue:true},'',url.pathname + url.search + url.hash);
      else history.pushState({slVenue:true},'',url.pathname + url.search + url.hash);
    }
    try {
      const v = await window.SLVenueData.detail(id); if (seq !== generation) return;
      render(v, content); loadReviews(v.id, seq);
    } catch (e) {
      if (seq !== generation) return;
      content.innerHTML = '<h2>Venue details unavailable</h2><p>' + E(e.message) + '</p><button type="button" data-retry-venue>Retry</button>';
      content.querySelector('[data-retry-venue]').onclick = () => open(id, true);
    }
  }
  function field(label, value) { return '<div><dt>' + E(label) + '</dt><dd>' + E(value || 'Not provided') + '</dd></div>'; }
  function render(v, content) {
    const booking = v.booking || {}, website = C().safeUrl(v.website), directions = C().safeUrl(v.google_maps_url);
    // A provider URL is not an in-site reservation integration.
    const price = v.price_label || (Number.isInteger(v.price_level) && v.price_level > 0 && v.price_level < 5 ? '$'.repeat(v.price_level) : null);
    content.innerHTML = '<h1>' + E(v.name) + '</h1><p class="sl-muted">' + E([v.type,v.neighborhood || v.city].filter(Boolean).join(' · ')) + '</p>' +
      '<img class="sl-vd-image" src="' + E(v.thumbnail_url) + '" alt="' + E(v.thumbnail_url.includes('placeholder-') ? 'Venue photo unavailable' : v.name) + '">' +
      '<p>' + E(v.description || 'No venue description has been provided.') + '</p>' +
      '<dl class="sl-vd-fields">' + field('Address',[v.address,v.city,v.state,v.zip_code].filter(Boolean).join(', ')) + field('Hours',v.hours_display) + field('Phone',v.phone) + field('Price',price) + '</dl>' +
      '<p class="sl-muted">' + E(window.SLVenueData.sourceText(v)) + '</p>' +
      '<div class="sl-notice"><strong>No reservation has been made.</strong> SceneLink saves, plans and RSVPs do not book a table or buy a ticket. ' +
      'In-site reservations are unavailable for this venue. Availability, reservation requests and provider confirmations are not connected; nothing has been submitted. Booking will remain on SceneLink when a supported integration is available.</div>' +
      '<div class="sl-row">' +
      (website ? '<a class="sl-link-button sl-secondary" href="' + E(website) + '" target="_blank" rel="noopener noreferrer">Venue website ↗</a>' : '') +
      (directions ? '<a class="sl-link-button sl-secondary" href="' + E(directions) + '" target="_blank" rel="noopener noreferrer">Directions ↗</a>' : '') + '</div>' +
      '<div class="sl-row" style="margin-top:18px"><button type="button" data-save-venue>Save venue</button><button type="button" class="sl-secondary" data-add-list>Add to list</button><a class="sl-link-button sl-secondary" href="/plan-with-friends?venue_id=' + encodeURIComponent(v.id) + '">Plan with friends</a><button type="button" class="sl-secondary" data-review-venue>Write a review</button></div>' +
      '<p data-venue-status role="status"></p><h2>Community reviews</h2><div data-venue-reviews>Loading submitted reviews…</div>';
    const image = content.querySelector('.sl-vd-image'), placeholder = '/assets/img/placeholder-venue.svg';
    function photoUnavailable() {
      image.removeEventListener('error', photoUnavailable);
      image.alt = 'Venue photo unavailable';
      if (image.getAttribute('src') !== placeholder) image.src = placeholder;
    }
    image.addEventListener('error', photoUnavailable, {once:true});
    // A cached failure may have completed before the handler was attached.
    if (image.complete && image.naturalWidth === 0) photoUnavailable();
    content.querySelector('[data-save-venue]').onclick = async function () {
      this.disabled = true; const button = this, current = generation, status = content.querySelector('[data-venue-status]');
      try { if(window.SLVenueActions&&window.SLVenueActions.setFavorite)await window.SLVenueActions.setFavorite(v.id,true);else{const result=await C().once('save:' + v.id, () => C().request('/favorites/' + encodeURIComponent(v.id), {method:'POST'}));if(result.favorited!==true)throw new Error('The save was not confirmed. Please retry.');}
        if (current !== generation) return; button.textContent = 'Saved to your account'; status.textContent = 'Venue saved. This is not a reservation.';
      } catch (e) { if (current === generation) { status.textContent = e.message; button.disabled = false; if(e.status===401 && window.SLAuthUI)window.SLAuthUI.open('login', button); } }
    };
    content.querySelector('[data-add-list]').onclick = function(){if(window.SLVenueActions&&window.SLVenueActions.addToList)window.SLVenueActions.addToList(v.id,this);else content.querySelector('[data-venue-status]').textContent='List controls are unavailable. Please reload.';};
    content.querySelector('[data-review-venue]').onclick = () => {
      if (window.SLReviewModal) window.SLReviewModal.open(v.id, v.name);
      else content.querySelector('[data-venue-status]').textContent = 'Reviews are unavailable. Please retry later.';
    };
  }
  async function loadReviews(id, seq) {
    try {
      const data = await C().request('/reviews?venue_id=' + encodeURIComponent(id)); if (seq !== generation) return;
      const reviews = data.reviews || data.items; if (!Array.isArray(reviews)) throw new Error('Reviews unavailable');
      const host = overlay.querySelector('[data-venue-reviews]');
      host.innerHTML = reviews.length ? reviews.map(r => '<article class="sl-item"><strong>' + E(r.display_name || r.username || 'SceneLink member') + '</strong>' +
        (Number(r.rating)>=1 && Number(r.rating)<=5 ? '<span> · ' + E(r.rating) + '/5</span>' : '') + '<p>' + E(r.content || r.body || '') + '</p></article>').join('') : '<p>No community reviews have been submitted.</p>';
    } catch (_) { if(seq===generation){const host=overlay.querySelector('[data-venue-reviews]');if(host)host.textContent='Community reviews are unavailable. No substitute reviews are shown.';} }
  }
  function fromLocation() {
    const url = new URL(location.href), match = url.hash.match(/^#venue=(.+)$/);
    let id;
    try { id = match ? decodeURIComponent(match[1]) : url.searchParams.get('venue') || url.searchParams.get('venue_id'); }
    catch (_) { if (openedId) hide(); return; } // Malformed external links must not break page initialization.
    if (id && id !== openedId && !/plan-with-friends/.test(location.pathname)) open(id, true);
    else if (!id && overlay && overlay.classList.contains('sl-open')) hide();
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-sl-action],.sl-vd-overlay,.sl-connected')) return;
    const trigger = e.target.closest('[data-open-venue],a[data-venue-slug],button[data-venue-slug]');
    if (trigger) { const id = trigger.dataset.openVenue || trigger.dataset.venueSlug; if (id) {e.preventDefault(); open(id);} }
  });
  window.addEventListener('popstate',fromLocation); window.addEventListener('hashchange',fromLocation);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fromLocation);else fromLocation();
  window.SLVenueDetail = {open,close};
})();
