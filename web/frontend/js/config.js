// SceneLink Configuration — PRODUCTION
// Google Maps API Configuration

const CONFIG = {
    // GOOGLE_MAPS_API_KEY removed — SceneLink uses Leaflet/OSM for all live maps.
    // If Google Maps JS is ever needed again, inject via env.js as window.__SL_GMAPS_KEY
    // (scoped to HTTPS referrer scenelink.app in the GCP console).
    GOOGLE_CLIENT_ID: '476937141773-733s6hkeapqs1b12kfelpn2c05m2kdt2.apps.googleusercontent.com',
    MAP_SETTINGS: {
        defaultCenter: { lat: 42.3601, lng: -71.0589 },
        defaultZoom: 13,
        minZoom: 10,
        maxZoom: 18
    },
    // API proxied to Render via Netlify (/api/* → scenelink-api-prod.onrender.com/api/*)
    API_BASE_URL: '/api',
    FEATURES: {
        socialFeed: true,
        groupPlanning: true,
        aiSearch: true,
        realTimeUpdates: true,
        notifications: true
    }
};

// Also set on window for modules that use the new pattern
window.SL_CONFIG = {
    API_BASE_URL: '/api',
    GOOGLE_CLIENT_ID: CONFIG.GOOGLE_CLIENT_ID,
    // Apple Services ID. Set to '' to hide the Apple button entirely,
    // or leave set to show a polished "Coming soon" state until the
    // Apple private key is configured on the backend.
    APPLE_CLIENT_ID: 'app.scenelink.www',
    // Controls whether the Apple button is clickable.
    // Backend verifies the Apple id_token against Apple JWKS
    // (https://appleid.apple.com/auth/keys) using only APPLE_CLIENT_ID.
    // No TEAM_ID / KEY_ID / PRIVATE_KEY are required on the server for
    // the web id_token flow — those are only required for the native
    // authorization-code exchange flow, which we do not use.
    APPLE_ENABLED: true
};
// Legacy compat
window.SLConfig = window.SLConfig || {};
window.SLConfig.GOOGLE_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;
window.SLConfig.API_URL = CONFIG.API_BASE_URL;
window.SLConfig.API_BASE_URL = CONFIG.API_BASE_URL;
window.GOOGLE_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}