import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import discovery from '../src/services/venue-duplicate-discovery.js';
import {verifyEquivalence} from './fixtures/duplicate-discovery-equivalence.mjs';

test('NULL-only discovery guard preserves pre017, reviewed, malformed and composed predicates',async()=>{
  const db=new PGlite();
  try {const result=await verifyEquivalence(db);assert.equal(result.case_count,97);}
  finally {await db.close();}
});
test('guard stays NULL-only and the full expression remains parenthesized',()=>{
  const sql=discovery.visibleDiscoveryVenueSQL('venues');
  assert.ok(sql.startsWith("(to_jsonb(venues)->>'duplicate_of' IS NULL OR NOT EXISTS ("));
  assert.ok(sql.endsWith('))'));
  assert.throws(()=>discovery.visibleDiscoveryVenueSQL('duplicate_canonical'));
  for(const alias of ['','v.x','v;DROP TABLE venues','v) OR TRUE --']) assert.throws(()=>discovery.visibleDiscoveryVenueSQL(alias));
});
