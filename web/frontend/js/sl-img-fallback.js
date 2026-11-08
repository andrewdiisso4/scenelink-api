/*!
 * sl-img-fallback.js — SceneLink image fallback guard + same-origin avatar helper
 * ------------------------------------------------------------------
 * Single-shot handler. The fallback image is same-origin SVG, so it
 * cannot rate-limit, CORS-block, or 404. Even if it somehow did, we
 * clear `onerror` before re-assigning `src`, so the browser can
 * NEVER loop.
 *
 * Usage from inline HTML:
 *   <img src="..." onerror="SL_IMG_FALLBACK(this,'venue')">
 *   <img src="..." onerror="SL_IMG_FALLBACK(this,'event')">
 *   <img src="..." onerror="SL_IMG_FALLBACK(this,'avatar')">
 *
 * Kind defaults to 'venue' if unknown.
 *
 * Also exposes:
 *   window.SL_AVATAR(name, opts?)  →  data: URI avatar SVG
 *     Replaces external ui-avatars.com calls with a same-origin,
 *     zero-request inline avatar (initials on colored circle).
 *     opts: { size?:number, bg?:string, fg?:string }
 * ------------------------------------------------------------------
 */
(function () {
    'use strict';

    var PLACEHOLDERS = {
        venue:  '/assets/img/placeholder-venue.svg',
        event:  '/assets/img/placeholder-event.svg',
        avatar: '/assets/img/placeholder-avatar.svg'
    };

    function slImgFallback(img, kind) {
        if (!img) return;

        // If we've already swapped this img once, do NOT swap again.
        if (img.__slFallbackUsed) {
            try {
                img.onerror = null;
                img.removeAttribute('onerror');
                img.style.visibility = 'hidden';
            } catch (e) {}
            return;
        }

        img.__slFallbackUsed = true;

        // CRITICAL: clear the handler BEFORE touching src.
        try {
            img.onerror = null;
            img.removeAttribute('onerror');
        } catch (e) {}

        var src = PLACEHOLDERS[kind] || PLACEHOLDERS.venue;
        try {
            img.src = src;
        } catch (e) {
            try { img.style.visibility = 'hidden'; } catch (e2) {}
        }
    }

    // ---- Same-origin avatar generator (zero external request) ----
    // Deterministic color from name so same name → same color.
    var PALETTE = [
        '#D4AF37','#3b82f6','#8b5cf6','#10b981','#ef4444',
        '#f97316','#06b6d4','#ec4899','#eab308','#22c55e'
    ];
    function hashStr(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
        return Math.abs(h);
    }
    function initialsOf(name) {
        if (!name) return '?';
        var parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    function slAvatar(name, opts) {
        opts = opts || {};
        var size = opts.size || 96;
        var bg = opts.bg || PALETTE[hashStr(String(name || '')) % PALETTE.length];
        var fg = opts.fg || '#0a0a0a';
        var label = initialsOf(name);
        var svg = '' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
            '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + (size/2) + '" fill="' + bg + '"/>' +
            '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" ' +
            'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Inter,Helvetica,Arial,sans-serif" ' +
            'font-size="' + Math.round(size * 0.42) + '" font-weight="700" fill="' + fg + '">' +
            label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
            '</text></svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    window.SL_IMG_FALLBACK = slImgFallback;
    // Preserve both supported call styles when the bundled fallback loads after sl-avatar.js.
    slAvatar.local = window.SL_AVATAR && typeof window.SL_AVATAR.local === 'function' ? window.SL_AVATAR.local : slAvatar;
    window.SL_AVATAR = slAvatar;

    window.SL = window.SL || {};
    window.SL.imgFallback = slImgFallback;
    window.SL.avatar = slAvatar;
})();
