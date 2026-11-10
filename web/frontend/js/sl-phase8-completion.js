/* =====================================================================
   SceneLink Phase 8 Launch Completion JS
   - Homepage venue hydration without map/social/event payloads
   - Unified newsletter/contact/business-interest wiring
   - Thin client helpers for launch QA flows
   ===================================================================== */
(function(){
  'use strict';
  var API_BASE = (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) || '/api';
  function $(sel, root){ return (root || document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s){ return String(s || '').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function token(){ try { return localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_auth_token') || ''; } catch(_) { return ''; } }
  async function api(path, opts){
    opts = opts || {};
    var headers = Object.assign({'Content-Type':'application/json','Accept':'application/json'}, opts.headers || {});
    var t = token(); if (t) headers.Authorization = 'Bearer ' + t;
    var body = opts.body;
    if (body && typeof body !== 'string') body = JSON.stringify(body);
    var res = await fetch(API_BASE + path, { method: opts.method || 'GET', headers: headers, body: body, credentials:'omit' });
    var text = await res.text();
    var data = null; try { data = text ? JSON.parse(text) : null; } catch(_) { data = { raw:text }; }
    if (!res.ok) { var err = new Error((data && data.error) || ('HTTP ' + res.status)); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  window.SLPhase8 = { api: api };

  function venueImage(v){
    return v.cover_image_url || v.image_url || v.thumbnail_url || v.image || (v.image_urls && v.image_urls[0]) || '/assets/img/placeholder-venue.svg';
  }
  function venueUrl(v){ return '/explore.html?' + (v.slug ? 'venue=' + encodeURIComponent(v.slug) : 'venue_id=' + encodeURIComponent(v.id || '')); }
  function renderVenueCard(v){
    var hood = v.neighborhood || v.city || 'Location not provided';
    var type = v.cuisine || v.category || v.type || 'Venue';
    var desc = v.short_desc || v.description || 'Confirm details and hours with the venue.';
    var rating = 'Venue details';
    return '<article class="sl-phase8-venue-card" data-sl-venue-id="' + esc(v.id || '') + '">' +
      '<a href="' + esc(venueUrl(v)) + '" class="sl-phase8-venue-image" aria-label="Open ' + esc(v.name) + '"><img src="' + esc(v.thumbnail_url) + '" alt="' + esc(v.name) + '" style="width:100%;height:100%;object-fit:cover"></a>' +
      '<div class="sl-phase8-venue-body">' +
      '<div class="sl-phase8-venue-meta">' + esc(type) + ' · ' + esc(hood) + '</div>' +
      '<h3 class="sl-phase8-venue-name">' + esc(v.name || 'Boston venue') + '</h3>' +
      '<p class="sl-phase8-venue-desc">' + esc(desc).slice(0, 145) + '</p>' +
      '<div class="sl-phase8-venue-actions">' +
      '<a class="sl-phase8-mini-btn" href="' + esc(venueUrl(v)) + '">' + rating + '</a>' +
      '<button type="button" class="sl-phase8-mini-btn gold" data-sl-action="save" data-sl-venue-id="' + esc(v.id || '') + '" data-sl-venue-name="' + esc(v.name || '') + '"><i class="far fa-heart"></i> Save</button>' +
      '</div></div></article>';
  }
  function renderSkeleton(grid, n){
    if (!grid) return;
    n = n || 6;
    grid.innerHTML = Array.from({length:n}).map(function(){ return '<article class="sl-phase8-venue-card"><div class="sl-phase8-venue-image"></div><div class="sl-phase8-venue-body"><div class="sl-phase8-skel-line"></div><div class="sl-phase8-skel-line" style="width:48%"></div><div class="sl-phase8-skel-line" style="width:88%;height:42px;border-radius:10px"></div></div></article>'; }).join('');
  }
  async function hydrateHomeVenues(){
    var grid = $('#phase8TonightGrid');
    if (!grid) return;
    renderSkeleton(grid, 6);
    try {
      var data = await window.SLVenueData.list({limit:6});
      var venues = data.venues;
      if(!venues.length){grid.innerHTML='<p>No venue listings match this selection.</p>';return;}
      grid.innerHTML = venues.slice(0,6).map(renderVenueCard).join('');
    } catch (e) {
      grid.innerHTML = '<div style="grid-column:1/-1;border:1px solid rgba(212,175,55,.22);border-radius:18px;padding:22px;color:rgba(255,255,255,.72);background:rgba(255,255,255,.04)">Tonight\'s picks could not load in this browser session. <a href="/explore.html" style="color:#D4AF37;font-weight:800">Open Explore</a> to browse Boston venues.</div>';
    }
  }
  function wireSearch(){
    var form = $('#phase8SearchForm');
    if (!form) return;
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var q = ($('#phase8SearchInput') || {}).value || '';
      window.location.href = '/explore.html' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : '');
    });
    $all('[data-phase8-query]').forEach(function(btn){
      btn.addEventListener('click', function(){ window.location.href = '/explore.html?q=' + encodeURIComponent(btn.getAttribute('data-phase8-query') || btn.textContent || ''); });
    });
  }
  function setStatus(form, msg, ok){
    var status = form.querySelector('[data-sl-form-status]') || form.parentElement && form.parentElement.querySelector('[data-sl-form-status]');
    if (status) { status.textContent = msg || ''; status.style.color = ok ? '#9be7b0' : '#ffb4a9'; }
  }
  function wireNewsletter(){
    $all('form[data-sl-newsletter="1"], form[data-sl-newsletter]').forEach(function(form){
      if (form.__slPhase8Newsletter) return; form.__slPhase8Newsletter = true;
      var pending = false;
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        if (pending) return;
        var input = form.querySelector('input[type="email"], input[name="email"]');
        if (!input || !form.reportValidity()) return;
        var email = input.value.trim();
        var btn = form.querySelector('button[type="submit"], button:not([type])');
        var old = btn && btn.innerHTML;
        pending = true;
        form.setAttribute('aria-busy', 'true');
        setStatus(form, 'Joining the list…', true);
        try {
          if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
          var result = await api('/newsletter/subscribe', { method:'POST', body:{ email: email, source: form.getAttribute('data-sl-newsletter-source') || form.getAttribute('data-source') || document.body.getAttribute('data-page') || location.pathname } });
          if (!result || result.ok !== true) throw new Error('Your subscription was not confirmed. Please try again.');
          setStatus(form, "You're on the SceneLink email list.", true);
          if (input.value.trim() === email) input.value = '';
        } catch (err) { setStatus(form, err.message || 'We could not confirm your subscription. Your email is still here so you can try again.', false); }
        finally { pending = false; form.removeAttribute('aria-busy'); if (btn) { btn.disabled = false; btn.innerHTML = old || 'Join the list'; } }
      });
    });
  }
  function wireContact(){
    $all('form[data-sl-contact]').forEach(function(form){
      if (form.__slPhase8Contact) return; form.__slPhase8Contact = true;
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        var fd = new FormData(form);
        var body = Object.fromEntries(fd.entries());
        var btn = form.querySelector('button[type="submit"], button:not([type])');
        var old = btn && btn.textContent;
        try {
          if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
          await api('/contact', { method:'POST', body: body });
          setStatus(form, 'Message received. SceneLink will respond from info@scenelink.app.', true);
          var success = document.getElementById('contactSuccess');
          if (success) { form.style.display = 'none'; success.style.display = 'block'; }
          form.reset();
        } catch(err) { setStatus(form, err.message || 'Message failed. Email info@scenelink.app directly.', false); }
        finally { if (btn) { btn.disabled = false; btn.textContent = old || 'Send'; } }
      });
    });
  }
  function wireBusinessInterest(){
    $all('form[data-sl-business-interest]').forEach(function(form){
      if (form.__slPhase8Biz) return; form.__slPhase8Biz = true;
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        var fd = new FormData(form);
        var body = Object.fromEntries(fd.entries());
        var btn = form.querySelector('button[type="submit"], button:not([type])');
        var old = btn && btn.textContent;
        try {
          if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
          await api('/business/upgrade-interest', { method:'POST', body: body });
          setStatus(form, 'Business interest received. The SceneLink team will follow up.', true);
          form.reset();
        } catch(err) { setStatus(form, err.message || 'Request failed. Email info@scenelink.app directly.', false); }
        finally { if (btn) { btn.disabled = false; btn.textContent = old || 'Submit'; } }
      });
    });
  }

  function wireSaveButtons(){
    document.addEventListener('click', async function(e){
      var btn = e.target && e.target.closest && e.target.closest('[data-sl-action="save"][data-sl-venue-id]');
      if (!btn || btn.__slSaving) return;
      var venueId = btn.getAttribute('data-sl-venue-id');
      if (!venueId) return;
      btn.__slSaving = true;
      var old = btn.innerHTML;
      try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving';
        await api('/favorites/' + encodeURIComponent(venueId), { method:'POST' });
        btn.innerHTML = '<i class="fas fa-check"></i> Saved';
      } catch(err) {
        if (err.status === 401) {
          btn.innerHTML = old;
          var auth = document.querySelector('.sl-auth-trigger, [data-auth-open], [data-sl-auth]');
          if (auth) auth.click(); else window.location.href = '/profile.html?auth=login';
        } else {
          btn.innerHTML = old;
          alert(err.message || 'Could not save this venue.');
        }
      } finally { btn.__slSaving = false; }
    });
  }

  function wireMobileNav(){
    // Phase 8F: the mobile-nav OPEN toggle is owned exclusively by
    // js/sl-phase8d-recovery.js (capture-phase delegated handler). Having a
    // second toggle here caused a double-toggle on a single tap (open+close),
    // so the drawer never appeared. We keep ONLY the auxiliary close behaviors
    // here: close the drawer when a nav link is tapped, on Escape, and on an
    // outside tap — without re-binding the open toggle.
    var links = $('#phase8NavLinks');
    if (!links) return;
    function closeNav(restoreFocus) {
      links.classList.remove('open');
      $all('[data-phase8-menu]').forEach(function(btn){ btn.setAttribute('aria-expanded', 'false'); });
      var opener = links.__slMenuOpener || $('[data-phase8-menu]');
      if (restoreFocus && opener) opener.focus();
    }
    // Close when any nav link/button inside the drawer is activated.
    links.addEventListener('click', function(e){
      var t = e.target && e.target.closest && e.target.closest('a, button');
      if (t) closeNav(false);
    });
    // Close on Escape.
    document.addEventListener('keydown', function(e){
      if ((e.key === 'Escape' || e.keyCode === 27) && links.classList.contains('open')) {
        e.preventDefault();
        closeNav(true);
      }
    });
    // Close on outside tap (anything that is not the drawer or the menu button).
    document.addEventListener('click', function(e){
      if (!links.classList.contains('open')) return;
      var insideDrawer = e.target.closest && e.target.closest('#phase8NavLinks');
      var onMenuBtn = e.target.closest && e.target.closest('[data-phase8-menu]');
      if (!insideDrawer && !onMenuBtn) closeNav(false);
    }, true);
  }
  function patchInitialPanels(){
    $all('#slRightPanelCards:empty').forEach(function(el){
      el.innerHTML = '<div class="sl-phase8-panel-skeleton"><div class="sl-phase8-skel-card"></div><div class="sl-phase8-skel-card"></div><div class="sl-phase8-skel-card"></div></div>';
    });
    $all('#slRightPanelCount').forEach(function(el){ if (/loading/i.test(el.textContent || '')) el.textContent = 'Finding venues'; });
  }
  function boot(){ hydrateHomeVenues(); wireSearch(); wireNewsletter(); wireContact(); wireBusinessInterest(); wireSaveButtons(); wireMobileNav(); patchInitialPanels(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
