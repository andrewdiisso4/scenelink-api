import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('call sites suppress discovery only; availableVenueSQL and explicit reference reads stay unchanged',async()=>{
  const load=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
  const main=await load('src/launch/discovery.js');
  assert.match(main,/conditions = \[availableVenueSQL\('v'\), visibleDiscoveryVenueSQL\('v'\)\]/);
  const detail=main.slice(main.indexOf('async function detail'),main.indexOf("router.get('/venues/slug"));
  assert.doesNotMatch(detail,/visibleDiscoveryVenueSQL/);
  for(const f of ['src/routes/concierge.js','src/routes/conciergeAI.js']) assert.match(await load(f),/\[availableVenueSQL\(''\), visibleDiscoveryVenueSQL\('venues'\)\]/);
  const ai=await load('src/routes/conciergeAI.js');
  assert.doesNotMatch(ai.slice(ai.indexOf('async function fetchVenuesByIds'),ai.indexOf('async function fetchUserContext')),/visibleDiscoveryVenueSQL/);
  const helpers=await load('src/services/venue-helpers.js');
  assert.doesNotMatch(helpers.slice(helpers.indexOf('function availableVenueSQL'),helpers.indexOf('function publicVenue(')),/duplicate/);
});
