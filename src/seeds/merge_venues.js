#!/usr/bin/env node
/**
 * Merge curated (premium, hand-verified) venues with OSM (real but unverified) venues.
 * - Curated always wins by name match
 * - Filter OSM noise (names too short, duplicates, obviously missing data)
 * - Cap at a reasonable target for launch
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const curated = JSON.parse(fs.readFileSync(path.join(dataDir, 'venues_curated.json'), 'utf8'));
const osm = JSON.parse(fs.readFileSync(path.join(dataDir, 'venues_real.json'), 'utf8'));

const normalized = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const curatedNames = new Set(curated.map(v => normalized(v.name)));

// Filter OSM:
//  - Must have name with 3+ chars
//  - Skip obvious chains we don't want to feature at top (McDonald's, Starbucks, Dunkin', etc.)
const EXCLUDE_CHAINS = new Set([
  'mcdonalds','burgerking','wendys','subway','dunkin','dunkindonuts','starbucks',
  'chipotle','dominos','pizzahut','taco bell','tacobell','kfc','popeyes',
  'halalguys','qdoba','sbarro','cosi','au bon pain','aubonpain','cvs','walgreens',
  'sevenseven','7eleven','seveneleven','wawa','prets','pret'
]);

const filtered = osm.filter(v => {
  const n = normalized(v.name);
  if (n.length < 3) return false;
  if (EXCLUDE_CHAINS.has(n)) return false;
  if (curatedNames.has(n)) return false;
  // Skip OSM venues with no neighborhood detection (pure "Boston")
  //   — actually keep them since they have real coords
  return true;
});

// Cap at 500 non-curated (20 curated + 500 = ~520 total, great for launch)
// Shuffle to get variety across neighborhoods before capping
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
shuffle(filtered);

// Balance: keep up to N per neighborhood
const PER_NHOOD_CAP = 60;
const nhoodCounts = {};
const balanced = [];
for (const v of filtered) {
  const nh = v.neighborhood || 'Boston';
  nhoodCounts[nh] = nhoodCounts[nh] || 0;
  if (nhoodCounts[nh] >= PER_NHOOD_CAP) continue;
  nhoodCounts[nh]++;
  balanced.push(v);
  if (balanced.length >= 500) break;
}

// Merge curated first (so they come first in query results)
const merged = [...curated, ...balanced];

// Mark top-rated as featured/trending
merged.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
merged.slice(0, 40).forEach(v => {
  if (v.source !== 'curated') v.featured = true;
});
merged.slice(0, 80).forEach(v => {
  if (v.source !== 'curated') v.trending = true;
});

// Re-sort by default: curated first, then by review_count desc
merged.sort((a, b) => {
  const aC = a.source === 'curated' ? 0 : 1;
  const bC = b.source === 'curated' ? 0 : 1;
  if (aC !== bC) return aC - bC;
  return (b.review_count || 0) - (a.review_count || 0);
});

// Convert to seed format (match venues.json schema)
const out = merged.map(v => ({
  ...v,
  // Ensure required fields
  city: v.city || 'Boston',
  state: v.state || 'MA',
  is_active: true,
  is_open_now: Math.random() > 0.3, // Roughly 70% "open"
}));

const outPath = path.join(dataDir, 'venues.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`✅ Merged ${curated.length} curated + ${balanced.length} OSM = ${out.length} total venues`);
console.log(`   Written to ${outPath}`);

// Breakdown
const byType = {}, byNhood = {}, byCity = {};
out.forEach(v => {
  byType[v.type] = (byType[v.type] || 0) + 1;
  byNhood[v.neighborhood] = (byNhood[v.neighborhood] || 0) + 1;
  byCity[v.city] = (byCity[v.city] || 0) + 1;
});
console.log('\nBy type:', byType);
console.log('By neighborhood:', byNhood);
console.log('By city:', byCity);