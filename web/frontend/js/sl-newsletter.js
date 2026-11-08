/**
 * SceneLink — Newsletter Subscription
 * Wires all footer-newsletter-form elements to POST /api/newsletter/subscribe
 * v1.0
 */
(function () {
  'use strict';

  var API_BASE = (window.SL_CONFIG && window.SL_CONFIG.API_BASE) || 'https://scenelink-api-prod.onrender.com';

  function initNewsletterForms() {
    document.querySelectorAll('.footer-newsletter-form').forEach(function (form) {
      if (form.getAttribute('data-sl-newsletter-wired')) return;
      form.setAttribute('data-sl-newsletter-wired', '1');

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailInput = form.querySelector('input[type="email"], input[type="text"]');
        var btn = form.querySelector('button[type="submit"], button');
        if (!emailInput || !emailInput.value.trim()) return;

        var email = emailInput.value.trim();
        var origText = btn ? btn.textContent : 'Subscribe';
        if (btn) { btn.textContent = 'Subscribing…'; btn.disabled = true; }

        fetch(API_BASE + '/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'footer' }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            if (btn) { btn.textContent = 'Subscribed ✓'; btn.style.background = '#22c55e'; }
            emailInput.disabled = true;
            emailInput.value = email;
            // Show toast
            showToast('🎉 You\'re subscribed! Check your inbox.', 'success');
          } else {
            if (btn) { btn.textContent = origText; btn.disabled = false; }
            showToast(data.error || 'Subscription failed. Please try again.', 'error');
          }
        })
        .catch(function () {
          if (btn) { btn.textContent = origText; btn.disabled = false; }
          showToast('Network error. Please try again.', 'error');
        });
      });
    });
  }

  function showToast(msg, type) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;' +
      'background:' + (type === 'success' ? '#0d2b1a' : '#2b0d0d') + ';' +
      'border:1px solid ' + (type === 'success' ? '#22c55e' : '#e17055') + ';' +
      'color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-family:sans-serif;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.4);white-space:nowrap;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 3500);
    setTimeout(function () { el.remove(); }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewsletterForms);
  } else {
    initNewsletterForms();
  }
})();