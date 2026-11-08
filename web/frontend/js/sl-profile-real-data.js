/**
 * SceneLink — Profile Real Data Renderer
 * Hydrates profile.html with real logged-in user data.
 * Handles: avatar, name, email, stats, activity feed, reviews, photos.
 * Hides Follow/Message/Share when viewing own profile.
 * Shows proper empty-state CTAs for new users with no activity.
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────
     Relative-time helper
  ───────────────────────────────────────── */
  function relTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var now = Date.now();
    var diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    var days = Math.floor(diff / 86400);
    if (days === 1) return 'Yesterday';
    if (days < 7)  return days + ' days ago';
    if (days < 30) return Math.floor(days / 7) + ' weeks ago';
    return Math.floor(days / 30) + ' months ago';
  }

  /* ─────────────────────────────────────────
     Star rating HTML helper
  ───────────────────────────────────────── */
  function starsHTML(rating) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<i class="' + (i <= rating ? 'fas' : 'far') + ' fa-star" style="color:#D4AF37;font-size:12px;"></i>';
    }
    return html;
  }

  /* ─────────────────────────────────────────
     Icon for activity type
  ───────────────────────────────────────── */
  function activityIcon(type) {
    var icons = {
      'checkin':  'fas fa-map-marker-alt',
      'check_in': 'fas fa-map-marker-alt',
      'review':   'fas fa-star',
      'save':     'fas fa-heart',
      'saved':    'fas fa-heart',
      'list':     'fas fa-list',
      'plan':     'fas fa-calendar',
      'follow':   'fas fa-user-plus'
    };
    return icons[type] || 'fas fa-bolt';
  }

  function activityLabel(type) {
    var labels = {
      'checkin':  'Checked in at',
      'check_in': 'Checked in at',
      'review':   'Reviewed',
      'save':     'Saved',
      'saved':    'Saved',
      'list':     'Added to list',
      'plan':     'Planned a visit to',
      'follow':   'Started following'
    };
    return labels[type] || 'Activity at';
  }

  /* ─────────────────────────────────────────
     Empty state HTML builder
  ───────────────────────────────────────── */
  function emptyState(emoji, title, subtitle, ctaText, ctaHref) {
    return '<div style="text-align:center;padding:64px 20px;">' +
      '<div style="font-size:48px;margin-bottom:12px;">' + emoji + '</div>' +
      '<div style="font-size:18px;color:#D4AF37;margin-bottom:8px;font-weight:600;">' + title + '</div>' +
      '<div style="color:rgba(255,255,255,0.5);margin-bottom:24px;">' + subtitle + '</div>' +
      '<a href="' + ctaHref + '" style="display:inline-block;background:linear-gradient(135deg,#D4AF37,#b8860b);' +
        'color:#000;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">' + ctaText + '</a>' +
      '</div>';
  }

  /* ─────────────────────────────────────────
     Render activity feed
  ───────────────────────────────────────── */
  function renderActivityFeed(items, userName) {
    var container = document.getElementById('profileActivityFeed');
    if (!container) return;

    if (!items || !items.length) {
      container.innerHTML = emptyState(
        '🎯',
        'No activity yet',
        'Start exploring Boston\'s best spots to build your activity feed.',
        'Explore Now',
        'explore.html'
      );
      return;
    }

    var html = items.map(function (item) {
      var venueName = item.venue_name || item.venue || item.name || 'a venue';
      var type = (item.type || item.activity_type || 'checkin').toLowerCase();
      var icon = activityIcon(type);
      var label = activityLabel(type);
      var time  = relTime(item.created_at || item.timestamp);
      var extra = '';
      if (item.rating) {
        extra += '<div class="activity-rating" style="margin:6px 0;">' + starsHTML(item.rating) + '</div>';
      }
      if (item.text || item.review_text || item.comment) {
        var reviewText = item.text || item.review_text || item.comment;
        extra += '<p class="activity-text" style="color:rgba(255,255,255,0.7);font-style:italic;margin:6px 0;">' +
          '&ldquo;' + reviewText + '&rdquo;</p>';
      }
      return '<div class="activity-item">' +
        '<div class="activity-icon"><i class="' + icon + '"></i></div>' +
        '<div class="activity-content">' +
          '<div class="activity-header">' +
            '<span class="activity-action">' + label + '</span>' +
            (time ? '<span class="activity-time">' + time + '</span>' : '') +
          '</div>' +
          '<h4 class="activity-venue">' + venueName + '</h4>' +
          extra +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = html;
  }

  /* ─────────────────────────────────────────
     Render reviews tab
  ───────────────────────────────────────── */
  function renderReviews(items) {
    var container = document.getElementById('profileReviewsList');
    if (!container) return;

    // Remove loading spinner
    var loading = document.getElementById('profileReviewsLoading');
    if (loading) loading.remove();

    if (!items || !items.length) {
      container.innerHTML = emptyState(
        '⭐',
        'No reviews yet',
        'Share your experience at restaurants, bars, and venues around Boston.',
        'Explore & Review',
        'explore.html'
      );
      return;
    }

    var html = items.map(function (item) {
      var venueName = item.venue_name || item.venue || 'Venue';
      var rating    = parseInt(item.rating) || 0;
      var time      = relTime(item.created_at || item.timestamp);
      var imgUrl    = item.venue_image || item.image_url ||
        '/assets/img/placeholder-venue.svg';
      var reviewText = item.text || item.review_text || item.comment || '';

      return '<div class="review-card">' +
        '<div class="review-header">' +
          '<div class="review-venue-info">' +
            '<img src="' + imgUrl + '" alt="' + venueName + '" class="review-venue-img">' +
            '<div>' +
              '<h4>' + venueName + '</h4>' +
              '<p class="review-date">' + time + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="review-rating">' + starsHTML(rating) + '</div>' +
        '</div>' +
        (reviewText ? '<p class="review-text">&ldquo;' + reviewText + '&rdquo;</p>' : '') +
        '<div class="review-stats">' +
          '<span><i class="fas fa-heart"></i> ' + (item.helpful_count || 0) + ' helpful</span>' +
          '<span><i class="fas fa-comment"></i> ' + (item.comment_count || 0) + ' comments</span>' +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = html;
  }

  /* ─────────────────────────────────────────
     Render photos tab — from favorites images
  ───────────────────────────────────────── */
  function renderPhotos(favorites) {
    var grid  = document.getElementById('profilePhotosGrid');
    var empty = document.getElementById('profilePhotosEmpty');
    if (!grid) return;

    // Build photo set from favorites (use their images)
    var photoItems = (favorites || []).filter(function (v) {
      return v.image_url || v.hero_image || v.photo;
    }).slice(0, 9);

    if (!photoItems.length) {
      if (empty) empty.style.display = '';
      grid.innerHTML = '';
      return;
    }

    if (empty) empty.style.display = 'none';
    grid.innerHTML = photoItems.map(function (v) {
      var img  = v.image_url || v.hero_image || v.photo;
      var name = v.name || v.venue_name || 'Venue';
      return '<div class="photo-item">' +
        '<img src="' + img + '" alt="' + name + '" loading="lazy">' +
        '<div class="photo-overlay">' +
          '<span class="photo-venue">' + name + '</span>' +
          '<span class="photo-likes"><i class="fas fa-heart"></i></span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ─────────────────────────────────────────
     Hydrate avatar using the correct img selector
  ───────────────────────────────────────── */
  function hydrateAvatar(avatarUrl, name) {
    var img = document.getElementById('profileAvatarImg');
    if (img) img.src = avatarUrl;
    // Also update dicebear fallback in profile-avatar-large
    document.querySelectorAll('.profile-avatar-large img').forEach(function (el) {
      el.src = avatarUrl;
    });
  }

  /* ─────────────────────────────────────────
     Show/hide correct action buttons
  ───────────────────────────────────────── */
  function showOwnProfileActions() {
    var followRow   = document.getElementById('profileActionsRow');
    var ownRow      = document.getElementById('profileOwnActionsRow');
    if (followRow) followRow.style.display = 'none';
    if (ownRow)    ownRow.style.display    = '';

    // Wire up Edit Profile button — real handler is in profile-social.js
    // (PUT /api/auth/profile). Phase 5D-B: removed the legacy
    // "Profile editing coming soon" toast that overrode the real handler.
    var editBtn = document.getElementById('profileEditBtn');
    if (editBtn) {
      // Mark as ready for profile-social.js to bind. No-op handler here.
      editBtn.setAttribute('data-edit-ready', 'true');
    }
    var settingsBtn = document.getElementById('profileSettingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () {
        // Settings page exists at /settings.html (account preferences).
        // If not present, fall back to profile-edit modal.
        if (window.location.pathname.endsWith('/settings.html')) return;
        var settingsLink = '/settings.html';
        // Probe via fetch HEAD; if 404, just open edit modal
        fetch(settingsLink, { method: 'HEAD' }).then(function(r){
          if (r.ok) window.location.href = settingsLink;
          else if (window.SLToast) window.SLToast('Account settings live in Edit Profile.');
        }).catch(function(){
          if (window.SLToast) window.SLToast('Account settings live in Edit Profile.');
        });
      });
    }
  }

  function showGuestProfileActions() {
    var followRow = document.getElementById('profileActionsRow');
    var ownRow    = document.getElementById('profileOwnActionsRow');
    if (followRow) followRow.style.display = '';
    if (ownRow)    ownRow.style.display    = 'none';
  }

  /* ─────────────────────────────────────────
     Locked state for logged-out users
  ───────────────────────────────────────── */
  function showLockedState() {
    // Hide profile-specific content, show sign-in prompt
    var feedEl    = document.getElementById('profileActivityFeed');
    var reviewsEl = document.getElementById('profileReviewsList');
    var photosEl  = document.getElementById('profilePhotosGrid');

    var lockedHTML = emptyState(
      '🔒',
      'Sign in to view your profile',
      'Log in to see your favorites, reviews, check-ins and more.',
      'Log In / Sign Up',
      '#'
    ).replace('href="#"', 'href="#" class="sl-auth-trigger"');

    if (feedEl)    feedEl.innerHTML    = lockedHTML;
    if (reviewsEl) reviewsEl.innerHTML = lockedHTML;

    // Remove spinners
    ['profileActivityLoading', 'profileReviewsLoading'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });

    // Show guest actions (Follow/Message/Share replaced by Log In)
    showGuestProfileActions();
    var followRow = document.getElementById('profileActionsRow');
    if (followRow) {
      followRow.innerHTML =
        '<button class="btn-profile-action primary sl-auth-trigger">' +
          '<i class="fas fa-sign-in-alt"></i> Log In to Connect' +
        '</button>';
      followRow.style.display = '';
    }
  }

  /* ─────────────────────────────────────────
     Level calculation from activity count
  ───────────────────────────────────────── */
  function calcLevel(checkins, reviews, favorites) {
    var score = (checkins || 0) * 10 + (reviews || 0) * 15 + (favorites || 0) * 2;
    return Math.max(1, Math.min(50, Math.floor(score / 20) + 1));
  }

  /* ─────────────────────────────────────────
     Main init
  ───────────────────────────────────────── */
  async function init() {
    // Only run on profile page
    if (!(/profile(-v2)?\.html/.test(window.location.pathname) || window.location.pathname === '/profile' || window.location.pathname.endsWith('/profile'))) {
      if (!document.querySelector('.profile-cover-enhanced, .profile-header-enhanced')) return;
    }

    // Wait for SLApi to be ready
    if (!window.SLApi) return;

    if (!SLApi.isLoggedIn()) {
      showLockedState();
      return;
    }

    try {
      // 1. Get user data
      const meData  = await SLApi.me();
      const user    = meData.user || meData;
      const name    = user.display_name || user.username || (user.email ? user.email.split('@')[0] : 'You');
      const email   = user.email || '';
      const avatar  = user.avatar_url ||
        (window.SL_AVATAR ? SL_AVATAR(name) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&size=200&background=D4AF37&color=0a0a0a');
      const bio     = user.bio || 'Discovering the best of Boston one venue at a time.';

      // 2. Hydrate basic info
      hydrateAvatar(avatar, name);

      var nameEl = document.getElementById('profileDisplayName');
      if (nameEl) nameEl.textContent = name;

      var emailEl = document.getElementById('profileEmailEl');
      if (emailEl) emailEl.textContent = email;

      var bioEl = document.getElementById('profileBioEl');
      if (bioEl) bioEl.textContent = bio;

      // 3. Show own-profile action buttons (Edit / Settings)
      showOwnProfileActions();

      // 4. Fetch collections in parallel
      const [activityRes, favsRes, listsRes, plansRes] = await Promise.allSettled([
        SLApi.activity ? SLApi.activity() : Promise.reject('no activity'),
        SLApi.favorites ? SLApi.favorites() : Promise.reject('no favs'),
        SLApi.lists ? SLApi.lists() : Promise.reject('no lists'),
        SLApi.plans ? SLApi.plans() : Promise.reject('no plans')
      ]);

      const activityItems = (activityRes.status === 'fulfilled' &&
        (activityRes.value.activities || activityRes.value.activity || activityRes.value)) || [];
      const favoritesRaw  = (favsRes.status === 'fulfilled' &&
        (favsRes.value.favorites || favsRes.value)) || [];
      const favorites     = Array.isArray(favoritesRaw) ? favoritesRaw : [];
      const listsRaw      = (listsRes.status === 'fulfilled' &&
        (listsRes.value.lists || listsRes.value)) || [];
      const lists         = Array.isArray(listsRaw) ? listsRaw : [];
      const plansRaw      = (plansRes.status === 'fulfilled' &&
        (plansRes.value.plans || plansRes.value)) || [];
      const plans         = Array.isArray(plansRaw) ? plansRaw : [];

      // Filter activity to current user's own events if user_id present
      var myId    = user.id || user.user_id;
      var myItems = activityItems.filter ? activityItems.filter(function (a) {
        if (!myId) return true;
        return (a.user_id === myId || a.userId === myId);
      }) : [];

      // If no user-filtered items, use all (single-user context)
      if (!myItems.length && activityItems.length) myItems = activityItems.slice(0, 10);

      // Extract reviews from activity
      var reviewItems = myItems.filter(function (a) {
        var t = (a.type || a.activity_type || '').toLowerCase();
        return t === 'review';
      });

      // 5. Update stats
      var checkinCount = myItems.filter(function (a) {
        var t = (a.type || a.activity_type || '').toLowerCase();
        return t === 'checkin' || t === 'check_in';
      }).length + (user.checkins_count || 0);

      document.querySelectorAll('[data-stat="favorites"], .favorites-count').forEach(function (el) {
        el.textContent = favorites.length;
      });
      document.querySelectorAll('[data-stat="checkins"], .checkins-count').forEach(function (el) {
        el.textContent = checkinCount;
      });
      document.querySelectorAll('[data-stat="lists"], .lists-count').forEach(function (el) {
        el.textContent = lists.length;
      });
      document.querySelectorAll('[data-stat="plans"], .plans-count').forEach(function (el) {
        el.textContent = plans.length;
      });

      // 6. Level badge
      var level     = calcLevel(checkinCount, reviewItems.length, favorites.length);
      var levelBadge = document.getElementById('profileLevelBadge');
      if (levelBadge) levelBadge.textContent = 'Level ' + level;

      // 7. Render tabs
      renderActivityFeed(myItems, name);
      renderReviews(reviewItems);
      renderPhotos(favorites);

      // 8. Remove loading spinners
      ['profileActivityLoading', 'profileReviewsLoading'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
      });

    } catch (err) {
      console.warn('[sl-profile-real-data] Error:', err);
      // Graceful fallback — show empty states
      var feedEl = document.getElementById('profileActivityFeed');
      if (feedEl) feedEl.innerHTML = emptyState('🎯', 'No activity yet',
        'Start exploring to build your activity feed.', 'Explore Now', 'explore.html');
      var reviewsEl = document.getElementById('profileReviewsList');
      if (reviewsEl) reviewsEl.innerHTML = emptyState('⭐', 'No reviews yet',
        'Share your experience at venues around Boston.', 'Explore & Review', 'explore.html');
      var photosEl  = document.getElementById('profilePhotosEmpty');
      if (photosEl) photosEl.style.display = '';
      ['profileActivityLoading', 'profileReviewsLoading'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
      });
      // Still show own-profile actions if logged in
      if (window.SLApi && SLApi.isLoggedIn()) showOwnProfileActions();
    }
  }

  // Run after DOM + SLApi are ready
  function waitAndRun() {
    if (window.SLApi) {
      init();
    } else {
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (window.SLApi) {
          clearInterval(iv);
          init();
        } else if (tries > 30) {
          clearInterval(iv);
          // SLApi never loaded — show appropriate state
          showLockedState();
        }
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndRun);
  } else {
    waitAndRun();
  }

  // Re-run when auth state changes
  document.addEventListener('sl-auth-change', function () {
    setTimeout(init, 200);
  });

  window.SLProfileRealData = { init: init };
})();