/* One canonical venue detail on every page. API data is escaped; newer navigation wins. */
(function () {
  'use strict';
  let overlay, generation = 0, previousFocus, previousOverflow, openedId;
  const C = () => window.SLConnected, E = value => C().esc(value);
  const visits = new Map(), uuidShape = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  let visitSession = '', visitView;
  function syncVisitSession() {
    const session = C() ? C().token() : '';
    if (session !== visitSession) {
      visitSession = session;
      visits.clear();
      if (visitView && visitView.seq === generation) { visitView.reset(); visitView.loadHistory(session); }
    }
    return session;
  }
  function build() {
    if (overlay) return overlay;
    overlay = document.createElement('div'); overlay.id = 'sl-venue-detail'; overlay.className = 'sl-vd-overlay';
    overlay.innerHTML = '<section class="sl-connected" role="dialog" aria-modal="true" aria-label="Venue details" tabindex="-1"><button type="button" class="sl-secondary sl-vd-close" aria-label="Close venue details">Close</button><div class="sl-vd-content" aria-live="polite"></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.sl-vd-close')) close(); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const all = Array.from(overlay.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')).filter(el => !el.closest('[hidden]'));
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
  function bindVisit(v, content) {
    const button = content.querySelector('[data-mark-been]'), pane = content.querySelector('[data-visit-pane]'), seq = generation;
    let paneRevision = 0, historyState = 'idle', readId = 0;
    function reset() { paneRevision++; pane.hidden = true; pane.replaceChildren(); button.textContent = 'Mark Been'; button.setAttribute('aria-expanded','false'); }
    function draw(entry, focus = false) {
      button.textContent = entry.saved ? 'Been' : 'Mark Been';
      if (!entry.saved && historyState === 'loading' && !entry.payload) {
        if (!pane.hidden) {
          pane.innerHTML = '<p role="status">Checking your recent visits…</p><button type="button" class="sl-secondary" data-visit-cancel>Close</button>';
          pane.querySelector('[data-visit-cancel]').onclick = () => { reset(); button.focus(); };
          if (focus) pane.querySelector('button').focus();
        }
        return;
      }
      if (pane.hidden) return;
      if (entry.saved) {
        pane.innerHTML = '<p role="status">' + (entry.historical ? 'Visit found in your recent SceneLink history.' : entry.audience === 'friends' ? 'Visit saved and shared with accepted friends.' : 'Visit saved privately. Not shared to the friend feed.') + '</p><a href="/my-lists#been">View Been</a>';
        if (focus) pane.querySelector('a').focus();
        return;
      }
      if (!pane.querySelector('[data-visit-confirm]')) {
        pane.innerHTML = '<h2>Log a visit</h2><p class="sl-muted">Self-reported visit, not a live check-in. No device location is used.</p>' +
          '<label for="sl-vd-visit-audience">Who can see it?</label><select id="sl-vd-visit-audience"><option value="private" selected>Only me</option><option value="friends">Accepted friends</option></select>' +
          '<div class="sl-row"><button type="button" data-visit-confirm></button><button type="button" class="sl-secondary" data-visit-cancel>Close</button></div><p role="status" data-visit-status></p>';
        pane.querySelector('[data-visit-cancel]').onclick = () => { if (!entry.payload) entry.audience = 'private'; reset(); button.focus(); };
        pane.querySelector('select').onchange = function () { if (!entry.payload) entry.audience = this.value === 'friends' ? 'friends' : 'private'; draw(entry); };
        pane.querySelector('[data-visit-confirm]').onclick = () => save(entry);
      }
      const select = pane.querySelector('select'), confirm = pane.querySelector('[data-visit-confirm]');
      select.value = entry.audience;
      select.disabled = Boolean(entry.payload) || entry.busy;
      confirm.disabled = entry.busy;
      confirm.textContent = entry.busy ? 'Saving…' : entry.error && entry.payload ? 'Retry same visit' : entry.audience === 'friends' ? 'Share visit with friends' : 'Save private visit';
      pane.querySelector('[data-visit-status]').textContent = entry.error || (historyState === 'unknown' ? 'Could not verify recent visits. Check Been before logging a repeat.' : 'This check covers your most recent visits only.');
      if (focus) (select.disabled ? confirm : select).focus();
    }
    function refresh(entry, focus = false) { if (visitView && visitView.seq === generation && visitView.id === v.id) visitView.draw(entry, focus && visitView.seq === seq); }
    async function loadHistory(session) {
      const reading = ++readId;
      historyState = 'idle';
      if (!session) return;
      // A confirmed write or an ambiguous/idempotent retry takes precedence over history.
      const existing = visits.get(v.id);
      if (existing && (existing.busy || existing.payload)) return;
      if (existing?.historical) visits.delete(v.id);
      historyState = 'loading';
      try {
        const data = await C().request('/checkins');
        if (session !== syncVisitSession() || seq !== generation || reading !== readId) return;
        if (!Array.isArray(data.checkins) || data.checkins.length > 100) throw Error('Recent visits unavailable.');
        const match = data.checkins.find(x => x && x.venue_id === v.id &&
          typeof x.id === 'string' && uuidShape.test(x.id) &&
          typeof x.user_id === 'string' && uuidShape.test(x.user_id) &&
          ['private','friends','public'].includes(x.audience) && typeof x.created_at === 'string' && Number.isFinite(Date.parse(x.created_at)));
        historyState = 'ready';
        if (match) visits.set(v.id,{session,audience:match.audience,historical:true,saved:true});
        else if (visits.get(v.id)?.historical) visits.delete(v.id);
      } catch (_) {
        if (session !== syncVisitSession() || seq !== generation || reading !== readId) return;
        historyState = 'unknown';
        if (visits.get(v.id)?.historical) visits.delete(v.id);
      }
      if (visits.has(v.id)) draw(visits.get(v.id),pane.contains(document.activeElement));
      else button.textContent = 'Mark Been';
    }
    async function save(entry) {
      const session = syncVisitSession();
      if (!session || session !== entry.session || entry.busy || entry.saved || historyState === 'loading') return;
      const focused = pane.contains(document.activeElement), submittedRevision = paneRevision, audience = entry.audience;
      entry.busy = true; entry.error = ''; draw(entry);
      try {
        const identity = await C().request('/users/me');
        if (session !== syncVisitSession() || visits.get(v.id) !== entry) return;
        const owner = identity.user && identity.user.id;
        if (typeof owner !== 'string' || !owner || (entry.owner && owner !== entry.owner)) throw Error('Signed-in account could not be confirmed.');
        // Closing or switching away before any write cancels this action.
        if (seq !== generation || pane.hidden || paneRevision !== submittedRevision) return;
        if (identity.user.email_verified === false) throw Object.assign(Error('Email verification is required.'),{code:'EMAIL_VERIFICATION_REQUIRED'});
        if (!entry.payload) {
          if (!window.crypto || typeof window.crypto.randomUUID !== 'function') throw Error('Use a secure browser to save a visit.');
          entry.owner = owner;
          entry.payload = {client_id:window.crypto.randomUUID(), venue_id:v.id, audience};
        }
        const result = await C().request('/checkins', {method:'POST',body:entry.payload});
        if (session !== syncVisitSession() || visits.get(v.id) !== entry) return;
        const visit = result.checkin;
        if (!visit || visit.id !== entry.payload.client_id || visit.user_id !== owner || visit.venue_id !== v.id || visit.audience !== entry.payload.audience ||
            (visit.note != null && visit.note !== '') || !Number.isFinite(Date.parse(visit.created_at))) throw Error('The response did not confirm this visit.');
        entry.saved = true; entry.busy = false;
        refresh(entry, focused && (pane.contains(document.activeElement) || document.activeElement === document.body));
        window.dispatchEvent(new CustomEvent('sl-checkins-changed'));
      } catch (e) {
        if (session !== syncVisitSession() || visits.get(v.id) !== entry) return;
        entry.error = e.code === 'EMAIL_VERIFICATION_REQUIRED' ? 'Verify your email in your account before saving a visit, then retry.' : entry.payload ? 'Could not confirm that this visit was saved. Retry sends the same visit, not another one.' : e.status === 401 ? 'Please sign in again to log this visit.' : 'Could not start saving this visit. Please retry in a secure, signed-in browser.';
      } finally {
        if (session === syncVisitSession() && visits.get(v.id) === entry) { entry.busy = false; refresh(entry); }
      }
    }
    const session = syncVisitSession();
    visitView = {id:v.id,seq,reset,draw,loadHistory};
    loadHistory(session);
    if (visits.has(v.id)) draw(visits.get(v.id));
    button.onclick = () => {
      const session = syncVisitSession();
      if (!session) {
        if (window.SLAuthUI) window.SLAuthUI.open('login',button);
        else content.querySelector('[data-venue-status]').textContent = 'Sign in to log a visit.';
        return;
      }
      if (!visits.has(v.id)) visits.set(v.id,{session,audience:'private',busy:false,saved:false});
      pane.hidden = false;
      button.setAttribute('aria-expanded','true');
      draw(visits.get(v.id),true);
    };
  }
  function render(v, content) {
    const photo = window.SLVenueData.licensedPhoto && window.SLVenueData.licensedPhoto(v);
    const photoUrl = photo ? photo.url : v.thumbnail_url;
    const booking = v.booking || {}, website = C().safeUrl(v.website), directions = C().safeUrl(v.google_maps_url);
    // A provider URL is not an in-site reservation integration.
    const price = v.price_label || (Number.isInteger(v.price_level) && v.price_level > 0 && v.price_level < 5 ? '$'.repeat(v.price_level) : null);
    content.innerHTML = '<h1>' + E(v.name) + '</h1><p class="sl-muted">' + E([v.type,v.neighborhood || v.city].filter(Boolean).join(' · ')) + '</p>' +
      '<img class="sl-vd-image" src="' + E(photoUrl) + '"' + (photo ? ' style="height:auto;max-height:560px;object-fit:contain"' : '') + ' alt="' + E(photo ? v.name + ' exterior, photographed ' + photo.date : (v.thumbnail_url.includes('placeholder-') ? 'Venue photo unavailable' : v.name)) + '">' +
      (photo ? '<p class="sl-photo-credit">Photo: <a href="' + E(photo.source) + '" target="_blank" rel="noopener noreferrer">' + E(photo.title) + ' by ' + E(photo.author) + '</a> · <a href="' + E(photo.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' + E(photo.license) + '</a><br>Photographed ' + E(photo.date) + '. ' + E(photo.changes) + ' Historical exterior photo, not a current appearance or opening-hours guarantee. This photo is separately licensed; general site rights notices do not restrict its linked license.</p>' : '') +
      '<p>' + E(v.description || 'No venue description has been provided.') + '</p>' +
      '<dl class="sl-vd-fields">' + field('Address',[v.address,v.city,v.state,v.zip_code].filter(Boolean).join(', ')) + field('Hours',v.hours_display) + field('Phone',v.phone) + field('Price',price) + '</dl>' +
      '<p class="sl-muted">' + E(window.SLVenueData.sourceText(v)) + '</p>' +
      '<div class="sl-notice"><strong>No reservation has been made.</strong> SceneLink saves, plans and RSVPs do not book a table or buy a ticket. ' +
      'In-site reservations are unavailable for this venue. Availability, reservation requests and provider confirmations are not connected; nothing has been submitted. Booking will remain on SceneLink when a supported integration is available.</div>' +
      '<div class="sl-row">' +
      (website ? '<a class="sl-link-button sl-secondary" href="' + E(website) + '" target="_blank" rel="noopener noreferrer">Venue website ↗</a>' : '') +
      (directions ? '<a class="sl-link-button sl-secondary" href="' + E(directions) + '" target="_blank" rel="noopener noreferrer">Directions ↗</a>' : '') + '</div>' +
      '<div class="sl-row" style="margin-top:18px"><button type="button" data-save-venue>Want to Try</button><button type="button" class="sl-secondary" data-mark-been aria-controls="sl-vd-visit" aria-expanded="false">Mark Been</button><button type="button" class="sl-secondary" data-add-list>Add to list</button><a class="sl-link-button sl-secondary" href="/plan-with-friends?venue_id=' + encodeURIComponent(v.id) + '">Plan with friends</a><button type="button" class="sl-secondary" data-review-venue>Write a review</button>' +
      '<button type="button" class="sl-secondary" data-share-venue>Copy venue link</button><span data-venue-share-status role="status"></span></div>' +
      '<div data-manual-share hidden></div><section id="sl-vd-visit" class="sl-panel" data-visit-pane aria-label="Log a venue visit" hidden></section>' +
      '<p data-venue-status role="status"></p><h2>Community reviews</h2><div data-venue-reviews>Loading submitted reviews…</div>';
    bindVisit(v, content);
    const shareButton = content.querySelector('[data-share-venue]');
    shareButton.onclick = async () => {
      const seq = generation, status = content.querySelector('[data-venue-share-status]');
      // Start with a clean public route. Never copy filters, invitation state, or other page context.
      const link = new URL('/explore', location.origin);
      link.searchParams.set('venue', v.id);
      const manual = content.querySelector('[data-manual-share]');
      const startedFocused = document.activeElement === shareButton;
      shareButton.disabled = true;
      // Async completion belongs to this open venue only.
      try {
        await navigator.clipboard.writeText(link.href);
        if (seq !== generation) return;
        manual.hidden = true;
        status.textContent = 'Venue link copied. You can paste it into a message.';
        shareButton.disabled = false;
        if (startedFocused && document.activeElement === document.body) shareButton.focus();
      } catch (_) {
        if (seq !== generation) return;
        let input = manual.querySelector('input');
        if (!input) {
          const label = document.createElement('label');
          label.append('Venue link ');
          input = document.createElement('input');
          input.type = 'url'; input.readOnly = true;
          label.appendChild(input); manual.appendChild(label);
        }
        input.value = link.href;
        manual.hidden = false;
        status.textContent = 'Couldn’t copy automatically. Select and copy the link below.';
        if (document.activeElement === shareButton || (startedFocused && document.activeElement === document.body)) {
          input.focus(); input.select();
        }
      } finally {
        if (seq === generation) shareButton.disabled = false;
      }
    };
    const image = content.querySelector('.sl-vd-image'), placeholder = '/assets/img/placeholder-venue.svg';
    function photoUnavailable() {
      image.removeEventListener('error', photoUnavailable);
      image.alt = 'Venue photo unavailable';
      const credit = content.querySelector('.sl-photo-credit'); if (credit) credit.remove();
      if (image.getAttribute('src') !== placeholder) image.src = placeholder;
    }
    image.addEventListener('error', photoUnavailable, {once:true});
    // A cached failure may have completed before the handler was attached.
    if (image.complete && image.naturalWidth === 0) photoUnavailable();
    content.querySelector('[data-save-venue]').onclick = async function () {
      this.disabled = true; const button = this, current = generation, status = content.querySelector('[data-venue-status]');
      try { if(window.SLVenueActions&&window.SLVenueActions.setFavorite)await window.SLVenueActions.setFavorite(v.id,true);else{const result=await C().once('save:' + v.id, () => C().request('/favorites/' + encodeURIComponent(v.id), {method:'POST'}));if(result.favorited!==true)throw new Error('The save was not confirmed. Please retry.');}
        if (current !== generation) return; button.textContent = 'Saved to Want to Try'; status.textContent = 'Venue saved to Want to Try. This is not a reservation.';
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
  ['sl-auth-change','sl-auth-changed','sl-auth-ready'].forEach(type=>{
    window.addEventListener(type,syncVisitSession);
    document.addEventListener(type,syncVisitSession);
  });
  window.addEventListener('storage',e=>{if(e.key===null||e.key==='sl_jwt_token')syncVisitSession();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fromLocation);else fromLocation();
  window.SLVenueDetail = {open,close};
})();
