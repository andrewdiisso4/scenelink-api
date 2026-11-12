'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {publicVenue} = require('../src/services/venue-helpers');
const {reviewedPriceSQL} = require('../src/services/venue-facts');
const discovery = require('../src/launch/discovery');
const fact = value => ({status:'reviewed',value,source_url:'https://venue.example.com/menu',observed_at:'2026-01-01'});
test('default prices and generated popularity are unknown, without changing stored rows',()=>{
  const row={name:'Fixture',source:'osm',category:'Restaurant',neighborhood:'Test area',price_level:2,price_label:'$$',description:'Fixture — a popular restaurant in Test area.'};
  const shown=publicVenue(row);
  assert.equal(shown.price_level,null);assert.equal(shown.price_label,null);assert.equal(shown.price_status,'unknown');
  assert.equal(shown.description,null);assert.equal(row.description,'Fixture — a popular restaurant in Test area.');assert.equal(row.price_level,2);
  assert.equal(publicVenue({...row,description:'A factual operator description.'}).description,'A factual operator description.');
});
test('reviewed prices match the current field and valid source/date, without whole-record verification',()=>{
  const row={source:'openstreetmap',price_level:3,price_label:'invented',field_provenance:{price_level:fact(3)}};
  const shown=publicVenue(row);assert.equal(shown.price_level,3);assert.equal(shown.price_label,'$$$');assert.equal(shown.price_status,'source_checked');
  assert.deepEqual(shown.reviewed_fields,['price_level']);assert.equal(shown.source_verification_status,'source_record_unverified');
  for(const bad of [{...fact(2)},{...fact(3),status:'unreviewed'},{...fact(3),source_url:'javascript:alert(1)'},{...fact(3),observed_at:'2026-02-30'},{...fact(3),observed_at:'2999-01-01'}]){
    assert.equal(publicVenue({...row,field_provenance:{price_level:bad}}).price_level,null);
  }
});
test('public provenance does not expose operator notes or absent/private fields',()=>{
  const row={name:'Fixture',duplicate_of:'private-operator-id',duplicate_review:{note:'Internal operator note'},field_provenance:{name:{...fact('Fixture'),note:'Internal operator note'},secret:fact('hidden'),address:fact('not in DTO')}};
  const shown=publicVenue(row);assert.deepEqual(Object.keys(shown.field_provenance),['name']);assert.equal(shown.field_provenance.name.note,undefined);assert.equal(shown.duplicate_review,undefined);assert.equal(shown.duplicate_of,undefined);
});
test('price filtering uses evidence and geography recognizes municipality separately from neighborhood',()=>{
  const q=discovery.build({price_level:'2',neighborhood:'Cambridge'});
  assert(q.where.includes("'field_provenance'"));assert(q.where.includes('v.city ILIKE'));assert(q.where.includes('v.neighborhood ILIKE'));
  assert(reviewedPriceSQL('v').includes('to_jsonb(v)'));assert.throws(()=>reviewedPriceSQL('v;DROP TABLE venues'));
});
test('price SQL is compatible with old schema and rejects stale, mismatched or impossible evidence',async()=>{
  const {PGlite}=await import('@electric-sql/pglite'); const db=new PGlite();
  try {
    await db.exec('CREATE TABLE venues (id integer PRIMARY KEY, price_level integer)');
    await db.query('INSERT INTO venues VALUES (1,2)');
    assert.equal((await db.query(`SELECT ${reviewedPriceSQL('v')} AS price FROM venues v`)).rows[0].price,null);
    await db.exec("ALTER TABLE venues ADD COLUMN field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb");
    const samples=[fact(2),{...fact(2),observed_at:'2026-02-30'},{...fact(2),observed_at:'2026-13-10'},
      {...fact(2),observed_at:'0000-01-01'},{...fact(2),observed_at:'2999-01-01'},
      {...fact(2),observed_at:'not a date'},{...fact(3)},{...fact(2),source_url:'javascript:alert(1)'}];
    for(let i=0;i<samples.length;i++){
      await db.query('UPDATE venues SET field_provenance=$1::jsonb WHERE id=1',[JSON.stringify({price_level:samples[i]})]);
      assert.equal((await db.query(`SELECT ${reviewedPriceSQL('v')} AS price FROM venues v`)).rows[0].price,i===0?2:null);
    }
  } finally { await db.close(); }
});

test('reviewed numeric coordinates survive pg decimal strings but reject mismatched points',()=>{
  const row={lat:'42.370554',lng:'-71.097126',field_provenance:{lat:fact(42.370554),lng:fact(-71.097126)}};
  assert.deepEqual(publicVenue(row).reviewed_fields,['lat','lng']);
  assert.equal(publicVenue(row).field_provenance.lat.value,42.370554);
  assert.deepEqual(publicVenue({...row,lat:'42.370000'}).reviewed_fields,['lng']);
});
