'use strict';
const bcrypt = require('bcryptjs');

const USERS = [
  {id:'b532045e-1a5f-4d78-950a-4daa0c801001',email:'qa.admin@example.invalid',username:'qa_admin',name:'QA Admin',role:'admin'},
  {id:'b532045e-1a5f-4d78-950a-4daa0c801002',email:'qa.member@example.invalid',username:'qa_member',name:'QA Member',role:'user'}
];
const VENUES = [
  {id:'b532045e-1a5f-4d78-950a-4daa0c802001',name:'QA Harbor Table',slug:'qa-harbor-table',type:'restaurant',category:'Restaurant',cuisine:'Italian',neighborhood:'South End',hours:'Mon–Sun 5–10 PM (fictional)'},
  {id:'b532045e-1a5f-4d78-950a-4daa0c802002',name:'QA Nightcap',slug:'qa-nightcap',type:'bar',category:'Cocktail Bar',cuisine:null,neighborhood:'South End',hours:'Mon–Sun 5–11 PM (fictional)'},
  {id:'b532045e-1a5f-4d78-950a-4daa0c802003',name:'QA Alternate Lounge',slug:'qa-alternate-lounge',type:'bar',category:'Cocktail Bar',cuisine:null,neighborhood:'South End',hours:'Mon–Sun 5–11 PM (fictional)'},
  {id:'b532045e-1a5f-4d78-950a-4daa0c802004',name:'QA Pending Cafe',slug:'qa-pending-cafe',type:'cafe',category:'Cafe',cuisine:null,neighborhood:'South Boston',hours:null}
];
const OWNERS = [
  {id:'b532045e-1a5f-4d78-950a-4daa0c803001',email:'qa.owner@example.invalid',status:'active',venue:VENUES[0],tier:'enterprise'},
  {id:'b532045e-1a5f-4d78-950a-4daa0c803002',email:'qa.pending@example.invalid',status:'pending',venue:VENUES[3],tier:'starter'}
];

async function seedFixtures(client, password, sourceCommit) {
  const hash = await bcrypt.hash(password, 12);
  await client.query('BEGIN');
  try {
    for (const user of USERS) await client.query(`INSERT INTO users(id,email,username,display_name,password_hash,role,email_verified_at,verified_email)
      VALUES($1,$2::text,$3,$4,$5,$6,NOW(),$2::text) ON CONFLICT(id) DO NOTHING`, [user.id,user.email,user.username,user.name,hash,user.role]);
    for (let i = 0; i < VENUES.length; i++) {
      const venue = VENUES[i];
      await client.query(`INSERT INTO venues(id,name,slug,type,category,cuisine,neighborhood,city,description,is_active,is_claimed,source,
        hours_display,rating,review_count,price_level,is_open_now,lat,lng)
        VALUES($1,$2,$3,$4,$5,$6,$7,'Boston','Fictional venue for isolated SceneLink acceptance. Not a real business.',$8,$9,'acceptance_fixture',
          $10,NULL,NULL,NULL,NULL,$11,$12) ON CONFLICT(id) DO NOTHING`,
      [venue.id,venue.name,venue.slug,venue.type,venue.category,venue.cuisine,venue.neighborhood,i<3,i<2,venue.hours,42.345+i*0.001,-71.065-i*0.001]);
    }
    for (const owner of OWNERS) await client.query(`INSERT INTO business_users(id,email,password_hash,venue_name,venue_id,tier,status)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`, [owner.id,owner.email,hash,owner.venue.name,owner.venue.id,owner.tier,owner.status]);
    for (let i = 0; i < 2; i++) await client.query(`INSERT INTO business_venues(business_user_id,venue_id,is_primary) VALUES($1,$2,$3)
      ON CONFLICT(business_user_id,venue_id) DO NOTHING`, [OWNERS[0].id,VENUES[i].id,i===0]);
    await client.query('UPDATE public.scenelink_acceptance_environment SET fixtures_seeded=true,source_commit=$1 WHERE singleton=true', [sourceCommit]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

module.exports = {USERS, VENUES, OWNERS, seedFixtures};
