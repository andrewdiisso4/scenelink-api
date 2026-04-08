const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Load JSON data from the api-data directory
function loadJSON(filename) {
  // Try multiple paths (workspace or sibling)
  const paths = [
    path.join(__dirname, '..', '..', '..', 'scenelink-build', 'api-data', filename),
    path.join(__dirname, '..', 'data', filename),
    path.join(__dirname, 'data', filename),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  console.warn(`⚠️  Could not find ${filename}`);
  return null;
}

async function seedDatabase(pool) {
  console.log('🌱 Seeding database...');

  // ==================== SEED VENUES ====================
  const venueData = loadJSON('venues.json');
  if (venueData) {
    const venues = venueData.venues || venueData;
    console.log(`  📍 Inserting ${venues.length} venues...`);

    for (const v of venues) {
      try {
        await pool.query(
          `INSERT INTO venues (
            id, slug, name, type, category, cuisine, genre,
            address, neighborhood, city, state, zip_code, lat, lng,
            description, short_desc, phone, website, email,
            price_level, price_label, hours_json, hours_display, is_open_now,
            image_url, image_urls, cover_image_url,
            rating, review_count, buzz_score, going_count, friends_going,
            cover_charge, dress_code, tags, badges, features,
            vibe, highlight, why_hot, pair_with,
            spotlight, trending, featured, time_slot,
            is_active, is_claimed, created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
            $39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49
          ) ON CONFLICT (id) DO NOTHING`,
          [
            v.id, v.slug, v.name, v.type, v.category || v.type, v.cuisine || '', v.genre || v.cuisine || '',
            v.address || '', v.neighborhood, v.city || 'Boston', v.state || 'MA', v.zip_code || '',
            v.lat, v.lng,
            v.description, v.short_desc || (v.description || '').substring(0, 120),
            v.phone || '', v.website || '', v.email || '',
            v.price_level || 2, v.price_label || '$$',
            v.hours_json ? JSON.stringify(v.hours_json) : null, v.hours_display || '',
            v.is_open_now || false,
            v.image_url || '', JSON.stringify(v.image_urls || [v.image_url]),
            v.cover_image_url || v.image_url || '',
            v.rating || 0, v.review_count || 0, v.buzz_score || 0,
            v.going_count || 0, v.friends_going || 0,
            v.cover_charge || null, v.dress_code || null,
            JSON.stringify(v.tags || []), JSON.stringify(v.badges || []),
            JSON.stringify(v.features || []),
            v.vibe || '', v.highlight || v.description || '',
            v.why_hot || '', v.pair_with || '',
            v.spotlight || false, v.trending || false, v.featured || false,
            v.time_slot || 'dinner',
            v.is_active !== false, v.is_claimed || false,
            v.created_at || new Date().toISOString(), v.updated_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.error(`  ❌ Failed to insert venue "${v.name}":`, err.message);
      }
    }
    const count = await pool.query('SELECT COUNT(*) FROM venues');
    console.log(`  ✅ ${count.rows[0].count} venues in database`);
  }

  // ==================== SEED EVENTS ====================
  const eventData = loadJSON('events.json');
  if (eventData) {
    const events = eventData.events || eventData;
    console.log(`  🎉 Inserting ${events.length} events...`);

    for (const e of events) {
      try {
        await pool.query(
          `INSERT INTO events (
            id, title, description, category, venue_id, venue_name, venue_slug,
            venue_neighborhood, image_url, date, start_time, end_time, price,
            is_featured, is_live, attending_count, rating, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (id) DO NOTHING`,
          [
            e.id, e.title, e.description, e.category || 'General',
            e.venue_id || null, e.venue_name || '', e.venue_slug || '',
            e.venue_neighborhood || '', e.image_url || '',
            e.date || null, e.start_time || '', e.end_time || null,
            e.price || 'Free',
            e.is_featured || false, e.is_live || false,
            e.attending_count || 0, e.rating || 0,
            e.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.error(`  ❌ Failed to insert event "${e.title}":`, err.message);
      }
    }
    const count = await pool.query('SELECT COUNT(*) FROM events');
    console.log(`  ✅ ${count.rows[0].count} events in database`);
  }

  // ==================== SEED ACTIVITIES ====================
  const activityData = loadJSON('activity.json');
  if (activityData) {
    const activities = activityData.activities || activityData;
    console.log(`  💬 Inserting ${activities.length} activities...`);

    for (const a of activities) {
      try {
        await pool.query(
          `INSERT INTO activities (
            id, user_id, user_name, user_display_name, user_avatar,
            type, venue_id, venue_name, venue_type, venue_neighborhood,
            venue_image, venue_rating, content, rating, likes, comments, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT (id) DO NOTHING`,
          [
            a.id, null, // user_id null for seed data (no FK constraint needed)
            a.user_name || '', a.user_display_name || a.user_name || '',
            a.user_avatar || '',
            a.type, null, // venue_id null for seed data
            a.venue_name || '', a.venue_type || '', a.venue_neighborhood || '',
            a.venue_image || '', a.venue_rating || 0,
            a.content || '', a.rating || null,
            a.likes || 0, a.comments || 0,
            a.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.error(`  ❌ Failed to insert activity:`, err.message);
      }
    }
    const count = await pool.query('SELECT COUNT(*) FROM activities');
    console.log(`  ✅ ${count.rows[0].count} activities in database`);
  }

  // ==================== SEED DEMO USER ====================
  console.log('  👤 Creating demo user...');
  try {
    const demoHash = await bcrypt.hash('demo1234', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, display_name, username, avatar_url, bio, neighborhood)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING`,
      [
        'demo@scenelink.app',
        demoHash,
        'SceneLink Demo',
        'demo_user',
        'https://api.dicebear.com/7.x/initials/svg?seed=Demo',
        'Exploring the best of Boston nightlife & dining',
        'Back Bay',
      ]
    );
    console.log('  ✅ Demo user created (demo@scenelink.app / demo1234)');
  } catch (err) {
    console.error('  ❌ Demo user error:', err.message);
  }

  console.log('🎉 Seed complete!');
}

// Allow running directly: node src/seeds/seed.js
if (require.main === module) {
  const pool = require('../config/database');
  seedDatabase(pool).then(() => {
    console.log('Done');
    process.exit(0);
  }).catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { seedDatabase };