/**
 * Venue import/enrichment helpers.
 * Pure functions where possible; DB-touching functions take a pool client.
 */

/** A stored URL is a navigation link, never evidence of inventory or a booking.
 * These helpers do not fetch URLs or claim that a provider currently accepts bookings.
 * Keep them shared by discovery and both concierge paths so page choice cannot revive
 * legacy seeded metrics or misleading reservation_live flags.
 */
function safePublicHttps(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(text)) return null;
  let url;
  try { url = new URL(text); } catch (_) { return null; }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  if (!host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
  return url.href;
}
function publicVenueImage(value) {
  // The only relative image route emitted by the canonical catalog is its own
  // Google-photo proxy. Do not accept arbitrary protocol-relative/local URLs.
  if (typeof value === 'string' && /^\/api\/photo\?/.test(value) && !/[\u0000-\u0020\u007f\\]/.test(value)) return value;
  const safe = safePublicHttps(value);
  if (!safe) return null;
  const host = new URL(safe).hostname.toLowerCase().replace(/\.$/, '');
  if (['unsplash.com','pexels.com'].some(domain => host === domain || host.endsWith('.' + domain))) return null;
  return safe;
}
function bookingLink(row = {}) {
  const url = ['reservation_url','opentable_url','resy_url'].map(key => safePublicHttps(row[key])).find(Boolean) || null;
  let provider = null;
  if (url) {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    const matches = domain => host === domain || host.endsWith('.' + domain);
    provider = matches('opentable.com') ? 'OpenTable' : matches('resy.com') ? 'Resy' : 'External site';
  }
  return {status:url ? 'external_link' : 'not_available',url,provider,
    requires_external_confirmation:true,reservation_confirmed:false};
}
function availableVenueSQL(alias = 'v') {
  const column = key => alias ? alias + '.' + key : key;
  return `${column('is_active')} IS TRUE AND COALESCE(${column('business_status')},'') NOT ILIKE 'CLOSED%'
    AND lower(COALESCE(${column('business_status')},'')) NOT IN ('temporarily_closed','permanently_closed')`;
}
function publicVenue(row) {
  const venue = {...row};
  for (const key of ['website','reservation_url','opentable_url','resy_url','yelp_url','google_maps_url']) {
    if (Object.hasOwn(venue,key)) venue[key] = safePublicHttps(venue[key]);
  }
  for (const key of ['image_url','cover_image_url','venue_image','thumbnail_url']) {
    if (Object.hasOwn(venue,key)) venue[key] = publicVenueImage(venue[key]);
  }
  if (Object.hasOwn(venue,'image_urls')) venue.image_urls = Array.isArray(venue.image_urls) ? venue.image_urls.map(publicVenueImage).filter(Boolean) : [];
  if (Object.hasOwn(venue,'has_real_photo') && ![venue.image_url,venue.cover_image_url,venue.thumbnail_url,venue.venue_image].some(Boolean)) venue.has_real_photo = false;
  const booking = bookingLink(venue);
  // Legacy imports manufactured these values. Until a separately reviewed factual
  // aggregate exists, neither consumers nor recommendation models receive them.
  return {...venue,rating:null,review_count:null,buzz_score:null,going_count:null,friends_going:null,
    trending:null,featured:null,spotlight:null,why_hot:null,score:null,is_open_now:null,
    metrics_status:'unverified',source_verification_status:venue.source ? 'source_record_unverified' : 'unknown',
    reservation_url:booking.url,reservation_provider:booking.provider,reservation_live:null,
    reservation_is_confirmed:false,booking};
}

/** Keep saved identities visible even when a catalog entry has been withdrawn. */
function savedVenue(row) {
  const available = row.venue_available === true;
  const venue = publicVenue({...row,...(!available ? {reservation_url:null,opentable_url:null,resy_url:null,website:null} : {})});
  return {...venue,venue_rating:null,venue_available:available,venue_status:available ? 'available' : 'unavailable'};
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

function uniqueSlug(base) {
  const suffix = Math.random().toString(36).substring(2, 7);
  return (base || 'venue') + '-' + suffix;
}

function toBool(v) {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).toLowerCase().trim();
  if (['true','1','yes','y'].includes(s)) return true;
  if (['false','0','no','n'].includes(s)) return false;
  return null;
}

function toNum(v) {
  if (v == null || (typeof v === 'string' && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseVibeTags(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  const s = String(v).trim();
  if (!s) return [];
  // try JSON first
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map(x => String(x).trim()).filter(Boolean);
  } catch(_) {}
  // csv / pipe / semicolon
  return s.split(/[,|;]/).map(x => x.trim()).filter(Boolean);
}

/**
 * Normalize one CSV row (with loose columns) into a venue payload.
 */
function normalizeCsvRow(row) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (row[k] != null && row[k] !== '') return row[k];
      const lower = Object.keys(row).find(kk => kk.toLowerCase() === k.toLowerCase());
      if (lower && row[lower] != null && row[lower] !== '') return row[lower];
    }
    return null;
  };

  const name = String(pick('name','venue','title') || '').trim();
  const address = String(pick('address','street') || '').trim();
  const city = String(pick('city') || '').trim();
  const state = String(pick('state') || '').trim();
  const neighborhood = String(pick('neighborhood','nbhd') || '').trim() || null;
  const category = String(pick('category','type') || '').trim() || null;
  const description = String(pick('description','desc') || '').trim() || null;
  const lat = toNum(pick('latitude','lat'));
  const lng = toNum(pick('longitude','lng','lon'));
  const phone = String(pick('phone','tel') || '').trim() || null;
  const website = String(pick('website','website_url','url','site') || '').trim() || null;
  const reservation = String(pick('reservation_url','reservations','book') || '').trim() || null;
  const image = String(pick('image_url','image','photo','cover_image_url') || '').trim() || null;
  const hours = pick('hours','hours_display','hours_json');
  const price_level = toNum(pick('price_level','price'));
  const source = String(pick('source') || 'csv').trim();
  const external_id = pick('external_id','ext_id') || null;
  const vibe_tags = parseVibeTags(pick('vibe_tags','vibes','tags'));
  const type = inferType(category);

  return {
    name, address, city, state, neighborhood, category, description,
    lat, lng, phone, website, reservation_url: reservation, image_url: image,
    hours_raw: hours, price_level, source, external_id: external_id ? String(external_id) : null,
    vibe_tags, type
  };
}

function inferType(category) {
  if (!category) return 'restaurant';
  const c = String(category).toLowerCase();
  if (/bar|lounge|pub|brewery|cocktail|tavern|speakeasy/.test(c)) return 'bar';
  if (/club|nightclub/.test(c)) return 'club';
  if (/cafe|coffee|bakery|patisserie/.test(c)) return 'cafe';
  if (/music|concert|theater|theatre|arena|venue|hall|stage/.test(c)) return 'music';
  if (/event|festival|attraction/.test(c)) return 'event';
  return 'restaurant';
}

/**
 * Validate a normalized payload. Returns an array of errors (empty if valid).
 */
function validateVenue(v) {
  const errors = [];
  if (!v.name) errors.push('name is required');
  if (v.lat != null && (v.lat < -90 || v.lat > 90)) errors.push('latitude out of range');
  if (v.lng != null && (v.lng < -180 || v.lng > 180)) errors.push('longitude out of range');
  if (v.website && !/^https?:\/\//i.test(v.website)) errors.push('website must start with http(s)://');
  return errors;
}

/**
 * Compute data quality score 0-100 and status label.
 */
function computeQuality(v) {
  let score = 0;
  if (v.name) score += 10;
  if (v.address) score += 15;
  if (v.lat != null && v.lng != null) score += 20;
  if (v.category) score += 10;
  if (v.neighborhood) score += 10;
  if (v.image_url) score += 10;
  if (v.website) score += 10;
  if (v.phone) score += 5;
  if (v.description) score += 5;
  if (v.vibe_tags && v.vibe_tags.length) score += 5;

  let status = 'complete';
  if (v.lat == null || v.lng == null) status = 'needs_coordinates';
  else if (!v.category) status = 'needs_category';
  else if (!v.image_url) status = 'needs_image';
  else if (!v.neighborhood) status = 'needs_neighborhood';
  else if (!v.vibe_tags || !v.vibe_tags.length) status = 'needs_vibe_tags';
  if (score < 40) status = 'low_quality';
  return { score, status };
}

/**
 * Upsert a venue row. Dedupe strategy (in order):
 *   1. osm_id + osm_type
 *   2. source + external_id
 *   3. exact nonempty name + city + street address (never empty neighborhood)
 * Returns { action: 'inserted'|'updated'|'skipped', id, slug }
 */
async function upsertVenue(pool, v, opts = {}) {
  const { ifExists = 'update' } = opts; // 'update' | 'skip'

  // Compose final record
  const vibe = Array.isArray(v.vibe_tags) ? v.vibe_tags : [];
  const quality = computeQuality(v);
  const hours_display = typeof v.hours_raw === 'string' ? v.hours_raw : null;
  const hours_json = (v.hours_raw && typeof v.hours_raw === 'object') ? v.hours_raw : null;

  // 1. Try match by OSM
  let existing = null;
  if (v.osm_id && v.osm_type) {
    const r = await pool.query('SELECT id, slug FROM venues WHERE osm_id=$1 AND osm_type=$2 LIMIT 1', [v.osm_id, v.osm_type]);
    existing = r.rows[0] || null;
  }
  // 2. Try match by external_id + source
  if (!existing && v.external_id && v.source) {
    const r = await pool.query('SELECT id, slug FROM venues WHERE external_id=$1 AND source=$2 LIMIT 1', [v.external_id, v.source]);
    existing = r.rows[0] || null;
  }
  // 3. Same-brand branches must not merge merely because neighborhoods match.
  if (!existing && v.name && String(v.city || '').trim() && String(v.address || '').trim()) {
    const r = await pool.query(
      `SELECT id, slug FROM venues
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
         AND LOWER(TRIM(COALESCE(city,''))) = LOWER(TRIM($2))
         AND LOWER(TRIM(COALESCE(address,''))) = LOWER(TRIM($3))
       LIMIT 1`,
      [v.name, v.city, v.address]
    );
    existing = r.rows[0] || null;
  }

  if (existing) {
    if (ifExists === 'skip') {
      return { action: 'skipped', id: existing.id, slug: existing.slug };
    }
    // Update — only overwrite fields with non-null incoming values
    await pool.query(
      `UPDATE venues SET
         name            = COALESCE($2, name),
         address         = COALESCE($3, address),
         neighborhood    = COALESCE($4, neighborhood),
         city            = COALESCE($5, city),
         state           = COALESCE($6, state),
         lat             = COALESCE($7, lat),
         lng             = COALESCE($8, lng),
         category        = COALESCE($9, category),
         type            = COALESCE($10, type),
         description     = COALESCE($11, description),
         phone           = COALESCE($12, phone),
         website         = COALESCE($13, website),
         reservation_url = COALESCE($14, reservation_url),
         image_url       = COALESCE($15, image_url),
         cover_image_url = COALESCE($15, cover_image_url),
         hours_display   = COALESCE($16, hours_display),
         hours_json      = COALESCE($17, hours_json),
         price_level     = COALESCE($18, price_level),
         vibe_tags       = CASE WHEN jsonb_array_length(COALESCE(vibe_tags,'[]'::jsonb)) = 0
                                THEN $19::jsonb ELSE vibe_tags END,
         source          = COALESCE($20, source),
         external_id     = COALESCE($21, external_id),
         osm_id          = COALESCE($22, osm_id),
         osm_type        = COALESCE($23, osm_type),
         osm_tags        = COALESCE($24, osm_tags),
         data_quality    = $25,
         data_quality_score = $26,
         updated_at      = NOW()
       WHERE id=$1`,
      [
        existing.id, v.name, v.address, v.neighborhood, v.city, v.state,
        v.lat, v.lng, v.category, v.type, v.description, v.phone, v.website,
        v.reservation_url, v.image_url, hours_display, hours_json,
        v.price_level, JSON.stringify(vibe), v.source, v.external_id,
        v.osm_id || null, v.osm_type || null,
        v.osm_tags ? JSON.stringify(v.osm_tags) : null,
        quality.status, quality.score
      ]
    );
    return { action: 'updated', id: existing.id, slug: existing.slug };
  }

  // Insert
  const slug = uniqueSlug(slugify(v.name + ' ' + (v.city || '')));
  const r = await pool.query(
    `INSERT INTO venues (
       slug, name, type, category, address, neighborhood, city, state,
       lat, lng, description, phone, website, reservation_url,
       image_url, cover_image_url, hours_display, hours_json,
       price_level, vibe_tags, source, external_id,
       osm_id, osm_type, osm_tags, data_quality, data_quality_score,
       is_active, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17,
             $18,$19,$20,$21,$22,$23,$24,$25,$26,true,NOW(),NOW())
     RETURNING id, slug`,
    [
      slug, v.name, v.type || 'restaurant', v.category || null,
      v.address || null, v.neighborhood || null, v.city || null, v.state || null,
      v.lat, v.lng, v.description || null, v.phone || null, v.website || null,
      v.reservation_url || null, v.image_url || null,
      hours_display, hours_json,
      v.price_level ?? null, JSON.stringify(vibe), v.source || 'csv', v.external_id || null,
      v.osm_id || null, v.osm_type || null,
      v.osm_tags ? JSON.stringify(v.osm_tags) : null,
      quality.status, quality.score
    ]
  );
  return { action: 'inserted', id: r.rows[0].id, slug: r.rows[0].slug };
}

module.exports = {
  safePublicHttps, publicVenueImage, bookingLink, publicVenue, savedVenue, availableVenueSQL,
  slugify, uniqueSlug, toBool, toNum, parseVibeTags,
  normalizeCsvRow, validateVenue, computeQuality, upsertVenue, inferType
};