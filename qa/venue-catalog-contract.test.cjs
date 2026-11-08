'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {safePublicHttps,bookingLink,publicVenue}=require('../src/services/venue-helpers');
const discovery=require('../src/launch/discovery');

const fixture=()=>({id:'00000000-0000-4000-8000-000000000001',name:'Isolated fixture',source:'fixture-only',
  rating:4.9,review_count:400,buzz_score:99,going_count:80,friends_going:12,trending:true,featured:true,spotlight:true,
  why_hot:'Invented popularity',score:99,is_open_now:true,reservation_live:true,reservation_provider:'Guaranteed booking',
  reservation_url:'javascript:alert(1)',opentable_url:'https://www.opentable.com/r/test-only-fixture'});

test('booking links reject active-content, credentials, local/IP hosts and non-HTTPS URLs',()=>{
  for(const value of [null,42,'','javascript:alert(1)','data:text/html,fixture','//resy.com/example','http://resy.com/example',
    'https://user:password@resy.com/example','https://localhost/example','https://127.0.0.1/example','https://[::1]/example',
    'https://2130706433/example','https://0x7f000001/example','https://venue.local/example','https://venue.internal/example',
    'https://test.invalid/example','https://resy.com:8443/example','https://resy.com/has space','https://resy.com/\npath',
    'https://resy.com\\@unsafe.example/'])assert.equal(safePublicHttps(value),null,String(value));
  assert.equal(safePublicHttps('https://resy.com/cities/bos/test?date=2026-10-30'),'https://resy.com/cities/bos/test?date=2026-10-30');
});

test('booking provider is derived from the actual host, never a legacy success flag',()=>{
  const booking=bookingLink(fixture());
  assert.equal(booking.provider,'OpenTable');assert.equal(booking.status,'external_link');
  assert.equal(booking.reservation_confirmed,false);assert.equal(booking.requires_external_confirmation,true);
  assert.equal(bookingLink({reservation_url:'https://resy.com.example.com/path',reservation_provider:'Resy'}).provider,'External site');
  assert.deepEqual(bookingLink({reservation_live:true,reservation_provider:'Confirmed'}),{
    status:'not_available',url:null,provider:null,requires_external_confirmation:true,reservation_confirmed:false});
});

test('public catalog never revives fabricated metrics or availability and does not mutate stored input',()=>{
  const original=fixture(),visible=publicVenue(original);
  for(const key of ['rating','review_count','buzz_score','going_count','friends_going','trending','featured','spotlight','why_hot','score','is_open_now','reservation_live'])assert.equal(visible[key],null,key);
  assert.equal(visible.reservation_is_confirmed,false);assert.equal(visible.metrics_status,'unverified');
  assert.equal(visible.source_verification_status,'source_record_unverified');
  assert.equal(visible.reservation_url,visible.booking.url);assert.equal(visible.reservation_provider,'OpenTable');
  assert.equal(original.rating,4.9);assert.equal(original.reservation_url,'javascript:alert(1)');
  assert.equal(publicVenue({name:'No source'}).source_verification_status,'unknown');
});

test('stock and unsafe photos cannot reappear through detail, concierge or saved-card fields',()=>{
  const value=publicVenue({image_url:'https://images.unsplash.com/fixture',cover_image_url:'https://images.pexels.com/fixture',
    venue_image:'javascript:alert(1)',has_real_photo:true,thumbnail_url:'/api/photo?name=places/test/photos/test&w=600',
    image_urls:['https://images.unsplash.com/fixture','https://example.com/venue-owned-photo.jpg']});
  assert.equal(value.image_url,null);assert.equal(value.cover_image_url,null);assert.equal(value.venue_image,null);
  assert.equal(value.thumbnail_url,'/api/photo?name=places/test/photos/test&w=600');
  assert.deepEqual(value.image_urls,['https://example.com/venue-owned-photo.jpg']);
  assert.equal(publicVenue({image_url:'https://images.unsplash.com/fixture',has_real_photo:true}).has_real_photo,false);
});

test('discovery filters and ordering cannot turn old popularity or ratings into a ranking',()=>{
  for(const mode of ['all','tonight','featured','nightlife','map']){
    const query=discovery.build({sort:'rating'},mode);
    assert.equal(query.sortApplied,'name');assert.equal(query.order,'lower(v.name) ASC, v.id ASC');
    assert(!/featured|trending|spotlight|rating|buzz_score|RANDOM/i.test(query.where+' '+query.order));
    assert(query.where.includes('v.is_active IS TRUE'));assert(query.where.includes('CLOSED%'));
    assert(query.where.includes("'temporarily_closed','permanently_closed'"));
  }
  const literal=discovery.build({q:'Harbor% _ Test'});assert(literal.values.includes('%harbor\\%%'));
  assert.throws(()=>discovery.build({sort:'most_fake_popular'}));
});

test('list, map, featured, detail and universal search use the same safe venue contract',async()=>{
  const routes=new Map(),queries=[];
  const router={get(path,...handlers){routes.set(path,handlers.at(-1));}};
  const pool={async query(sql,values){queries.push({sql,values});
    if(/COUNT\(\*\)::int AS total/.test(sql))return{rows:[{total:1}]};
    if(/SELECT DISTINCT|FROM users/.test(sql))return{rows:[]};
    return{rows:[fixture()]};
  }};
  discovery.install({router,pool,auth:{optionalAuth:(_q,_s,next)=>next()}});
  async function call(path,req){let result;const res={setHeader(){},status(code){assert.equal(code,200);return this;},json(value){result=value;}};
    await routes.get(path)({query:{},params:{},...req},res,error=>{throw error;});return result;
  }
  const expected=publicVenue(fixture());
  for(const path of ['/venues','/venues/map','/venues/tonight','/venues/featured','/venues/nightlife','/venues/search']){
    const result=await call(path);assert.deepEqual(result.venues[0],expected,path);assert.equal(result.selection_basis,'catalog_not_live_availability');
  }
  assert.deepEqual(await call('/venues/:identifier',{params:{identifier:fixture().id}}),expected);
  assert.deepEqual(await call('/venues/slug/:slug',{params:{slug:'fixture'}}),expected);
  assert.deepEqual((await call('/search/universal',{query:{q:'fixture'}})).venues[0],expected);
  assert(queries.some(x=>x.sql.includes('v.opentable_url,v.resy_url')),'cards have the same provider links as detail');
});

async function withConciergeFixture(database,run) {
  const paths=['../src/config/database','../src/routes/conciergeAI','../src/routes/concierge','../src/middleware/auth'];
  const resolved=paths.map(p=>require.resolve(p)),previous=resolved.map(p=>require.cache[p]);
  for(const p of resolved)delete require.cache[p];
  require.cache[resolved[0]]={id:resolved[0],filename:resolved[0],loaded:true,exports:database};
  // A middleware stub prevents this pure contract test from requiring any identity
  // secret. The real HTTP/JWT gate separately tests authentication and permissions.
  require.cache[resolved[3]]={id:resolved[3],filename:resolved[3],loaded:true,exports:{optionalAuth:(_q,_s,next)=>next()}};
  try {await run(require('../src/routes/conciergeAI'),require('../src/routes/concierge'));}
  finally {for(let i=0;i<resolved.length;i++)if(previous[i])require.cache[resolved[i]]=previous[i];else delete require.cache[resolved[i]];}
}

test('AI candidate fetch and model summaries cannot disclose legacy manufactured popularity',async()=>{
  const calls=[],database={async query(sql,params){calls.push({sql,params});return{rows:[fixture()]};}};
  await withConciergeFixture(database,async ai=>{
    const rows=await ai.fetchCandidateVenues(ai.parseFilters('Italian in Southie'));
    assert.deepEqual(rows,[publicVenue(fixture())]);
    assert.deepEqual(await ai.fetchVenuesByIds([fixture().id]),rows);
    assert.equal(calls[0].sql.includes('ORDER BY lower(name), id'),true);
    assert(!/ORDER BY.*(?:rating|score|RANDOM)/.test(calls[0].sql));
    const summary=ai.summarizeVenueForLLM(fixture());
    assert.equal(summary.rating,null);assert.equal(summary.trending,null);assert.equal(summary.whyHot,null);
    assert.equal(summary.reservationConfirmed,false);assert.equal(summary.availability,'unknown');
  });
});

test('rule-based concierge shares venue booking semantics and reviewed-event source gate',async()=>{
  const calls=[],event={id:'00000000-0000-4000-8000-000000000002',title:'Isolated reviewed event fixture',date:'2099-01-01',
    source:'official_venue',source_url:'https://example.com/event',event_url:'https://example.com/event',attending_count:0};
  const database={async query(sql,params){calls.push({sql,params});return{rows:sql.includes('FROM events e')?[event]:sql.includes('FROM venues')?[fixture()]:[]};}};
  await withConciergeFixture(database,async(_ai,router)=>{
    const handler=router.stack.find(layer=>layer.route?.path==='/'&&layer.route.methods.post).route.stack.at(-1).handle;
    async function ask(message){let output;const res={setHeader(){},status(code){assert.equal(code,200);return this;},json(body){output=body;return body;}};
      await handler({body:{message,ai:false}},res);return output;
    }
    const places=await ask('Book Italian in Southie');
    assert.deepEqual(places.venues,[publicVenue(fixture())]);
    assert.equal(places.actions[0].reservation_confirmed,false);
    assert(places.actions[0].label.startsWith('Check booking options for '));
    const events=await ask('concert tonight');
    assert.equal(events.events[0].title,event.title);assert.equal(events.events[0].rsvp_is_reservation,false);
    assert.equal(events.events[0].booking_status,'not_booked');
    const query=calls.find(call=>call.sql.includes('FROM events e'));
    assert(query.sql.includes("source_review_status='reviewed'"));assert(query.sql.includes('e.date BETWEEN $1::date AND $2::date'));
    assert.match(query.params[0],/^\d{4}-\d{2}-\d{2}$/);assert(!query.sql.includes('event_date'));
  });
});
