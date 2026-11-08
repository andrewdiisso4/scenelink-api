/**
 * SceneLink — AI Concierge Real-Data Enhancer
 * Augments the existing rule-based concierge with live venue data from /api/venues/search.
 * - Intercepts fallback/unknown queries and runs live search
 * - Adds quick chips that produce real results
 * - Gracefully falls back to static responses
 */
(function () {
  'use strict';

  var API_BASE = (window.SLConfig && (window.SLConfig.API_BASE_URL || window.SLConfig.API_URL)) || '/api';

  function waitForConcierge(cb, tries) {
    tries = tries || 0;
    var fab = document.querySelector('.sl-fab, #aiConciergeFab');
    var panel = document.querySelector('.sl-panel, #aiConciergePanel, [class*="concierge-panel"]');
    var messages = document.querySelector('.sl-messages, #aiConciergeMessages');
    if (fab && messages) return cb({ fab: fab, panel: panel, messages: messages });
    if (tries > 60) return;
    setTimeout(function () { waitForConcierge(cb, tries + 1); }, 200);
  }

  // ──────────────────────────────────────────────────────────
  // Live API call: /api/venues/search?q=...
  // ──────────────────────────────────────────────────────────
  async function searchVenues(query, opts) {
    opts = opts || {};
    var limit = opts.limit || 4;
    try {
      var url = API_BASE + '/venues/search?q=' + encodeURIComponent(query) + '&limit=' + limit;
      var res = await fetch(url);
      if (!res.ok) return [];
      var data = await res.json();
      var venues = Array.isArray(data) ? data : (data.venues || data.results || data.data || []);
      return venues.slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  async function fetchByNeighborhood(nbhd, limit) {
    limit = limit || 4;
    try {
      var url = API_BASE + '/venues?neighborhood=' + encodeURIComponent(nbhd) + '&limit=' + limit;
      var res = await fetch(url);
      if (!res.ok) return [];
      var data = await res.json();
      return (Array.isArray(data) ? data : (data.venues || [])).slice(0, limit);
    } catch (e) { return []; }
  }

  async function fetchTonight(limit) {
    limit = limit || 4;
    try {
      var url = API_BASE + '/venues/tonight?limit=' + limit;
      var res = await fetch(url);
      if (!res.ok) return [];
      var data = await res.json();
      return (Array.isArray(data) ? data : (data.venues || [])).slice(0, limit);
    } catch (e) { return []; }
  }

  // ──────────────────────────────────────────────────────────
  // Render helpers — reuse concierge's styling if available
  // ──────────────────────────────────────────────────────────
  function addBotMessage(text) {
    var messages = document.querySelector('.sl-messages, #aiConciergeMessages');
    if (!messages) return;
    var w = document.createElement('div');
    w.className = 'sl-msg sl-msg-bot';
    w.innerHTML = '<div class="sl-msg-bubble">' + text + '</div>';
    messages.appendChild(w);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderLiveVenueCard(v) {
    var img = v.cover_image_url || v.image_url ||
      (v.image_urls && v.image_urls[0]) ||
      '/assets/img/placeholder-venue.svg';
    var rating = v.rating ? parseFloat(v.rating).toFixed(1) : '';
    var price = v.price_level ? '$'.repeat(Math.max(1, Math.min(4, v.price_level))) : (v.price || '');
    var type = v.type || v.cuisine || 'Venue';
    var nbhd = v.neighborhood || v.city || '';
    var desc = v.short_desc || v.description || '';
    if (desc.length > 120) desc = desc.substring(0, 117) + '…';

    return '<div class="sl-venue-card sl-live-card" style="margin-top:8px;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,rgba(212,175,55,0.08),rgba(0,0,0,0.4));border:1px solid rgba(212,175,55,0.25);">' +
      '<div style="position:relative;height:120px;background:url(\'' + img + '\') center/cover;">' +
        (rating ? '<div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.85);color:#D4AF37;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;"><i class="fas fa-star" style="font-size:9px;margin-right:3px"></i>' + rating + '</div>' : '') +
      '</div>' +
      '<div style="padding:12px 14px;">' +
        '<div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:4px;">' + (v.name || 'Venue') + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:6px;">' + type + (nbhd ? ' • ' + nbhd : '') + (price ? ' • ' + price : '') + '</div>' +
        (desc ? '<div style="font-size:12px;color:rgba(255,255,255,0.75);line-height:1.4;margin-bottom:8px;">' + desc + '</div>' : '') +
        '<div style="display:flex;gap:6px;">' +
          '<button class="sl-ai-venue-view" data-venue-id="' + (v.id || '') + '" style="flex:1;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:none;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">View Details</button>' +
          '<button class="sl-ai-venue-save" data-sl-action="save" data-sl-venue-id="' + (v.id || '') + '" data-sl-venue-name="' + (v.name || '').replace(/"/g, '&quot;') + '" data-sl-venue-type="' + (type || '').replace(/"/g, '&quot;') + '" data-sl-venue-neighborhood="' + (nbhd || '').replace(/"/g, '&quot;') + '" data-sl-venue-image="' + img + '" style="background:rgba(212,175,55,0.1);color:#D4AF37;border:1px solid rgba(212,175,55,0.4);padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;"><i class="far fa-heart"></i></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function addLiveVenueCards(venues) {
    if (!venues || !venues.length) return;
    var messages = document.querySelector('.sl-messages, #aiConciergeMessages');
    if (!messages) return;
    venues.forEach(function (v) {
      var w = document.createElement('div');
      w.className = 'sl-msg sl-msg-bot';
      w.innerHTML = renderLiveVenueCard(v);
      messages.appendChild(w);
    });
    messages.scrollTop = messages.scrollHeight;

    // Wire up view-detail buttons
    messages.querySelectorAll('.sl-ai-venue-view:not([data-wired])').forEach(function (btn) {
      btn.setAttribute('data-wired', '1');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var vid = btn.getAttribute('data-venue-id');
        if (vid && window.SLVenueDetail && typeof SLVenueDetail.openById === 'function') {
          SLVenueDetail.openById(vid);
        } else if (vid) {
          window.location.href = 'explore.html?venue=' + vid;
        }
      });
    });
  }

  // ──────────────────────────────────────────────────────────
  // Query interceptor — intercepts obvious "real-search" queries
  // ──────────────────────────────────────────────────────────
  function detectLiveQuery(q) {
    q = (q || '').toLowerCase().trim();

    // "near" or "in <neighborhood>"
    var nbhds = ['back bay', 'south end', 'north end', 'seaport', 'cambridge', 'fort point', 'somerville',
                 'downtown', 'beacon hill', 'allston', 'fenway', 'jamaica plain', 'chinatown', 'charlestown',
                 'brookline', 'dorchester', 'east boston', 'west end', 'leather district'];
    for (var i = 0; i < nbhds.length; i++) {
      if (q.indexOf(nbhds[i]) > -1) {
        return { kind: 'neighborhood', value: nbhds[i] };
      }
    }

    // Tonight / now / open
    if (/\b(tonight|right now|open now|happening now|what's on)\b/i.test(q)) {
      return { kind: 'tonight' };
    }

    // Generic venue search
    if (q.length >= 4) {
      return { kind: 'search', value: q };
    }

    return null;
  }

  // ──────────────────────────────────────────────────────────
  // Hook: monkey-patch handleUserMessage's typing flow
  // by observing DOM mutations for user messages
  // ──────────────────────────────────────────────────────────
  function installHook(ctx) {
    var messages = ctx.messages;
    var lastHandled = null;

    var observer = new MutationObserver(async function (mutList) {
      for (var i = 0; i < mutList.length; i++) {
        var m = mutList[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var node = m.addedNodes[j];
          if (!node || node.nodeType !== 1) continue;
          // User message?
          if (node.classList && node.classList.contains('sl-msg-user')) {
            var bubble = node.querySelector('.sl-msg-bubble');
            if (!bubble) continue;
            var text = (bubble.textContent || '').trim();
            if (!text || text === lastHandled) continue;
            lastHandled = text;

            // Wait briefly to let static response render first
            setTimeout(async function (userText) {
              return async function () {
                var live = detectLiveQuery(userText);
                if (!live) return;

                var venues = [];
                if (live.kind === 'neighborhood') {
                  venues = await fetchByNeighborhood(live.value, 3);
                } else if (live.kind === 'tonight') {
                  venues = await fetchTonight(4);
                } else if (live.kind === 'search') {
                  venues = await searchVenues(live.value, 3);
                }

                if (venues && venues.length) {
                  addBotMessage('Here are some live picks from our database that might fit:');
                  addLiveVenueCards(venues);
                }
              };
            }(text)(), 1400);
          }
        }
      }
    });

    observer.observe(messages, { childList: true });
  }

  waitForConcierge(installHook);
})();