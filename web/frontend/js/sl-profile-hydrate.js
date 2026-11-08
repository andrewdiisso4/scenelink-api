/**
 * SceneLink — Real Profile Data Hydration
 * Overlays actual user data from /api/auth/me onto V2 profile page elements.
 * Non-destructive: only updates elements if they exist.
 */
(function() {
  'use strict';
  if (document.body && document.body.hasAttribute('data-sl-social-profile')) return;

  async function hydrateProfile() {
    if (!window.SLApi || !SLApi.isLoggedIn()) return;
    try {
      const data = await SLApi.me();
      const user = data.user || data;
      if (!user || !user.email) return;

      const name = user.display_name || user.username || user.email.split('@')[0];
      const email = user.email;
      const avatar = user.avatar_url || window.SL_AVATAR.local(name);
      const neighborhood = user.neighborhood || 'Boston';
      const city = user.city || 'Boston';
      const bio = user.bio || '';

      // Update common profile selectors
      const nameSelectors = [
        '.profile-name', '.user-name', '[data-user-name]',
        '#profile-name', '#user-name', '.profile-display-name'
      ];
      nameSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.tagName === 'INPUT') el.value = name;
          else el.textContent = name;
        });
      });

      const emailSelectors = [
        '.profile-email', '.user-email', '[data-user-email]',
        '#profile-email', '#user-email'
      ];
      emailSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.tagName === 'INPUT') el.value = email;
          else el.textContent = email;
        });
      });

      const avatarSelectors = [
        '.profile-avatar', '.user-avatar', '.avatar-img',
        '#profile-avatar', '[data-user-avatar]'
      ];
      avatarSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.tagName === 'IMG') el.src = avatar;
          else el.style.backgroundImage = `url(${avatar})`;
        });
      });

      const locationSelectors = [
        '.profile-location', '.user-location', '[data-user-location]'
      ];
      locationSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          el.textContent = `${neighborhood}, ${city}`;
        });
      });

      // Hydrate favorites count if element exists
      try {
        const favs = await SLApi.favorites();
        const list = favs.favorites || favs || [];
        const count = Array.isArray(list) ? list.length : 0;
        document.querySelectorAll(
          '[data-stat="favorites"], .stat-favorites .stat-value, .favorites-count'
        ).forEach(el => { el.textContent = count; });
      } catch(_) {}

      // Expose to window for other scripts
      window.SL_CURRENT_USER = user;
      document.dispatchEvent(new CustomEvent('sl-profile-hydrated', { detail: user }));
    } catch(err) {
      console.warn('[SL] Profile hydration skipped:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateProfile);
  } else {
    hydrateProfile();
  }
  // Re-run after auth change
  document.addEventListener('sl-auth-change', hydrateProfile);

  window.SLProfileHydrate = hydrateProfile;
})();