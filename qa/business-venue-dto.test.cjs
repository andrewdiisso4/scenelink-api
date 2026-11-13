'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {businessVenue}=require('../src/services/business-venue-dto');
const sentinel='INTERNAL_REVIEW_SENTINEL_DO_NOT_EMIT';
const venue={id:'11111111-1111-4111-8111-111111111111',name:'Fictional owner cafe',address:'1 Test Street',city:'Boston',
  price_level:2,price_label:'$$',description:'Owner editable description',hours_display:'Owner editable hours',
  phone:'6175550100',website:'http://owner.example.com',tags:['owner tag'],is_primary:true,is_active:true,is_claimed:true,
  duplicate_of:'22222222-2222-4222-8222-222222222222',duplicate_review:{note:sentinel,operator:sentinel},
  field_provenance:{name:{status:'reviewed',value:'Fictional owner cafe',source_url:'https://venue.example.com/contact',observed_at:'2026-01-01',note:sentinel,operator:sentinel},private_field:{value:sentinel},address:{status:'reviewed',value:'Old address',source_url:'https://venue.example.com/contact',observed_at:'2026-01-01',note:sentinel}}};
function clean(row){
 assert(!JSON.stringify(row).includes(sentinel));assert(!Object.hasOwn(row,'duplicate_of'));assert(!Object.hasOwn(row,'duplicate_review'));
 assert.deepEqual(row.field_provenance,{name:{status:'reviewed',value:venue.name,source_url:'https://venue.example.com/contact',observed_at:'2026-01-01'}});
 assert.deepEqual(row.reviewed_fields,['name']);
 assert.equal(row.price_level,2);assert.equal(row.price_label,'$$');assert.equal(row.description,venue.description);assert.equal(row.hours_display,venue.hours_display);assert.equal(row.website,venue.website);assert.deepEqual(row.tags,venue.tags);assert.equal(row.is_primary,true);
}
test('owner DTO removes internal review fields without changing editable values or the stored row',()=>{
 const before=JSON.parse(JSON.stringify(venue));clean(businessVenue(venue));assert.deepEqual(venue,before);
 assert.equal(businessVenue(null),null);assert.equal(businessVenue(undefined),null);
 assert.deepEqual(businessVenue({name:'Legacy venue',price_level:3}),{name:'Legacy venue',price_level:3,field_provenance:{},reviewed_fields:[]});
});
test('every business venue response sanitizes a sentinel driver row, including create/add and projected routes',async()=>{
 // Isolated route-response contract test. No database, authentication provider,
 // mailer or external network is used. Real auth/SQL remain native suite gates.
 const express=require('express'),ownerId='33333333-3333-4333-8333-333333333333';
 let mode='';const queries=[];const restores=[];
 function mock(path,exports){const id=require.resolve(path);restores.push([id,require.cache[id]]);require.cache[id]={id,filename:id,loaded:true,exports};}
 const owner={id:ownerId,email:'owner@example.invalid',password_hash:'local-test-hash',venue_name:venue.name,venue_id:venue.id,tier:'enterprise',status:'active'};
 mock('../src/config/database',{query:async(sql,values)=>{
  queries.push({sql,values});
  if(/SELECT id FROM business_users WHERE LOWER\(email\)/.test(sql))return{rows:[]};
  if(/COUNT\(\*\)::int AS n/.test(sql))return{rows:[{n:0}]};
  if(/WITH all_ids|FROM venues|(?:INSERT INTO|UPDATE) venues[\s\S]*RETURNING \*/.test(sql))return{rows:[structuredClone(venue)]};
  if(/INSERT INTO business_users/.test(sql))return{rows:[{...owner,status:'pending'}]};
  if(/FROM business_users/.test(sql))return{rows:[{...owner,venue_id:mode==='create'?null:venue.id}]};
  if(/UPDATE business_users|INSERT INTO business_venues|UPDATE venues/.test(sql))return{rows:[]};
  throw Error('Unexpected fixture query: '+sql);
 }});
 mock('../src/middleware/auth',{generateBusinessToken:()=> 'local-fixture-token',requireBusinessAuth:(req,res,next)=>{req.user={id:ownerId,role:'business'};next();}});
 mock('bcryptjs',{hash:async()=> 'local-test-hash',compare:async()=>true});
 mock('../src/middleware/rateLimits',{authLimiter:(req,res,next)=>next(),passwordResetLimiter:(req,res,next)=>next(),contactLimiter:(req,res,next)=>next()});
 mock('../src/services/mailer',{});
 const routePath=require.resolve('../src/routes/business'),previousRoute=require.cache[routePath];delete require.cache[routePath];
 let server;
 try{
  const app=express();app.use(express.json());app.use('/business',require(routePath));server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port+'/business';
  const cases=[
   ['GET','/me',null,d=>d.user.venue],['GET','/venue',null,d=>d.venue],['GET','/venues',null,d=>d.venues[0]],
   ['POST','/login',{email:owner.email,password:'Local fixture password123'},d=>d.user.venue],
   ['POST','/claim',{venue_name:venue.name,email:'claim@example.invalid',password:'Local fixture password123'},d=>d.user.matched_venue],
   ['POST','/venue',{name:venue.name},d=>d.venue,'create'],
   ['PATCH','/venue',{description:venue.description},d=>d.venue],['PUT','/venue',{phone:venue.phone},d=>d.venue],
   ['POST','/venues/add',{existing_venue_id:venue.id},d=>d.venue],['POST','/venues/add',{name:venue.name},d=>d.venue],
   ['GET','/venues/search?q=Fictional',null,d=>d.venues[0]]
  ];
  for(const [method,path,body,pick,fixtureMode]of cases){
   mode=fixtureMode||'';const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const data=await response.json();assert(response.ok,method+' '+path+': '+JSON.stringify(data));assert(!JSON.stringify(data).includes(sentinel),method+' '+path);clean(pick(data));
  }
  assert(queries.length>cases.length);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(previousRoute)require.cache[routePath]=previousRoute;else delete require.cache[routePath];
  for(const [id,previous]of restores){if(previous)require.cache[id]=previous;else delete require.cache[id];}
 }
});
