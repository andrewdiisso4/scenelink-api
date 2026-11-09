/**
 * SceneLink — Unified User State
 *
 * SINGLE source of truth for: favorites, lists, plans (itinerary), check-ins.
 *
 * Account API responses hydrate tab-only memory. Browser-only legacy data is never
 * silently imported into another account or used as proof that a save succeeded.
 * Exposes window.SLState and emits sl-state-change for legacy renderers.
 */
(function () {
  'use strict';

  var KEYS = {
    favorites:  'sl_favorites_v3',     // Array of venue objects
    lists:      'sl_lists_v3',         // Array of list objects {id, name, description, venues[]}
    plan:       'sl_active_plan_v3',   // Current itinerary {id, name, date, venues[]}
    checkins:   'sl_checkins_v3',      // Array of {venueId, when}
    lastSync:   'sl_state_last_sync'
  };

  // Account-scoped tab memory only. Existing browser-only keys are left untouched
  // and are never silently imported into a signed-in account.
  var memory={}, memorySession=currentSession(), hydrationSerial=0;
  function currentSession(){try{return localStorage.getItem('sl_jwt_token')||'';}catch(_){return '';}}
  function isAccountKey(k){return Object.keys(KEYS).some(function(name){return KEYS[name]===k;});}

  // Legacy keys to migrate from (in priority order — first found wins)
  var LEGACY_FAV_KEYS = ['sl_saved_venues', 'tp-saved-v2', 'sl_favorites'];
  var LEGACY_LISTS_KEYS = ['sl_lists', 'sl_user_lists'];
  var LEGACY_PLAN_KEYS = ['tp-plan-v2', 'sl_plan', 'sl_itinerary'];

  function safeGet(k, fallback) {
    if(isAccountKey(k))return memorySession===currentSession()&&Object.prototype.hasOwnProperty.call(memory,k)?memory[k]:fallback;
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch (_) { return fallback; }
  }
  function safeSet(k, v) {
    if(isAccountKey(k)){if(memorySession!==currentSession())return false;memory[k]=v;return true;}
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (_) { return false; }
  }
  function safeDel(k) { try { localStorage.removeItem(k); } catch (_) {} }

  function nowIso() { return new Date().toISOString(); }

  function venueShape(v) {
    if (!v) return null;
    return {
      id:           v.id || v.venue_id,
      slug:         v.slug || v.venue_slug || null,
      name:         v.name || v.venue_name || 'Unknown',
      type:         v.type || v.venue_type || v.category || '',
      image:        v.image || v.image_url || v.venue_image || v.img || '',
      rating:       parseFloat(v.rating || v.venue_rating || 0) || 0,
      neighborhood: v.neighborhood || v.venue_neighborhood || '',
      price:        v.price_label || v.price || v.venue_price || '',
      addedAt:      v.addedAt || v.created_at || nowIso()
    };
  }

  // ---- Migration: merge any legacy keys into new canonical keys (one-time) ----
  function migrate() {
    // Favorites
    if (!safeGet(KEYS.favorites, null)) {
      var merged = [];
      var seenIds = {};
      LEGACY_FAV_KEYS.forEach(function (k) {
        var v = safeGet(k, null);
        if (!v) return;
        var items = [];
        if (Array.isArray(v)) items = v;
        else if (typeof v === 'object') items = Object.values(v);
        items.forEach(function (item) {
          var shaped = venueShape(item);
          if (shaped && shaped.id && !seenIds[shaped.id]) {
            seenIds[shaped.id] = true;
            merged.push(shaped);
          }
        });
      });
      safeSet(KEYS.favorites, merged);
    }

    // Lists
    if (!safeGet(KEYS.lists, null)) {
      var lists = [];
      LEGACY_LISTS_KEYS.forEach(function (k) {
        var v = safeGet(k, null);
        if (!v) return;
        var items = Array.isArray(v) ? v : Object.values(v);
        items.forEach(function (l) {
          if (!l || !l.name) return;
          lists.push({
            id: l.id || ('list-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
            name: l.name,
            description: l.description || '',
            venues: Array.isArray(l.venues) ? l.venues.map(venueShape).filter(Boolean) : [],
            createdAt: l.createdAt || l.created_at || nowIso()
          });
        });
      });
      safeSet(KEYS.lists, lists);
    }

    // Plan (itinerary)
    if (!safeGet(KEYS.plan, null)) {
      for (var i = 0; i < LEGACY_PLAN_KEYS.length; i++) {
        var k = LEGACY_PLAN_KEYS[i];
        var v = safeGet(k, null);
        if (v) {
          var items;
          if (Array.isArray(v)) items = v.map(venueShape).filter(Boolean);
          else if (v.venues) items = v.venues.map(venueShape).filter(Boolean);
          else items = [];
          safeSet(KEYS.plan, {
            id: 'local-plan',
            name: (v && v.name) || 'My Plan Tonight',
            date: (v && v.date) || null,
            venues: items,
            createdAt: nowIso()
          });
          break;
        }
      }
      if (!safeGet(KEYS.plan, null)) {
        safeSet(KEYS.plan, { id: 'local-plan', name: 'My Plan Tonight', date: null, venues: [], createdAt: nowIso() });
      }
    }
  }

  // Legacy local data is not authoritative account state; no automatic migration.

  // ---- Emit state change events ----
  function emit(kind, detail) {
    detail = Object.assign({ kind: kind }, detail || {});
    try {
      window.dispatchEvent(new CustomEvent('sl-state-change', { detail: detail }));
      document.dispatchEvent(new CustomEvent('sl-state-change', { detail: detail }));
    } catch (_) {}
  }

  // =====================================================================
  // FAVORITES
  // =====================================================================
  var favApiInFlight = null;

  function getFavorites() {
    return safeGet(KEYS.favorites, []) || [];
  }

  function isFavorite(venueId) {
    if (!venueId) return false;
    return getFavorites().some(function (v) { return v.id === venueId; });
  }

  function addFavorite(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    var favs = getFavorites();
    if (favs.some(function (v) { return v.id === shaped.id; })) return false;
    favs.unshift(shaped);
    safeSet(KEYS.favorites, favs);
    emit('favorites', { action: 'add', venue: shaped });
    syncFavoriteToApi(shaped.id, true);
    return true;
  }

  function removeFavorite(venueId) {
    if (!venueId) return false;
    var favs = getFavorites();
    var filtered = favs.filter(function (v) { return v.id !== venueId; });
    if (filtered.length === favs.length) return false;
    safeSet(KEYS.favorites, filtered);
    emit('favorites', { action: 'remove', venueId: venueId });
    syncFavoriteToApi(venueId, false);
    return true;
  }

  function toggleFavorite(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    if (isFavorite(shaped.id)) {
      removeFavorite(shaped.id);
      return false;
    } else {
      addFavorite(shaped);
      return true;
    }
  }

  function syncFavoriteToApi(venueId, expectFavorited) {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return;
    // Only valid UUIDs can round-trip through Postgres
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(String(venueId))) return;
    if(window.SLVenueActions&&window.SLVenueActions.setFavorite){
      window.SLVenueActions.setFavorite(venueId,expectFavorited).then(function(){hydrateFromServer();}).catch(function(){});
    } else if(window.SLConnected){
      window.SLConnected.request('/favorites/'+encodeURIComponent(venueId),{method:expectFavorited?'POST':'DELETE'}).then(function(){hydrateFromServer();}).catch(function(){});
    }
  }

  // =====================================================================
  // LISTS
  // =====================================================================

  function getLists() {
    return safeGet(KEYS.lists, []) || [];
  }

  function createList(name, description) {
    if (!name) return null;
    var lists = getLists();
    var newList = {
      id: 'list-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: String(name).trim(),
      description: description || '',
      venues: [],
      createdAt: nowIso()
    };
    lists.unshift(newList);
    safeSet(KEYS.lists, lists);
    emit('lists', { action: 'create', list: newList });

    // Sync to API
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      SLApi.createList(newList.name, newList.description)
        .then(function (r) {
          if (r && r.list && r.list.id) {
            // Replace local id with server id
            var all = getLists();
            var idx = all.findIndex(function (l) { return l.id === newList.id; });
            if (idx >= 0) {
              all[idx].id = r.list.id;
              safeSet(KEYS.lists, all);
              emit('lists', { action: 'sync' });
            }
          }
        }).catch(function () {});
    }
    return newList;
  }

  function deleteList(listId) {
    var lists = getLists();
    var filtered = lists.filter(function (l) { return l.id !== listId; });
    if (filtered.length === lists.length) return false;
    safeSet(KEYS.lists, filtered);
    emit('lists', { action: 'delete', listId: listId });
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      SLApi.deleteList(listId).catch(function () {});
    }
    return true;
  }

  function addVenueToList(listId, venue) {
    var shaped = venueShape(venue);
    if (!shaped) return false;
    var lists = getLists();
    var list = lists.find(function (l) { return l.id === listId; });
    if (!list) return false;
    if (list.venues.some(function (v) { return v.id === shaped.id; })) return false;
    list.venues.unshift(shaped);
    safeSet(KEYS.lists, lists);
    emit('lists', { action: 'add-venue', listId: listId, venue: shaped });
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      SLApi.addToList(listId, shaped.id).catch(function () {});
    }
    return true;
  }

  function removeVenueFromList(listId, venueId) {
    var lists = getLists();
    var list = lists.find(function (l) { return l.id === listId; });
    if (!list) return false;
    var before = list.venues.length;
    list.venues = list.venues.filter(function (v) { return v.id !== venueId; });
    if (list.venues.length === before) return false;
    safeSet(KEYS.lists, lists);
    emit('lists', { action: 'remove-venue', listId: listId, venueId: venueId });
    return true;
  }

  // =====================================================================
  // PLAN (ITINERARY) — single active plan, user can replace/extend
  // =====================================================================

  function getActivePlan() {
    return safeGet(KEYS.plan, { id: 'local-plan', name: 'My Plan Tonight', date: null, venues: [] });
  }

  function setActivePlan(plan) {
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'set', plan: plan });
  }

  function isInPlan(venueId) {
    if (!venueId) return false;
    return getActivePlan().venues.some(function (v) { return v.id === venueId; });
  }

  function addToPlan(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    var plan = getActivePlan();
    if (plan.venues.some(function (v) { return v.id === shaped.id; })) return false;
    plan.venues.push(shaped);
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'add', venue: shaped });

    // Sync to API — ensure a server plan exists first
    syncPlanEnsure().then(function (serverPlanId) {
      if (serverPlanId && window.SLApi) {
        SLApi.addToPlan(serverPlanId, shaped.id).catch(function () {});
      }
    });
    return true;
  }

  function removeFromPlan(venueId) {
    var plan = getActivePlan();
    var before = plan.venues.length;
    plan.venues = plan.venues.filter(function (v) { return v.id !== venueId; });
    if (plan.venues.length === before) return false;
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'remove', venueId: venueId });
    return true;
  }

  function togglePlan(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    if (isInPlan(shaped.id)) {
      removeFromPlan(shaped.id);
      return false;
    } else {
      addToPlan(shaped);
      return true;
    }
  }

  function reorderPlan(newVenueIds) {
    var plan = getActivePlan();
    var byId = {};
    plan.venues.forEach(function (v) { byId[v.id] = v; });
    plan.venues = newVenueIds.map(function (id) { return byId[id]; }).filter(Boolean);
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'reorder' });
  }

  function clearPlan() {
    var plan = getActivePlan();
    plan.venues = [];
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'clear' });
  }

  function renamePlan(name) {
    var plan = getActivePlan();
    plan.name = name || 'My Plan Tonight';
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'rename' });
  }

  // Ensure server-side plan exists; return its id
  var planEnsurePromise = null;
  function syncPlanEnsure() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return Promise.resolve(null);
    var plan = getActivePlan();
    if (plan.serverId) return Promise.resolve(plan.serverId);
    if (planEnsurePromise) return planEnsurePromise;
    planEnsurePromise = SLApi.plans()
      .then(function (r) {
        var plans = (r && r.plans) || [];
        // Find a plan with matching name + today's date, or create one
        var today = new Date().toISOString().slice(0, 10);
        var match = plans.find(function (p) {
          return p.name === plan.name || (p.date && String(p.date).startsWith(today));
        });
        if (match) return match.id;
        return SLApi.createPlan(plan.name, today).then(function (cr) {
          return cr && cr.plan && cr.plan.id;
        });
      })
      .then(function (serverId) {
        if (serverId) {
          var p = getActivePlan();
          p.serverId = serverId;
          safeSet(KEYS.plan, p);
        }
        planEnsurePromise = null;
        return serverId;
      })
      .catch(function () { planEnsurePromise = null; return null; });
    return planEnsurePromise;
  }

  // =====================================================================
  // HYDRATE FROM SERVER on login (merges server data into local state)
  // =====================================================================

  function hydrateFromServer() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return Promise.resolve();

    var jobs = [],captured=currentSession(),serial=++hydrationSerial;

    // Favorites
    jobs.push(SLApi.favorites().then(function (r) {
      var serverFavs = ((r && r.favorites) || []).map(function (f) {
        return venueShape({
          id: f.venue_id,
          slug: f.venue_slug,
          name: f.venue_name,
          type: f.venue_type,
          image: f.venue_image,
          rating: f.venue_rating,
          neighborhood: f.venue_neighborhood,
          price: f.venue_price,
          addedAt: f.created_at
        });
      }).filter(Boolean);

      if(serial!==hydrationSerial || captured!==currentSession())return;
      safeSet(KEYS.favorites, serverFavs);
    }).catch(function () {}));

    // Lists
    jobs.push(SLApi.lists().then(function (r) {
      var serverLists = ((r && r.lists) || []).map(function (l) {
        return {
          id: l.id,
          name: l.name,
          description: l.description || '',
          venues: (l.venues || []).map(venueShape).filter(Boolean),
          createdAt: l.created_at,
          serverSynced: true
        };
      });
      if(serial!==hydrationSerial || captured!==currentSession())return;
      safeSet(KEYS.lists, serverLists);
    }).catch(function () {}));

    // Plans — use newest for the active plan
    jobs.push(SLApi.plans().then(function (r) {
      var plans = (r && r.plans) || [];
      if(serial!==hydrationSerial || captured!==currentSession())return;
      if (!plans.length) {safeSet(KEYS.plan,{id:null,name:'',date:null,venues:[]});return;}
      // Active plan = first plan in list, or today's plan if found
      var today = new Date().toISOString().slice(0, 10);
      var active = plans.find(function (p) { return p.date && String(p.date).startsWith(today); }) || plans[0];
      if (active) {
        setActivePlan({
          id: 'active-plan',
          serverId: active.id,
          name: active.name,
          date: active.date,
          venues: (active.venues || []).map(venueShape).filter(Boolean),
          members: active.members || [],
          createdAt: active.created_at
        });
      }
    }).catch(function () {}));

    return Promise.all(jobs).then(function () {
      if(serial!==hydrationSerial || captured!==currentSession())return;
      safeSet(KEYS.lastSync, nowIso());
      emit('all', { action: 'hydrate' });
    });
  }

  // Trigger hydration on auth change
  function onAuthChange() {
    var next=currentSession();if(next!==memorySession){memorySession=next;memory={};hydrationSerial++;planEnsurePromise=null;emit('all',{action:'account-change'});}
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      hydrateFromServer();
    }
  }

  ['sl-auth-change','sl-auth-changed','sl-auth-ready'].forEach(function(type){window.addEventListener(type,onAuthChange);document.addEventListener(type,onAuthChange);});
  window.addEventListener('storage',function(e){if(e.key===null||e.key==='sl_jwt_token')onAuthChange();});

  // Also try once on load
  setTimeout(function () {
    if (window.SLApi && window.SLApi.isLoggedIn()) hydrateFromServer();
  }, 800);

  // =====================================================================
  // PUBLIC API
  // =====================================================================
  window.SLState = {
    // favorites
    getFavorites: getFavorites,
    isFavorite: isFavorite,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    toggleFavorite: toggleFavorite,

    // lists
    getLists: getLists,
    createList: createList,
    deleteList: deleteList,
    addVenueToList: addVenueToList,
    removeVenueFromList: removeVenueFromList,

    // plan
    getActivePlan: getActivePlan,
    isInPlan: isInPlan,
    addToPlan: addToPlan,
    removeFromPlan: removeFromPlan,
    togglePlan: togglePlan,
    reorderPlan: reorderPlan,
    clearPlan: clearPlan,
    renamePlan: renamePlan,

    // sync
    hydrateFromServer: hydrateFromServer,
    venueShape: venueShape,

    KEYS: KEYS
  };
})();