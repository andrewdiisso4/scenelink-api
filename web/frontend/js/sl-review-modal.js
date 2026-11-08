/**
 * SceneLink — Write Review Modal (Yelp-style, no check-in required)
 * Wires any `.btn-write-review`, `[data-action="write-review"]` element,
 * or a data-venue-id attribute to a modal that POSTs to /api/reviews.
 *
 * Exposes: window.SLReviewModal.open(venueId, venueName)
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    wireTriggers();
    // Re-wire whenever new DOM is injected (venue cards etc.)
    setTimeout(wireTriggers, 1500);
    setTimeout(wireTriggers, 4000);
  });

  function injectStyles() {
    if (document.getElementById('sl-review-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-review-style';
    st.textContent = `
      #slReviewModal .sl-rating-stars {
        display: flex; gap: 4px; font-size: 32px; justify-content: center;
        padding: 12px 0;
      }
      #slReviewModal .sl-rating-stars i {
        color: rgba(255,255,255,0.2); cursor: pointer; transition: transform 0.1s;
      }
      #slReviewModal .sl-rating-stars i:hover { transform: scale(1.1); }
      #slReviewModal .sl-rating-stars i.active { color: #D4AF37; }
      #slReviewModal .sl-rating-label {
        text-align: center; color: rgba(255,255,255,0.6); font-size: 13px;
        min-height: 18px; margin-bottom: 8px;
      }
    `;
    document.head.appendChild(st);
  }

  function buildModal() {
    if (document.getElementById('slReviewModal')) return;
    var m = document.createElement('div');
    m.id = 'slReviewModal';
    m.className = 'sl-modal-overlay';
    m.innerHTML =
      '<div class="sl-modal">' +
      '  <div class="sl-modal-header">' +
      '    <h2>Write a Review</h2>' +
      '    <button class="sl-modal-close" data-close="slReviewModal"><i class="fas fa-times"></i></button>' +
      '  </div>' +
      '  <div class="sl-modal-body">' +
      '    <div id="slReviewVenueLabel" style="font-size:14px;color:rgba(255,255,255,0.7);margin-bottom:8px;"></div>' +
      '    <div class="sl-rating-stars" id="slRatingStars">' +
      '      <i class="fas fa-star" data-rating="1"></i>' +
      '      <i class="fas fa-star" data-rating="2"></i>' +
      '      <i class="fas fa-star" data-rating="3"></i>' +
      '      <i class="fas fa-star" data-rating="4"></i>' +
      '      <i class="fas fa-star" data-rating="5"></i>' +
      '    </div>' +
      '    <div class="sl-rating-label" id="slRatingLabel">Tap to rate</div>' +
      '    <div class="sl-form-group">' +
      '      <label>Your review (optional)</label>' +
      '      <textarea class="sl-input" id="slReviewText" rows="5" maxlength="2000" placeholder="Share what you loved, what stood out, or any tips for others…"></textarea>' +
      '      <div class="sl-char-count"><span id="slReviewCount">0</span>/2000</div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="sl-modal-footer">' +
      '    <button class="sl-btn sl-btn-secondary" data-close="slReviewModal">Cancel</button>' +
      '    <button class="sl-btn sl-btn-primary" id="slReviewSubmit" disabled><i class="fas fa-check"></i> Post Review</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(m);

    m.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { close(); });
    });

    var rating = 0;
    var labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
    m.querySelectorAll('#slRatingStars i').forEach(function (star) {
      star.addEventListener('mouseenter', function () {
        var r = parseInt(this.dataset.rating, 10);
        paintStars(r);
      });
      star.addEventListener('mouseleave', function () { paintStars(rating); });
      star.addEventListener('click', function () {
        rating = parseInt(this.dataset.rating, 10);
        paintStars(rating);
        document.getElementById('slRatingLabel').textContent = labels[rating] || '';
        document.getElementById('slReviewSubmit').disabled = rating < 1;
      });
    });

    function paintStars(r) {
      m.querySelectorAll('#slRatingStars i').forEach(function (s) {
        var v = parseInt(s.dataset.rating, 10);
        s.classList.toggle('active', v <= r);
      });
    }

    document.getElementById('slReviewText').addEventListener('input', function () {
      document.getElementById('slReviewCount').textContent = this.value.length;
    });

    document.getElementById('slReviewSubmit').addEventListener('click', function () {
      var btn = this;
      var venueId = m.dataset.venueId;
      var content = document.getElementById('slReviewText').value.trim();
      if (!venueId || rating < 1) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting…';
      window.SLApi.postReview({
        venue_id: venueId,
        rating: rating,
        content: content
      }).then(function () {
        if (window.SLToast) window.SLToast('Review posted 🎉', 2800, 'success');
        close();
        // Notify other scripts (venue detail page) to refresh
        window.dispatchEvent(new CustomEvent('sl-review-posted', { detail: { venue_id: venueId }}));
      }).catch(function (err) {
        if (window.SLToast) window.SLToast(err.message || 'Could not post review', 2800, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Post Review';
      });
    });

    // Expose close helper
    m._reset = function (venueId, venueName) {
      m.dataset.venueId = venueId || '';
      document.getElementById('slReviewVenueLabel').textContent =
        venueName ? 'Reviewing ' + venueName : '';
      rating = 0;
      paintStars(0);
      document.getElementById('slRatingLabel').textContent = 'Tap to rate';
      document.getElementById('slReviewText').value = '';
      document.getElementById('slReviewCount').textContent = '0';
      document.getElementById('slReviewSubmit').disabled = true;
      document.getElementById('slReviewSubmit').innerHTML = '<i class="fas fa-check"></i> Post Review';
    };

    function close() {
      m.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function open(venueId, venueName) {
    if (!window.SLApi.isLoggedIn()) {
      // Trigger sign-in flow
      var trig = document.querySelector('.sl-auth-trigger');
      if (trig) trig.click();
      else if (window.SLToast) window.SLToast('Please sign in first');
      return;
    }
    if (!venueId) {
      if (window.SLToast) window.SLToast('No venue specified');
      return;
    }
    buildModal();
    var m = document.getElementById('slReviewModal');
    m._reset(venueId, venueName);
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function wireTriggers() {
    var sels = [
      '.btn-write-review',
      '[data-action="write-review"]',
      '[data-write-review]',
      '.write-review-btn'
    ];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.dataset.slReviewWired) return;
        el.dataset.slReviewWired = '1';
        el.addEventListener('click', function (e) {
          var venueId = this.dataset.venueId ||
                        this.closest('[data-venue-id]') && this.closest('[data-venue-id]').dataset.venueId;
          var venueName = this.dataset.venueName ||
                          this.closest('[data-venue-name]') && this.closest('[data-venue-name]').dataset.venueName;
          if (!venueId) {
            // Try a common body attribute on venue pages
            venueId = document.body.dataset.venueId || '';
            venueName = document.body.dataset.venueName || '';
          }
          if (!venueId) return; // silently skip if no venue context
          e.preventDefault();
          e.stopPropagation();
          open(venueId, venueName);
        }, true);
      });
    });
  }

  window.SLReviewModal = { open: open, wire: wireTriggers };
})();