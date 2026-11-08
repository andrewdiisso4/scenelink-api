/**
 * SceneLink — Universal Save/Plan Action Handler
 *
 * Reads declarative data attributes from any button to wire save/plan actions.
 * Pages only need to add the right attributes to any button; this script handles
 * everything (auth-gating, API sync, visual state, toasts).
 *
 * Attributes:
 *   data-sl-action="save"|"plan"|"remove-fav"|"remove-plan"
 *   data-sl-venue-id="{uuid or number}"
 *   data-sl-venue-slug="{slug}"           (optional)
 *   data-sl-venue-name="{name}"           (for local/toast display)
 *   data-sl-venue-type="{type}"           (optional)
 *   data-sl-venue-image="{url}"           (optional)
 *   data-sl-venue-price="{$ label}"       (optional)
 *   data-sl-venue-neighborhood="{...}"    (optional)
 *   data-sl-venue-rating="{0-5}"          (optional)
 *
 * Visual state classes applied:
 *   .sl-saved, .sl-in-plan
 *
 * Child icon toggling:
 *   <i class="far fa-heart"></i>  ↔  <i class="fas fa-heart"></i>
 *   <i class="fas fa-plus"></i>   ↔  <i class="fas fa-check"></i>
 */
(function () {
  'use strict';

  // ---- Toast ----
  var _toastContainer = null;
  function toast(msg, kind) {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'sl-toast-container';
      _toastContainer.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10050;' +
        'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
      document.body.appendChild(_toastContainer);
    }
    var bg = '#D4AF37', color = '#000';
    if (kind === 'remove') { bg = '#333'; color = '#fff'; }
    if (kind === 'error')  { bg = '#ef4444'; color = '#fff'; }
    if (kind === 'info')   { bg = '#1e293b'; color = '#fff'; }

    var t = document.createElement('div');
    t.style.cssText =
      'background:' + bg + ';color:' + color + ';padding:10px 22px;border-radius:24px;' +
      'font-weight:600;font-size:14px;box-shadow:0 8px 28px rgba(0,0,0,0.45);' +
      'opacity:0;transform:translateY(12px);transition:opacity 0.25s, transform 0.25s;' +
      'pointer-events:auto;';
    t.textContent = msg;
    _toastContainer.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateY(12px)';
      setTimeout(function () { t.remove(); }, 260);
    }, 2400);
  }

  // ---- Extract venue payload from button or parent card ----
  function extractVenue(btn) {
    var ds = btn.dataset;
    var v = {
      id:           ds.slVenueId || ds.venueId,
      slug:         ds.slVenueSlug || ds.venueSlug,
      name:         ds.slVenueName || ds.venueName,
      type:         ds.slVenueType || ds.venueType,
      image:        ds.slVenueImage || ds.venueImage,
      rating:       ds.slVenueRating || ds.venueRating,
      neighborhood: ds.slVenueNeighborhood || ds.venueNeighborhood,
      price:        ds.slVenuePrice || ds.venuePrice
    };
    // Fallback: walk up to nearest card element with data-venue-* attrs
    if (!v.id) {
      var card = btn.closest('[data-venue-id], [data-sl-venue-id]');
      if (card) {
        var cds = card.dataset;
        v = {
          id:           cds.slVenueId || cds.venueId,
          slug:         cds.slVenueSlug || cds.venueSlug,
          name:         cds.slVenueName || cds.venueName,
          type:         cds.slVenueType || cds.venueType,
          image:        cds.slVenueImage || cds.venueImage,
          rating:       cds.slVenueRating || cds.venueRating,
          neighborhood: cds.slVenueNeighborhood || cds.venueNeighborhood,
          price:        cds.slVenuePrice || cds.venuePrice
        };
      }
    }
    return v.id ? v : null;
  }

  // ---- Toggle heart icon ----
  function setSavedIcon(btn, isSaved) {
    btn.classList.toggle('sl-saved', isSaved);
    btn.classList.toggle('saved', isSaved);
    btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
    var icon = btn.querySelector('i.fa-heart, i.fa-bookmark, i[class*="heart"], i[class*="bookmark"]');
    if (icon) {
      if (icon.classList.contains('fa-heart')) {
        icon.classList.toggle('far', !isSaved);
        icon.classList.toggle('fas', isSaved);
      } else if (icon.classList.contains('fa-bookmark')) {
        icon.classList.toggle('far', !isSaved);
        icon.classList.toggle('fas', isSaved);
      }
      icon.style.color = isSaved ? '#D4AF37' : '';
    }
    // Label swap if button has a text label like "Save" / "Saved"
    var txt = btn.querySelector('.sl-btn-label, .btn-label');
    if (txt) txt.textContent = isSaved ? 'Saved' : 'Save';
  }

  function setPlanIcon(btn, inPlan) {
    btn.classList.toggle('sl-in-plan', inPlan);
    btn.classList.toggle('in-plan', inPlan);
    btn.setAttribute('aria-pressed', inPlan ? 'true' : 'false');
    var icon = btn.querySelector('i.fa-plus, i.fa-check, i[class*="plus"], i[class*="check"]');
    if (icon) {
      if (inPlan) {
        icon.classList.remove('fa-plus'); icon.classList.add('fa-check');
      } else {
        icon.classList.remove('fa-check'); icon.classList.add('fa-plus');
      }
    }
    var txt = btn.querySelector('.sl-btn-label, .btn-label');
    if (txt) txt.textContent = inPlan ? 'In Plan' : 'Add to Plan';
  }

  // ---- Sync ALL matching buttons on the page to current state ----
  function refreshAll() {
    document.querySelectorAll('[data-sl-action="save"]').forEach(function (btn) {
      var v = extractVenue(btn);
      if (v) setSavedIcon(btn, window.SLState.isFavorite(v.id));
    });
    document.querySelectorAll('[data-sl-action="plan"]').forEach(function (btn) {
      var v = extractVenue(btn);
      if (v) setPlanIcon(btn, window.SLState.isInPlan(v.id));
    });
    updateHeaderBadge();
  }

  // ---- Header badge: show plan count ----
  function updateHeaderBadge() {
    var plan = window.SLState.getActivePlan();
    var count = plan.venues.length;
    var badges = document.querySelectorAll('.sl-plan-count-badge');
    badges.forEach(function (b) {
      b.textContent = count;
      b.style.display = count > 0 ? '' : 'none';
    });
  }

  // ---- Auth gate ----
  function isLoggedIn() {
    try {
      if (window.SLApi && typeof window.SLApi.isLoggedIn === 'function') return window.SLApi.isLoggedIn();
      if (window.SLAuth && typeof window.SLAuth.isAuthed === 'function') return window.SLAuth.isAuthed();
      return !!(localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_jwt_v2'));
    } catch (_) { return false; }
  }
  function requireAuthOrPrompt(actionLabel) {
    if (isLoggedIn()) return true;
    // Prefer premium login prompt modal if available
    try {
      if (window.SLPolish && typeof window.SLPolish.showLoginPrompt === 'function') {
        window.SLPolish.showLoginPrompt(actionLabel);
        return false;
      }
    } catch (_) {}
    // Fallback: toast + auth modal
    toast('Please log in to ' + (actionLabel || 'continue'), 'info');
    try {
      if (window.SLAuth && typeof window.SLAuth.openLogin === 'function') window.SLAuth.openLogin('login');
      else if (window.SLAuthUI && typeof window.SLAuthUI.open === 'function') window.SLAuthUI.open('login');
    } catch (_) {}
    return false;
  }

  // ---- Handle click ----
  function onClick(e) {
    var btn = e.target.closest('[data-sl-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-sl-action');
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();

    if (action === 'save' || action === 'plan' || action === 'remove-fav' || action === 'remove-plan' || action === 'add-to-list') {
      var label = action === 'save' ? 'save favorites' :
                  action === 'plan' ? 'build your plan' :
                  action === 'add-to-list' ? 'add to a list' : 'continue';
      if (!requireAuthOrPrompt(label)) return;
    }

    var venue = extractVenue(btn);
    if (!venue || !venue.id) {
      console.warn('[sl-universal-actions] no venue data on button', btn);
      return;
    }

    if (action === 'save') {
      var nowSaved = window.SLState.toggleFavorite(venue);
      setSavedIcon(btn, nowSaved);
      // Sync all other buttons for this venue
      document.querySelectorAll('[data-sl-action="save"][data-sl-venue-id="' + venue.id + '"]').forEach(function (b) {
        setSavedIcon(b, nowSaved);
      });
      toast(nowSaved ? ('Saved ' + (venue.name || 'venue')) : ('Removed ' + (venue.name || 'venue')), nowSaved ? 'saved' : 'remove');
      return;
    }

    if (action === 'plan') {
      var nowInPlan = window.SLState.togglePlan(venue);
      setPlanIcon(btn, nowInPlan);
      document.querySelectorAll('[data-sl-action="plan"][data-sl-venue-id="' + venue.id + '"]').forEach(function (b) {
        setPlanIcon(b, nowInPlan);
      });
      toast(nowInPlan ? ('Added ' + (venue.name || 'venue') + ' to your plan') : ('Removed from plan'), nowInPlan ? 'saved' : 'remove');
      updateHeaderBadge();
      return;
    }

    if (action === 'remove-fav') {
      window.SLState.removeFavorite(venue.id);
      toast('Removed from favorites', 'remove');
      return;
    }

    if (action === 'remove-plan') {
      window.SLState.removeFromPlan(venue.id);
      toast('Removed from plan', 'remove');
      updateHeaderBadge();
      return;
    }
  }

  // ---- Init ----
  function init() {
    document.addEventListener('click', onClick, true);
    refreshAll();

    // Refresh when state changes
    window.addEventListener('sl-state-change', refreshAll);
    document.addEventListener('sl-state-change', refreshAll);
    // Refresh when auth changes (hydrate may have updated favorites)
    window.addEventListener('sl-auth-change', function () {
      setTimeout(refreshAll, 400);
      setTimeout(refreshAll, 1500);
    });

    // Repeat refresh to catch late-rendered cards
    setTimeout(refreshAll, 500);
    setTimeout(refreshAll, 1500);
    setTimeout(refreshAll, 3000);

    // Observe DOM for new cards
    try {
      var mo = new MutationObserver(function (muts) {
        var hasNew = muts.some(function (m) {
          return [].some.call(m.addedNodes, function (n) {
            return n.nodeType === 1 && (
              n.matches && n.matches('[data-sl-action], [data-venue-id]') ||
              n.querySelector && n.querySelector('[data-sl-action], [data-venue-id]')
            );
          });
        });
        if (hasNew) refreshAll();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public helpers
  window.SLActions = {
    refresh: refreshAll,
    toast: toast
  };
})();