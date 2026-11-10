/* ==============================================
   SceneLink AI Concierge v5 — Full Real-Data
   ============================================== */
(function () {
    'use strict';

    if (window.__slConciergeV5) return;
    window.__slConciergeV5 = true;

    // Kill any previous instance cleanly
    document.querySelectorAll('.sl-concierge-fab, .sl-concierge-panel, [class*="concierge-fab"]:not(.sl-concierge-fab-v5), [class*="concierge-panel"]:not(.sl-concierge-panel-v5)').forEach(function (el) {
        try { el.remove(); } catch (_) {}
    });
    window.__slConciergeV3 = true; // blocks v3 from reinitializing

    var API_BASE = (window.SLConfig && (window.SLConfig.API_BASE_URL || window.SLConfig.API_URL)) || '/api';

    /* ═══════════════════════════════════════════════════════
       API CLIENTS
       ═══════════════════════════════════════════════════════ */
    async function apiGet(path) {
        try {
            var res = await fetch(API_BASE + path, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    }

    async function searchVenues(q, limit) {
        limit = limit || 4;
        var data = await apiGet('/venues/search?q=' + encodeURIComponent(q) + '&limit=' + limit);
        if (!data) return [];
        return (Array.isArray(data) ? data : (data.venues || data.results || data.data || [])).slice(0, limit);
    }

    async function fetchVenues(params) {
        params = params || {};
        var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
        var data = await apiGet('/venues?' + qs);
        if (!data) return [];
        return Array.isArray(data) ? data : (data.venues || []);
    }

    async function fetchTonight(limit) {
        return fetchVenues({limit: limit || 4, sort: 'name'});
    }

    async function fetchNightlife(limit) {
        limit = limit || 4;
        var data = await apiGet('/venues/nightlife?limit=' + limit);
        if (!data) return [];
        return (Array.isArray(data) ? data : (data.venues || [])).slice(0, limit);
    }

    async function fetchEvents(limit) {
        limit = limit || 4;
        var data = await apiGet('/events?limit=' + limit);
        if (!data) return [];
        var items = Array.isArray(data) ? data : (data.events || []);
        // Filter out past events
        var now = Date.now();
        return items.filter(function (e) {
            if (!e.start_date && !e.event_date) return true;
            var d = new Date(e.start_date || e.event_date).getTime();
            return d > now - 86400000;
        }).slice(0, limit);
    }

    /* ═══════════════════════════════════════════════════════
       CONTEXT & PERSONALITY
       ═══════════════════════════════════════════════════════ */
    function getPageContext() {
        var path = window.location.pathname.toLowerCase();
        if (path.indexOf('tonight') > -1) return { page: "Tonight's Picks", type: 'tonight' };
        if (path.indexOf('nightlife') > -1) return { page: 'Nightlife', type: 'nightlife' };
        if (path.indexOf('event') > -1) return { page: 'Events', type: 'events' };
        if (path.indexOf('explore') > -1) return { page: 'Explore', type: 'explore' };
        if (path.indexOf('social') > -1) return { page: 'Social', type: 'social' };
        if (path.indexOf('plan') > -1) return { page: 'Plan with Friends', type: 'planning' };
        if (path.indexOf('profile') > -1) return { page: 'Profile', type: 'profile' };
        return { page: 'Home', type: 'home' };
    }

    // Signature prompt chips shown everywhere
    var SIGNATURE_CHIPS = [
        'Plan my night', 'Dinner then drinks', 'Date night',
        'Late-night spots', 'Group plans', 'Upscale vibe',
        'Low-key drinks', 'Explore venues'
    ];
    function getQuickActions(ctx) {
        switch (ctx.type) {
            case 'nightlife': return ['Plan my night', 'Late-night spots', 'Rooftop bars', 'Upscale vibe'];
            case 'events':    return ['Explore venues', "What's tonight", 'This weekend', 'Live music'];
            case 'tonight':   return ['Plan my night', 'Dinner then drinks', 'Date night', 'Late-night spots'];
            case 'explore':   return ['Plan my night', 'Upscale vibe', 'Low-key drinks', 'Explore venues'];
            case 'social':    return ['Explore venues', 'Browse venues', 'Plan my night', 'Date night'];
            case 'planning':  return ['Plan my night', 'Group plans', 'Dinner then drinks', 'Date night'];
            case 'profile':   return SIGNATURE_CHIPS.slice(0, 4);
            default:          return SIGNATURE_CHIPS.slice(0, 4);
        }
    }

    function getGreeting() {
        var h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    }

    /* ═══════════════════════════════════════════════════════
       QUERY CLASSIFIER
       ═══════════════════════════════════════════════════════ */
    var NEIGHBORHOODS = [
        'north end','south end','back bay','seaport','cambridge','fort point','somerville',
        'downtown','beacon hill','allston','fenway','jamaica plain','chinatown','charlestown',
        'brookline','dorchester','east boston','west end','leather district','theater district',
        'financial district','brighton','roxbury','davis square','kendall square','harvard square'
    ];

    var CUISINE_MAP = {
        'italian': 'italian', 'pasta': 'italian', 'pizza': 'italian',
        'japanese': 'japanese', 'sushi': 'japanese', 'omakase': 'japanese', 'ramen': 'japanese',
        'seafood': 'seafood', 'oyster': 'seafood', 'lobster': 'seafood', 'fish': 'seafood',
        'spanish': 'spanish', 'tapas': 'spanish', 'paella': 'spanish',
        'mediterranean': 'mediterranean', 'meze': 'mediterranean', 'greek': 'mediterranean',
        'french': 'french', 'bistro': 'french',
        'mexican': 'mexican', 'tacos': 'mexican', 'margarita': 'mexican',
        'chinese': 'chinese', 'dim sum': 'chinese',
        'thai': 'thai', 'vietnamese': 'vietnamese', 'korean': 'korean',
        'indian': 'indian', 'curry': 'indian',
        'american': 'american', 'burger': 'burger', 'steak': 'steakhouse',
        'bbq': 'bbq', 'barbecue': 'bbq', 'brunch': 'brunch'
    };

    function classifyQuery(q) {
        q = (q || '').toLowerCase().trim();

        // Greetings — non-search
        if (/^(hi|hello|hey|howdy|yo|sup|what's up)\b/i.test(q)) return { type: 'greeting' };
        if (/^(thanks|thank you|thx|cheers|appreciate)\b/i.test(q)) return { type: 'thanks' };
        if (/^(bye|goodbye|see ya|later)\b/i.test(q)) return { type: 'bye' };
        if (/^(help|what can you do|how does this work)\b/i.test(q)) return { type: 'help' };

        // Time-based
        if (/\b(tonight|right now|open now|happening now|what's on|what is on)\b/i.test(q)) return { type: 'tonight' };
        if (/\b(tomorrow|weekend|this week|next week)\b/i.test(q)) return { type: 'events' };

        // Neighborhood detection
        for (var i = 0; i < NEIGHBORHOODS.length; i++) {
            if (q.indexOf(NEIGHBORHOODS[i]) > -1) {
                return { type: 'neighborhood', value: NEIGHBORHOODS[i] };
            }
        }

        // Category detection
        if (/\b(rooftop|terrace)\b/i.test(q)) return { type: 'search', value: 'rooftop', label: 'rooftop bars' };
        if (/\b(cocktail|speakeasy|mixology|martini)\b/i.test(q)) return { type: 'search', value: 'cocktail', label: 'cocktail spots' };
        if (/\b(nightclub|club|dancing|dance floor|dj)\b/i.test(q)) return { type: 'nightlife', label: 'nightclubs & dance spots' };
        if (/\b(live music|jazz|concert|band|music venue)\b/i.test(q)) return { type: 'search', value: 'live music', label: 'live music venues' };
        if (/\b(event|festival|show|happening)\b/i.test(q)) return { type: 'events' };

        // Vibe detection
        if (/\b(date|romantic|anniversary|intimate|special occasion)\b/i.test(q)) return { type: 'vibe', value: 'romantic', label: 'date night spots' };
        if (/\b(group|friends|birthday|party|large|celebration)\b/i.test(q)) return { type: 'vibe', value: 'lively', label: 'group-friendly spots' };
        if (/\b(cheap|budget|affordable|inexpensive)\b/i.test(q)) return { type: 'vibe', value: 'budget', label: 'budget-friendly spots' };
        if (/\b(fancy|upscale|high end|luxury|michelin)\b/i.test(q)) return { type: 'vibe', value: 'upscale', label: 'upscale fine dining' };
        if (/\b(casual|laid back|chill|relaxed)\b/i.test(q)) return { type: 'vibe', value: 'casual', label: 'casual spots' };
        if (/\b(happy hour|after work|drinks after)\b/i.test(q)) return { type: 'search', value: 'happy hour', label: 'happy hour spots' };
        if (/\b(outdoor|patio|al fresco|beer garden)\b/i.test(q)) return { type: 'search', value: 'outdoor', label: 'outdoor dining & patios' };

        // Cuisine detection
        for (var key in CUISINE_MAP) {
            if (q.indexOf(key) > -1) {
                return { type: 'cuisine', value: CUISINE_MAP[key], label: key + ' spots' };
            }
        }

        // Generic restaurant/bar
        if (/\b(restaurant|dinner|eat|food|hungry|dining)\b/i.test(q)) return { type: 'search', value: 'restaurant', label: 'restaurants' };
        if (/\b(bar|drink|drinks|pub|brewery)\b/i.test(q)) return { type: 'search', value: 'bar', label: 'bars' };

        // Fallback — free-text search
        if (q.length >= 3) return { type: 'search', value: q, label: 'matches' };
        return { type: 'unknown' };
    }

    /* ═══════════════════════════════════════════════════════
       CONVERSATION ENGINE
       ═══════════════════════════════════════════════════════ */
    // ═══════════════════════════════════════════════════════════════
    //  Backend-first generateResponse
    //  Tries POST /api/concierge (real intent + DB queries), falls back to
    //  the local client-side classifier if backend is unreachable.
    // ═══════════════════════════════════════════════════════════════
    var _conciergeSession = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    var _backendAvailable = null;
    var _convoHistory = []; // last few turns for multi-turn context

    function getAuthToken() {
        try {
            return (window.SLAuth && typeof SLAuth.getToken === 'function' && SLAuth.getToken()) ||
                   localStorage.getItem('sl_auth_token') ||
                   localStorage.getItem('sl_jwt_token') ||
                   null;
        } catch (_) { return null; }
    }

    async function generateResponse(query) {
        try {
            window.dispatchEvent(new CustomEvent('sl:concierge-ask', { detail: { query: query } }));
        } catch(_){}

        if (_backendAvailable !== false) {
            try {
                var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
                var tok = getAuthToken();
                if (tok) headers['Authorization'] = 'Bearer ' + tok;

                // Build pageContext from current page (no PII)
                var pageContext = { pageId: (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') };

                var res = await fetch(API_BASE + '/concierge', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        message: query,
                        session_id: _conciergeSession,
                        history: _convoHistory.slice(-6),
                        context: pageContext
                    })
                });
                if (res.status === 429) {
                    _backendAvailable = true;
                    var rd = await res.json().catch(function(){ return {}; });
                    return {
                        text: rd.reply || 'Whoa — slow down for a moment. Try again in a few seconds.',
                        plan: null, venueCards: [], quickReplies: [], requiresLogin: false, isLoggedIn: !!tok, notice: null
                    };
                }
                if (res.ok) {
                    _backendAvailable = true;
                    var data = await res.json();
                    if (data.ok) {
                        // Track conversation for context
                        _convoHistory.push({ role: 'user', content: query });
                        if (data.reply) _convoHistory.push({ role: 'assistant', content: data.reply });
                        if (_convoHistory.length > 10) _convoHistory = _convoHistory.slice(-10);

                        return {
                            text: data.reply || '',
                            plan: data.recommendedPlan || null,
                            venueCards: data.venueCards || [],
                            recommendedVenues: data.recommendedVenues || [],
                            recommendedEvents: data.recommendedEvents || [],
                            quickReplies: data.quickReplies || [],
                            notice: data.notice || null,
                            isLoggedIn: !!data.isLoggedIn,
                            requiresLogin: !!data.requiresLogin,
                            source: data.source,
                            intent: data.intent
                        };
                    }
                }
                if (res.status >= 400 && res.status < 500) {
                    var ed = await res.json().catch(function(){ return {}; });
                    return {
                        text: ed.error || 'That message didn\u2019t work — try rephrasing?',
                        plan: null, venueCards: [], quickReplies: [], requiresLogin: false, isLoggedIn: !!tok, notice: null
                    };
                }
                _backendAvailable = false;
            } catch (err) {
                console.warn('[concierge] backend unavailable, using client fallback:', err.message);
                _backendAvailable = false;
            }
        }

        // Last-resort client-side fallback (should rarely hit — backend has its own fallback)
        var cs = await generateResponseClientSide(query);
        return {
            text: cs.text,
            plan: null,
            venueCards: cs.venues || [],
            recommendedVenues: [],
            quickReplies: [],
            notice: null,
            isLoggedIn: !!getAuthToken(),
            requiresLogin: true,
            source: 'client-fallback'
        };
    }

    function buildFollowUp(intent, venues) {
        if (!intent || !venues || !venues.length) return '';
        if (intent.is_booking) return 'Tap the book button on any card to reserve. I can also plan a night with friends — just ask!';
        if (intent.cuisines && intent.cuisines.indexOf('italian') !== -1 && intent.neighborhoods && intent.neighborhoods.indexOf('north end') !== -1) {
            return 'Pro tip: pair dinner with cannoli from Mike\'s or Modern Pastry for the full North End experience.';
        }
        if (intent.vibes && intent.vibes.indexOf('romantic') !== -1) {
            return 'Follow dinner with cocktails at a speakeasy like Drink or Yvonne\'s for a perfect date night.';
        }
        if (intent.times && intent.times.indexOf('tonight') !== -1) {
            return 'Tap any venue to save it, or "Plan with friends" to vote together.';
        }
        return 'Want me to narrow by price, vibe, or time?';
    }

    async function generateResponseClientSide(query) {
        var c = classifyQuery(query);

        switch (c.type) {
            case 'greeting':
                return {
                    text: getGreeting() + "! I'm your SceneLink guide to Boston's best dining and nightlife. What are you in the mood for?",
                    quickActions: getQuickActions(getPageContext())
                };

            case 'thanks':
                return { text: "You're welcome — have a great night out! Let me know if you need anything else." };

            case 'bye':
                return { text: 'See you next time! Enjoy Boston. 🥂' };

            case 'help':
                return {
                    text: "I can help you find:<br>• <strong>Restaurants</strong> — by cuisine, vibe, or neighborhood<br>• <strong>Bars & Nightlife</strong> — cocktail bars, rooftops, clubs<br>• <strong>Events</strong> — what's on tonight or this week<br>• <strong>Plans</strong> — date night, group dinner, bar crawl ideas<br><br>Try asking: \"Italian in the North End\" or \"rooftop bars with views\".",
                    quickActions: ['Tonight', 'Date night', 'Rooftops', 'Happy hour']
                };

            case 'tonight': {
                var venues = await fetchTonight(4);
                if (!venues.length) venues = await fetchVenues({ limit: 4, sort: 'name' });
                return {
                    text: venues.length
                        ? "Directory suggestions to explore (alphabetical, not live popularity or verified availability):"
                        : "I couldn't load tonight's picks right now. Try again in a moment.",
                    venues: venues,
                    followUp: venues.length ? 'Tap any venue for details, or save your favorites to build a plan.' : ''
                };
            }

            case 'events': {
                var events = await fetchEvents(4);
                return {
                    text: events.length
                        ? "Here's what's coming up in Boston:"
                        : "I don't see upcoming events right now — try checking back later.",
                    events: events
                };
            }

            case 'neighborhood': {
                var nb = c.value;
                var venues = await fetchVenues({ neighborhood: nb, limit: 4 });
                if (!venues.length) venues = await searchVenues(nb, 4);
                var nbCap = nb.replace(/\b\w/g, function (x) { return x.toUpperCase(); });
                return {
                    text: venues.length
                        ? "Top picks in <strong>" + nbCap + "</strong>:"
                        : "I couldn't find anything in " + nbCap + " right now. Try another neighborhood?",
                    venues: venues,
                    followUp: venues.length ? 'Want me to narrow by vibe, cuisine, or price?' : ''
                };
            }

            case 'nightlife': {
                var venues = await fetchNightlife(4);
                return {
                    text: venues.length ? (c.label ? "Best " + c.label + " in Boston:" : "Boston's top nightlife picks:") : "I couldn't load nightlife right now.",
                    venues: venues
                };
            }

            case 'cuisine': {
                var venues = await searchVenues(c.value, 4);
                return {
                    text: venues.length
                        ? "Matching <strong>" + c.label + "</strong> in Boston:"
                        : "I couldn't find " + c.label + " right now — try a different cuisine?",
                    venues: venues
                };
            }

            case 'vibe': {
                var venues = await searchVenues(c.value, 4);
                return {
                    text: venues.length ? "Matching " + (c.label || 'picks') + ":" : "Nothing matches right now.",
                    venues: venues,
                    followUp: c.value === 'romantic' ? 'Pro tip: follow dinner with cocktails at a speakeasy like Drink or Yvonne\'s for the perfect night.' : ''
                };
            }

            case 'search': {
                var venues = await searchVenues(c.value, 4);
                return {
                    text: venues.length
                        ? "Here's what I found for <strong>" + c.value + "</strong>:"
                        : "I couldn't find \"" + c.value + "\" — try a different term?",
                    venues: venues
                };
            }

            default:
                return {
                    text: "I'd love to help! Try asking me about cuisines (\"Italian food\"), neighborhoods (\"South End\"), vibes (\"date night\"), or times (\"what's on tonight\").",
                    quickActions: ['Tonight', 'Date night', 'North End', 'Rooftops']
                };
        }
    }

    /* ═══════════════════════════════════════════════════════
       UI — CARDS
       ═══════════════════════════════════════════════════════ */
    function safeAttr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

    function venueCard(v) {
        var img = (window.SLVenueImages && SLVenueImages.pick(v)) ||
            v.cover_image_url || v.image_url ||
            (v.image_urls && v.image_urls[0]) ||
            '/assets/img/placeholder-venue.svg';
        var rating = v.metrics_status === 'verified' && v.rating ? parseFloat(v.rating).toFixed(1) : '';
        var price = v.price_level ? '$'.repeat(Math.max(1, Math.min(4, v.price_level))) : (v.price || '');
        var type = v.type || v.cuisine || 'Venue';
        var nbhd = v.neighborhood || '';
        var desc = v.short_desc || v.description || '';
        if (desc.length > 110) desc = desc.substring(0, 107) + '…';
        var venueId = v.id || '';
        var venueSlug = v.slug || venueId;

        // Booking remains on SceneLink; a provider URL is not a supported integration.
        var bookBtn = venueId ? '<button class="slc-btn-book" data-venue-id="' + safeAttr(venueId) + '" title="Check in-site booking capability">Booking status</button>' : '';

        return '<div class="slc-venue-card" data-venue-id="' + safeAttr(venueId) + '" data-venue-slug="' + safeAttr(venueSlug) + '">' +
            '<div class="slc-venue-img" style="background-image:url(\'' + img + '\')">' +
                (rating ? '<span class="slc-venue-rating"><i class="fas fa-star"></i> ' + rating + '</span>' : '') +
            '</div>' +
            '<div class="slc-venue-body">' +
                '<div class="slc-venue-name">' + safeAttr(v.name || 'Venue') + '</div>' +
                '<div class="slc-venue-meta">' + safeAttr(type) + (nbhd ? ' · ' + safeAttr(nbhd) : '') + (price ? ' · ' + price : '') + '</div>' +
                (desc ? '<div class="slc-venue-desc">' + safeAttr(desc) + '</div>' : '') +
                '<div class="slc-venue-actions">' +
                    '<button class="slc-btn-view" data-action="view">View</button>' +
                    bookBtn +
                    '<button class="slc-btn-icon" data-sl-action="save" data-sl-venue-id="' + safeAttr(venueId) + '" data-sl-venue-name="' + safeAttr(v.name) + '" data-sl-venue-type="' + safeAttr(type) + '" data-sl-venue-neighborhood="' + safeAttr(nbhd) + '" data-sl-venue-image="' + safeAttr(img) + '" aria-label="Save"><i class="far fa-heart"></i></button>' +
                    '<button class="slc-btn-icon" data-sl-action="plan" data-sl-venue-id="' + safeAttr(venueId) + '" data-sl-venue-name="' + safeAttr(v.name) + '" data-sl-venue-type="' + safeAttr(type) + '" data-sl-venue-neighborhood="' + safeAttr(nbhd) + '" data-sl-venue-image="' + safeAttr(img) + '" aria-label="Add to Plan"><i class="fas fa-plus"></i></button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function eventCard(e) {
        var img = e.image_url || e.cover_image_url || '/assets/img/placeholder-venue.svg';
        var d = e.start_date || e.event_date;
        var dateStr = '';
        if (d) {
            var dd = new Date(d);
            dateStr = dd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            var t = dd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            if (t && t !== '12:00 AM') dateStr += ' · ' + t;
        }
        return '<div class="slc-event-card">' +
            '<div class="slc-event-img" style="background-image:url(\'' + img + '\')"></div>' +
            '<div class="slc-event-body">' +
                '<div class="slc-event-title">' + safeAttr(e.title || e.name || 'Event') + '</div>' +
                '<div class="slc-event-meta">' + safeAttr(dateStr) + (e.venue_name ? ' · ' + safeAttr(e.venue_name) : '') + '</div>' +
                (e.short_description || e.description ? '<div class="slc-event-desc">' + safeAttr((e.short_description || e.description).substring(0, 100)) + '…</div>' : '') +
            '</div>' +
        '</div>';
    }

    /* ═══════════════════════════════════════════════════════
       BUILD UI
       ═══════════════════════════════════════════════════════ */
    function buildUI() {
        var fab = document.createElement('button');
        fab.className = 'sl-concierge-fab sl-concierge-fab-v5';
        fab.setAttribute('aria-label', 'Open AI Concierge');
        fab.innerHTML =
            '<div class="slc-fab-pulse"></div>' +
            '<svg viewBox="0 0 24 24" width="26" height="26" fill="#0a0a0a"><path d="M12 2l2.4 5.4L20 9l-4.5 4 1.5 6L12 16l-5 3 1.5-6L4 9l5.6-1.6L12 2z"/></svg>' +
            '<span class="slc-fab-tooltip">Ask AI</span>';

        var panel = document.createElement('div');
        panel.className = 'sl-concierge-panel sl-concierge-panel-v5';
        panel.innerHTML =
            '<div class="slc-header">' +
                '<div class="slc-header-left">' +
                    '<div class="slc-avatar">' +
                        '<svg viewBox="0 0 24 24" width="20" height="20" fill="#0a0a0a"><path d="M12 2l2.4 5.4L20 9l-4.5 4 1.5 6L12 16l-5 3 1.5-6L4 9l5.6-1.6L12 2z"/></svg>' +
                    '</div>' +
                    '<div>' +
                        '<div class="slc-title">SceneLink <span class="slc-badge">AI</span></div>' +
                        '<div class="slc-subtitle"><span class="slc-online-dot"></span> Online · Boston</div>' +
                    '</div>' +
                '</div>' +
                '<button class="slc-close" aria-label="Close">' +
                    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="slc-messages" id="slcMessages"></div>' +
            '<div class="slc-input-area">' +
                '<input type="text" class="slc-input" placeholder="Ask about Boston — ex: Italian in South End" />' +
                '<button class="slc-send" aria-label="Send">' +
                    '<svg viewBox="0 0 24 24" width="18" height="18" fill="#0a0a0a"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
                '</button>' +
            '</div>';

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        var messages = panel.querySelector('.slc-messages');
        var input = panel.querySelector('.slc-input');
        var send = panel.querySelector('.slc-send');
        var close = panel.querySelector('.slc-close');

        var state = { open: false, greeted: false };

        function addMessage(html, who) {
            var w = document.createElement('div');
            w.className = 'slc-msg slc-msg-' + who;
            if (who === 'bot') {
                w.innerHTML = '<div class="slc-msg-avatar"><svg viewBox="0 0 24 24" width="14" height="14" fill="#D4AF37"><path d="M12 2l2.4 5.4L20 9l-4.5 4 1.5 6L12 16l-5 3 1.5-6L4 9l5.6-1.6L12 2z"/></svg></div>' +
                    '<div class="slc-msg-bubble">' + html + '</div>';
            } else {
                w.innerHTML = '<div class="slc-msg-bubble">' + html + '</div>';
            }
            messages.appendChild(w);
            messages.scrollTop = messages.scrollHeight;
            return w;
        }

        function addTyping() {
            var w = document.createElement('div');
            w.className = 'slc-msg slc-msg-bot slc-typing';
            w.innerHTML = '<div class="slc-msg-avatar"><svg viewBox="0 0 24 24" width="14" height="14" fill="#D4AF37"><path d="M12 2l2.4 5.4L20 9l-4.5 4 1.5 6L12 16l-5 3 1.5-6L4 9l5.6-1.6L12 2z"/></svg></div>' +
                '<div class="slc-msg-bubble"><div class="slc-typing-dots"><span></span><span></span><span></span></div></div>';
            messages.appendChild(w);
            messages.scrollTop = messages.scrollHeight;
            return w;
        }

        function addQuickActions(actions) {
            if (!actions || !actions.length) return;
            var w = document.createElement('div');
            w.className = 'slc-quick-actions';
            actions.forEach(function (a) {
                var b = document.createElement('button');
                b.className = 'slc-chip';
                b.textContent = a;
                b.addEventListener('click', function () { handleMessage(a); });
                w.appendChild(b);
            });
            messages.appendChild(w);
            messages.scrollTop = messages.scrollHeight;
        }

        function addVenues(venues) {
            if (!venues || !venues.length) return;
            var w = document.createElement('div');
            w.className = 'slc-cards-stack';
            w.innerHTML = venues.map(venueCard).join('');
            messages.appendChild(w);
            messages.scrollTop = messages.scrollHeight;

            // Wire View buttons
            w.querySelectorAll('.slc-btn-view').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var card = btn.closest('.slc-venue-card');
                    var id = card.getAttribute('data-venue-id');
                    var slug = card.getAttribute('data-venue-slug');
                    if (window.SLVenueDetail && typeof SLVenueDetail.open === 'function' && (slug || id)) {
                        SLVenueDetail.open(slug || id);
                    } else if (id) {
                        window.location.href = 'explore.html?venue=' + id;
                    }
                });
            });
            // Booking status stays in SceneLink and never opens an external reservation site.
            w.querySelectorAll('.slc-btn-book').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var venueId = btn.getAttribute('data-venue-id') || '';
                    if (venueId && window.SLVenueDetail) window.SLVenueDetail.open(venueId);
                });
            });
            // Whole-card click
            w.querySelectorAll('.slc-venue-card').forEach(function (card) {
                card.addEventListener('click', function (e) {
                    if (e.target.closest('button')) return;
                    var id = card.getAttribute('data-venue-id');
                    var slug = card.getAttribute('data-venue-slug');
                    if (window.SLVenueDetail && typeof SLVenueDetail.open === 'function' && (slug || id)) {
                        SLVenueDetail.open(slug || id);
                    } else if (id) {
                        window.location.href = 'explore.html?venue=' + id;
                    }
                });
            });
        }

        function normalizeEventForDisplay(e) {
            if (!e) return e;
            return {
                id: e.id,
                title: e.title || e.name,
                description: e.description || e.short_description,
                short_description: e.description || e.short_description,
                image_url: e.imageUrl || e.image_url || e.cover_image_url,
                cover_image_url: e.imageUrl || e.image_url || e.cover_image_url,
                start_date: e.date || e.start_date || e.startDate,
                event_date: e.date || e.event_date,
                venue_name: e.venueName || e.venue_name,
                venue_slug: e.venueSlug || e.venue_slug,
                event_url: e.eventUrl || e.event_url,
                category: e.category
            };
        }
        function addEvents(events) {
            if (!events || !events.length) return;
            var w = document.createElement('div');
            w.className = 'slc-cards-stack';
            w.innerHTML = events.map(function(e){ return eventCard(normalizeEventForDisplay(e)); }).join('');
            messages.appendChild(w);
            messages.scrollTop = messages.scrollHeight;

            // Event cards stay in SceneLink. External source URLs are informational only.
            w.querySelectorAll('.slc-event-card').forEach(function(card){
                card.style.cursor = 'pointer';
                card.addEventListener('click', function(){ window.location.href = '/events'; });
            });
        }

        async function handleMessage(text) {
            text = (text || '').trim();
            if (!text) return;
            addMessage(text, 'user');
            input.value = '';

            // Intent shortcuts for signature chips
            var low = text.toLowerCase();
            if (/^plan my night$|^build my night$/i.test(text)) {
                return buildMyNightFlow();
            }
            if (/^dinner then drinks$/i.test(text)) {
                return handleItinerary('dinner-then-drinks');
            }

            var t = addTyping();
            try {
                var resp = await generateResponse(text);
                setTimeout(function () {
                    t.remove();
                    renderConciergeResponse(resp);
                }, 350 + Math.random() * 250);
            } catch (e) {
                t.remove();
                addMessage("Hmm, something went wrong. Try again?", 'bot');
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // RENDER the full structured response from POST /api/concierge
        // ─────────────────────────────────────────────────────────────────
        function renderConciergeResponse(resp) {
            if (!resp) { addMessage("Hmm, something went wrong. Try again?", 'bot'); return; }

            if (resp.notice) {
                addMessage('<span class="slc-notice"><i class="fas fa-info-circle"></i> ' + escHtmlC(resp.notice) + '</span>', 'bot');
            }

            if (resp.text) addMessage(escHtmlC(resp.text), 'bot');

            if (resp.plan && resp.plan.stops && resp.plan.stops.length) {
                addMessage(
                    '<div class="slc-plan-header">' +
                        '<div class="slc-plan-title"><i class="fas fa-route"></i> ' + escHtmlC(resp.plan.title || 'Your night') + '</div>' +
                        (resp.plan.summary ? '<div class="slc-plan-summary">' + escHtmlC(resp.plan.summary) + '</div>' : '') +
                    '</div>',
                    'bot'
                );
                resp.plan.stops.forEach(function (stop) {
                    var card = findCardInResp(resp.venueCards, stop.venueId);
                    if (!card) return;
                    addMessage(
                        '<div class="slc-stop-label">' +
                            '<span class="slc-stop-cat">' + escHtmlC(stop.category || 'Stop') + '</span>' +
                            (stop.bestTime ? '<span class="slc-stop-time">' + escHtmlC(stop.bestTime) + '</span>' : '') +
                        '</div>' +
                        (stop.whyItFits ? '<div class="slc-stop-why">' + escHtmlC(stop.whyItFits) + '</div>' : ''),
                        'bot'
                    );
                    addVenues([normalizeCardForDisplay(card)]);
                });
                addPlanCTAs(resp);
            }
            else if (resp.venueCards && resp.venueCards.length) {
                addVenues(resp.venueCards.map(normalizeCardForDisplay));
            }

            // Render related events (from backend recommendedEvents)
            if (resp.recommendedEvents && resp.recommendedEvents.length) {
                addMessage(
                    '<div class="slc-plan-header">' +
                        '<div class="slc-plan-title"><i class="fas fa-calendar-alt"></i> Related events</div>' +
                    '</div>',
                    'bot'
                );
                addEvents(resp.recommendedEvents);
            }

            var qr = (resp.quickReplies && resp.quickReplies.length) ? resp.quickReplies : SIGNATURE_CHIPS.slice(0, 4);
            addQuickActions(qr);
        }

        function findCardInResp(cards, id) {
            if (!cards || !id) return null;
            for (var i = 0; i < cards.length; i++) {
                if (String(cards[i].id) === String(id)) return cards[i];
            }
            return null;
        }

        function normalizeCardForDisplay(c) {
            if (!c) return c;
            return {
                id: c.id, slug: c.slug, name: c.name,
                type: c.type, cuisine: c.cuisine, neighborhood: c.neighborhood,
                rating: c.rating, price_level: c.priceLevel, price: c.priceLabel,
                short_desc: c.shortDesc, description: c.description,
                cover_image_url: c.coverImageUrl || c.imageUrl,
                image_url: c.imageUrl || c.coverImageUrl,
                image_urls: null,
                reservation_url: c.reservationUrl || c.opentableUrl || c.resyUrl,
                opentable_url: c.opentableUrl, resy_url: c.resyUrl, yelp_url: c.yelpUrl,
                google_maps_url: c.googleMapsUrl,
                vibe: c.vibe, highlight: c.highlight, why_hot: c.whyHot, pair_with: c.pairWith
            };
        }

        function escHtmlC(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/\'/g, '&#39;');
        }

        function addPlanCTAs(resp) {
            var w = document.createElement('div');
            w.className = 'slc-plan-ctas';
            w.innerHTML =
                '<button class="slc-btn-plan-save" data-action="save-plan"><i class="fas fa-bookmark"></i> Save this plan</button>' +
                '<button class="slc-btn-plan-invite" data-action="invite-friends"><i class="fas fa-user-friends"></i> Invite friends</button>' +
                '<button class="slc-btn-plan-share" data-action="share-plan"><i class="fas fa-share-alt"></i> Share</button>';
            messages.appendChild(w);
            messages.scrollTop = messages.scrollHeight;
            w.querySelector('[data-action="save-plan"]').addEventListener('click', function () { return handleSavePlanWithPicker(resp); });
            w.querySelector('[data-action="invite-friends"]').addEventListener('click', function () {
                if (!resp.isLoggedIn) return showLoginPromptMsg('invite friends and build your night');
                window.location.href = 'plan-with-friends.html';
            });
            w.querySelector('[data-action="share-plan"]').addEventListener('click', function () { return handleSharePlan(resp); });
        }

        async function handleSavePlanWithPicker(resp) {
            if (!resp.isLoggedIn) return showLoginPromptMsg('save this plan');
            try {
                var tok = getAuthToken();
                var listRes = await fetch(API_BASE + '/plans', {
                    headers: { 'Authorization': 'Bearer ' + tok }
                });
                var listData = listRes.ok ? await listRes.json() : { plans: [] };
                var plans = (listData && listData.plans) || [];
                if (plans.length === 0) { return handleSavePlan(resp); }
                showPlanPicker(resp, plans);
            } catch (_) { return handleSavePlan(resp); }
        }

        function showPlanPicker(resp, plans) {
            var existing = document.getElementById('slcPlanPicker');
            if (existing) existing.remove();
            var picker = document.createElement('div');
            picker.id = 'slcPlanPicker';
            picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
            var rows = plans.slice(0, 8).map(function (p) {
                return '<button class="slc-pp-row" data-pid="' + p.id + '" style="display:block;width:100%;text-align:left;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:12px 14px;border-radius:10px;margin-bottom:8px;cursor:pointer;">' +
                    '<strong style="display:block;">' + escHtmlC(p.name || 'Untitled') + '</strong>' +
                    (p.date ? '<small style="color:rgba(255,255,255,0.5);">' + escHtmlC(p.date) + '</small>' : '') +
                    '</button>';
            }).join('');
            picker.innerHTML =
                '<div style="background:#141414;border-radius:14px;max-width:440px;width:100%;padding:24px;border:1px solid rgba(212,175,55,0.25);">' +
                '<h3 style="color:#D4AF37;margin:0 0 14px;font-size:17px;">Add to which plan?</h3>' +
                '<p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 16px;">Choose an existing plan or create a new one.</p>' +
                rows +
                '<button class="slc-pp-new" style="display:block;width:100%;background:linear-gradient(135deg,#D4AF37,#b8860b);border:0;color:#000;padding:12px;border-radius:10px;font-weight:700;margin-top:8px;cursor:pointer;"><i class="fas fa-plus"></i> Create new plan</button>' +
                '<button class="slc-pp-cancel" style="display:block;width:100%;background:transparent;border:0;color:rgba(255,255,255,0.5);padding:10px;margin-top:4px;cursor:pointer;font-size:13px;">Cancel</button>' +
                '</div>';
            document.body.appendChild(picker);
            picker.querySelectorAll('.slc-pp-row').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var pid = this.dataset.pid;
                    picker.remove();
                    addStopsToPlan(resp, pid);
                });
            });
            picker.querySelector('.slc-pp-new').addEventListener('click', function () { picker.remove(); handleSavePlan(resp); });
            picker.querySelector('.slc-pp-cancel').addEventListener('click', function () { picker.remove(); });
            picker.addEventListener('click', function (e) { if (e.target === picker) picker.remove(); });
        }

        async function addStopsToPlan(resp, planId) {
            try {
                var tok = getAuthToken();
                var stops = (resp.plan && resp.plan.stops) || [];
                for (var i = 0; i < stops.length; i++) {
                    await fetch(API_BASE + '/plans/' + planId + '/venues', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
                        body: JSON.stringify({ venue_id: stops[i].venueId })
                    }).catch(function () {});
                }
                addMessage('<span class="slc-tip"><i class="fas fa-check-circle"></i> Added ' + stops.length + ' stop' + (stops.length === 1 ? '' : 's') + ' to your plan.</span>', 'bot');
            } catch (_) {
                addMessage('Couldn\u2019t add to that plan. Please try again.', 'bot');
            }
        }

        async function handleSavePlan(resp) {
            if (!resp.isLoggedIn) return showLoginPromptMsg('save this plan');
            try {
                var tok = getAuthToken();
                var planName = (resp.plan && resp.plan.title) ? resp.plan.title : 'SceneLink Night';
                var pr = await fetch(API_BASE + '/plans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
                    body: JSON.stringify({ name: planName })
                });
                if (!pr.ok) { addMessage('Couldn\u2019t save that plan \u2014 please try again.', 'bot'); return; }
                var pd = await pr.json();
                var planId = pd.plan && pd.plan.id;
                if (!planId) { addMessage('Couldn\u2019t save that plan \u2014 please try again.', 'bot'); return; }
                for (var i = 0; i < resp.plan.stops.length; i++) {
                    await fetch(API_BASE + '/plans/' + planId + '/venues', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
                        body: JSON.stringify({ venue_id: resp.plan.stops[i].venueId })
                    }).catch(function () {});
                }
                addMessage('<span class="slc-tip"><i class="fas fa-check-circle"></i> Saved \u201c' + escHtmlC(planName) + '\u201d to your plans.</span>', 'bot');
                if (window.SLNotifications && typeof SLNotifications.success === 'function') {
                    SLNotifications.success('Plan saved. View it on your Plans page.');
                }
            } catch (err) {
                addMessage('Something went wrong saving that plan.', 'bot');
            }
        }

        async function handleSharePlan(resp) {
            var title = (resp.plan && resp.plan.title) || 'My SceneLink Night';
            var lines = [title];
            if (resp.plan && resp.plan.stops) {
                resp.plan.stops.forEach(function (s) {
                    var c = findCardInResp(resp.venueCards, s.venueId);
                    if (c) lines.push('\u2022 ' + (s.category || 'Stop') + ': ' + c.name + ' (' + (c.neighborhood || 'Boston') + ')');
                });
            }
            var text = lines.join('\n') + '\n\nBuilt with SceneLink';
            try { if (navigator.share) { await navigator.share({ title: title, text: text }); return; } } catch (_) {}
            try {
                await navigator.clipboard.writeText(text);
                addMessage('<span class="slc-tip"><i class="fas fa-clipboard"></i> Itinerary copied to clipboard.</span>', 'bot');
            } catch (_) {
                addMessage('<span class="slc-tip">Share not supported on this device.</span>', 'bot');
            }
        }

        function showLoginPromptMsg(action) {
            var w = document.createElement('div');
            w.className = 'slc-msg slc-msg-bot';
            w.innerHTML =
                '<div class="slc-msg-avatar"><svg viewBox="0 0 24 24" width="14" height="14" fill="#D4AF37"><path d="M12 2l2.4 5.4L20 9l-4.5 4 1.5 6L12 16l-5 3 1.5-6L4 9l5.6-1.6L12 2z"/></svg></div>' +
                '<div class="slc-msg-bubble slc-login-prompt">' +
                    '<div class="slc-login-prompt-title">Log in to ' + escHtmlC(action || 'continue') + '</div>' +
                    '<div class="slc-login-prompt-sub">Sign in to save plans, invite friends, and build your night.</div>' +
                    '<div class="slc-login-prompt-actions">' +
                        '<a href="#" data-sl-auth-action="login" class="slc-login-prompt-btn">Log in</a>' +
                        '<a href="#" data-sl-auth-action="signup" class="slc-login-prompt-btn-outline">Sign up</a>' +
                    '</div>' +
                '</div>';
            messages.appendChild(w);
            messages.scrollTop = messages.scrollHeight;
        }

        /* ═══════════════════════════════════════════════════
           BUILD MY NIGHT — signature itinerary flow
           ═══════════════════════════════════════════════════ */
        var _bmnState = null;

        function buildMyNightFlow() {
            _bmnState = { step: 'vibe', vibe: null, hood: null, group: null };
            addMessage(
                '<strong>Let\'s build your perfect Boston night.</strong><br>First — what vibe are you going for?',
                'bot'
            );
            addChoiceChips([
                { label: '🕯️ Upscale & refined', value: 'upscale' },
                { label: '🎉 Lively & social', value: 'lively' },
                { label: '🍸 Low-key cocktails', value: 'lowkey' },
                { label: '🔥 Trendy & hot', value: 'trendy' },
                { label: '🎶 Live music', value: 'live' }
            ], function (v, label) {
                _bmnState.vibe = v;
                addMessage(label, 'user');
                addMessage('Which neighborhood?', 'bot');
                addChoiceChips([
                    { label: 'North End', value: 'North End' },
                    { label: 'Back Bay', value: 'Back Bay' },
                    { label: 'Seaport', value: 'Seaport' },
                    { label: 'South End', value: 'South End' },
                    { label: 'Cambridge', value: 'Cambridge' },
                    { label: 'Anywhere good', value: '' }
                ], function (v2, label2) {
                    _bmnState.hood = v2;
                    addMessage(label2, 'user');
                    addMessage('Who\'s coming with you?', 'bot');
                    addChoiceChips([
                        { label: '💕 Date night (2)', value: 'date' },
                        { label: '👯 Small group (3-4)', value: 'small' },
                        { label: '🎊 Big group (5+)', value: 'big' },
                        { label: '🙋 Solo', value: 'solo' }
                    ], function (v3, label3) {
                        _bmnState.group = v3;
                        addMessage(label3, 'user');
                        generateItinerary();
                    });
                });
            });
        }

        async function generateItinerary() {
            var t = addTyping();
            var vibe = _bmnState.vibe || '';
            var hood = _bmnState.hood || '';
            var group = _bmnState.group || '';

            // Build 3 queries for dinner / drinks / late-night
            var q1 = (vibe === 'upscale' ? 'upscale' : 'great') + ' dinner' + (hood ? ' in ' + hood : '');
            var q2 = (vibe === 'lowkey' ? 'cozy' : 'great') + ' cocktail bar' + (hood ? ' in ' + hood : '');
            var q3 = (vibe === 'live' ? 'live music' : 'late night') + (hood ? ' in ' + hood : '');
            try {
                var r1 = await generateResponse(q1);
                var r2 = await generateResponse(q2);
                var r3 = await generateResponse(q3);
                setTimeout(function () {
                    t.remove();
                    var title = 'Your itinerary';
                    if (hood) title += ' in ' + hood;
                    addMessage('<strong>🌙 ' + title + '</strong>', 'bot');
                    addItineraryStop('1. Dinner', r1.venues && r1.venues[0]);
                    addItineraryStop('2. Drinks', r2.venues && r2.venues[0]);
                    addItineraryStop('3. Late night', r3.venues && r3.venues[0]);
                    addMessage('<span class="slc-tip">💡 Tap <strong>Add to Plan</strong> on each stop to save this as your night plan — or ask me to swap any of them.</span>', 'bot');
                    addQuickActions(['Swap dinner', 'Swap drinks', 'Different neighborhood', 'Start over']);
                }, 450);
            } catch (e) {
                t.remove();
                addMessage('Hmm — couldn\'t build that itinerary. Try again?', 'bot');
            }
        }

        function addItineraryStop(label, venue) {
            if (!venue) {
                addMessage('<div class="slc-stop-label">' + label + '</div><div class="slc-msg-empty">No match found — try a different vibe/neighborhood.</div>', 'bot');
                return;
            }
            addMessage('<div class="slc-stop-label">' + label + '</div>', 'bot');
            addVenues([venue]);
        }

        function handleItinerary(kind) {
            if (kind === 'dinner-then-drinks') {
                _bmnState = { vibe: null, hood: null, group: null };
                return generateItinerary();
            }
        }

        function addChoiceChips(choices, onPick) {
            var wrap = document.createElement('div');
            wrap.className = 'slc-quick-actions slc-choice-chips';
            choices.forEach(function (c) {
                var b = document.createElement('button');
                b.className = 'slc-quick-btn';
                b.textContent = c.label;
                b.addEventListener('click', function () {
                    // Disable the chip group after selection
                    wrap.querySelectorAll('button').forEach(function(x){x.disabled = true; x.style.opacity = '0.5';});
                    onPick(c.value, c.label);
                });
                wrap.appendChild(b);
            });
            messages.appendChild(wrap);
            messages.scrollTop = messages.scrollHeight;
        }

        function welcome() {
            if (state.greeted) return;
            state.greeted = true;
            var ctx = getPageContext();
            addMessage(
                '<div class="slc-ctx-badge"><i class="fas fa-location-dot"></i> ' + ctx.page + '</div>' +
                '<strong>Ask SceneLink Concierge</strong><br>' +
                getGreeting() + '! I can help you explore venues listed on SceneLink. Tell me what you\'re in the mood for, and I\'ll help you plan your night.',
                'bot'
            );
            var fallback = getQuickActions(ctx);
            addQuickActions(fallback);
            // Try backend suggestions (time-of-day aware)
            try {
                fetch(API_BASE + '/concierge/suggestions').then(function(r){return r.ok?r.json():null;}).then(function(d){
                    if (d && d.suggestions && d.suggestions.length) {
                        var host = body.querySelector('.slc-quick-actions:last-child');
                        if (host) host.remove();
                        addQuickActions(d.suggestions);
                    }
                }).catch(function(){});
            } catch(_){}
        }

        function openPanel() {
            if (state.open) return;               // idempotent
            state.open = true;
            // Ensure fab visible + clickable (in case any stray style hid it)
            fab.style.display = '';
            fab.style.pointerEvents = 'auto';
            fab.style.opacity = '';
            panel.style.display = '';
            panel.classList.add('slc-panel-visible');
            fab.classList.add('slc-fab-open');
            document.body.classList.add('slc-open');
            welcome();
            setTimeout(function () { try { input.focus(); } catch(_){} }, 300);
            try { window.dispatchEvent(new CustomEvent('sl:concierge-opened')); } catch(_){}
        }

        function closePanel() {
            if (!state.open) return;              // idempotent
            state.open = false;
            panel.classList.remove('slc-panel-visible');
            fab.classList.remove('slc-fab-open');
            document.body.classList.remove('slc-open');
            // Force-clear any inline style leftover so fab is clickable next time
            fab.style.pointerEvents = 'auto';
            fab.style.display = '';
            try { window.dispatchEvent(new CustomEvent('sl:concierge-closed')); } catch(_){}
        }

        function togglePanel() {
            if (state.open) closePanel(); else openPanel();
        }

        // Click handlers — stop propagation so outside-click doesn't immediately re-close
        fab.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            togglePanel();
        });
        close.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            closePanel();
        });
        panel.addEventListener('click', function (e) { e.stopPropagation(); });

        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && state.open) closePanel();
        });
        // Outside click to close
        document.addEventListener('click', function (e) {
            if (!state.open) return;
            if (panel.contains(e.target) || fab.contains(e.target)) return;
            // Don't close when clicking the nav "Ask AI" link
            if (e.target.closest && e.target.closest('[data-ai-concierge-nav]')) return;
            closePanel();
        });
        send.addEventListener('click', function () { handleMessage(input.value); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); handleMessage(input.value); }
        });

        // Expose
        window.SLConcierge = {
            open: openPanel,
            close: closePanel,
            ask: function (q) { openPanel(); setTimeout(function () { handleMessage(q); }, 300); }
        };

        // Global delegated click handler — works regardless of inline onclick failures
        document.addEventListener('click', function(e) {
            var trigger = e.target.closest(
                '[data-sl-concierge], [data-ask-concierge], .tv2-ask-ai-btn, ' +
                '.sl-concierge-trigger, [data-concierge-ask], .ask-concierge-btn'
            );
            if (!trigger) return;
            e.preventDefault();
            e.stopPropagation();
            var q = trigger.getAttribute('data-sl-concierge') ||
                    trigger.getAttribute('data-ask-concierge') ||
                    trigger.getAttribute('data-concierge-ask') ||
                    trigger.getAttribute('data-ask') ||
                    '';
            if (q && q.length > 1) {
                window.SLConcierge.ask(q);
            } else {
                window.SLConcierge.open();
            }
        }, true); // capture phase to run before any other handler

        // ?ask= URL param support (deep link from anywhere)
        try {
            var params = new URLSearchParams(window.location.search);
            var askParam = params.get('ask');
            if (askParam && askParam.length > 1) {
                setTimeout(function () { window.SLConcierge.ask(askParam); }, 800);
            }
        } catch (_) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildUI);
    } else {
        buildUI();
    }
})();