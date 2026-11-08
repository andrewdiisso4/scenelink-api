/* ============================================
   ROUND 9.3d - Homepage Search Enhancements
   ============================================ */

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {

        // ===== CATEGORY TAB SWITCHING =====
        var catTabs = document.querySelectorAll('.search-cat-tab');
        var searchInput = document.getElementById('premiumSearchInput');
        var activeCat = 'all';

        var placeholders = {
            all: "Search restaurants, bars, events, or ask 'Where should I go tonight?'",
            restaurants: "Search restaurants by cuisine, name, or neighborhood...",
            bars: "Find cocktail bars, wine bars, sports bars...",
            nightlife: "Discover nightclubs, lounges, dance floors...",
            events: "Search events, concerts, food festivals..."
        };

        catTabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                catTabs.forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                activeCat = this.getAttribute('data-cat');
                if (searchInput) {
                    searchInput.placeholder = placeholders[activeCat] || placeholders.all;
                    searchInput.focus();
                }
            });
        });

        // ===== QUICK SUGGESTION TAGS =====
        var quickTags = document.querySelectorAll('.search-quick-tag');
        quickTags.forEach(function(tag) {
            tag.addEventListener('click', function() {
                var query = this.getAttribute('data-query');
                if (searchInput && query) {
                    searchInput.value = query;
                    searchInput.focus();
                    searchInput.dispatchEvent(new Event('input'));
                }
            });
        });

        // ===== ENHANCED SEARCH WITH AI SUGGESTION =====
        var searchDropdown = document.getElementById('searchResultsDropdown');
        var searchBtn = document.getElementById('premiumSearchBtn');

        // Phase 5D-A: Replaced mock venueDatabase with LIVE /api/venues lookup.
        // No hardcoded names. Real production data only.
        var SL_API = (window.SL_CONFIG && window.SL_CONFIG.API_BASE) || '';
        var searchAbort = null;
        var searchCache = {};

        function getCatFilter() {
            if (activeCat === 'all') return null;
            if (activeCat === 'restaurants') return 'restaurant';
            if (activeCat === 'bars') return 'bar';
            if (activeCat === 'nightlife') return 'nightlife';
            if (activeCat === 'events') return 'event';
            return null;
        }

        function escHtml(s){return String(s||'').replace(/[&<>"']/g, function(c){return ({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'})[c];});}

        function iconForType(t){
            t=(t||'').toLowerCase();
            if(t==='bar'||t==='lounge') return 'fa-cocktail';
            if(t==='nightlife'||t==='club') return 'fa-music';
            if(t==='event') return 'fa-calendar-alt';
            if(t==='cafe'||t==='bakery') return 'fa-mug-hot';
            return 'fa-utensils';
        }

        function labelForType(t){
            t=(t||'').toLowerCase();
            if(t==='bar'||t==='lounge') return 'bar';
            if(t==='nightlife'||t==='club') return 'nightlife';
            if(t==='event') return 'event';
            return 'restaurant';
        }

        function destForType(t){
            t=labelForType(t);
            if(t==='bar'||t==='nightlife') return 'nightlife.html';
            if(t==='event') return 'events.html';
            return 'explore.html';
        }

        function renderSearchResults(query) {
            if (!searchDropdown) return;
            var q = (query||'').trim();
            if (!q || q.length < 2) {
                searchDropdown.classList.remove('active');
                return;
            }

            // Loading state
            searchDropdown.innerHTML = '<div class="search-no-results"><i class="fas fa-circle-notch fa-spin" style="margin-right:8px;opacity:0.6;"></i>Searching…</div>';
            searchDropdown.classList.add('active');

            var catFilter = getCatFilter();
            var cacheKey = q.toLowerCase() + '|' + (catFilter||'');
            if (searchCache[cacheKey]) {
                paintResults(searchCache[cacheKey], q, catFilter);
                return;
            }

            if (searchAbort) { try { searchAbort.abort(); } catch(_){} }
            searchAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;

            var url = '/api/venues?q=' + encodeURIComponent(q) + '&limit=12';
            fetch(url, { signal: searchAbort ? searchAbort.signal : undefined })
                .then(function(r){ return r.ok ? r.json() : { venues: [] }; })
                .then(function(data){
                    var venues = (data && data.venues) || [];
                    searchCache[cacheKey] = venues;
                    paintResults(venues, q, catFilter);
                })
                .catch(function(err){
                    if (err && err.name === 'AbortError') return;
                    searchDropdown.innerHTML = '<div class="search-no-results"><i class="fas fa-search" style="margin-right:8px;opacity:0.5;"></i>Try Explore for full results</div>';
                });
        }

        function paintResults(venues, query, catFilter) {
            if (!searchDropdown) return;

            // Apply cat filter on client side
            var filtered = venues.filter(function(v){
                if (!catFilter) return true;
                var t = labelForType(v.type || v.category);
                return t === catFilter;
            });

            if (filtered.length === 0) {
                searchDropdown.innerHTML = '<div class="search-no-results"><i class="fas fa-search" style="margin-right:8px;opacity:0.5;"></i>No results for "' + escHtml(query) + '"</div>';
                searchDropdown.classList.add('active');
                return;
            }

            // Group
            var groups = { restaurant: [], bar: [], nightlife: [], event: [] };
            filtered.forEach(function(v){
                var t = labelForType(v.type || v.category);
                if (groups[t]) groups[t].push(v);
                else groups.restaurant.push(v);
            });

            var labels = { restaurant: 'Restaurants', bar: 'Bars & Lounges', nightlife: 'Nightlife', event: 'Events' };
            var html = '';

            for (var type in groups) {
                var items = groups[type];
                if (!items.length) continue;
                html += '<div class="sr-category">' + labels[type] + '</div>';
                items.slice(0, 5).forEach(function(v){
                    var ic = iconForType(v.type || v.category);
                    var dest = destForType(v.type || v.category);
                    var detail = (v.cuisine ? (v.cuisine + ' · ') : '') + (v.neighborhood || '') +
                                 (v.rating ? (' · ★ ' + v.rating) : '');
                    var badgeHtml = '';
                    if (v.trending) badgeHtml = '<span class="sr-item-badge sr-badge-trending">Trending</span>';
                    else if (v.featured || v.spotlight) badgeHtml = '<span class="sr-item-badge sr-badge-hot">Hot</span>';
                    html += '<a class="sr-item" href="' + dest + '?search=' + encodeURIComponent(v.name) + '">' +
                        '<div class="sr-item-icon"><i class="fas ' + ic + '"></i></div>' +
                        '<div class="sr-item-info"><span class="sr-item-name">' + escHtml(v.name) + '</span>' +
                        '<span class="sr-item-detail">' + escHtml(detail) + '</span></div>' +
                        badgeHtml + '</a>';
                });
            }

            searchDropdown.innerHTML = html;
            searchDropdown.classList.add('active');
        }

        if (searchInput) {
            var _slDebounce = null;
            searchInput.addEventListener('input', function() {
                var v = this.value;
                if (_slDebounce) clearTimeout(_slDebounce);
                _slDebounce = setTimeout(function(){ renderSearchResults(v); }, 220);
            });

            searchInput.addEventListener('focus', function() {
                if (this.value.length >= 2) {
                    renderSearchResults(this.value);
                }
            });

            document.addEventListener('click', function(e) {
                if (searchDropdown && !searchDropdown.contains(e.target) && e.target !== searchInput &&
                    !e.target.closest('.premium-search-card')) {
                    searchDropdown.classList.remove('active');
                }
            });

            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var q = this.value.trim();
                    if (q) {
                        var dest = activeCat === 'nightlife' ? 'nightlife.html' :
                                   activeCat === 'events' ? 'events.html' : 'explore.html';
                        window.location.href = dest + '?search=' + encodeURIComponent(q);
                    }
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', function() {
                var q = searchInput ? searchInput.value.trim() : '';
                if (q) {
                    var dest = activeCat === 'nightlife' ? 'nightlife.html' :
                               activeCat === 'events' ? 'events.html' : 'explore.html';
                    window.location.href = dest + '?search=' + encodeURIComponent(q);
                }
            });
        }

    });
})();