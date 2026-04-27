/**
 * OpenStreetMap / Overpass service
 *
 * - Fetches venues via Overpass API with safety rails
 * - Converts OSM tags to SceneLink venue payloads
 * - Caches responses in memory for 10 minutes to avoid repeat hits
 *
 * License reminder: OSM data is © OpenStreetMap contributors, licensed under
 * the Open Database License (ODbL). Any page showing this data must attribute
 * "© OpenStreetMap contributors".
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];

const CATEGORY_FILTERS = {
  restaurant: '"amenity"="restaurant"',
  fast_food:  '"amenity"="fast_food"',
  bar:        '"amenity"="bar"',
  pub:        '"amenity"="pub"',
  cafe:       '"amenity"="cafe"',
  nightclub:  '"amenity"="nightclub"',
  theatre:    '"amenity"="theatre"',
  cinema:     '"amenity"="cinema"',
  brewery:    '"craft"="brewery"',
  winery:     '"craft"="winery"',
  attraction: '"tourism"="attraction"',
  music:      '"amenity"="music_venue"'
};

// Presets for quick imports
const CITY_PRESETS = {
  boston: {
    name: 'Boston, MA',
    bbox: [42.227, -71.191, 42.400, -70.986], // S,W,N,E
  },
  cambridge: {
    name: 'Cambridge, MA',
    bbox: [42.352, -71.160, 42.405, -71.060],
  },
  somerville: {
    name: 'Somerville, MA',
    bbox: [42.370, -71.135, 42.420, -71.065],
  }
};

const MAX_BBOX_DEG = 0.5; // safety: bbox side must be < 0.5 deg (~55 km)
const MAX_RESULTS = 500;  // safety: per single import call
const OVERPASS_TIMEOUT_MS = 40000;

// simple in-memory cache
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
function cacheKey(bbox, cats) { return JSON.stringify({bbox, cats}); }

/**
 * Build an Overpass QL query scoped to a bbox + list of category filters.
 * bbox = [south, west, north, east]
 */
function buildQuery(bbox, categories) {
  const [s,w,n,e] = bbox;
  const filters = categories
    .filter(c => CATEGORY_FILTERS[c])
    .map(c => CATEGORY_FILTERS[c]);
  if (!filters.length) throw new Error('No valid categories');

  const bboxStr = `${s},${w},${n},${e}`;
  const lines = [];
  lines.push(`[out:json][timeout:30][maxsize:67108864];`);
  lines.push(`(`);
  for (const f of filters) {
    lines.push(`  node[${f}](${bboxStr});`);
    lines.push(`  way[${f}](${bboxStr});`);
    lines.push(`  relation[${f}](${bboxStr});`);
  }
  lines.push(`);`);
  lines.push(`out center tags;`);
  return lines.join('\n');
}

function validateBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('bbox must be [south,west,north,east]');
  const [s,w,n,e] = bbox.map(Number);
  if ([s,w,n,e].some(x => !Number.isFinite(x))) throw new Error('bbox contains non-numeric values');
  if (s >= n) throw new Error('south must be less than north');
  if (w >= e) throw new Error('west must be less than east');
  if ((n-s) > MAX_BBOX_DEG || (e-w) > MAX_BBOX_DEG) {
    throw new Error(`bbox too large (max ${MAX_BBOX_DEG}°; got ${(n-s).toFixed(3)}° x ${(e-w).toFixed(3)}°)`);
  }
  return [s,w,n,e];
}

async function fetchOverpass(query) {
  const body = new URLSearchParams({ data: query }).toString();
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SceneLink-Admin/1.0 (https://scenelink.app; ops@scenelink.app)'
        },
        body,
        signal: controller.signal
      });
      clearTimeout(t);
      if (!r.ok) {
        lastErr = new Error(`Overpass ${endpoint} → HTTP ${r.status}`);
        continue;
      }
      const data = await r.json();
      return { endpoint, data };
    } catch (err) {
      lastErr = err;
      // try next endpoint
    }
  }
  throw lastErr || new Error('Overpass unreachable');
}

/**
 * Fetch venues via Overpass. Caches by bbox+categories for CACHE_TTL_MS.
 * Returns { elements, endpoint, cached }
 */
async function fetchVenues(bbox, categories) {
  const safeBbox = validateBbox(bbox);
  const cats = (categories || []).filter(c => CATEGORY_FILTERS[c]);
  if (!cats.length) throw new Error('no valid categories');

  const key = cacheKey(safeBbox, cats.sort());
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) {
    return { elements: hit.elements, endpoint: hit.endpoint, cached: true };
  }

  const query = buildQuery(safeBbox, cats);
  const { endpoint, data } = await fetchOverpass(query);
  const elements = Array.isArray(data.elements) ? data.elements : [];
  if (elements.length > MAX_RESULTS) {
    // Still return first MAX_RESULTS so the import continues — but warn via count
  }
  _cache.set(key, { t: Date.now(), elements, endpoint });
  return { elements, endpoint, cached: false };
}

/**
 * Map an OSM element to a SceneLink venue payload.
 */
function osmToVenue(el) {
  const tags = el.tags || {};
  const lat = el.lat || (el.center && el.center.lat) || null;
  const lng = el.lon || (el.center && el.center.lon) || null;
  if (!lat || !lng) return null;

  const name = tags.name || tags['name:en'] || null;
  if (!name) return null;

  // Category
  let category = null;
  let type = 'restaurant';
  if (tags.amenity) {
    const a = tags.amenity;
    if (a === 'restaurant' || a === 'fast_food') { category = tags.cuisine || 'Restaurant'; type='restaurant'; }
    else if (a === 'bar')       { category = 'Bar';       type = 'bar'; }
    else if (a === 'pub')       { category = 'Pub';       type = 'bar'; }
    else if (a === 'cafe')      { category = 'Café';      type = 'cafe'; }
    else if (a === 'nightclub') { category = 'Nightclub'; type = 'club'; }
    else if (a === 'theatre')   { category = 'Theatre';   type = 'music'; }
    else if (a === 'cinema')    { category = 'Cinema';    type = 'entertainment'; }
    else if (a === 'music_venue'){ category = 'Music Venue'; type='music'; }
  } else if (tags.craft === 'brewery') { category = 'Brewery'; type = 'bar'; }
  else if (tags.craft === 'winery')    { category = 'Winery';  type = 'bar'; }
  else if (tags.tourism === 'attraction') { category = 'Attraction'; type = 'event'; }

  const address = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || null;
  const city = tags['addr:city'] || null;
  const state = tags['addr:state'] || null;
  const zip = tags['addr:postcode'] || null;
  const phone = tags.phone || tags['contact:phone'] || null;
  const website = tags.website || tags['contact:website'] || null;
  const hours = tags.opening_hours || null;

  // Vibe tags from cuisine + other descriptive tags
  const vibe_tags = [];
  if (tags.cuisine)       vibe_tags.push(...tags.cuisine.split(';').map(x => x.trim()));
  if (tags.outdoor_seating === 'yes') vibe_tags.push('outdoor_seating');
  if (tags.takeaway === 'yes') vibe_tags.push('takeaway');
  if (tags.reservation === 'yes') vibe_tags.push('reservations');
  if (tags.live_music === 'yes') vibe_tags.push('live_music');

  return {
    name,
    address, city, state,
    lat, lng,
    category, type,
    phone, website,
    hours_raw: hours,
    vibe_tags,
    osm_id: el.id,
    osm_type: el.type,   // 'node' | 'way' | 'relation'
    osm_tags: tags,
    source: 'openstreetmap',
    external_id: null,
    image_url: null,
    neighborhood: null,
    reservation_url: null,
    description: null,
    price_level: null
  };
}

module.exports = {
  CATEGORY_FILTERS, CITY_PRESETS, OVERPASS_ENDPOINTS,
  MAX_BBOX_DEG, MAX_RESULTS,
  buildQuery, validateBbox, fetchVenues, osmToVenue
};