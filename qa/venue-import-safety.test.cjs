'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeCsvRow,upsertVenue,toNum,computeQuality}=require('../src/services/venue-helpers');
function pool(){const calls=[];return{calls,async query(sql,values){calls.push({sql,values});return{rows:sql.startsWith('INSERT')?[{id:'fixture-id',slug:'fixture-slug'}]:[]};}};}
test('blank factual fields stay unknown, not Boston, MA, zero coordinates or $$',async()=>{
 const v=normalizeCsvRow({name:'Factual fixture',latitude:' ',longitude:'',price_level:''});
 assert.equal(v.city,'');assert.equal(v.state,'');assert.equal(v.lat,null);assert.equal(v.lng,null);assert.equal(v.price_level,null);assert.equal(toNum(' '),null);
 const db=pool();await upsertVenue(db,v,{ifExists:'skip'});const insert=db.calls.find(x=>x.sql.startsWith('INSERT'));
 assert.equal(insert.values[6],null);assert.equal(insert.values[7],null);assert.equal(insert.values[17],null);
 assert.equal(db.calls.filter(x=>x.sql.startsWith('SELECT')).length,0);
});
test('same brand and empty or shared neighborhood never establishes duplicate identity',async()=>{
 const db=pool();await upsertVenue(db,{name:'Same Brand',city:'Quincy',address:'200 Test Street',neighborhood:'',source:'verified-fixture'},{ifExists:'skip'});
 const match=db.calls.find(x=>x.sql.startsWith('SELECT'));
 assert.deepEqual(match.values,['Same Brand','Quincy','200 Test Street']);assert(!match.sql.includes('neighborhood'));assert(!match.sql.includes(' OR '));
 const missing=pool();await upsertVenue(missing,{name:'Same Brand',city:'Quincy',neighborhood:'Shared neighborhood'},{ifExists:'skip'});assert.equal(missing.calls.filter(x=>x.sql.startsWith('SELECT')).length,0);
});
test('source identity skip never updates existing record',async()=>{
 const calls=[],db={async query(sql,values){calls.push(sql);return{rows:[{id:'stable-id',slug:'stable-slug'}]};}};
 const result=await upsertVenue(db,{name:'Fixture',city:'Quincy',source:'overture',external_id:'fixture-source-id'},{ifExists:'skip'});
 assert.equal(result.action,'skipped');assert.equal(calls.length,1);assert(calls[0].includes('external_id=$1 AND source=$2'));
});
test('zero-valued real coordinates are not treated as absent',()=>{
 assert.notEqual(computeQuality({name:'Fixture',address:'Known street',lat:0,lng:0,category:'cafe',website:'https://example.invalid'}).status,'needs_coordinates');
});
