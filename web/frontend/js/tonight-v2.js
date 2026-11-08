/* ============================================================
   SceneLink Tonight v2 — Premium Nightlife Discovery JS
   Single unified system. No legacy dependencies.
   ============================================================ */
(function () {
  'use strict';
  const slEsc=value=>window.SLConnected.esc(value);

  /* ── Venue Data (loaded from API) ── */
  let VENUES = [], venueGeneration=0, venueOffset=0, venueMore=false, venueTotal=0, venueError=false;

  /* Avatar colors */
  const AVATAR_COLORS = ['#D4AF37','#ef4444','#3b82f6','#22c55e','#a855f7','#f97316','#ec4899'];
  const FRIENDS = []; // populated from real user's friend list when logged in

  /* Map API venue → tonight-v2 format */
  function mapApiVenue(v, idx) {
    const cats = { restaurant:'restaurants', bar:'bars', lounge:'bars', nightclub:'nightlife', club:'nightlife', live_music:'nightlife', cafe:'restaurants' };
    const type = (v.type || '').toLowerCase();
    let category = 'restaurants';
    if (type.includes('nightclub') || type.includes('club')) category = 'nightlife';
    else if (type.includes('bar') || type.includes('lounge')) category = 'bars';
    else if (type.includes('music') || type.includes('live')) category = 'nightlife';

    const priceMap = { 1:'$', 2:'$$', 3:'$$$', 4:'$$$$' };
    const vibeWords = ['lively','romantic','chill','classy','energetic','upscale','casual'];

    return {
      id: v.id,
      slug: v.slug,
      name: v.name,
      type: v.type || 'Venue',
      category: category,
      img: (window.SLVenueImages && SLVenueImages.pick(v)) || v.thumbnail_url || v.cover_image_url || v.image_url || (v.image_urls && v.image_urls[0]) ||
           (window.SLPhoto && SLPhoto.fallbackFor(v)) || '/assets/img/placeholder-venue.svg',
      rating: null, // Legacy aggregate provenance is not verified.
      price: priceMap[v.price_level] || 'Price unavailable',
      // Phase 6B: never show "open status" until hours_json ingestion is complete. Fall back to 'Tonight'.
      hours: v.hours_display || 'Hours unavailable',
      location: v.neighborhood || v.city || 'Location not provided',
      dist: '',
      desc: v.description || 'Confirm details with the venue.',
      highlight: '', // Editorial/deal claims require verification.
      tags: (Array.isArray(v.tags) ? v.tags : []).filter(t => !/trending|popular|top pick|featured|spotlight|hot tonight/i.test(String(t))).slice(0,3),
      spotlight: false,
      timeSlot: type.includes('nightclub') || type.includes('club') ? 'late' : 'both',
      vibe: v.vibe || '',
      whyHot: '',
      pairWith: '',
      // Phase 6A: NO fake fallbacks. If backend doesn't have a real value, hide it.
      buzzScore: null,
      goingCount: null,
      friendsGoing: 0,
      isOpenNow: v.is_open_now === true,
      hasHours: !!(v.hours_json || v.hours_display),
      // Phase 6B: NO 'open' badge until hours_json ingestion is complete. Forbidden by Phase 6B P0 rule.
      badges: [], // No unsupported popularity or editorial badges.
    };
  }

  /* ── Tonight: real-data only. No fake fallback cards. ── */
  const TONIGHT_FALLBACK = [];

  async function loadVenues(append) {
 const seq=++venueGeneration,offset=append?venueOffset:0;venueError=false;
 if(!append)VENUES=[];
 try{const data=await window.SLVenueData.list({limit:100,offset,q:state.searchQuery||''});if(seq!==venueGeneration)return;
 const seen=new Set(VENUES.map(v=>v.id));VENUES=VENUES.concat(data.venues.filter(v=>!seen.has(v.id)).map(mapApiVenue));venueOffset=offset+data.venues.length;venueMore=data.has_more;venueTotal=data.total;
 }catch(e){if(seq!==venueGeneration)return;venueError=true;venueMore=false;}
 }

    /* ── State ──────────────────────────────────────────────── */
  const state = {
    timeFilter: 'all',
    typeFilter: null,
    vibeFilter: null,
    priceFilter: null,
    searchQuery: '',
    savedVenues: new Set(JSON.parse(localStorage.getItem('tp-saved-v2') || '[]')),
    plan: JSON.parse(localStorage.getItem('tp-plan-v2') || '[]'),
    activeModal: null,
    reviewRating: 0,
  };

  /* ── Helpers ────────────────────────────────────────────── */
  function savePersist() {
    localStorage.setItem('tp-saved-v2', JSON.stringify([...state.savedVenues]));
    localStorage.setItem('tp-plan-v2', JSON.stringify(state.plan));
  }

  function getFilteredVenues() {
    return VENUES.filter(v => {
      if (state.timeFilter === 'dinner' && v.timeSlot !== 'dinner' && v.timeSlot !== 'both') return false;
      if (state.timeFilter === 'late' && v.timeSlot !== 'late' && v.timeSlot !== 'both') return false;
      if (state.typeFilter && v.category !== state.typeFilter) return false;
      if (state.vibeFilter) {
        const vibeMap = { romantic: 'romantic', lively: 'lively', upscale: 'upscale', casual: 'casual' };
        if (v.vibe !== state.vibeFilter) return false;
      }
      if (state.priceFilter) {
        const priceMap = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };
        const target = priceMap[state.priceFilter] || 0;
        if (priceMap[v.price] !== target) return false;
      }
      // Server search handles locality, token matching and category aliases.
      return true;
    });
  }

  /* ── Badge HTML ─────────────────────────────────────────── */
  function badgeHTML(type) { return ''; } // Await source-backed badge provenance.

  /* ── Stars HTML ─────────────────────────────────────────── */
  function starsHTML(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '<i class="fas fa-star"></i>';
    if (half) s += '<i class="fas fa-star-half-alt"></i>';
    return s;
  }

  /* ── Avatar HTML ────────────────────────────────────────── */
  function avatarHTML(initials, color) {
    return `<div class="tv2-avatar" style="background:${color}">${initials}</div>`;
  }

  /* ── Image with fallback ─────────────────────────────────── */
  function imgHTML(src, alt, cls) {
    return `<img src="${slEsc(src)}" alt="${slEsc(alt)}" class="${slEsc(cls)}" onerror="SL_IMG_FALLBACK(this,'venue')" loading="lazy">`;
  }

  /* ── Render Stats Bar ───────────────────────────────────── */
  function renderStats() {
    const el = document.getElementById('tv2-stats');
    if (el) el.innerHTML = `<div class="tv2-stat"><div class="tv2-stat-val">${getFilteredVenues().length}</div><div class="tv2-stat-label">Showing in this selection</div></div>`;
  }

  /* ── Render Social Proof ────────────────────────────────── */
  function renderSocialProof() {
    const el = document.getElementById('tv2-social-bar');
    if (!el) return;
    // Phase 6A: NO fake social proof. Only real friends-going data when available.
    // Wire to /api/plans?status=going&for=tonight + /api/friends/me when posts/plans
    // table has live data. Currently friends_going=0 system-wide — hide entirely.
    const proofs = [];
    if (proofs.length === 0) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = proofs.map(p => `
      <div class="tv2-social-pill">
        <div class="tv2-social-avatars">
          ${p.avatars.map((a, i) => avatarHTML(a, p.color[i])).join('')}
        </div>
        <span class="tv2-pill-text">${p.text}</span>
      </div>
    `).join('');
  }

  /* ── Render Spotlight ───────────────────────────────────── */
  function renderSpotlight() {
    const el = document.getElementById('tv2-spotlight');
    if (!el) return;
    const v = VENUES[0]; // First alphabetical listing, not a popularity claim.
    if (!v) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    const isSaved = state.savedVenues.has(v.id);
    const inPlan = state.plan.some(p => p.id === v.id);

    el.innerHTML = `
      <div class="tv2-spotlight" role="button" tabindex="0" onclick="window.TV2.openModal('${slEsc(v.id)}')" onkeydown="if(event.key==='Enter')window.TV2.openModal('${slEsc(v.id)}')">
        <div class="tv2-spotlight-img">
          ${imgHTML(v.img, v.name, '')}
          <div class="tv2-spotlight-badges">
            ${(v.badges || []).map(badgeHTML).join('')}
          </div>
        </div>
        <div class="tv2-spotlight-body">
          <div>
            <div class="tv2-spotlight-type">${slEsc(v.type)}</div>
            <h2 class="tv2-spotlight-name">${slEsc(v.name)}</h2>
            <p class="tv2-spotlight-desc">${slEsc(v.desc)}</p>
            <div class="tv2-meta">

              <span class="tv2-meta-item"><i class="fas fa-clock"></i> ${slEsc(v.hours)}</span>
              <span class="tv2-meta-item"><i class="fas fa-map-marker-alt"></i> ${slEsc(v.location)}${v.dist ? ' · ' + v.dist : ''}</span>
              <span class="tv2-meta-item"><i class="fas fa-dollar-sign"></i> ${slEsc(v.price)}</span>
            </div>
            ${v.highlight ? `<div class="tv2-highlight"><i class="fas fa-tag"></i> ${v.highlight}</div>` : ''}
            <div class="tv2-tags">${v.tags.map(t => `<span class="tv2-tag">${slEsc(t)}</span>`).join('')}</div>
          </div>
          <div class="tv2-spotlight-actions" onclick="event.stopPropagation()">
            <button class="tv2-btn-primary" onclick="window.TV2.openModal('${slEsc(v.id)}')"><i class="fas fa-eye"></i> View Details</button>
            <button class="tv2-btn-secondary ${isSaved ? 'saved' : ''}" onclick="window.TV2.toggleSave('${slEsc(v.id)}')" id="spot-save-${slEsc(v.id)}">
              <i class="fa${isSaved ? 's' : 'r'} fa-heart"></i> ${isSaved ? 'Saved' : 'Save'}
            </button>
            <button class="tv2-btn-secondary ${inPlan ? 'in-plan' : ''}" onclick="window.TV2.togglePlan('${slEsc(v.id)}')" id="spot-plan-${slEsc(v.id)}">
              <i class="fas ${inPlan ? 'fa-check' : 'fa-plus'}"></i> ${inPlan ? 'In Plan' : 'Add to Plan'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /* ── Render Venue Card ──────────────────────────────────── */
  function renderCard(v) {
    const isSaved = state.savedVenues.has(v.id);
    const inPlan = state.plan.some(p => p.id === v.id);
    const displayBadges = (v.badges || []).filter(b => b !== 'pick' && b !== 'open');

    return `
      <div class="tv2-card" role="button" tabindex="0"
           onclick="window.TV2.openModal('${slEsc(v.id)}')"
           onkeydown="if(event.key==='Enter')window.TV2.openModal('${slEsc(v.id)}')">
        <div class="tv2-card-img">
          ${imgHTML(v.img, v.name, '')}
          <div class="tv2-card-badges">${displayBadges.map(badgeHTML).join('')}</div>
          <!-- Phase 6B: Hours pill removed; cannot honestly show without real hours_json. -->
          <button class="tv2-card-save ${isSaved ? 'saved' : ''}" id="card-save-${slEsc(v.id)}"
            onclick="event.stopPropagation();window.TV2.toggleSave('${slEsc(v.id)}')"
            title="${isSaved ? 'Saved' : 'Save to favorites'}">
            <i class="fa${isSaved ? 's' : 'r'} fa-heart"></i>
          </button>
        </div>
        <div class="tv2-card-body">
          <div class="tv2-card-name-row">
            <div class="tv2-card-name">${slEsc(v.name)}</div>

          </div>
          <div class="tv2-card-type">${slEsc(v.type)} · ${slEsc(v.price)}</div>
          <p class="tv2-card-desc">${slEsc(v.desc)}</p>
          <div class="tv2-card-meta">
            <span class="tv2-card-meta-item"><i class="fas fa-clock"></i> ${slEsc(v.hours)}</span>
            <span class="tv2-card-meta-item"><i class="fas fa-map-marker-alt"></i> ${slEsc(v.location)}${v.dist ? ' · ' + v.dist : ''}</span>
          </div>
          <div class="tv2-card-tags">${v.tags.map(t => `<span class="tv2-card-tag">${slEsc(t)}</span>`).join('')}</div>
          <div class="tv2-card-actions" onclick="event.stopPropagation()">
            <button class="tv2-card-btn-view" onclick="window.TV2.openModal('${slEsc(v.id)}')">
              <i class="fas fa-eye"></i> View Details
            </button>
            <button class="tv2-card-btn-sm ${isSaved ? 'saved' : ''}" id="card-save-btn-${slEsc(v.id)}"
              onclick="event.stopPropagation();window.TV2.toggleSave('${slEsc(v.id)}')"
              title="${isSaved ? 'Saved' : 'Save to favorites'}">
              <i class="fa${isSaved ? 's' : 'r'} fa-heart"></i>
            </button>
            <button class="tv2-card-btn-sm ${inPlan ? 'in-plan' : ''}" id="card-plan-btn-${slEsc(v.id)}"
              onclick="event.stopPropagation();window.TV2.togglePlan('${slEsc(v.id)}')"
              title="${inPlan ? 'Remove from plan' : 'Add to plan'}">
              <i class="fas ${inPlan ? 'fa-check' : 'fa-plus'}"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /* ── Section definitions ────────────────────────────────── */
  function getSections(filtered) {
    const sections = [];

    // Section 1: Perfect for Dinner (restaurants, dinner slot)
    const dinner = filtered.filter(v => v.category === 'restaurants' && (v.timeSlot === 'dinner' || v.timeSlot === 'both'));
    if (dinner.length && (state.timeFilter === 'all' || state.timeFilter === 'dinner')) {
      sections.push({ id: 'dinner', icon: '🍽️', title: 'Perfect for Dinner', venues: dinner.slice(0, 6) });
    }

    // Section 2: Drinks & Cocktails
    const bars = filtered.filter(v => v.category === 'bars');
    if (bars.length) {
      sections.push({ id: 'bars', icon: '🍸', title: 'Drinks & Cocktails', venues: bars.slice(0, 6) });
    }

    // Section 3: Live Music & Events
    const events = filtered.filter(v => v.category === 'events');
    if (events.length) {
      sections.push({ id: 'events', icon: '🎵', title: 'Live Music & Events', venues: events.slice(0, 6) });
    }

    // Section 4: Late Night (if all or late filter)
    if (state.timeFilter !== 'dinner') {
      const late = filtered.filter(v => v.timeSlot === 'late' || v.category === 'nightlife');
      if (late.length) {
        sections.push({ id: 'late', icon: '🌙', title: 'Late Night', venues: late.slice(0, 6) });
      }
    }

    // If filtering returns nothing in category sections, show all filtered
    if (sections.length === 0 && filtered.length > 0) {
      sections.push({ id: 'all', icon: '✨', title: 'Tonight\'s Picks', venues: filtered });
    }

    return sections;
  }

  /* ── Render Sections ────────────────────────────────────── */
  function renderSections() {
    const el = document.getElementById('tv2-sections');
    if (!el) return;
    const filtered = getFilteredVenues();
    const sections = getSections(filtered);

    if (sections.length === 0) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--tv2-text-muted)">
        <i class="fas fa-search" style="font-size:2rem;margin-bottom:16px;display:block;color:var(--tv2-text-dim)"></i>
        No venues match your current filters.<br>
        <button onclick="window.TV2.clearFilters()" style="margin-top:16px;padding:8px 20px;border-radius:20px;background:var(--tv2-gold);color:#0a0a0a;border:none;cursor:pointer;font-weight:600;">Clear Filters</button>
      </div>`;
      return;
    }

    el.innerHTML = sections.map(s => `
      <div class="tv2-section">
        <div class="tv2-section-head">
          <div class="tv2-section-title">
            <span class="tv2-section-icon">${s.icon}</span>
            ${s.title}
            <span class="tv2-section-count">${s.venues.length} spot${s.venues.length !== 1 ? 's' : ''}</span>
          </div>
          <a class="tv2-view-all" href="explore.html">View All <i class="fas fa-arrow-right"></i></a>
        </div>
        <div class="tv2-grid">${s.venues.map(renderCard).join('')}</div>
      </div>
    `).join('');
  }

  /* ── Render WHY HOT / PAIR WITH Insights ────────────────── */
  function renderInsights() {
    const el = document.getElementById('tv2-insights');
    if (el) { el.innerHTML = ''; el.style.display = 'none'; }
  }

  /* ── Open Modal ─────────────────────────────────────────── */
  function openModal(venueId){ return window.SLVenueDetail.open(venueId); }

  /* ── Reviews ──────────────────────────────────────────────── */
  function loadReviewsForVenue(venueId) {
    const listEl = document.getElementById(`tv2-modal-reviews-list-${slEsc(venueId)}`);
    const countEl = document.getElementById(`tv2-modal-reviews-count-${slEsc(venueId)}`);
    if (!listEl) return;

    // Only fetch for UUID venues (real backend venues)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(venueId)) {
      listEl.innerHTML = '<div class="tv2-reviews-empty">Reviews load for live venues. Browse Tonight\'s Picks to see real venue reviews.</div>';
      return;
    }

    const apiBase = (window.SLConfig && (window.SLConfig.API_URL || window.SLConfig.API_BASE_URL)) || (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) || '/api';
    fetch(`${apiBase}/reviews?venue_id=${encodeURIComponent(venueId)}`)
      .then(r => r.json())
      .then(data => {
        const reviews = (data && data.reviews) || [];
        if (countEl) countEl.textContent = reviews.length ? `(${reviews.length})` : '';
        if (!reviews.length) {
          listEl.innerHTML = '<div class="tv2-reviews-empty">No reviews yet. Be the first to share your experience!</div>';
          return;
        }
        listEl.innerHTML = reviews.map(r => {
          const initials = (r.display_name || 'A').trim().charAt(0).toUpperCase();
          const stars = '★'.repeat(Math.round(r.rating || 0)) + '☆'.repeat(5 - Math.round(r.rating || 0));
          const when = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const safeContent = String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const safeName = String(r.display_name || 'Anonymous').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `
            <div class="tv2-review">
              <div class="tv2-review-head">
                <div class="tv2-review-avatar">${initials}</div>
                <div class="tv2-review-meta">
                  <div class="tv2-review-name">${safeName}</div>
                  <div class="tv2-review-date">${when}</div>
                </div>
                <div class="tv2-review-stars">${stars}</div>
              </div>
              ${safeContent ? `<div class="tv2-review-content">${safeContent}</div>` : ''}
            </div>
          `;
        }).join('');
      })
      .catch(err => {
        console.warn('[reviews] load failed:', err);
        listEl.innerHTML = '<div class="tv2-reviews-empty">Could not load reviews right now.</div>';
      });
  }

  function openReviewForm(venueId) {
    // Auth gate
    const token = localStorage.getItem('sl_jwt_token') || (window.SLApi && window.SLApi.getToken && window.SLApi.getToken());
    if (!token) {
      if (window.SLAuth && window.SLAuth.openModal) {
        window.SLAuth.openModal();
      } else {
        alert('Please sign in to write a review.');
      }
      return;
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(venueId)) {
      alert('Reviews are only available for live venues.');
      return;
    }

    // Inject form overlay (separate from venue modal)
    let formOverlay = document.getElementById('tv2-review-form-overlay');
    if (!formOverlay) {
      formOverlay = document.createElement('div');
      formOverlay.id = 'tv2-review-form-overlay';
      formOverlay.className = 'tv2-review-form-overlay';
      document.body.appendChild(formOverlay);
    }

    formOverlay.innerHTML = `
      <div class="tv2-review-form">
        <button class="tv2-review-form-close" onclick="window.TV2.closeReviewForm()" aria-label="Close">&times;</button>
        <div class="tv2-review-form-title">Write a Review</div>
        <div class="tv2-review-form-field">
          <label>Your rating</label>
          <div class="tv2-review-form-stars" id="tv2-rf-stars">
            ${[1,2,3,4,5].map(n => `<span class="tv2-rf-star" data-rating="${n}" onclick="window.TV2.setReviewRating(${n})">★</span>`).join('')}
          </div>
        </div>
        <div class="tv2-review-form-field">
          <label>Your review (optional)</label>
          <textarea id="tv2-rf-content" placeholder="Share your experience..." rows="5" maxlength="1000"></textarea>
        </div>
        <div class="tv2-review-form-actions">
          <button class="tv2-review-form-cancel" onclick="window.TV2.closeReviewForm()">Cancel</button>
          <button class="tv2-review-form-submit" onclick="window.TV2.submitReview('${slEsc(venueId)}')">Post Review</button>
        </div>
        <div class="tv2-review-form-error" id="tv2-rf-error"></div>
      </div>
    `;
    state.reviewRating = 0;
    formOverlay.classList.add('open');
  }

  function closeReviewForm() {
    const overlay = document.getElementById('tv2-review-form-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function setReviewRating(n) {
    state.reviewRating = n;
    document.querySelectorAll('#tv2-rf-stars .tv2-rf-star').forEach((el, i) => {
      el.classList.toggle('active', i < n);
    });
  }

  function submitReview(venueId) {
    const errEl = document.getElementById('tv2-rf-error');
    const content = (document.getElementById('tv2-rf-content') || {}).value || '';
    const rating = state.reviewRating || 0;
    if (errEl) errEl.textContent = '';
    if (rating < 1) {
      if (errEl) errEl.textContent = 'Please select a rating.';
      return;
    }
    const token = localStorage.getItem('sl_jwt_token') || (window.SLApi && window.SLApi.getToken && window.SLApi.getToken());
    const apiBase = (window.SLConfig && (window.SLConfig.API_URL || window.SLConfig.API_BASE_URL)) || (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) || '/api';
    const btn = document.querySelector('.tv2-review-form-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

    fetch(`${apiBase}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ venue_id: venueId, rating: rating, content: content })
    })
      .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data }) => {
        if (!ok) throw new Error((data && data.error) || ('HTTP ' + status));
        closeReviewForm();
        loadReviewsForVenue(venueId);
      })
      .catch(err => {
        if (errEl) errEl.textContent = 'Could not post review: ' + (err.message || 'unknown error');
        if (btn) { btn.disabled = false; btn.textContent = 'Post Review'; }
      });
  }

  function closeModal() {
    const overlay = document.getElementById('tv2-modal-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    state.activeModal = null;
  }

  function checkIn(venueId) {
    const token = localStorage.getItem('sl_jwt_token') || (window.SLApi && window.SLApi.getToken && window.SLApi.getToken());
    if (!token) {
      if (window.SLAuth && window.SLAuth.openModal) {
        window.SLAuth.openModal();
      } else {
        showToast && showToast('Please sign in to check in', 'info');
      }
      return;
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(venueId)) {
      showToast && showToast('Check-ins only work for live venues', 'info');
      return;
    }
    const v = VENUES.find(x => x.id === venueId);
    const btn = document.getElementById(`modal-checkin-${slEsc(venueId)}`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking in…'; }

    const apiBase = (window.SLConfig && (window.SLConfig.API_URL || window.SLConfig.API_BASE_URL)) || (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) || '/api';
    fetch(`${apiBase}/checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ venue_id: venueId, note: '' })
    })
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error((data && data.error) || 'Check-in failed');
        if (btn) {
          btn.classList.add('checked-in');
          btn.innerHTML = '<i class="fas fa-check"></i> Checked In';
          btn.disabled = true;
        }
        // Bump local going count for immediate UX feedback
        if (v) v.goingCount = (v.goingCount || 0) + 1;
        showToast && showToast(`Checked in to ${v ? v.name : 'venue'}`, 'saved');
      })
      .catch(err => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-location-dot"></i> I\'m Here'; }
        showToast && showToast('Could not check in right now', 'info');
        console.warn('[checkin]', err);
      });
  }

  /* ── Toggle Save ────────────────────────────────────────── */
  /* ── Auth helpers (launch-polish: enforce login on save/plan) ── */
  function isAuthedTV2() {
    try {
      if (window.SLApi && typeof window.SLApi.isLoggedIn === 'function') return window.SLApi.isLoggedIn();
      if (window.SLAuth && typeof window.SLAuth.isAuthed === 'function') return window.SLAuth.isAuthed();
      return !!(localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_jwt_v2'));
    } catch(e) { return false; }
  }
  function promptLoginTV2(action) {
    try {
      if (window.SLAuth && typeof window.SLAuth.openLogin === 'function') {
        window.SLAuth.openLogin('login');
        return;
      }
    } catch(e) {}
    try {
      if (window.SLToast && typeof window.SLToast.info === 'function') {
        window.SLToast.info('Please sign in to ' + (action || 'continue') + '.');
      } else {
        alert('Please sign in to ' + (action || 'continue') + '.');
      }
    } catch(e) { alert('Please sign in first.'); }
  }

  function toggleSave(venueId){return window.SLVenueActions.save(venueId);}

  /* ── Toggle Plan ────────────────────────────────────────── */
  function togglePlan(venueId){window.location.href='/plan-with-friends?venue_id='+encodeURIComponent(venueId);}

  /* ── Reserve ────────────────────────────────────────────── */
  function reserve(venueId){ return window.SLVenueDetail.open(venueId); }

  /* ── Invite Friend ──────────────────────────────────────── */
  function inviteFriend(){window.location.href='/plan-with-friends';}

  /* ── Invite All ─────────────────────────────────────────── */
  function inviteAll(venueId){window.location.href='/plan-with-friends?venue_id='+encodeURIComponent(venueId);}

  /* ── Share ──────────────────────────────────────────────── */
  function share(venueId) {
    const v = VENUES.find(x => x.id === venueId);
    if (navigator.share) {
      navigator.share({ title: v?.name, text: `Check out ${v?.name} on SceneLink tonight!`, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${v?.name} — ${window.location.href}`).catch(() => {});
      showToast('Link copied to clipboard', 'save');
    }
  }

  /* ── Clear Filters ──────────────────────────────────────── */
  function clearFilters() {
    state.typeFilter = null;
    state.vibeFilter = null;
    state.priceFilter = null;
    state.searchQuery = '';
    state.timeFilter = 'all';

    document.querySelectorAll('.tv2-chip.active, .tv2-time-btn.active').forEach(el => el.classList.remove('active'));
    const allBtn = document.querySelector('[data-time="all"]');
    if (allBtn) allBtn.classList.add('active');
    const search = document.getElementById('tv2-search');
    if (search) search.value = '';

    renderAll();
  }

  /* ── Plan Strip ─────────────────────────────────────────── */
  function updatePlanStrip() {
    const strip = document.getElementById('tv2-plan-strip');
    if (!strip) return;
    const count = state.plan.length;
    const badge = document.getElementById('tv2-plan-count');
    if (badge) badge.textContent = count;
    strip.classList.toggle('visible', count > 0);
    var dr = document.getElementById('tv2-plan-drawer');
    if (dr && dr.classList.contains('visible')) {
      renderPlanDrawer();
    }
  }

  /* Plan Drawer (slide-up) */
  function openPlanDrawer() {
    const dr = document.getElementById('tv2-plan-drawer');
    if (!dr) return;
    renderPlanDrawer();
    dr.classList.add('visible');
    dr.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closePlanDrawer() {
    const dr = document.getElementById('tv2-plan-drawer');
    if (!dr) return;
    dr.classList.remove('visible');
    dr.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function renderPlanDrawer() {
    const body = document.getElementById('tv2-plan-drawer-body');
    if (!body) return;
    if (!state.plan.length) {
      body.innerHTML =
        '<div class="tv2-plan-empty">' +
        '<div class="tv2-plan-empty-icon"><i class="fa fa-moon"></i></div>' +
        '<h4>Start building your night</h4>' +
        '<p>Add dinner, drinks, or a late-night spot. Share it, or get full-route directions when you\'re ready.</p>' +
        '<button class="tv2-plan-btn-primary" onclick="window.TV2.closePlanDrawer();if(window.SLConcierge){window.SLConcierge.ask(\'Plan my night\');}">' +
        '<i class="fas fa-wand-magic-sparkles"></i> Ask the Concierge to plan it' +
        '</button>' +
        '</div>';
      return;
    }
    const byStop = { dinner: [], drinks: [], late: [] };
    state.plan.forEach(function (id) {
      const v = VENUES.find(function (x) { return x.id === id; });
      if (!v) return;
      if (v.category === 'bars') byStop.drinks.push(v);
      else if (v.timeSlot === 'late' || v.category === 'nightlife') byStop.late.push(v);
      else byStop.dinner.push(v);
    });
    const stopLabels = { dinner: '1. Dinner', drinks: '2. Drinks', late: '3. Late Night' };
    var html = '';
    ['dinner', 'drinks', 'late'].forEach(function (slot) {
      const stop = byStop[slot];
      html += '<div class="tv2-plan-stop">';
      html += '<div class="tv2-plan-stop-head">' + stopLabels[slot] + '</div>';
      if (!stop.length) {
        html += '<div class="tv2-plan-stop-empty">No ' + slot + ' picks yet</div>';
      } else {
        stop.forEach(function (v) {
          const img = (window.SLVenueImages && window.SLVenueImages.pick(v)) || v.image || '';
          html += '<div class="tv2-plan-item">';
          html += '<div class="tv2-plan-item-img" style="background-image:url(\'' + (img || '') + '\')"></div>';
          html += '<div class="tv2-plan-item-body">';
          html += '<div class="tv2-plan-item-name">' + (v.name || 'Venue') + '</div>';
          html += '<div class="tv2-plan-item-meta">' + (v.neighborhood || '') + (v.price ? ' &middot; ' + v.price : '') + (v.vibe ? ' &middot; ' + v.vibe : '') + '</div>';
          html += '</div>';
          html += '<button class="tv2-plan-item-remove" onclick="window.TV2.removeFromPlan(\'' + v.id + '\')" aria-label="Remove"><i class="fa fa-times"></i></button>';
          html += '</div>';
        });
      }
      html += '</div>';
    });
    body.innerHTML = html;
  }
  function removeFromPlan(id) {
    const i = state.plan.indexOf(id);
    if (i !== -1) {
      state.plan.splice(i, 1);
      try { localStorage.setItem('tv2_plan', JSON.stringify(state.plan)); } catch(_){}
      try { localStorage.setItem('sl_plan_venues', JSON.stringify(state.plan)); } catch(_){}
      updatePlanStrip();
      renderPlanDrawer();
      renderAll();
      showToast('Removed from plan', 'remove');
    }
  }
  function sharePlan() {
    if (!state.plan.length) { showToast('Add a spot first', 'info'); return; }
    const items = state.plan.map(function (id) {
      const v = VENUES.find(function (x) { return x.id === id; });
      return v ? (v.name + ' (' + (v.neighborhood || 'Boston') + ')') : null;
    }).filter(Boolean);
    const text = 'My SceneLink Night Plan:\n' + items.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n') + '\n\nBuild yours: https://scenelink.app/tonight';
    if (navigator.share) {
      navigator.share({ title: 'My Night Plan', text: text, url: 'https://scenelink.app/tonight' }).catch(function(){});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { showToast('Plan copied to clipboard', 'save'); });
    } else {
      showToast('Share not supported on this device', 'info');
    }
  }
  function invitePlanFriends(){window.location.href='/plan-with-friends';}
  function getDirectionsPlan() {
    const pts = state.plan.map(function (id) {
      const v = VENUES.find(function (x) { return x.id === id; });
      return v ? (v.address || v.name) : null;
    }).filter(Boolean);
    if (!pts.length) { showToast('Add a spot first', 'info'); return; }
    const origin = encodeURIComponent('Boston, MA');
    const dest = encodeURIComponent(pts[pts.length - 1] + ', Boston, MA');
    const waypoints = pts.slice(0, -1).map(function (p) { return encodeURIComponent(p + ', Boston, MA'); }).join('|');
    var url = 'https://www.google.com/maps/dir/?api=1&origin=' + origin + '&destination=' + dest;
    if (waypoints) url += '&waypoints=' + waypoints;
    window.open(url, '_blank', 'noopener');
  }

  /* ── Toast ──────────────────────────────────────────────── */
  function showToast(msg, type) {
    const container = document.getElementById('tv2-toast-container');
    if (!container) return;
    const icons = { saved: '♥', plan: '＋', remove: '×', reserve: '✓', invite: '✉', save: '📋' };
    const toast = document.createElement('div');
    toast.className = `tv2-toast tv2-toast-${type || 'save'}`;
    toast.innerHTML = `<span class="tv2-toast-icon">${icons[type] || '✓'}</span>${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  /* ── Render All ─────────────────────────────────────────── */
  function renderAll() {
    renderStats();
    renderSections();
    renderInsights();
    let pagination=document.getElementById('slTonightPagination');if(!pagination){pagination=document.createElement('div');pagination.id='slTonightPagination';pagination.className='sl-connected';document.getElementById('tv2-stats').after(pagination);}
    pagination.innerHTML='<p>'+(venueError?'Venue service unavailable. No substitute listings are shown.':'Showing '+VENUES.length+' of '+venueTotal+' directory records. Confirm hours with the venue.')+'</p>'+((venueMore||venueError)?'<button type="button" id="slTonightMore">'+(venueError?'Retry':'Load more venues')+'</button>':'');
    const more=document.getElementById('slTonightMore');if(more)more.onclick=()=>{more.disabled=true;loadVenues(!venueError).then(renderAll);};
    // Re-render spotlight save/plan state without full rebuild (just update buttons)
    const v = VENUES[0]; // Same first alphabetical listing as the large card.
    if (v) {
      ['spot-save', 'spot-plan'].forEach(() => {}); // state already reflected via IDs
    }
  }

  /* ── Filter Chip Handler ─────────────────────────────────── */
  function bindFilters() {
    // Time toggles
    document.querySelectorAll('.tv2-time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tv2-time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timeFilter = btn.dataset.time;
        renderAll();
      });
    });

    // Type chips
    document.querySelectorAll('[data-type]').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.type;
        const isActive = chip.classList.contains('active');
        document.querySelectorAll('[data-type]').forEach(c => c.classList.remove('active'));
        state.typeFilter = isActive ? null : val;
        if (!isActive) chip.classList.add('active');
        renderAll();
      });
    });

    // Vibe chips
    document.querySelectorAll('[data-vibe]').forEach(chip => {
      if (/^(trending|popular|hot|featured|top-rated)$/.test(chip.dataset.vibe || '')) {
        chip.disabled = true; chip.setAttribute('aria-disabled', 'true');
        chip.title = 'Unavailable until source-backed activity is verified'; return;
      }
      chip.addEventListener('click', () => {
        const val = chip.dataset.vibe;
        const isActive = chip.classList.contains('active');
        document.querySelectorAll('[data-vibe]').forEach(c => c.classList.remove('active'));
        state.vibeFilter = isActive ? null : val;
        if (!isActive) chip.classList.add('active');
        renderAll();
      });
    });

    // Price chips
    document.querySelectorAll('[data-price]').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.price;
        const isActive = chip.classList.contains('active');
        document.querySelectorAll('[data-price]').forEach(c => c.classList.remove('active'));
        state.priceFilter = isActive ? null : val;
        if (!isActive) chip.classList.add('active');
        renderAll();
      });
    });

    // Search
    const searchEl = document.getElementById('tv2-search');
    if (searchEl) {
      let searchTimer;
      searchEl.addEventListener('input', () => {state.searchQuery=searchEl.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadVenues().then(renderAll),250);});
    }
  }

  /* ── Keyboard: close modal on Escape ───────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  /* ── Init ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    // Public API
    window.TV2 = {
      openModal, closeModal, toggleSave, togglePlan,
      reserve, inviteFriend, inviteAll, share, clearFilters, showToast,
      openReviewForm, closeReviewForm, setReviewRating, submitReview,
      checkIn,
      openPlanDrawer, closePlanDrawer, renderPlanDrawer,
      sharePlan, invitePlanFriends, getDirectionsPlan, removeFromPlan,
    };

    // Show polished skeleton loading state (instead of raw Loading...)
    const sectionsEl = document.getElementById('tv2-sections');
    if (sectionsEl) {
      var skeleton = '<div class="tv2-skeleton-section">';
      skeleton += '<div class="tv2-skeleton-title"></div>';
      skeleton += '<div class="tv2-skeleton-grid">';
      for (var i = 0; i < 3; i++) {
        skeleton += '<div class="tv2-skeleton-card"><div class="tv2-skel-img"></div><div class="tv2-skel-body"><div class="tv2-skel-line w80"></div><div class="tv2-skel-line w60"></div><div class="tv2-skel-line w40"></div></div></div>';
      }
      skeleton += '</div></div>';
      sectionsEl.innerHTML = skeleton;
    }

    await loadVenues();

    renderSocialProof();
    renderSpotlight();
    renderAll();
    updatePlanStrip();
    bindFilters();
  });

})();