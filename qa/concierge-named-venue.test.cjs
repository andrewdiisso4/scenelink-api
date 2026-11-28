const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { explicitName, resolveNamedVenue } = require('../src/services/concierge-named-venue');
const root = require('node:path').join(__dirname, '..');
function queryFunction(file, start, end, pool, extra = {}) {
  const source = fs.readFileSync(root + '/src/routes/' + file, 'utf8');
  return vm.runInNewContext(source.slice(source.indexOf(start), source.indexOf(end)) + '\n' + start.match(/function (\w+)/)[1], {
    pool, availableVenueSQL: () => 'is_active = true', visibleDiscoveryVenueSQL: () => 'hidden = false',
    reviewedPriceSQL: () => 'reviewed_price', publicVenue: v => v, MAX_CANDIDATE_VENUES: 20,
    VENUE_SELECT: '*', ...require('../src/services/concierge-query-constraints'), ...extra
  });
}
test('explicit parsing isolates names including cuisine/category words and preserves constraints', () => {
  assert.deepEqual(explicitName('Tell me about "Zebra Italian Cafe" in Back Bay under $30'), { name:'Zebra Italian Cafe',filterText:'Tell me about  in Back Bay under $30' });
  assert.deepEqual(explicitName('Find a venue'), null);
  assert.equal(explicitName('find venue named Zebra Cafe').name,'Zebra Cafe');
  assert.equal(explicitName('tell me about Zebra Cafe in Back Bay').filterText,'in Back Bay');
  assert.equal(explicitName('best italian restaurants'),null);
});
test('exact bare lookup checks catalog before candidate limits and binds hostile names', async () => {
  let seen;
  const pool = { query: async (sql, values) => { seen={sql,values}; return {rows:[{name:values[0]}]}; } };
  const name = "Zebra Cafe %_'; DROP TABLE venues; --";
  assert.equal((await resolveNamedVenue(pool,name)).name,name);
  assert.deepEqual(seen.values,[name]);
  assert.ok(!seen.sql.includes(name));
  assert.match(seen.sql,/lower\(name\) = lower\(\$1\)/);
  assert.match(seen.sql,/LIMIT 1/);
});
test('explicit unknown name never becomes generic; generic requests remain generic', async () => {
  const pool = { query:async()=>({rows:[]}) };
  assert.equal((await resolveNamedVenue(pool,'look up Missing Fictional Place')).name,'Missing Fictional Place');
  assert.equal(await resolveNamedVenue(pool,'recommend italian in Back Bay'),null);
});
for (const [file,start,end,filters] of [
 ['conciergeAI.js','async function fetchCandidateVenues','async function fetchVenuesByIds',{venueName:'Zebra Italian Cafe',neighborhoods:['Back Bay'],priceMax:2,cuisines:[],venueType:null}],
 ['concierge.js','async function queryVenues','async function queryEvents',{venueName:'Zebra Italian Cafe',neighborhoods:['Back Bay'],budget:2,cuisines:[],vibes:[]}]
]) test(file+' restricts named lookup before limit with no unrelated fallback',async()=>{
  const catalog=Array.from({length:40},(_,i)=>({id:i,name:'Alpha '+i})).concat({id:99,name:'Zebra Italian Cafe'});
  let seen;
  const pool={query:async(sql,values)=>{seen={sql,values};return {rows:catalog.filter(v=>v.name===values[0])}}};
  const query=queryFunction(file,start,end,pool);
  assert.equal((await query(filters,5))[0].id,99);
  assert.match(seen.sql,/lower\(name\) = lower\(\$1\)/);
  assert.match(seen.sql,/is_active = true AND hidden = false/);
  assert.match(seen.sql,/reviewed_price <=/);
  assert.ok(seen.values.some(v=>Array.isArray(v)&&v.some(x=>x.includes('Back Bay'))));
  assert.equal((await query({...filters,venueName:'Missing'},5)).length,0);
});
test('both entry paths resolve names before interpreting name words as constraints',()=>{
  const shared=fs.readFileSync(root+'/src/services/concierge-conversation.js','utf8');
  assert.match(shared,/await resolveNamedVenue\(pool, constraints.positiveText\)/);
  assert.match(shared,/const filterText = named \? named.filterText/);
  assert.match(shared,/const parsed = parse\(filterText\)/);
  for(const file of ['concierge.js','conciergeAI.js']){
    const text=fs.readFileSync(root+'/src/routes/'+file,'utf8');
    assert.match(text,/await resolveConversation\(/);
  }
});
test('real embedded PostgreSQL name lookup reaches beyond20 and excludes unavailable/reviewed duplicates',async()=>{
 const {PGlite}=require('@electric-sql/pglite');
 const db=new PGlite();
 const {availableVenueSQL}=require('../src/services/venue-helpers');
 const {visibleDiscoveryVenueSQL}=require('../src/services/venue-duplicate-discovery');
 try {
  await db.exec(`CREATE TABLE venues(id integer primary key,name text,address text,city text,neighborhood text,is_active boolean default true,business_status text,duplicate_of text,duplicate_review jsonb,reviewed_price integer); INSERT INTO venues(id,name) SELECT i,'Alpha '||i FROM generate_series(1,40) i; INSERT INTO venues(id,name,address,city,neighborhood,reviewed_price) VALUES(99,'Zebra Italian Cafe','1 Test','Boston','Back Bay',2),(100,'Alias Cafe','2 Test','Boston','Back Bay',2);`);
  await db.query(`UPDATE venues SET duplicate_of='99',duplicate_review=$1 WHERE id=100`,[JSON.stringify({status:'reviewed_duplicate',canonical_id:'99',alias_identity:{name:'Alias Cafe',address:'2 Test',city:'Boston'},canonical_identity:{name:'Zebra Italian Cafe',address:'1 Test',city:'Boston'}})]);
  const query=queryFunction('conciergeAI.js','async function fetchCandidateVenues','async function fetchVenuesByIds',db,{availableVenueSQL,visibleDiscoveryVenueSQL});
  assert.equal((await resolveNamedVenue(db,'Zebra Italian Cafe')).name,'Zebra Italian Cafe');
  const filters={venueName:'Zebra Italian Cafe',neighborhoods:['Back Bay'],priceMax:2,cuisines:[]};
  assert.equal((await query(filters))[0].id,99);
  assert.equal((await query({...filters,neighborhoods:['North End']})).length,0);
  assert.equal((await query({...filters,priceMax:1})).length,0);
  assert.equal((await resolveNamedVenue(db,'Alias Cafe')).name,'Alias Cafe');
  for(const name of ['Missing','Alias Cafe',''])assert.equal((await query({...filters,venueName:name})).length,0);
  await db.query("UPDATE venues SET business_status='CLOSED_PERMANENTLY' WHERE id=99");
  assert.equal((await resolveNamedVenue(db,'Zebra Italian Cafe')).name,'Zebra Italian Cafe');
  assert.equal((await query(filters)).length,0);
  await db.query("UPDATE venues SET business_status=NULL,is_active=false WHERE id=99");
  assert.equal((await resolveNamedVenue(db,'Zebra Italian Cafe')).name,'Zebra Italian Cafe');
  assert.equal((await query(filters)).length,0);
 } finally {await db.close();}
});
test('blank quoted name fails closed in both candidate query builders',async()=>{
 assert.equal(explicitName('"   "').name,'');
 for(const [file,start,end,filters] of [
  ['conciergeAI.js','async function fetchCandidateVenues','async function fetchVenuesByIds',{venueName:'',cuisines:[]}],
  ['concierge.js','async function queryVenues','async function queryEvents',{venueName:'',cuisines:[],vibes:[],neighborhoods:[]}]
 ]) {
  const query=queryFunction(file,start,end,{query:async(sql,values)=>{assert.match(sql,/lower\(name\) = lower\(\$1\)/);assert.equal(values[0],'');return {rows:[]};}});
  assert.equal((await query(filters)).length,0);
 }
});

test('long quoted names within request limit remain restrictive explicit lookup',async()=>{
 const name='Z'.repeat(240);
 assert.equal(explicitName('tell me about "'+name+'"').name,name);
 const pool={query:async()=>{throw Error('explicit lookup needs no existence probe');}};
 assert.equal((await resolveNamedVenue(pool,'"'+name+'"')).name,name);
});
