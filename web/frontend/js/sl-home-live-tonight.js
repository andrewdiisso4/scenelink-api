/**
 * SceneLink — Home "Live Tonight" section
 * Multi-panel dashboard combining:
 *   1. Trending venues tonight (from /api/venues with sort=buzz)
 *   2. Live events (from /api/events?upcoming=1)
 *   3. Social activity (from /api/activity)
 *   4. AI concierge quick-suggestions (client-side prompts → open concierge)
 */
(function () {
    'use strict';

    function esc(s) { return String(s || '').replace(/[<>&"]/g, function (c) { return { '<': '<', '>': '>', '&': '&', '"': '"' }[c]; }); }
    function timeAgo(ts) {
        if (!ts) return '';
        var d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
        if (d < 60) return d + 's ago';
        if (d < 3600) return Math.floor(d / 60) + 'm ago';
        if (d < 86400) return Math.floor(d / 3600) + 'h ago';
        return Math.floor(d / 86400) + 'd ago';
    }
    function fmtDate(ts) {
        if (!ts) return '';
        try {
            var d = new Date(ts);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } catch (_) { return ''; }
    }

    var ph = '/assets/img/placeholder-venue.svg';
    var phEvent = '/assets/img/placeholder-event.svg';

    function venueImage(v) {
        return v.thumbnail_url || v.image_url || v.image || v.photo || v.photo_url || v.cover_image || ph;
    }
    function eventImage(v) {
        return v.image_url || v.image || v.photo || phEvent;
    }

    // ----- 1. Trending venues
    function renderTrending(list, venues) {
        if (!venues || !venues.length) {
            list.innerHTML = '<div class="slht-empty">Loading trending venues…</div>';
            return;
        }
        list.innerHTML = venues.slice(0, 4).map(function (v) {
            var name = esc(v.name || 'Venue');
            var hood = esc(v.neighborhood || v.address || 'Boston');
            var cat = esc(v.category || v.type || '');
            var rating = v.rating ? '<span class="slht-rating">★ ' + Number(v.rating).toFixed(1) + '</span>' : '';
            var buzz = v.buzz_score || v.buzz || '';
            return '<article class="slht-trend-card" data-venue-id="' + esc(v.id || '') + '"' +
                ' data-sl-venue-id="' + esc(v.id || '') + '"' +
                ' data-sl-venue-name="' + name + '"' +
                ' data-sl-venue-neighborhood="' + hood + '">' +
                '<div class="slht-trend-img" style="background-image:url(\'' + esc(venueImage(v)) + '\');">' +
                (buzz ? '<span class="slht-buzz">🔥 ' + esc(String(buzz)) + '</span>' : '') +
                '</div>' +
                '<div class="slht-trend-body">' +
                '<div class="slht-trend-meta">' + cat + (cat && hood ? ' · ' : '') + hood + '</div>' +
                '<div class="slht-trend-name">' + name + '</div>' +
                '<div class="slht-trend-actions">' +
                rating +
                '<button type="button" class="slht-save-btn" data-sl-action="save" data-sl-venue-id="' + esc(v.id || '') + '" data-sl-venue-name="' + name + '" aria-label="Save"><i class="far fa-heart"></i></button>' +
                '</div>' +
                '</div>' +
                '</article>';
        }).join('');

        // Open venue detail on card click (but not on save button)
        list.querySelectorAll('.slht-trend-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.slht-save-btn')) return;
                var vid = card.getAttribute('data-venue-id');
                if (vid) window.location.href = '/explore.html?venue=' + encodeURIComponent(vid);
            });
        });
    }

    // ----- 2. Live events
    function renderEvents(list, events) {
        if (!events || !events.length) {
            // Phase 7C: graceful empty state for events panel — no skeleton-forever
            list.innerHTML = '<div class="slht-empty" style="padding:24px 16px;text-align:center;color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;">No events on the calendar right now.<br>We\'ll surface events here as venues add them.</div>';
            return;
        }
        list.innerHTML = events.slice(0, 3).map(function (ev) {
            var title = esc(ev.title || ev.name || 'Event');
            var venue = esc(ev.venue_name || ev.venue || 'Boston');
            var when = fmtDate(ev.start_time || ev.date || ev.event_date);
            var url = ev.event_url || ev.ticket_url || ev.url || '';
            return '<article class="slht-event-card">' +
                '<div class="slht-event-img" style="background-image:url(\'' + esc(eventImage(ev)) + '\');"></div>' +
                '<div class="slht-event-body">' +
                '<div class="slht-event-venue">' + venue + '</div>' +
                '<div class="slht-event-title">' + title + '</div>' +
                (when ? '<div class="slht-event-when">📅 ' + when + '</div>' : '') +
                '<div class="slht-event-ctas">' +
                '<a href="/events.html" class="slht-btn-ghost">Details</a>' +
                (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="slht-btn-gold">Get Tickets</a>' : '') +
                '</div>' +
                '</div>' +
                '</article>';
        }).join('');
    }

    // ----- 3. Activity feed (minimal)
    // Local SVG initial avatar — no external dicebear dependency, no failing requests
    function localInitialAvatar(name){
        var n = (name||'?').trim();
        var initials = n.split(/\s+/).slice(0,2).map(function(p){return (p[0]||'').toUpperCase();}).join('') || '?';
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'+
                  '<rect width="64" height="64" fill="#1a1a1a"/>'+
                  '<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui,Arial" font-size="24" font-weight="700" fill="#d4af37">'+initials+'</text>'+
                  '</svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    function renderActivity(list, acts) {
        // Filter synthetic seed users (user_id === null) — they have no real profile to link to
        if (Array.isArray(acts)) {
            acts = acts.filter(function(a){ return a && a.user_id; });
        }
        if (!acts || !acts.length) {
            list.innerHTML = '<div class="slht-empty">Be the first to check in tonight 🎉</div>';
            return;
        }
        list.innerHTML = acts.slice(0, 4).map(function (a) {
            var user = esc(a.user_display_name || a.user_name || 'Someone');
            // Use API-provided avatar only if it isn't a known-failing dicebear URL
            var rawAvatar = a.user_avatar || '';
            var avatar = (rawAvatar && rawAvatar.indexOf('dicebear') === -1)
                ? rawAvatar
                : localInitialAvatar(a.user_display_name || a.user_name || 'User');
            var venueName = esc(a.venue_name || 'a venue');
            var content = esc((a.content || '').slice(0, 80));
            var ts = timeAgo(a.created_at);
            var action = esc(a.type || 'visited');
            return '<div class="slht-activity-item">' +
                '<img src="' + esc(avatar) + '" alt="" class="slht-activity-avatar" onerror="SL_IMG_FALLBACK(this,\'avatar\')">' +
                '<div class="slht-activity-body">' +
                '<div class="slht-activity-top"><strong>' + user + '</strong> ' + action + ' <span class="slht-activity-venue">' + venueName + '</span></div>' +
                (content ? '<div class="slht-activity-content">"' + content + '"</div>' : '') +
                '<div class="slht-activity-ts">' + ts + '</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    // ----- Fetch all in parallel
    function loadAll() {
        var root = document.getElementById('slhtLiveSection');
        if (!root) return;
        var trendList = root.querySelector('#slhtTrending');
        var eventList = root.querySelector('#slhtEvents');
        var actList = root.querySelector('#slhtActivity');

        // Trending venues — fetch top 50 and sort by buzz
        fetch('/api/venues?limit=50')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var venues = (data && (data.venues || data.results || data)) || [];
                if (!Array.isArray(venues)) venues = [];
                // Sort by buzz_score desc (fallback to rating)
                venues.sort(function (a, b) {
                    var ba = Number(a.buzz_score || a.buzz || 0);
                    var bb = Number(b.buzz_score || b.buzz || 0);
                    if (bb !== ba) return bb - ba;
                    return (Number(b.rating || 0) - Number(a.rating || 0));
                });
                renderTrending(trendList, venues);
            })
            .catch(function () {
                if (trendList) trendList.innerHTML = '<div class="slht-empty">Could not load trending venues</div>';
            });

        // Events
        fetch('/api/events?limit=20')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var events = (data && (data.events || data.results || data)) || [];
                if (!Array.isArray(events)) events = [];
                // Phase 5H truth gate: only show events that have a real ticket/event URL.
                // Otherwise the seeded "Indie Rock Showcase / Live Jazz Night" placeholders leak
                // into the homepage. If none qualify, show an honest empty state.
                events = events.filter(function (e) {
                    return e && (e.event_url || e.ticket_url || e.url);
                });
                // Filter to upcoming
                var now = Date.now();
                events = events.filter(function (e) {
                    var t = new Date(e.start_time || e.date || e.event_date || 0).getTime();
                    return !t || t >= now - 86400000; // include events from last 24h and future
                });
                if (!events.length && eventList) {
                    eventList.innerHTML = '<div class="slht-empty">Curated Boston events &mdash; launching soon. <a href="/events.html" style="color:#d4af37;font-weight:700">Get notified</a></div>';
                } else {
                    renderEvents(eventList, events);
                }
            })
            .catch(function () {
                if (eventList) eventList.innerHTML = '<div class="slht-empty">Could not load events</div>';
            });

        // Activity
        fetch('/api/activity?limit=6')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var acts = (data && data.activities) || [];
                renderActivity(actList, acts);
            })
            .catch(function () {
                if (actList) actList.innerHTML = '<div class="slht-empty">Activity will appear as the scene gets going 🌙</div>';
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAll);
    } else {
        loadAll();
    }
})();