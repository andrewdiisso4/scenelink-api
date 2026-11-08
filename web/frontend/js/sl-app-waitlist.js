/**
 * SceneLink — App Waitlist Capture
 * Upgrades App Store / Google Play footer badges into an email-capture popup
 * instead of the toast "Coming soon". Persists submissions via POST /api/newsletter
 * with source="app_waitlist_ios" or "app_waitlist_android".
 */
(function () {
  'use strict';

  function apiBase() {
    return (window.SLConfig && (window.SLConfig.API_URL || window.SLConfig.API_BASE_URL)) ||
           (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) ||
           '/api';
  }

  function closeModal() {
    var m = document.getElementById('sl-waitlist-modal');
    if (m) m.remove();
  }

  function openModal(platform) {
    closeModal();
    var modal = document.createElement('div');
    modal.id = 'sl-waitlist-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;animation:sl-wl-fade 0.2s ease-out;';

    var isIOS = platform === 'ios';
    var plat = isIOS ? 'iOS' : 'Android';
    var icon = isIOS ? 'fa-apple' : 'fa-google-play';

    modal.innerHTML =
      '<style>@keyframes sl-wl-fade{from{opacity:0}to{opacity:1}}@keyframes sl-wl-pop{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}</style>' +
      '<div role="dialog" aria-modal="true" aria-labelledby="sl-wl-title" style="background:linear-gradient(180deg,#1a1f2e 0%,#0f1420 100%);border:1px solid rgba(212,175,55,0.3);border-radius:20px;max-width:440px;width:100%;padding:36px 32px;position:relative;animation:sl-wl-pop 0.25s ease-out;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
        '<button id="sl-wl-close" aria-label="Close" style="position:absolute;top:14px;right:14px;background:transparent;border:none;color:rgba(255,255,255,0.5);font-size:24px;cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseout="this.style.background=\'transparent\'">&times;</button>' +
        '<div style="text-align:center;margin-bottom:20px;">' +
          '<div style="width:60px;height:60px;margin:0 auto 14px;background:linear-gradient(135deg,#D4AF37,#B8912A);border-radius:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(212,175,55,0.3);">' +
            '<i class="fab ' + icon + '" style="font-size:28px;color:#000"></i>' +
          '</div>' +
          '<h3 id="sl-wl-title" style="color:#D4AF37;font-size:20px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;">SceneLink for ' + plat + '</h3>' +
          '<p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0;line-height:1.5;">The app is in active development. Join the waitlist and we\'ll email you the moment it\'s ready.</p>' +
        '</div>' +
        '<form id="sl-wl-form" style="display:flex;flex-direction:column;gap:10px;">' +
          '<input id="sl-wl-email" type="email" required placeholder="you@example.com" autocomplete="email" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:12px 14px;border-radius:10px;font-size:14px;font-family:inherit;outline:none;transition:all 0.2s;" />' +
          '<button type="submit" id="sl-wl-submit" style="background:linear-gradient(135deg,#D4AF37,#B8912A);color:#000;font-weight:700;border:none;padding:12px;border-radius:10px;cursor:pointer;font-size:14px;transition:all 0.2s;font-family:inherit;">Notify Me</button>' +
        '</form>' +
        '<div id="sl-wl-result" style="text-align:center;margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);"></div>' +
        '<p style="text-align:center;margin:14px 0 0;font-size:11px;color:rgba(255,255,255,0.4);">We\'ll only use your email for launch notifications. Unsubscribe anytime.</p>' +
      '</div>';

    document.body.appendChild(modal);

    var emailEl = document.getElementById('sl-wl-email');
    if (emailEl) {
      emailEl.focus();
      emailEl.addEventListener('focus', function () { emailEl.style.borderColor = '#D4AF37'; });
      emailEl.addEventListener('blur', function () { emailEl.style.borderColor = 'rgba(255,255,255,0.12)'; });
    }

    document.getElementById('sl-wl-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    document.getElementById('sl-wl-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = (emailEl.value || '').trim();
      var submitBtn = document.getElementById('sl-wl-submit');
      var result = document.getElementById('sl-wl-result');
      if (!email) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Joining…';
      result.style.color = 'rgba(255,255,255,0.5)';
      result.textContent = '';

      try {
        var res = await fetch(apiBase() + '/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            source: 'app_waitlist_' + platform
          })
        });
        // Accept 200 or 409 (already subscribed) as success
        if (res.ok || res.status === 409) {
          result.style.color = '#D4AF37';
          result.innerHTML = '<i class="fas fa-check-circle"></i> You\'re on the list. We\'ll be in touch soon.';
          submitBtn.style.display = 'none';
          emailEl.disabled = true;
          setTimeout(closeModal, 2400);
        } else {
          var err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Something went wrong');
        }
      } catch (err) {
        result.style.color = '#ef4444';
        result.textContent = 'Error: ' + (err.message || 'Please try again');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Notify Me';
      }
    });
  }

  function wireAppBadges() {
    // Find all app-badge-like anchors: footer-app-badges children, or any anchor with fa-apple/fa-google-play
    var badges = document.querySelectorAll('.footer-app-badges a, a.app-badge, [data-app-waitlist]');
    badges.forEach(function (a) {
      if (a.dataset.slWaitlistWired === '1') return;
      a.dataset.slWaitlistWired = '1';
      // Detect platform
      var icon = a.querySelector('i');
      var isIOS = icon && /fa-apple/.test(icon.className);
      var isAndroid = icon && /fa-google-play/.test(icon.className);
      if (!isIOS && !isAndroid) {
        // Fallback: check text
        var txt = (a.textContent || '').toLowerCase();
        isIOS = /app store|ios|iphone/.test(txt);
        isAndroid = /google play|android/.test(txt);
      }
      if (!isIOS && !isAndroid) return;
      // Strip legacy inline onclick that shows the old toast
      a.removeAttribute('onclick');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(isIOS ? 'ios' : 'android');
      });
    });
  }

  function init() {
    wireAppBadges();
    // Re-wire if footer is injected dynamically
    var observer = new MutationObserver(wireAppBadges);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();