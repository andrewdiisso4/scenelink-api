'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {PUBLIC_EVENT}=require('../src/launch/events');

test('pilot read gate tracks the exact venue identity and current sibling ambiguity only', async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    CREATE TABLE venues(id text PRIMARY KEY,name text,address text,city text,state text,
      is_active boolean DEFAULT true,business_status text DEFAULT 'OPERATIONAL');
    CREATE TABLE events(id text PRIMARY KEY,venue_id text,external_id text,source text DEFAULT 'official_venue',
      is_active boolean DEFAULT true,source_review_status text DEFAULT 'reviewed',
      source_reviewed_at timestamptz DEFAULT now(),source_url text DEFAULT 'https://example.invalid/event',
      date date DEFAULT current_date);
    INSERT INTO venues(id,name,address,city,state) VALUES
      ('original','City Winery Boston','80 Beverly Street','Boston','MA'),
      ('ordinary','Not the pilot','82 Beverly Street','Boston','MA'),
      ('other-city','City Winery Boston','80 Beverly Street','Quincy','MA');
    INSERT INTO events(id,venue_id,external_id) VALUES
      ('pilot','original','city-winery-boston:qa-only'),
      ('ordinary','ordinary','organizer:qa-only'),
      ('no-venue',NULL,'organizer:venue-unassigned');
  `);
  const visible=async()=> (await db.query(`
    SELECT release.id FROM events release LEFT JOIN venues site ON site.id=release.venue_id
    WHERE ${PUBLIC_EVENT('release','site')} ORDER BY release.id
  `)).rows.map(x=>x.id);
  const all=['no-venue','ordinary','pilot'],hold=['no-venue','ordinary'];
  assert.deepEqual(await visible(),all);
  await db.exec("INSERT INTO venues(id,name,address,city,state) VALUES ('sibling',' CITY  WINERY BOSTON ',' 80   Beverly St. ',' Boston ','ma')");
  assert.deepEqual(await visible(),hold);
  await db.exec("UPDATE venues SET business_status='permanently_closed' WHERE id='sibling'");
  assert.deepEqual(await visible(),all);
  await db.exec("ALTER TABLE venues ADD COLUMN duplicate_of text; UPDATE venues SET business_status='OPERATIONAL',duplicate_of='original' WHERE id='sibling'");
  assert.deepEqual(await visible(),hold,'an annotated sibling that is still active remains ambiguous');
  await db.exec("UPDATE venues SET is_active=false WHERE id='sibling'");
  assert.deepEqual(await visible(),all);
  await db.exec("UPDATE venues SET address='82 Beverly Street' WHERE id='original'");
  assert.deepEqual(await visible(),hold);
  await db.exec("UPDATE venues SET address='80 Beverly Street',duplicate_of='sibling' WHERE id='original'");
  assert.deepEqual(await visible(),hold);
  await db.exec("UPDATE venues SET duplicate_of=NULL WHERE id='original'");
  assert.deepEqual(await visible(),all);
});
