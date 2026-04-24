#!/usr/bin/env node
/**
 * Build seed JSON files (venues.json, events.json, activity.json) by parsing
 * the frontend JS venue arrays from the scenelink-frontend package.
 *
 * Run once at build time (or locally). Output is written to ./data/*.json
 * which is picked up by seed.js on first DB boot.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRONTEND_DIR = path.resolve(__dirname, '..', '..', '..', 'scenelink-frontend');
const OUT_DIR = path.join(__dirname, 'data');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- helpers ----------
function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
function uuid5(seed) {
  // deterministic UUIDv5-ish from sha1 — avoids needing a uuid package at build
  const h = crypto.createHash('sha1').update(String(seed)).digest('hex');
  return `${h.substr(0,8)}-${h.substr(8,4)}-5${h.substr(13,3)}-${((parseInt(h.substr(16,2),16)&0x3f)|0x80).toString(16)}${h.substr(18,2)}-${h.substr(20,12)}`;
}
function priceLabel(pr) {
  if (!pr) return '$$';
  if (typeof pr === 'string') return pr;
  return '$'.repeat(Math.max(1, Math.min(4, pr)));
}
function priceLevel(pr) {
  if (typeof pr === 'number') return pr;
  if (typeof pr === 'string') return Math.max(1, Math.min(4, pr.length));
  return 2;
}
function humanizeHood(slug) {
  return String(slug || '').split('-').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}

// Evaluate array literal from JS source via Function constructor
function extractArray(filepath, varName) {
  if (!fs.existsSync(filepath)) return [];
  const src = fs.readFileSync(filepath, 'utf8');
  // Find: const <varName> = [   ...   ];  (balanced brackets)
  const re = new RegExp(`const\\s+${varName}\\s*=\\s*\\[`);
  const m = src.match(re);
  if (!m) return [];
  let start = m.index + m[0].length - 1;  // position of `[`
  let depth = 0, end = -1, inStr = null, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  const literal = src.slice(start, end+1);
  try {
    // eslint-disable-next-line no-new-func
    return (new Function(`return ${literal};`))();
  } catch (e) {
    console.error(`Parse fail for ${varName} in ${filepath}:`, e.message);
    return [];
  }
}

// ---------- extract ----------
const sources = [
  { file: 'js/explore-v2.js',      varName: 'restaurants',      kind: 'restaurant' },
  { file: 'js/tonight-picks-v2.js', varName: 'picks',           kind: 'mixed' },
  { file: 'js/tonight-picks-v2.js', varName: 'tonightPicks',    kind: 'mixed' },
  { file: 'js/nightlife-modern.js', varName: 'nightlifeVenues', kind: 'nightlife' },
];

let allVenues = [];
for (const s of sources) {
  const arr = extractArray(path.join(FRONTEND_DIR, s.file), s.varName);
  console.log(`  ${s.file} / ${s.varName}: ${arr.length}`);
  for (const v of arr) {
    if (!v || !v.name) continue;
    v.__kind = s.kind;
    allVenues.push(v);
  }
}

// Dedupe by name
const seen = new Map();
allVenues = allVenues.filter(v => {
  const k = v.name.toLowerCase().trim();
  if (seen.has(k)) return false;
  seen.set(k, true);
  return true;
});
console.log(`\n📍 Total unique venues: ${allVenues.length}`);

// Transform to backend schema
const venues = allVenues.map(v => {
  const slug = slugify(v.name);
  const id = uuid5(`venue:${slug}`);
  const type = (v.type || v.cuisine || 'restaurant').toLowerCase();
  const category = v.__kind === 'nightlife' ? 'bar' : (type.includes('club') ? 'bar' : 'restaurant');
  const price_label = priceLabel(v.priceRange || v.price_level);
  const price_level = priceLevel(v.priceRange || v.price_level);
  const images = v.image ? [v.image] : [];
  const vibe = v.vibe || (v.tags && v.tags[0]) || '';
  const buzz = Math.round(60 + Math.random()*35);
  const going = Math.round(20 + Math.random()*80);
  const badges = [];
  if ((v.rating||0) >= 4.8) badges.push('Boston Icon');
  if (v.__kind === 'nightlife') badges.push('Nightlife Hot Spot');
  const trending = (v.rating||0) >= 4.6;
  const featured = (v.rating||0) >= 4.7;
  const spotlight = (v.rating||0) >= 4.8;

  return {
    id,
    slug,
    name: v.name,
    type,
    category,
    cuisine: v.cuisine || '',
    genre: v.vibe || v.cuisine || '',
    address: v.address || '',
    neighborhood: humanizeHood(v.neighborhood || 'Boston'),
    city: 'Boston',
    state: 'MA',
    zip_code: '',
    lat: v.lat, lng: v.lng,
    description: v.description || '',
    short_desc: (v.description || '').slice(0, 120),
    phone: '', website: '', email: '',
    price_level,
    price_label,
    hours_json: null,
    hours_display: v.hours || '',
    is_open_now: v.isOpen !== false,
    image_url: v.image || '',
    image_urls: images,
    cover_image_url: v.image || '',
    rating: v.rating || 0,
    review_count: Math.round(50 + Math.random()*300),
    buzz_score: buzz,
    going_count: going,
    friends_going: 0,
    cover_charge: null,
    dress_code: v.__kind === 'nightlife' ? 'Smart Casual' : null,
    tags: v.tags || [],
    badges,
    features: v.features || [],
    vibe,
    highlight: v.description || '',
    why_hot: '',
    pair_with: '',
    spotlight,
    trending,
    featured,
    time_slot: v.__kind === 'nightlife' ? 'late_night' : 'dinner',
    is_active: true,
    is_claimed: false,
  };
});

fs.writeFileSync(path.join(OUT_DIR, 'venues.json'), JSON.stringify({ venues }, null, 2));
console.log(`✅ venues.json written (${venues.length})`);

// ---------- events (nested inside eventVenues[i].events) ----------
const eventVenues = extractArray(path.join(FRONTEND_DIR, 'js/events-modern.js'), 'eventVenues');
const events = [];
for (const ev of eventVenues) {
  if (!ev || !Array.isArray(ev.events)) continue;
  for (const e of ev.events) {
    if (!e || !e.title) continue;
    const id = uuid5(`event:${ev.name}:${e.title}:${e.date||''}`);
    events.push({
      id, title: e.title,
      description: e.description || '',
      category: e.type || e.category || 'General',
      venue_id: null,
      venue_name: ev.name,
      venue_slug: slugify(ev.name),
      venue_neighborhood: humanizeHood(ev.neighborhood || ''),
      image_url: e.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&h=600&fit=crop',
      date: e.date || null,
      start_time: e.time || '',
      end_time: null,
      price: e.price || 'Free',
      is_featured: e.status === 'tonight' || e.status === 'live',
      is_live: e.status === 'live',
      attending_count: e.attendees || Math.round(50 + Math.random()*200),
      rating: e.rating || 0,
    });
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'events.json'), JSON.stringify({ events }, null, 2));
console.log(`✅ events.json written (${events.length})`);

// ---------- activity (synthetic) ----------
const verbs = ['checked in at', 'loved', 'saved', 'reviewed', 'is going to'];
const names = ['Alex M.', 'Priya S.', 'Jordan K.', 'Sam L.', 'Taylor R.', 'Morgan P.', 'Jamie D.', 'Casey W.'];
const activity = [];
for (let i=0;i<30 && i<venues.length;i++) {
  const v = venues[i];
  const u = names[i % names.length];
  activity.push({
    id: uuid5(`activity:${i}:${v.slug}`),
    user_name: u.toLowerCase().replace(/[^a-z]/g,''),
    user_display_name: u,
    user_avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u)}`,
    type: verbs[i % verbs.length],
    venue_name: v.name,
    venue_type: v.type,
    venue_neighborhood: v.neighborhood,
    venue_image: v.image_url,
    venue_rating: v.rating,
    content: `${verbs[i%verbs.length]} ${v.name}`,
    rating: verbs[i%verbs.length] === 'reviewed' ? Math.round(v.rating) : null,
    likes: Math.round(Math.random()*40),
    comments: Math.round(Math.random()*10),
    created_at: new Date(Date.now() - i*3600*1000).toISOString(),
  });
}
fs.writeFileSync(path.join(OUT_DIR, 'activity.json'), JSON.stringify({ activities: activity }, null, 2));
console.log(`✅ activity.json written (${activity.length})`);

console.log('\n🎉 Seed data build complete. Files in:', OUT_DIR);