import assert from 'node:assert/strict';
import discovery from '../../src/services/venue-duplicate-discovery.js';
import helpers from '../../src/services/venue-helpers.js';

// Frozen pre-optimization predicate from c2eac302. Do not derive this oracle
// from the optimized expression: that would make the comparison circular.
export function legacyDiscoverySQL(alias = 'v') {
  const review = `(to_jsonb(${alias})->'duplicate_review')`;
  const identity = a => `jsonb_build_object('name',${a}.name,'address',${a}.address,'city',${a}.city)`;
  return `NOT EXISTS (
    SELECT 1 FROM venues duplicate_canonical
    WHERE duplicate_canonical.id::text = to_jsonb(${alias})->>'duplicate_of'
      AND duplicate_canonical.id <> ${alias}.id
      AND ${helpers.availableVenueSQL('duplicate_canonical')}
      AND NULLIF(to_jsonb(duplicate_canonical)->>'duplicate_of','') IS NULL
      AND ${review}->>'status' = 'reviewed_duplicate'
      AND ${review}->>'canonical_id' = duplicate_canonical.id::text
      AND ${review}->'alias_identity' = ${identity(alias)}
      AND ${review}->'canonical_identity' = ${identity('duplicate_canonical')}
  )`;
}
export const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-22222222222a', '33333333-3333-4333-8333-333333333333'];
const identity = {name:'Fictional Cafe',address:'10 Test Street',city:'Test City'};
function fixture() {
  const rows = ids.map(id => ({id,...identity,is_active:true,business_status:null,duplicate_of:null,duplicate_review:{}}));
  rows[0].duplicate_of=ids[1];
  rows[0].duplicate_review={status:'reviewed_duplicate',canonical_id:ids[1],alias_identity:{...identity},canonical_identity:{...identity}};
  return rows;
}

/** Uses a session-local temporary table only, on PGlite or a dedicated native
 * PostgreSQL connection. Covers absent/partial017 and damaged legacy shapes. */
export async function verifyEquivalence(db) {
  const results=[];
  async function schema(targetType, review=true, idType='uuid') {
    await db.query('DROP TABLE IF EXISTS pg_temp.venues');
    await db.query(`CREATE TEMP TABLE venues(id ${idType} PRIMARY KEY,name text,address text,city text,is_active boolean,business_status text${targetType?',duplicate_of '+targetType:''}${review?',duplicate_review jsonb':''})`);
  }
  async function run(name, rows, targetType, review=true, expectedAliasVisible) {
    await db.query('TRUNCATE pg_temp.venues');
    const columns=['id','name','address','city','is_active','business_status',...(targetType?['duplicate_of']:[]),...(review?['duplicate_review']:[])];
    for(const row of rows) {
      const values=columns.map(key => key==='duplicate_review'||(key==='duplicate_of'&&targetType==='jsonb') ? (row[key]===undefined?null:JSON.stringify(row[key])) : row[key]??null);
      await db.query(`INSERT INTO pg_temp.venues(${columns.join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')})`,values);
    }
    const before=legacyDiscoverySQL(),after=discovery.visibleDiscoveryVenueSQL();
    const values=(await db.query(`SELECT v.id,(${before}) AS before,(${after}) AS after FROM venues v ORDER BY v.id`)).rows;
    for(const row of values) {assert.equal(row.after,row.before,name+': '+row.id);assert.equal(typeof row.after,'boolean');}
    if(expectedAliasVisible!==undefined) assert.equal(values.find(row=>row.id===ids[0]).after,expectedAliasVisible,name);
    for(const compose of [p=>`${helpers.availableVenueSQL('v')} AND ${p}`,p=>`v.city IS NULL OR ${p}`,p=>`FALSE AND ${p}`,p=>`NULL::boolean AND ${p}`,p=>`NOT ${p}`,p=>`${p} OR NULL::boolean`]) {
      const query=p=>`SELECT v.id FROM venues v WHERE ${compose(p)} ORDER BY v.id`;
      assert.deepEqual((await db.query(query(after))).rows,(await db.query(query(before))).rows,name+': WHERE composition');
    }
    results.push({name,rows:rows.length,equivalent:true});
  }
  try {
    for(const [targetType,review,label] of [[null,false,'pre017'],[null,true,'review-only'],['uuid',false,'target-only']]) {
      await schema(targetType,review);
      await run(label,fixture(),targetType,review,true);
    }
    await schema('uuid');
    const cases=[['valid reviewed alias',r=>{},false],['SQL NULL target',r=>{r[0].duplicate_of=null;},true],['missing canonical',r=>{r.splice(1,1);},true],['self link',r=>{r[0].duplicate_of=ids[0];r[0].duplicate_review.canonical_id=ids[0];},true],['canonical chain',r=>{r[1].duplicate_of=ids[2];},true],['canonical cycle',r=>{r[1].duplicate_of=ids[0];},true],['inactive canonical',r=>{r[1].is_active=false;},true],['NULL active canonical',r=>{r[1].is_active=null;},true],['inactive alias still uses same predicate',r=>{r[0].is_active=false;},false]];
    for(const value of ['CLOSED','CLOSED_TEMPORARILY','closed_permanently','temporarily_closed','permanently_closed']) cases.push(['closed canonical '+value,r=>{r[1].business_status=value;},true]);
    for(const field of ['name','address','city']) {
      for(const index of [0,1]) cases.push([`drift ${index} ${field}`,r=>{r[index][field]='Changed';},true]);
      cases.push(['matching null '+field,r=>{r[0][field]=null;r[1][field]=null;r[0].duplicate_review.alias_identity[field]=null;r[0].duplicate_review.canonical_identity[field]=null;},false]);
    }
    for(const value of [null,{},[],[{}],true,false,0,'reviewed_duplicate']) cases.push(['malformed review '+JSON.stringify(value),r=>{r[0].duplicate_review=value;},true]);
    for(const field of ['status','canonical_id','alias_identity','canonical_identity']) {
      cases.push(['missing '+field,r=>{delete r[0].duplicate_review[field];},true]);
      for(const value of [null,false,42,[],{},'wrong']) cases.push([field+'='+JSON.stringify(value),r=>{r[0].duplicate_review[field]=value;},true]);
    }
    cases.push(['extra alias identity key',r=>{r[0].duplicate_review.alias_identity.extra=true;},true]);
    cases.push(['extra review metadata is unchanged',r=>{r[0].duplicate_review.note='Ignored metadata';},false]);
    for(const [name,change,expected] of cases) {const rows=fixture();change(rows);await run(name,rows,'uuid',true,expected);}
    for(const targetType of ['text','jsonb']) {
      await schema(targetType);
      const values=targetType==='text'?['',' ','null','not-a-uuid',ids[1].toUpperCase()]:[null,'',' ','null',false,0,{},[],{id:ids[1]},[ids[1]],ids[1]];
      for(const value of values) {const rows=fixture();rows[0].duplicate_of=value;await run(targetType+' target '+JSON.stringify(value),rows,targetType);}
      for(const value of values) {const rows=fixture();rows[1].duplicate_of=value;await run(targetType+' canonical target '+JSON.stringify(value),rows,targetType);}
    }
    // This deliberately nonproduction text-ID schema proves that an empty
    // string must NOT be normalized to SQL NULL by the new outer guard.
    await schema('text',true,'text');
    const rows=fixture();rows[1].id='';rows[0].duplicate_of='';rows[0].duplicate_review.canonical_id='';
    await run('empty-string canonical ID remains suppressible',rows,'text',true,false);
    const aliases=['venues','v','duplicate_metadata','DUPLICATE_METADATA','duplicate_candidate','duplicate_metadata_alt','duplicate_candidate_alt'];
    for(const alias of aliases) {
      const query=predicate=>`SELECT ${alias}.id FROM venues ${alias} WHERE ${predicate} ORDER BY ${alias}.id`;
      assert.deepEqual((await db.query(query(discovery.visibleDiscoveryVenueSQL(alias)))).rows,
        (await db.query(query(legacyDiscoverySQL(alias)))).rows,'Internal names must not shadow outer alias '+alias);
    }
    return {case_count:results.length,outer_alias_checks:aliases.length,cases:results};
  } finally {await db.query('DROP TABLE IF EXISTS pg_temp.venues');}
}
