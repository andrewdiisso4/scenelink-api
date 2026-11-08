/* ============================================
   EVENTS PAGE APPLICATION - SceneLink
   Real-data version: loads from /api/events
   ============================================ */
(function () {
    'use strict';

    var allEvents = [];
    var filtered = [];
    var activeCategory = 'all';
    var activeDateFilter = 'all';
    var map = null;
    var markers = [];
    var visibleCount = 12; // initial page size
    var PAGE_SIZE = 12;

    function evToast(msg) {
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(212,175,55,0.95);color:#0a0a0a;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;z-index:999999;pointer-events:none;white-space:nowrap;';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.3s'; }, 2200);
        setTimeout(function(){ if(t.parentNode) t.remove(); }, 2500);
    }

    function renderCard(e) {
        var price = e.price || 'Free';
        var date = e.date ? new Date(e.date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : '';
        var time = e.start_time ? e.start_time.substring(0,5) : '';
        var venueName = e.venue_name || e.venue || '';
        var neighborhood = e.venue_neighborhood || e.neighborhood || 'Boston';
        var attending = e.attending_count || e.attending || 0;
        var rating = e.rating ? parseFloat(e.rating).toFixed(1) : '';
        var img = e.image_url || e.image || '/assets/img/placeholder-event.svg';
        var cat = (e.category || '').toLowerCase();
        var catColors = {
            'nightlife':'#9B59B6','live music':'#E74C3C','music':'#E74C3C',
            'food & drink':'#F39C12','brunch':'#E67E22','comedy':'#2ECC71',
            'sports':'#3498DB','themed':'#D4AF37','date night':'#E91E8C',
            'arts & culture':'#1ABC9C','arts':'#1ABC9C'
        };
        var catColor = catColors[cat] || '#D4AF37';
        var venueSlug = e.venue_slug || '';
        var venueId = e.venue_id || '';
        var detailKey = venueSlug || venueId;
        var isFree = String(price).toLowerCase().indexOf('free') >= 0;

        var viewBtn = detailKey
            ? '<button class="ev-btn ev-view-btn" data-detail-key="' + detailKey + '" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;"><i class="fas fa-eye"></i> View Venue</button>'
            : '';
        var saveBtn = '<button class="ev-btn ev-save-btn" data-event-id="' + e.id + '" data-venue-id="' + (venueId||venueSlug) + '" data-venue-name="' + (venueName||e.title||e.name||'').replace(/"/g,'&quot;') + '" style="background:#1f1f1f;color:#fff;border:1px solid rgba(255,255,255,0.15);padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;"><i class="far fa-heart"></i> Save</button>';
        var reserveBtn = detailKey
            ? '<button class="ev-btn ev-reserve-btn" data-detail-key="' + detailKey + '" style="background:#1f1f1f;color:#D4AF37;border:1px solid rgba(212,175,55,0.3);padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;"><i class="fas fa-circle-info"></i> Details</button>'
            : '';
        var ticketBtn = e.event_url
            ? '<button class="ev-btn ev-ticket-btn" data-ticket-url="' + e.event_url + '" style="background:linear-gradient(135deg,#E74C3C,#c0392b);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;"><i class="fas fa-ticket-alt"></i> Get Tickets</button>'
            : '';



        return '<div class="event-card" data-id="' + e.id + '" data-category="' + cat + '" style="background:#111;border-radius:16px;overflow:hidden;transition:transform 0.2s;box-shadow:0 4px 20px rgba(0,0,0,0.4);">' +
            '<div style="position:relative;height:200px;background:url(\'' + img + '\') center/cover no-repeat;">' +
                '<div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.7));"></div>' +
                '<div style="position:absolute;top:12px;left:12px;background:' + catColor + ';color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">' + (e.category || 'Event') + '</div>' +
                '<div style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.8);color:' + (isFree ? '#2ECC71' : '#D4AF37') + ';padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;">' + (isFree ? 'FREE' : price) + '</div>' +
            '</div>' +
            '<div style="padding:16px;">' +
                '<h3 style="color:#fff;font-size:16px;font-weight:700;margin:0 0 6px;line-height:1.3;">' + (e.title || e.name || 'Event') + '</h3>' +
                '<div style="color:#D4AF37;font-size:13px;margin-bottom:4px;font-weight:500;">' + venueName + '</div>' +
                '<div style="color:rgba(255,255,255,0.5);font-size:12px;margin-bottom:10px;"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>' + neighborhood + '</div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:12px;">' +
                    '<div style="color:rgba(255,255,255,0.7);font-size:12px;"><i class="fas fa-calendar-alt" style="color:#D4AF37;margin-right:4px;"></i>' + date + (time ? ' · ' + time : '') + '</div>' +
                    '<div style="color:rgba(255,255,255,0.5);font-size:12px;">' +
                        (attending ? '<i class="fas fa-users" style="margin-right:4px;"></i>' + attending + ' going' : '') +
                        (rating ? (attending ? ' · ' : '') + '<i class="fas fa-star" style="color:#D4AF37;margin-right:2px;"></i>' + rating : '') +
                    '</div>' +
                '</div>' +
                (e.description ? '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + e.description + '</p>' : '') +
                '<div class="event-card-actions" style="display:flex;gap:8px;flex-wrap:wrap;">' +
                    viewBtn + saveBtn + reserveBtn + ticketBtn +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function renderEvents() {
        var grid = document.getElementById('eventsGrid') || document.querySelector('.events-grid');
        if (!grid) return;
        if (!filtered.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);"><div style="font-size:48px;margin-bottom:16px;">🎭</div><h3 style="color:rgba(255,255,255,0.6);margin:0 0 8px;">No events found</h3><p style="margin:0;font-size:14px;">Try a different category or date filter</p></div>';
            var lmWrap = document.getElementById('loadMoreBtn');
            if (lmWrap && lmWrap.parentNode) lmWrap.parentNode.style.display = 'none';
            return;
        }
        var toRender = filtered.slice(0, visibleCount);
        grid.innerHTML = toRender.map(renderCard).join('');

        // Show/hide Load More based on whether there are more items
        var loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            var wrap = loadMoreBtn.closest('.sl-load-more') || loadMoreBtn.parentNode;
            if (filtered.length > visibleCount) {
                if (wrap) wrap.style.display = '';
                loadMoreBtn.style.display = '';
                loadMoreBtn.innerHTML = '<i class="fas fa-plus"></i> Load More Events (' + (filtered.length - visibleCount) + ' more)';
                loadMoreBtn.disabled = false;
            } else {
                if (wrap) wrap.style.display = 'none';
            }
        }

        // Wire View Venue + Reserve buttons
        grid.querySelectorAll('.ev-view-btn, .ev-reserve-btn').forEach(function(btn) {
            btn.addEventListener('click', function(ev) {
                ev.stopPropagation();
                var key = btn.getAttribute('data-detail-key');
                if (key && window.SLVenueDetail) {
                    window.SLVenueDetail.open(key);
                }
            });
        });

        // Wire Save buttons
        grid.querySelectorAll('.ev-save-btn').forEach(function(btn) {
            btn.addEventListener('click', function(ev) {
                ev.stopPropagation();
                var venueId = btn.getAttribute('data-venue-id');
                var venueName = btn.getAttribute('data-venue-name') || 'Venue';
                var icon = btn.querySelector('i');
                var saved = {};
                try { saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '{}'); } catch(ex) {}
                var key = venueId || btn.getAttribute('data-event-id');
                if (!saved[key]) {
                    saved[key] = { id: key, name: venueName, time: Date.now() };
                    localStorage.setItem('sl_saved_venues', JSON.stringify(saved));
                    if (icon) icon.className = 'fas fa-heart';
                    btn.style.color = '#e74c3c';
                    evToast('💛 Saved ' + venueName);
                    window.dispatchEvent(new Event('sl-lists-changed'));
                    if (window.SLApi && window.SLApi.isLoggedIn() && venueId) {
                        window.SLApi.toggleFavorite(venueId).catch(function(){});
                    }
                } else {
                    delete saved[key];
                    localStorage.setItem('sl_saved_venues', JSON.stringify(saved));
                    if (icon) icon.className = 'far fa-heart';
                    btn.style.color = '';
                    evToast('Removed from saved');
                    window.dispatchEvent(new Event('sl-lists-changed'));
                }
            });
        });
        // Wire Get Tickets buttons
        grid.querySelectorAll('.ev-ticket-btn').forEach(function(btn) {
            btn.addEventListener('click', function(ev) {
                ev.stopPropagation();
                var url = btn.getAttribute('data-ticket-url');
                if (url) { window.open(url, '_blank', 'noopener'); }
            });
        });
    }

    function matchesDate(e) {
        if (activeDateFilter === 'all') return true;
        var eventDate = new Date(e.date);
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        if (activeDateFilter === 'today') return evDay.getTime() === today.getTime();
        if (activeDateFilter === 'weekend') { var day = evDay.getDay(); return day === 0 || day === 6; }
        if (activeDateFilter === 'week') { var end = new Date(today); end.setDate(end.getDate() + 7); return evDay >= today && evDay <= end; }
        if (activeDateFilter === 'day' && window._calFilterDate) { return evDay.getTime() === new Date(window._calFilterDate.getFullYear(), window._calFilterDate.getMonth(), window._calFilterDate.getDate()).getTime(); }
        return true;
    }

    function applyFilters() {
        filtered = allEvents.filter(function(e) {
            var catMatch = activeCategory === 'all' || (e.category || '').toLowerCase().indexOf(activeCategory.toLowerCase()) >= 0;
            return catMatch && matchesDate(e);
        });
        visibleCount = PAGE_SIZE; // reset paging on filter change
        renderEvents();
        updateMap();
    }

    function initMap() {
        var mapEl = document.getElementById('eventsMap');
        if (!mapEl || typeof L === 'undefined' || map) return;
        map = L.map('eventsMap', { zoomControl: true, scrollWheelZoom: false }).setView([42.3601, -71.0589], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', maxZoom: 18 }).addTo(map);
        var loading = document.getElementById('eventsMapLoading');
        if (loading) loading.style.display = 'none';
    }

    function updateMap() {
        if (!map) return;
        markers.forEach(function(m) { map.removeLayer(m); });
        markers = [];
        var bounds = [];
        filtered.forEach(function(e) {
            var lat = parseFloat(e.venue_lat || e.lat);
            var lng = parseFloat(e.venue_lng || e.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            var venueSlug = e.venue_slug || '';
            var venueId = e.venue_id || '';
            var detailKey = venueSlug || venueId;
            var title = (e.title || e.name || 'Event').replace(/'/g, "\\'");
            var vName = (e.venue_name || '').replace(/'/g, "\\'");
            var popupHtml =
                '<div style="background:#111;color:#fff;min-width:160px;">' +
                '<strong style="color:#D4AF37;display:block;margin-bottom:4px;">' + (e.title || e.name || 'Event') + '</strong>' +
                (e.venue_name ? '<span style="color:rgba(255,255,255,0.8);font-size:12px;">' + e.venue_name + '</span><br>' : '') +
                '<small style="color:rgba(255,255,255,0.5);">' + (e.venue_neighborhood || 'Boston') + '</small>' +
                (detailKey ? '<br><button onclick="if(window.SLVenueDetail)window.SLVenueDetail.open(\'' + detailKey + '\')" style="margin-top:8px;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:none;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;width:100%;">View Venue</button>' : '') +
                '</div>';

            var cat = (e.category || '').toLowerCase();
            var catColors = {
                'nightlife':'#9B59B6','live music':'#E74C3C','music':'#E74C3C',
                'food & drink':'#F39C12','brunch':'#E67E22','comedy':'#2ECC71',
                'sports':'#3498DB','themed':'#D4AF37','date night':'#E91E8C',
                'arts & culture':'#1ABC9C','arts':'#1ABC9C'
            };
            var pinColor = catColors[cat] || '#D4AF37';
            var m = L.circleMarker([lat, lng], {
                radius: 9,
                fillColor: pinColor,
                color: '#000',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).bindPopup(popupHtml, { className: 'sl-event-popup' });

            m.addTo(map);
            markers.push(m);
            bounds.push([lat, lng]);
        });

        if (bounds.length > 0) {
            try {
                map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
            } catch(err) {}
        }
    }

    function updateEventStats(events) {
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

        var thisWeek = 0, liveTonight = 0, freeCount = 0;
        events.forEach(function(e) {
            var d = e.date ? new Date(e.date) : null;
            if (d) {
                var evDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                if (evDay >= today && evDay <= weekEnd) thisWeek++;
                if (evDay.getTime() === today.getTime()) liveTonight++;
            }
            if (e.price && (e.price === 0 || e.price === '0' || (typeof e.price === 'string' && e.price.toLowerCase().indexOf('free') >= 0))) freeCount++;
        });

        var tw = document.getElementById('totalEventsCount');
        var lt = document.getElementById('liveEventsCount');
        var fr = document.getElementById('freeEventsCount');
        if (tw) tw.textContent = thisWeek;
        if (lt) lt.textContent = liveTonight;
        if (fr) fr.textContent = freeCount;
    }

    function loadEvents() {
        var grid = document.getElementById('eventsGrid') || document.querySelector('.events-grid');
        if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:80px 24px;"><div style="color:rgba(255,255,255,0.4);font-size:16px;">Loading events&hellip;</div></div>';
        fetch('/api/events?limit=100')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                allEvents = (data.events || []).sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
                updateEventStats(allEvents);
                initMap();
                applyFilters();
                renderCalendar();
            })
            .catch(function() {
                if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);"><div style="font-size:48px;">😔</div><p>Events unavailable right now. Try refreshing.</p></div>';
            });
    }

    function wireFilters() {
        document.querySelectorAll('[data-category], .filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                activeCategory = this.dataset.category || this.dataset.filter || this.textContent.trim().toLowerCase() || 'all';
                if (activeCategory === 'all venues') activeCategory = 'all';
                document.querySelectorAll('[data-category], .filter-btn').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                applyFilters();
            });
        });
        document.querySelectorAll('[data-date]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var txt = (this.dataset.date || this.textContent.trim()).toLowerCase();
                if (txt.indexOf('today') >= 0) activeDateFilter = 'today';
                else if (txt.indexOf('weekend') >= 0) activeDateFilter = 'weekend';
                else if (txt.indexOf('week') >= 0) activeDateFilter = 'week';
                else activeDateFilter = 'all';
                document.querySelectorAll('[data-date]').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                applyFilters();
            });
        });

        // Load More button
        var loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', function() {
                visibleCount += PAGE_SIZE;
                renderEvents();
            });
        }

        // Events search input (if present)
        var searchInput = document.getElementById('eventsSearch') || document.querySelector('input[placeholder*="Search events" i]');
        if (searchInput) {
            var searchTimer = null;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimer);
                var q = this.value.trim().toLowerCase();
                searchTimer = setTimeout(function() {
                    if (!q) { applyFilters(); return; }
                    filtered = allEvents.filter(function(e) {
                        var hay = ((e.title||'')+' '+(e.name||'')+' '+(e.venue_name||'')+' '+(e.neighborhood||'')+' '+(e.category||'')+' '+(e.description||'')).toLowerCase();
                        return hay.indexOf(q) >= 0;
                    });
                    visibleCount = PAGE_SIZE;
                    renderEvents();
                    updateMap();
                }, 200);
            });
        }
    }

    // ── Calendar widget ──────────────────────────────────────
    var calState = { year: new Date().getFullYear(), month: new Date().getMonth() };
    var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function renderCalendar() {
        var titleEl = document.getElementById('calTitle');
        var gridEl  = document.getElementById('calGrid');
        if (!titleEl || !gridEl) return;

        var y = calState.year, m = calState.month;
        titleEl.textContent = MONTH_NAMES[m] + ' ' + y;

        var firstDay = new Date(y, m, 1).getDay(); // 0=Sun
        var daysInMonth = new Date(y, m + 1, 0).getDate();
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();

        // Build event dates set for this month
        var eventDays = new Set();
        allEvents.forEach(function(e) {
            if (!e.date) return;
            var d = new Date(e.date);
            if (d.getFullYear() === y && d.getMonth() === m) {
                eventDays.add(d.getDate());
            }
        });

        var html = '';
        // Empty cells before first day
        for (var i = 0; i < firstDay; i++) html += '<div class="sl-cal-cell empty"></div>';
        // Day cells
        for (var d = 1; d <= daysInMonth; d++) {
            var isToday = (y === today.getFullYear() && m === today.getMonth() && d === today.getDate());
            var hasEvent = eventDays.has(d);
            var cls = 'sl-cal-cell' + (isToday ? ' today' : '') + (hasEvent ? ' has-event' : '');
            html += '<div class="' + cls + '">' + d + (hasEvent ? '<span class="cal-dot"></span>' : '') + '</div>';
        }
        gridEl.innerHTML = html;

        // Click on a day with events to filter
        gridEl.querySelectorAll('.sl-cal-cell.has-event').forEach(function(cell) {
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', function() {
                var day = parseInt(this.textContent);
                var clickedDate = new Date(y, m, day);
                activeDateFilter = 'day';
                window._calFilterDate = clickedDate;
                applyFilters();
            });
        });
    }

    function initCalendar() {
        renderCalendar();
        var prev = document.getElementById('calPrev');
        var next = document.getElementById('calNext');
        if (prev) prev.addEventListener('click', function() {
            if (calState.month === 0) { calState.month = 11; calState.year--; }
            else { calState.month--; }
            renderCalendar();
        });
        if (next) next.addEventListener('click', function() {
            if (calState.month === 11) { calState.month = 0; calState.year++; }
            else { calState.month++; }
            renderCalendar();
        });
    }

    function init() {
        wireFilters();
        loadEvents();
        initCalendar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();