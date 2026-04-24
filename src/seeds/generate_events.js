#!/usr/bin/env node
/**
 * Generate realistic upcoming events tied to real venues in venues.json
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const venues = JSON.parse(fs.readFileSync(path.join(dataDir, 'venues.json'), 'utf8'));

// Pick venues suitable for each event category
const barsAndClubs = venues.filter(v => v.type === 'bar' || v.type === 'nightclub');
const restaurants = venues.filter(v => v.type === 'restaurant');
const cafes = venues.filter(v => v.type === 'cafe');

function pick(arr, n = 1) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return n === 1 ? shuffled[0] : shuffled.slice(0, n);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const EVENT_TEMPLATES = [
  // Live music
  { category: 'Live Music', title: 'Live Jazz Night', description: 'Local jazz quartet performing bebop classics.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=1200', price: '$15', times: ['8:00 PM','9:30 PM'] },
  { category: 'Live Music', title: 'Acoustic Sessions', description: 'Intimate acoustic performance by Boston singer-songwriters.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1501612780327-45045538702b?w=1200', price: 'Free', times: ['7:00 PM'] },
  { category: 'Live Music', title: 'Indie Rock Showcase', description: 'Rotating lineup of up-and-coming Boston bands.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1200', price: '$20', times: ['9:00 PM'] },
  // DJ / Nightlife
  { category: 'Nightlife', title: 'Saturday Night Takeover', description: 'Guest DJ set, bottle service, dance floor open until 2 AM.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200', price: '$25', times: ['10:00 PM'] },
  { category: 'Nightlife', title: 'Ladies Night', description: 'Complimentary bubbly for ladies + resident DJ.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200', price: 'Free before 11', times: ['9:00 PM'] },
  { category: 'Nightlife', title: 'Throwback Thursday', description: '2000s hits and dance classics all night.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=1200', price: '$15', times: ['10:00 PM'] },
  // Food events
  { category: 'Food & Drink', title: 'Wine Tasting Dinner', description: '5-course prix fixe with sommelier-paired wines.', pool: restaurants, image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200', price: '$95', times: ['6:30 PM'] },
  { category: 'Food & Drink', title: 'Chef\'s Table Experience', description: 'Counter seating with chef-narrated tasting menu.', pool: restaurants, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200', price: '$125', times: ['7:00 PM'] },
  { category: 'Food & Drink', title: 'Oyster Happy Hour', description: '$2 oysters and craft cocktails 4-6 PM.', pool: restaurants, image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200', price: '$2 oysters', times: ['4:00 PM'] },
  { category: 'Food & Drink', title: 'Trivia & Tacos', description: 'Team trivia with $3 tacos and $5 margs.', pool: restaurants, image: 'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=1200', price: 'Free entry', times: ['7:30 PM'] },
  // Brunch
  { category: 'Brunch', title: 'Bottomless Brunch', description: 'Bottomless mimosas with a 90-min seating.', pool: cafes.concat(restaurants), image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200', price: '$45', times: ['10:30 AM','12:30 PM'] },
  { category: 'Brunch', title: 'Drag Brunch', description: 'Boston drag queens host a two-hour variety show.', pool: restaurants, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200', price: '$55', times: ['11:00 AM'] },
  // Comedy
  { category: 'Comedy', title: 'Stand-up Comedy Night', description: 'Rotating Boston comedians + surprise headliner.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1527224538127-2104bb71c51b?w=1200', price: '$20', times: ['8:00 PM','10:00 PM'] },
  { category: 'Comedy', title: 'Open Mic Monday', description: 'Local comics test material — free to attend.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1527224538127-2104bb71c51b?w=1200', price: 'Free', times: ['8:00 PM'] },
  // Sports viewing
  { category: 'Sports', title: 'Celtics Watch Party', description: 'Big-screen game with drink specials.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200', price: 'Free', times: ['7:30 PM'] },
  { category: 'Sports', title: 'Bruins Viewing Party', description: 'Game on all screens, $5 beer specials.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200', price: 'Free', times: ['7:00 PM'] },
  // Themed
  { category: 'Themed', title: '80\'s Night', description: 'All 80s music, retro photo booth, costume contest.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1571266028243-d220c6a11f1b?w=1200', price: '$10', times: ['9:30 PM'] },
  { category: 'Themed', title: 'Latin Night', description: 'Reggaeton, bachata, salsa — DJ + dance lessons.', pool: barsAndClubs, image: 'https://images.unsplash.com/photo-1545128485-c400ce7b23d0?w=1200', price: '$15', times: ['10:00 PM'] },
  // Date night
  { category: 'Date Night', title: 'Candlelit Wine & Dine', description: 'Special date-night menu with rose bouquets.', pool: restaurants, image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200', price: '$85 per person', times: ['7:00 PM'] },
  // Art
  { category: 'Arts & Culture', title: 'Gallery Opening + Cocktails', description: 'New exhibition opening reception with wine.', pool: cafes.concat(barsAndClubs), image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200', price: 'Free', times: ['6:00 PM'] },
];

const events = [];
let eventId = 1;

// Create 2-4 events per template, spread across next 30 days
EVENT_TEMPLATES.forEach(template => {
  const numEvents = 2 + Math.floor(Math.random() * 3); // 2-4 events per template
  const venuePool = pick(template.pool, numEvents * 2);
  const pickedVenues = Array.isArray(venuePool) ? venuePool : [venuePool];
  for (let i = 0; i < numEvents && i < pickedVenues.length; i++) {
    const venue = pickedVenues[i];
    if (!venue) continue;
    const daysFromNow = Math.floor(Math.random() * 30);
    const time = template.times[Math.floor(Math.random() * template.times.length)];
    events.push({
      id: 'evt-' + String(eventId++).padStart(4, '0'),
      title: template.title,
      description: template.description,
      category: template.category,
      venue_id: null, // Will be linked by venue_slug at seed time
      venue_name: venue.name,
      venue_slug: venue.slug,
      venue_neighborhood: venue.neighborhood,
      image_url: template.image,
      date: addDays(daysFromNow),
      start_time: time,
      end_time: null,
      price: template.price,
      is_featured: Math.random() > 0.7,
      rsvp_count: Math.floor(Math.random() * 200) + 10,
      created_at: new Date().toISOString(),
    });
  }
});

// Sort by date
events.sort((a, b) => a.date.localeCompare(b.date));

fs.writeFileSync(path.join(dataDir, 'events.json'), JSON.stringify(events, null, 2));
console.log(`✅ Generated ${events.length} events`);

const byCategory = {};
events.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + 1; });
console.log('By category:', byCategory);