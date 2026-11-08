/**
 * SL Capacitor Bridge — runs only inside the native iOS/Android shell.
 *
 * Wires up:
 *   - Push notifications registration → /api/push/register-token
 *   - Status bar style
 *   - Deep-link / Universal Link handling
 *   - Back button behavior on Android
 *   - Network status listener
 *   - App lifecycle hooks (refresh token on resume)
 *
 * Gracefully no-ops in web browsers.
 */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) {
    // web — expose empty shim so other scripts can `if (window.SLNative)` without crashing
    window.SLNative = { isNative: false };
    return;
  }

  document.documentElement.classList.add('sl-native');
  document.body && document.body.classList.add('sl-native');

  var SLNative = {
    isNative: true,
    platform: Cap.getPlatform && Cap.getPlatform(),
    ready: false,
    pushToken: null,
    appVersion: null
  };
  window.SLNative = SLNative;

  function getAppVersion() {
    try {
      return Cap.Plugins && Cap.Plugins.App && Cap.Plugins.App.getInfo().then(function (info) {
        SLNative.appVersion = info && (info.version || info.build);
        return SLNative.appVersion;
      });
    } catch (_) { return Promise.resolve(null); }
  }

  // ── Status bar (keep dark) ───────────────────────────────────────
  try {
    if (Cap.Plugins && Cap.Plugins.StatusBar) {
      var S = Cap.Plugins.StatusBar;
      S.setStyle && S.setStyle({ style: 'DARK' }).catch(() => {});
      S.setBackgroundColor && S.setBackgroundColor({ color: '#0a0a0a' }).catch(() => {});
      S.setOverlaysWebView && S.setOverlaysWebView({ overlay: false }).catch(() => {});
    }
  } catch (_) {}

  // ── Push notifications ───────────────────────────────────────────
  function registerPush() {
    var P = Cap.Plugins && Cap.Plugins.PushNotifications;
    if (!P) return;

    P.requestPermissions().then(function (result) {
      if (result && (result.receive === 'granted' || result.receive === 'prompt-with-rationale')) {
        P.register();
      } else {
        console.log('[native] push permission denied');
      }
    }).catch((e) => console.warn('[native] push perm err', e));

    P.addListener('registration', function (token) {
      var raw = token && (token.value || token.token);
      if (!raw) return;
      SLNative.pushToken = raw;
      var platform = SLNative.platform === 'ios' ? 'ios' : 'android';

      function sendTokenWhenReady() {
        if (window.SLApi && window.SLApi.registerPushToken) {
          var tok = null;
          try { tok = localStorage.getItem('sl_jwt_token'); } catch (_){}
          if (!tok) return; // wait for user to sign in
          window.SLApi.registerPushToken(raw, platform, Cap.DeviceId || null, SLNative.appVersion)
            .then(() => console.log('[native] push token registered'))
            .catch((e) => console.warn('[native] push register err', e.message));
        } else {
          setTimeout(sendTokenWhenReady, 400);
        }
      }
      sendTokenWhenReady();
      // Also send when user signs in later
      window.addEventListener('sl-auth-ready', sendTokenWhenReady, { once: true });
    });

    P.addListener('registrationError', function (err) {
      console.warn('[native] push registration error', err);
    });

    // Foreground: show native-ish toast instead of system notification
    P.addListener('pushNotificationReceived', function (n) {
      var title = (n && (n.title || (n.notification && n.notification.title))) || 'SceneLink';
      var body  = (n && (n.body  || (n.notification && n.notification.body)))  || '';
      if (window.SLToast) window.SLToast(title + (body ? ' — ' + body : ''), 3500, 'success');
    });

    // Tap action: navigate
    P.addListener('pushNotificationActionPerformed', function (a) {
      var data = (a && a.notification && a.notification.data) || {};
      if (data.url) location.href = data.url;
      else if (data.type === 'message' && data.user_id) location.href = '/messages.html?user=' + data.user_id;
      else if (data.type === 'friend_request') location.href = '/profile.html#friends';
      else if (data.type === 'plan_invite') location.href = '/plan-with-friends.html';
    });
  }

  // Re-register push token on logout/delete-account
  SLNative.unregisterPush = function () {
    if (!SLNative.pushToken) return Promise.resolve();
    if (window.SLApi && window.SLApi.unregisterPushToken) {
      return window.SLApi.unregisterPushToken(SLNative.pushToken).catch(() => {});
    }
    return Promise.resolve();
  };
  window.SLPush = { unregister: SLNative.unregisterPush };

  // ── Deep links (scenelink://... or https://scenelink.app/...) ────
  try {
    var A = Cap.Plugins && Cap.Plugins.App;
    if (A && A.addListener) {
      A.addListener('appUrlOpen', function (event) {
        if (!event || !event.url) return;
        try {
          var u = new URL(event.url);
          // Translate web URL or custom scheme to an in-app path
          var path = u.pathname + (u.search || '') + (u.hash || '');
          if (path && path !== location.pathname + location.search + location.hash) {
            location.href = path;
          }
        } catch (_) {}
      });
    }
  } catch (_) {}

  // ── Android back button ──────────────────────────────────────────
  try {
    var A2 = Cap.Plugins && Cap.Plugins.App;
    if (A2 && A2.addListener && SLNative.platform === 'android') {
      A2.addListener('backButton', function () {
        if (history.length > 1) history.back();
        else A2.exitApp();
      });
    }
  } catch (_) {}

  // ── Network listener (optional — shows toast) ────────────────────
  try {
    var N = Cap.Plugins && Cap.Plugins.Network;
    if (N && N.addListener) {
      N.addListener('networkStatusChange', function (s) {
        if (!s.connected && window.SLToast) window.SLToast('Offline — some features limited', 2500, 'error');
        else if (s.connected && window.SLToast) window.SLToast('Back online', 1800, 'success');
      });
    }
  } catch (_) {}

  // ── App resume: re-check auth ────────────────────────────────────
  try {
    var A3 = Cap.Plugins && Cap.Plugins.App;
    if (A3 && A3.addListener) {
      A3.addListener('appStateChange', function (state) {
        if (state && state.isActive && window.SLApi && window.SLApi.me) {
          window.SLApi.me().catch(() => {});
        }
      });
    }
  } catch (_) {}

  // Kick off
  getAppVersion().finally(function () {
    SLNative.ready = true;
    registerPush();
    window.dispatchEvent(new CustomEvent('sl-native-ready', { detail: SLNative }));
  });
})();