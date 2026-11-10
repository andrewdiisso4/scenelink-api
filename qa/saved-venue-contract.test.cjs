'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {savedVenue}=require('../src/services/venue-helpers');
const venueId='00000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000002';
const listId='00000000-0000-4000-8000-000000000003';
const fixture=available=>({venue_id:venueId,venue_name:'Saved isolated venue',name:'Saved isolated venue',venue_available:available,
  rating:4.9,venue_rating:4.9,source:'fixture-only',reservation_url:'https://example.com/booking',reservation_live:true});

test('unavailable saved venues retain identity without stale booking actions or manufactured ratings',()=>{
  const held=savedVenue(fixture(false));
  assert.equal(held.venue_id,venueId);assert.equal(held.venue_name,'Saved isolated venue');
  assert.equal(held.venue_status,'unavailable');assert.equal(held.venue_available,false);
  assert.equal(held.rating,null);assert.equal(held.venue_rating,null);assert.equal(held.reservation_url,null);
  assert.equal(held.booking.status,'not_available');assert.equal(held.reservation_is_confirmed,false);
  const active=savedVenue(fixture(true));assert.equal(active.venue_status,'available');
  assert.equal(active.booking.status,'external_link');assert.equal(active.booking.reservation_confirmed,false);
});

async function withRoute(name,database,run) {
  const paths=['../src/config/database','../src/middleware/auth','../src/routes/'+name].map(require.resolve);
  const old=paths.map(p=>require.cache[p]);for(const p of paths)delete require.cache[p];
  require.cache[paths[0]]={id:paths[0],filename:paths[0],loaded:true,exports:database};
  const next=(_q,_s,next)=>next();
  require.cache[paths[1]]={id:paths[1],filename:paths[1],loaded:true,exports:{requireAuth:next,optionalAuth:next}};
  try{await run(require('../src/routes/'+name));}
  finally{paths.forEach((p,i)=>{if(old[i])require.cache[p]=old[i];else delete require.cache[p];});}
}
async function call(router,method,path,{body={},params={},status=200}={}) {
  const handler=router.stack.find(layer=>layer.route?.path===path&&layer.route.methods[method]).route.stack.at(-1).handle;
  let output,actual=200;const res={headersSent:false,setHeader(){},vary(){},status(code){actual=code;return this;},json(value){output=value;return value;}};
  await handler({user:{id:userId},body,params,query:{}},res,error=>{throw error;});assert.equal(actual,status,JSON.stringify(output));return output;
}

test('favorites read retains withdrawn entries and new saves reject closed sources before writing',async()=>{
  const calls=[],database={async query(sql,values){calls.push({sql,values});
    if(sql.includes('FROM favorites f'))return{rows:[fixture(false)]};
    return{rows:[]};},async connect(){return{query:database.query,release(){}};}};
  await withRoute('favorites',database,async router=>{
    const output=await call(router,'get','/');assert.equal(output.favorites[0].venue_status,'unavailable');assert.equal(output.favorites[0].venue_rating,null);
    await call(router,'post','/:venueId',{params:{venueId},status:404});
    assert(calls.some(x=>x.sql.includes('FOR SHARE')&&x.sql.includes("'temporarily_closed','permanently_closed'")));
    assert(calls.some(x=>x.sql==='ROLLBACK'));assert(!calls.some(x=>x.sql.startsWith('INSERT')));
  });
});

test('favorite removal remains possible after venue withdrawal and never revalidates its availability',async()=>{
  const calls=[],database={async query(sql,values){calls.push({sql,values});
    return{rows:sql.startsWith('SELECT id FROM favorites')?[{id:'fixture-favorite'}]:[]};},async connect(){return{query:database.query,release(){}};}};
  await withRoute('favorites',database,async router=>{
    const output=await call(router,'post','/toggle',{body:{venue_id:venueId}});assert.equal(output.favorited,false);
    await call(router,'delete','/:venueId',{params:{venueId}});
    assert(calls.some(x=>x.sql.includes('pg_advisory_xact_lock')));assert(!calls.some(x=>x.sql.includes('FROM venues')));
    assert.equal(calls.filter(x=>x.sql.startsWith('DELETE FROM favorites')).length,2);
  });
});

test('private saved lists normalize venues and detail queries enforce owner profile visibility',async()=>{
  const calls=[],database={async query(sql,values){calls.push({sql,values});
    if(sql.includes('FROM lists l'))return{rows:[{id:listId,user_id:userId,name:'Fixture list',is_public:false,is_owner:true,can_edit:true,revision:1}]};
    if(sql.includes('FROM list_venues'))return{rows:[fixture(false)]};return{rows:[]};},async connect(){return{query:database.query,release(){}};}};
  await withRoute('lists',database,async router=>{
    assert.equal((await call(router,'get','/')).lists[0].venues[0].venue_status,'unavailable');
    const output=await call(router,'get','/:listId',{params:{listId}});assert.equal(output.list.venues[0].rating,null);
    const detail=calls.find(x=>x.sql.includes('FROM lists l JOIN users')&&x.sql.includes('l.id=$2'));assert.deepEqual(detail.values,[userId,listId]);
    assert(detail.sql.includes('u.is_private'));assert(detail.sql.includes('user_blocks'));assert(detail.sql.includes('is_suspended'));
    await call(router,'post','/:listId/venues',{params:{listId},body:{venue_id:venueId},status:404});
    const availability=calls.find(x=>x.sql.startsWith('SELECT id FROM venues'));assert(availability.sql.includes('permanently_closed'));
    assert(!calls.some(x=>x.sql.startsWith('INSERT INTO list_venues')));
  });
});
