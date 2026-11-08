/**
 * SceneLink — Tonight in Boston (Explore + Nightlife enhancement)
 *
 * Phase 5H truth pass:
 *   - Only render the "Tonight in Boston" bar when /api/checkins/tonight-stats
 *     returns source !== 'estimated' (i.e. real check-in data exists).
 *   - When data is estimated/missing, the bar is suppressed entirely.
 *   - No more random Energy meters, fake "Busy" badges, or simulated
 *     crowd-count fluctuation. Crowd indicators only appear when the
 *     backend supplies real per-venue going_count / live signals.
 *
 * Phase 6E truth pass:
 *   - Backend `tonight-stats` now returns source 'live' | 'quiet' | 'error'
 *     (the legacy 'estimated' value with Math.random() padding is gone).
 *   - Render bar ONLY when source === 'live'. Hide otherwise.
 *   - `avgWait` field has been removed from backend response — drop the tile.
 */
(function () {
    'use strict';

    var path = (window.location.pathname || '').toLowerCase();
    var runHere = /(explore|nightlife)/i.test(path);
    if (!runHere) return;

    function injectTonightBar(stats) {
        var mapArea = document.querySelector('.sl-map-area');
        if (!mapArea) return;
        if (document.getElementById('tonightBostonBar')) return;
        // Phase 6E truth gate: only render when backend says we have live data.
        // Hide when source is 'quiet' (no check-ins yet), 'estimated' (legacy),
        // or 'error' (backend fallback). Never show fabricated numbers.
        if (!stats || stats.source !== 'live') return;

        var bar = document.createElement('div');
        bar.id = 'tonightBostonBar';
        bar.className = 'tonight-boston-bar';
        var people = (stats.peopleOut || 0).toLocaleString();
        var trending = stats.trendingCount || 0;
        var hotSpots = stats.hotSpots || 0;
        bar.innerHTML =
            '<div class="tbb-left">' +
                '<div class="tbb-title">🌃 Tonight in Boston</div>' +
                '<div class="tbb-live"><span class="tbb-live-dot"></span> LIVE</div>' +
            '</div>' +
            '<div class="tbb-stats">' +
                '<div class="tbb-stat"><span class="tbb-stat-val" id="tbbPeopleOut">' + people + '</span><span class="tbb-stat-label">People Out</span></div>' +
                '<div class="tbb-stat"><span class="tbb-stat-val" id="tbbTrending">' + trending + '</span><span class="tbb-stat-label">Trending</span></div>' +
                '<div class="tbb-stat"><span class="tbb-stat-val" id="tbbHotSpots">' + hotSpots + '</span><span class="tbb-stat-label">Hot Spots</span></div>' +
            '</div>';
        mapArea.insertBefore(bar, mapArea.firstChild);
    }

    function enhanceCrowdIndex(stats) {
        var crowdIndex = document.querySelector('.sl-crowd-index');
        if (!crowdIndex) return;
        // Only style as "live" if we actually have live data (Phase 6E: source === 'live')
        if (stats && stats.source === 'live') {
            crowdIndex.classList.add('enhanced');
            crowdIndex.style.cssText = 'background: linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05)); border: 1px solid rgba(212,175,55,0.25);';
        }
        // Replace any "people out tonight" string when data is not live — show truthful catalog count
        var countEl = document.getElementById('slCrowdCount');
        if (countEl && (!stats || stats.source !== 'live')) {
            countEl.textContent = 'Boston venues to explore';
        }
    }

    function refreshLiveStats() {
        try {
            fetch('/api/checkins/tonight-stats', { credentials: 'omit' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    injectTonightBar(data);
                    enhanceCrowdIndex(data);
                })
                .catch(function () { enhanceCrowdIndex(null); });
        } catch (e) { enhanceCrowdIndex(null); }
    }

    function init() {
        refreshLiveStats();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
