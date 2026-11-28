#!/usr/bin/env node
'use strict';
// Explicit operator only. Never imported by app startup or an HTTP route.
// Existing local-only import/rehearsal guards are intentionally untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate:validateSource}=require('../../qa/tools/stage-venue-import.cjs');
const KIND='inactive_venue_intake_v1',VERSION='staged-venue-provenance-2026-10-27';
const SHA=/^[a-f0-9]{64}$/;
const MAX_ROWS=500,MAX_FILE=64*1024*1024,MAX_TOTAL=256*1024*1024;
const BASIC=new Set(['source','external_id','name','type','category','address','city','state','zip_code','lat','lng']);
const TABLES=['venues','venue_source_records','venue_import_batches'];
const reviewedPackets=new WeakSet(),explicitTargets=new WeakSet();
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
const digest=value=>hash(stable(value));
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function freeze(value){
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
}
function invocation(pool,packet,target){
  if(!reviewedPackets.has(packet))fail('INVALID_PACKET','Read and verify the packet with loadPacket before database use');
  if(!explicitTargets.has(target)||pool.options?.connectionString!==target.connectionString
    ||digest(pool.options?.ssl??null)!==digest(target.ssl)
    ||['host','port','user','password','database'].some(key=>pool.options?.[key]!==undefined))fail('INVALID_TARGET','Pool must use only the explicit validated intake connection');
}
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const address=value=>normalize(value).replace(/\b(street|avenue|road|boulevard|place|square)\b/g,
  word=>({street:'st',avenue:'ave',road:'rd',boulevard:'blvd',place:'pl',square:'sq'})[word]);
const identity=row=>normalize(row.name)+'|'+address(row.address);
const reviewNormalize=value=>String(value??'').normalize('NFKD').replace(/[^\x00-\x7F]/g,'').toLowerCase()
  .replace(/&/g,' and ').replace(/'/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\b(llc|inc|corp|corporation)\b/g,'')
  .trim().replace(/\s+/g,' ');
const reviewName=value=>reviewNormalize(value).replace(/^the /,'');
const streetAliases={street:'st',avenue:'ave',road:'rd',boulevard:'blvd',place:'pl',square:'sq',
  drive:'dr',court:'ct',parkway:'pkwy',terrace:'ter',lane:'ln',way:'way'};
function canonicalStreet(value){
  let key=reviewNormalize(String(value??'').split(',')[0].replace(/#\s*(?=[a-zA-Z0-9])/g,' unit '));
  key=key.replace(/\b(street|avenue|road|boulevard|place|square|drive|court|parkway|terrace|lane)\b/g,word=>streetAliases[word])
    .replace(/\b(ste|suite|unit|floor|fl)\b.*$/,'').trim()
    .replace(/\s+(st|ave|rd|blvd|pl|sq|dr|ct|way|ln|pkwy|ter)$/,'').trim();
  return /^\d+[a-z]?(?:\s+\d+)?\s+\S/.test(key)?key:'';
}
function nameCores(value){
  const tokens=reviewName(value).split(' ').filter(Boolean),variants=[tokens];
  if(tokens.length>1&&tokens.at(-1)==='boston')variants.push(tokens.slice(0,-1));
  const descriptors=new Set(['cafe','caffe','restaurant','bar']);
  variants.push(...variants.map(variant=>variant.filter(token=>!descriptors.has(token))));
  const stop=new Set([...descriptors,'a','an','and','at','by','for','in','of','on','the','to','boston']),cores=new Set();
  for(const variant of variants){
    const meaningful=variant.filter(token=>!stop.has(token));
    if(meaningful.some(token=>token.length>=4)||new Set(meaningful).size>=2)cores.add([...variant].sort().join(' '));
  }
  return cores;
}
function addressComponents(value){
  const raw=String(value??'').replace(/#\s*(?=[a-zA-Z0-9])/g,' unit '),units={};
  for(const match of reviewNormalize(raw).matchAll(/\b(ste|suite|unit|floor|fl)\s+([a-z0-9]+)\b/g)){
    units[['floor','fl'].includes(match[1])?'floor':'unit']=match[2];
  }
  const street=reviewNormalize(raw.split(',')[0]).replace(/\b(ste|suite|unit|floor|fl)\b.*$/,'').trim();
  const last=street.split(' ').at(-1),suffix=streetAliases[last]??(Object.values(streetAliases).includes(last)?last:null);
  return {suffix,units};
}
function addressConflicts(left,right){
  const a=addressComponents(left),b=addressComponents(right),reasons=[];
  if(a.suffix&&b.suffix&&a.suffix!==b.suffix)reasons.push('different_explicit_street_types');
  if(Object.keys(a.units).some(key=>Object.hasOwn(b.units,key)&&a.units[key]!==b.units[key]))reasons.push('different_explicit_units');
  return reasons;
}
function finiteCoordinate(value){
  if(!['number','string'].includes(typeof value)||(typeof value==='string'&&!value.trim()))return null;
  const number=Number(value);return Number.isFinite(number)?number:null;
}
function distanceMeters(left,right){
  const values=[left.lng,left.lat,right.lng,right.lat].map(finiteCoordinate);
  if(values.some(value=>value===null))return Infinity;
  const [x,y,xx,yy]=values.map(value=>value*Math.PI/180);
  const a=Math.sin((yy-y)/2)**2+Math.cos(y)*Math.cos(yy)*Math.sin((xx-x)/2)**2;
  return 6371008.8*2*Math.asin(Math.min(1,Math.sqrt(Math.max(0,a))));
}
function potentialAlias(left,right,leftCores=nameCores(left.name),rightCores=nameCores(right.name)){
  const shared=[...leftCores].filter(core=>rightCores.has(core)).sort();
  if(!shared.length)return null;
  const street=canonicalStreet(left.address),sameStreet=!!street&&street===canonicalStreet(right.address);
  const separation=distanceMeters(left,right);
  if(!sameStreet&&separation>=165)return null;
  return {method:sameStreet?'potential_name_core_same_street':'potential_name_core_nearby',
    match_status:'potential_alias_requires_review',name_core:shared[0],
    distance_m:Number.isFinite(separation)?Math.round(separation*10)/10:null,
    address_conflicts:addressConflicts(left.address,right.address)};
}
function identityKeys(provenance){
  const keys=provenance?.intake_identity_keys??[];
  if(!Array.isArray(keys)||keys.length>20||keys.some(key=>typeof key!=='string'||! /^[a-z][a-z0-9-]{1,40}:[A-Za-z0-9._:-]{1,250}$/.test(key)))fail('INVALID_PACKET','Invalid supplied identity keys');
  return [...new Set(keys)].sort();
}
function loadPacket(directory,expectedSha){
  if(!SHA.test(expectedSha||''))fail('PACKET_HASH_REQUIRED','Supply the independently reviewed manifest SHA-256');
  const root=fs.realpathSync(directory);let bytesRead=0;
  const read=relative=>{
    if(typeof relative!=='string'||!relative||relative.includes('\\')||path.isAbsolute(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'))fail('INVALID_PACKET','Unsafe packet path');
    const resolved=fs.realpathSync(path.join(root,relative));
    if(!resolved.startsWith(root+path.sep))fail('INVALID_PACKET','Packet path escapes its directory');
    const info=fs.statSync(resolved);
    if(!info.isFile()||info.size>MAX_FILE||(bytesRead+=info.size)>MAX_TOTAL)fail('INVALID_PACKET','Packet exceeds file or total size bound');
    return fs.readFileSync(resolved);
  };
  const manifestBytes=read('intake-manifest.json');
  if(hash(manifestBytes)!==expectedSha)fail('PACKET_HASH_MISMATCH','Manifest does not match the reviewed packet');
  const manifest=JSON.parse(manifestBytes);
  if(!object(manifest)||manifest.version!==1||manifest.scope!=='inactive_venue_intake'||!object(manifest.files))fail('INVALID_PACKET','Unsupported intake manifest');
  const required=['candidate-import.json','provenance.json','report.json'];
  if(Object.keys(manifest.files).sort().join('|')!==required.slice().sort().join('|'))fail('INVALID_PACKET','Require exactly the three named data files');
  const data={},fileHashes={};
  for(const file of required){
    const bytes=read(file);
    if(!SHA.test(manifest.files[file]||'')||hash(bytes)!==manifest.files[file])fail('PACKET_HASH_MISMATCH','Data file differs from reviewed packet');
    data[file]=JSON.parse(bytes);fileHashes[file]=hash(bytes);
  }
  if(!Array.isArray(manifest.evidence)||!manifest.evidence.length||manifest.evidence.length>64)fail('INVALID_PACKET','Require bounded source and license evidence');
  const paths=new Set(required),evidence=[];
  for(const item of manifest.evidence){
    if(!object(item)||!['source','city','license','notice'].includes(item.kind)||!SHA.test(item.sha256||'')||paths.has(item.path))fail('INVALID_PACKET','Invalid or duplicate evidence entry');
    paths.add(item.path);const bytes=read(item.path);
    if(hash(bytes)!==item.sha256)fail('PACKET_HASH_MISMATCH','Evidence differs from reviewed packet');
    evidence.push({kind:item.kind,path:item.path,sha256:item.sha256});
  }
  if(!evidence.some(item=>['source','city'].includes(item.kind))||!evidence.some(item=>['license','notice'].includes(item.kind)))fail('INVALID_PACKET','Require source and license/notice evidence');
  const bundle=data['candidate-import.json'],provenance=data['provenance.json'],report=data['report.json'];
  if(!object(bundle)||bundle.ifExists!=='skip'||!Array.isArray(bundle.rows)||!bundle.rows.length||bundle.rows.length>MAX_ROWS||!object(provenance)||!object(report)||report.candidate_count!==bundle.rows.length)fail('INVALID_PACKET','Require 1–500 insert-only candidates and matching provenance/report');
  if(!Array.isArray(manifest.held??[])||(manifest.held??[]).length>10000)fail('INVALID_PACKET','Invalid held registry');
  for(const held of manifest.held??[]){
    if(!object(held)||typeof held.external_id!=='string'||!held.external_id||!Array.isArray(held.reasons)||!held.reasons.length||held.reasons.some(reason=>typeof reason!=='string'||!reason||reason.length>500))fail('INVALID_PACKET','Invalid held registry entry');
  }
  for(const row of bundle.rows){
    if(!object(row)||typeof row.external_id!=='string'||row.external_id!==row.external_id.trim()||!normalize(row.name)||!address(row.address))fail('INVALID_PACKET','Missing stable source or factual identity');
    const p=provenance[row.external_id];
    if(!object(p)||Object.hasOwn(p,'intake_metadata'))fail('INVALID_PACKET','Missing provenance or reserved intake metadata');
    // Validate individually so all participants in repeated source identities
    // can be explicitly held by the planner instead of silently losing a row.
    validateSource({ifExists:'skip',rows:[row]},provenance,{...report,candidate_count:1});
    identityKeys(p);
    if(Object.hasOwn(row,'is_active')&&row.is_active!==false)fail('INVALID_PACKET','Intake must remain inactive');
    if(Object.hasOwn(row,'needs_manual_review')&&row.needs_manual_review!==true)fail('INVALID_PACKET','Intake must require manual review');
    for(const [key,value]of Object.entries(row))if(!BASIC.has(key)&&key!=='needs_manual_review'&&value!==null&&value!==false&&!(Array.isArray(value)&&value.length===0))fail('INVALID_PACKET','Public claims must be unknown in an intake packet: '+key);
  }
  const packet=freeze({sha256:expectedSha,manifest,bundle,provenance,report,fileHashes,
    noticesSha256:digest(evidence.filter(item=>['license','notice'].includes(item.kind)).sort((a,b)=>a.path.localeCompare(b.path)))});
  reviewedPackets.add(packet);return packet;
}
function targetFromEnv(env=process.env){
  if(!env.INTAKE_DATABASE_URL)fail('TARGET_REQUIRED','Set INTAKE_DATABASE_URL explicitly; DATABASE_URL is never used');
  let url;try{url=new URL(env.INTAKE_DATABASE_URL);}catch(_){fail('INVALID_TARGET','Invalid intake database URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.port||!url.username||url.pathname.length<2||url.search||url.hash||/[?#]/.test(env.INTAKE_DATABASE_URL))fail('INVALID_TARGET','Require explicit PostgreSQL host, port, user and database without URL overrides');
  const local=['127.0.0.1','[::1]'].includes(url.hostname),tls=env.INTAKE_TLS_MODE||'verify-full';
  if(!['verify-full','disable'].includes(tls)||(tls==='disable'&&!local))fail('INVALID_TARGET','TLS may be disabled only for literal-loopback native QA');
  const target=freeze({connectionString:env.INTAKE_DATABASE_URL,ssl:tls==='disable'?false:{rejectUnauthorized:true},
    fingerprint:digest({protocol:'postgresql:',host:url.hostname,port:url.port,database:url.pathname,user:url.username,tls})});
  explicitTargets.add(target);return target;
}
function canonicalRow(row){
  return {source:'overture',external_id:row.external_id,name:row.name,type:row.type,category:row.category,
    address:row.address,city:row.city,state:row.state,zip_code:row.zip_code??null,
    lat:Number(row.lat.toFixed(6)),lng:Number(row.lng.toFixed(6))};
}
async function schemaState(db){
  const relations=(await db.query(`SELECT c.relname,c.relkind,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[TABLES])).rows;
  if(relations.length!==3||relations.some(row=>row.relkind!=='r'||row.relrowsecurity))fail('UNSAFE_SCHEMA','Require ordinary, non-RLS migration 011 tables');
  const columns=(await db.query(`SELECT table_name,column_name,udt_name,is_nullable,column_default,is_generated,is_identity,
    numeric_precision,numeric_scale,character_maximum_length,datetime_precision
    FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position`,[TABLES])).rows;
  const required={venues:{id:['uuid'],slug:['varchar','text'],name:['varchar','text'],source:['varchar','text'],external_id:['varchar','text'],
    type:['varchar','text'],category:['varchar','text'],address:['varchar','text'],city:['varchar','text'],state:['varchar','text'],zip_code:['varchar','text'],
    lat:['numeric'],lng:['numeric'],is_active:['bool'],needs_manual_review:['bool']},
    venue_import_batches:{id:['uuid'],source:['text'],source_release:['text'],input_sha256:['bpchar'],provenance_sha256:['bpchar'],notices_sha256:['bpchar'],
      input_count:['int4'],inserted_count:['int4'],skipped_count:['int4'],source_report:['jsonb'],outcomes:['jsonb']},
    venue_source_records:{source:['text'],external_id:['text'],venue_id:['uuid'],import_batch_id:['uuid'],source_release:['text'],provenance:['jsonb']}};
  for(const [table,fields]of Object.entries(required))for(const [name,types]of Object.entries(fields)){
    const column=columns.find(item=>item.table_name===table&&item.column_name===name);
    if(!column||!types.includes(column.udt_name)||column.is_generated!=='NEVER'||column.is_identity==='YES')fail('UNSAFE_SCHEMA','Unexpected required column: '+table+'.'+name);
  }
  const constraints=(await db.query(`SELECT c.relname,con.contype,pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,con.contype,definition`,[TABLES])).rows;
  const has=(table,type,pattern)=>constraints.some(row=>row.relname===table&&row.contype===type&&pattern.test(row.definition));
  if(!has('venues','p',/^PRIMARY KEY \(id\)$/)||!has('venue_import_batches','p',/^PRIMARY KEY \(id\)$/)||
    !has('venue_source_records','p',/^PRIMARY KEY \(source, external_id\)$/)||
    !has('venue_source_records','f',/^FOREIGN KEY \(venue_id\) REFERENCES (?:public\.)?venues\(id\) ON DELETE RESTRICT$/)||
    !has('venue_source_records','f',/^FOREIGN KEY \(import_batch_id\) REFERENCES (?:public\.)?venue_import_batches\(id\) ON DELETE RESTRICT$/))fail('UNSAFE_SCHEMA','Required migration 011 primary/foreign keys are missing');
  const triggers=(await db.query(`SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal AND t.tgenabled<>'D'`,[TABLES])).rows;
  if(triggers.length)fail('UNSAFE_SCHEMA','Enabled custom intake-table triggers require separate review');
  if(!(await db.query('SELECT 1 FROM public.launch_schema_versions WHERE version=$1',[VERSION])).rows.length)fail('UNSAFE_SCHEMA','Migration 011 receipt is missing');
  const venueColumns=columns.filter(column=>column.table_name==='venues');
  if(venueColumns.some(column=>column.is_generated!=='NEVER'||column.is_identity==='YES'))fail('UNSAFE_SCHEMA','Generated venue fields need separate claim review');
  for(const name of ['lat','lng']){
    const column=venueColumns.find(item=>item.column_name===name);
    if(column.numeric_precision!==10||column.numeric_scale!==6)fail('UNSAFE_SCHEMA','Coordinates require the reviewed NUMERIC(10,6) schema');
  }
  const safeRequired=new Set([...BASIC,'id','slug','is_active','needs_manual_review','field_provenance','duplicate_review','created_at','updated_at']);
  if(venueColumns.some(column=>column.is_nullable==='NO'&&column.is_generated==='NEVER'&&!safeRequired.has(column.column_name)))fail('UNSAFE_SCHEMA','An additional required venue field needs review');
  return {fingerprint:digest({relations,columns,constraints}),venueColumns};
}
async function catalogState(db){
  const venues=(await db.query('SELECT to_jsonb(v) AS row FROM public.venues v ORDER BY v.id')).rows.map(item=>item.row);
  const sources=(await db.query('SELECT to_jsonb(s) AS row FROM public.venue_source_records s ORDER BY s.source,s.external_id')).rows.map(item=>item.row);
  return {venues,sources,fingerprint:digest({venues,sources})};
}
function planRows(packet,catalog){
  const candidates=packet.bundle.rows,counted=new Map(),candidateKeys=candidates.map(row=>[
    'source:'+row.source+'|'+row.external_id,'identity:'+identity(row),...identityKeys(packet.provenance[row.external_id]).map(key=>'supplied:'+key)]);
  for(const keys of candidateKeys)for(const key of keys)counted.set(key,(counted.get(key)||0)+1);
  const heldRegistry=new Map((packet.manifest.held??[]).map(item=>[item.external_id,item.reasons]));
  const index=new Map(),add=(key,id)=>{if(!index.has(key))index.set(key,new Set());index.get(key).add(id);};
  const byCore=new Map(),catalogCores=new Map();
  for(const row of catalog.venues){
    if(row.source&&row.external_id)add('source:'+row.source+'|'+row.external_id,row.id);
    if(normalize(row.name)&&address(row.address))add('identity:'+identity(row),row.id);
    const cores=nameCores(row.name);catalogCores.set(row.id,cores);
    for(const core of cores){if(!byCore.has(core))byCore.set(core,[]);byCore.get(core).push(row);}
  }
  for(const row of catalog.sources){
    add('source:'+row.source+'|'+row.external_id,row.venue_id);
    for(const key of identityKeys(row.provenance))add('supplied:'+key,row.venue_id);
  }
  const candidateCores=candidates.map(row=>nameCores(row.name)),batchAliases=candidates.map(()=>[]);
  for(let left=0;left<candidates.length;left++)for(let right=left+1;right<candidates.length;right++){
    const match=potentialAlias(candidates[left],candidates[right],candidateCores[left],candidateCores[right]);
    if(match){batchAliases[left].push({other_position:right,...match});batchAliases[right].push({other_position:left,...match});}
  }
  return candidates.map((row,position)=>{
    const keys=candidateKeys[position],reasons=[];
    if(heldRegistry.has(row.external_id))reasons.push('reviewed_packet_hold');
    if(keys.some(key=>counted.get(key)>1))reasons.push('batch_identity_collision_hold_all');
    if(batchAliases[position].length)reasons.push('batch_potential_alias_collision_hold_all');
    const exact=new Set(keys.flatMap(key=>[...(index.get(key)??[])])),evidence=[];
    for(const venueId of [...exact].sort()){
      for(const key of keys)if(index.get(key)?.has(venueId))evidence.push({venue_id:venueId,
        method:key.startsWith('source:')?'exact_source_id':key.startsWith('supplied:')?'exact_supplied_identity':'exact_normalized_name_address',
        match_status:'existing_identity_skip_only'});
    }
    const potential=new Map();
    for(const core of candidateCores[position])for(const existing of byCore.get(core)??[]){
      if(exact.has(existing.id)||potential.has(existing.id))continue;
      const match=potentialAlias(row,existing,candidateCores[position],catalogCores.get(existing.id));
      if(match)potential.set(existing.id,{venue_id:existing.id,...match});
    }
    if(potential.size)reasons.push('potential_existing_alias_review');
    evidence.push(...[...potential.values()].sort((a,b)=>String(a.venue_id).localeCompare(String(b.venue_id))));
    const matched=[...new Set([...exact,...potential.keys()])].sort();
    if(matched.length>1)reasons.push('ambiguous_existing_identity');
    const action=reasons.length?'hold':exact.size?'skip_existing':'insert_inactive';
    return {position,external_id:row.external_id,action,reasons,existing_venue_ids:matched,
      existing_match_evidence:evidence,batch_alias_evidence:batchAliases[position],canonical:canonicalRow(row)};
  });
}
function makePlan(packet,schema,catalog,target){
  const outcomes=planRows(packet,catalog);
  const plan={kind:KIND,packet_sha256:packet.sha256,target_fingerprint:target.fingerprint,
    schema_fingerprint:schema.fingerprint,catalog_fingerprint:catalog.fingerprint,
    catalog_count:catalog.venues.length,source_record_count:catalog.sources.length,input_count:outcomes.length,
    insert_count:outcomes.filter(row=>row.action==='insert_inactive').length,
    skip_count:outcomes.filter(row=>row.action==='skip_existing').length,hold_count:outcomes.filter(row=>row.action==='hold').length,
    activation:'inactive_manual_review_only',outcomes};
  return {...plan,plan_sha256:digest(plan)};
}
async function priorReceipt(db,packet){
  const {rows}=await db.query(`SELECT id,source_report,inserted_count,skipped_count,outcomes FROM public.venue_import_batches
    WHERE source_report->>'operator_kind'=$1 AND source_report->>'packet_sha256'=$2 ORDER BY id`,[KIND,packet.sha256]);
  if(rows.length>1)fail('AMBIGUOUS_RECEIPT','Multiple receipts exist for this packet');
  if(!rows.length)return null;
  const row=rows[0],receipt=row.source_report.intake_receipt;
  if(!object(receipt)||!SHA.test(receipt.plan_sha256||'')||receipt.packet_sha256!==packet.sha256||receipt.batch_id!==row.id||receipt.inserted!==row.inserted_count)fail('INVALID_RECEIPT','Existing intake receipt needs review');
  return {...receipt,replayed:true,newly_inserted:0};
}
async function transaction(pool,readOnly,run){
  const db=await pool.connect();
  try{
    await db.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
    await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    await db.query("SET LOCAL search_path=pg_catalog,public");
    const result=await run(db);await db.query('COMMIT');return result;
  }catch(error){try{await db.query('ROLLBACK');}catch(_){}throw error;}
  finally{db.release();}
}
async function preview(pool,packet,target){
  invocation(pool,packet,target);
  return transaction(pool,true,async db=>{
    const schema=await schemaState(db),prior=await priorReceipt(db,packet);
    if(prior)return {kind:KIND,already_applied:true,receipt:prior,plan_sha256:prior.plan_sha256};
    return makePlan(packet,schema,await catalogState(db),target);
  });
}
function insertedValues(row,id,columns){
  const values={...canonicalRow(row),id,slug:'review-'+id,is_active:false,needs_manual_review:true,
    is_claimed:false,has_real_photo:false,featured:false,trending:false,spotlight:false,
    review_reasons:['inactive_source_intake_pending_review'],field_provenance:{},duplicate_review:{}};
  const names=[],parameters=[],expressions=[];
  for(const column of columns){
    if(column.is_generated!=='NEVER'||column.is_identity==='YES')continue;
    names.push('"'+column.column_name.replaceAll('"','""')+'"');
    if(['created_at','updated_at'].includes(column.column_name)){expressions.push('clock_timestamp()');continue;}
    let value=Object.hasOwn(values,column.column_name)?values[column.column_name]:null;
    if(column.udt_name==='jsonb'&&value!==null)value=JSON.stringify(value);
    parameters.push(value);expressions.push('$'+parameters.length);
  }
  return {names,parameters,expressions};
}
async function apply(pool,packet,target,{planSha,operator}){
  invocation(pool,packet,target);
  if(!SHA.test(planSha||'')||typeof operator!=='string'||!operator.trim()||operator.length>200||/[\r\n\0]/.test(operator))fail('APPLY_REVIEW_REQUIRED','Apply requires the exact preview digest and an operator identity');
  return transaction(pool,false,async db=>{
    // Table locks coordinate with all ordinary INSERT/UPDATE/DELETE writers,
    // including older binaries that do not know this operator's advisory key.
    await db.query('LOCK TABLE public.venues,public.venue_source_records,public.venue_import_batches IN SHARE ROW EXCLUSIVE MODE');
    const schema=await schemaState(db),prior=await priorReceipt(db,packet);
    if(prior){if(prior.plan_sha256!==planSha)fail('PLAN_CHANGED','This packet was applied under a different preview');return prior;}
    const catalog=await catalogState(db),plan=makePlan(packet,schema,catalog,target);
    if(plan.plan_sha256!==planSha)fail('PLAN_CHANGED','Catalog, schema, target or reconciliation changed; review a fresh preview');
    const batchId=crypto.randomUUID(),snapshots=[],outcomes=[];
    const receipt={kind:KIND,batch_id:batchId,packet_sha256:packet.sha256,plan_sha256:planSha,
      inserted:plan.insert_count,skipped:plan.skip_count,held:plan.hold_count,newly_inserted:plan.insert_count,
      activation:'inactive_manual_review_only',operator:operator.trim(),replayed:false};
    const report={preparation_report:packet.report,preparation_report_sha256:packet.fileHashes['report.json'],
      database_write_mode:'insert_only_inactive',operator_kind:KIND,packet_sha256:packet.sha256,
      manifest:packet.manifest,preview:plan,intake_receipt:receipt,publication_ready:false};
    await db.query(`INSERT INTO public.venue_import_batches(id,source,source_release,input_sha256,provenance_sha256,notices_sha256,input_count,source_report)
      VALUES($1,'overture',$2,$3,$4,$5,$6,$7::jsonb)`,[batchId,packet.report.release,packet.fileHashes['candidate-import.json'],packet.fileHashes['provenance.json'],packet.noticesSha256,plan.input_count,JSON.stringify(report)]);
    for(const outcome of plan.outcomes){
      if(outcome.action!=='insert_inactive'){outcomes.push(outcome);continue;}
      const row=packet.bundle.rows[outcome.position],id=crypto.randomUUID(),insert=insertedValues(row,id,schema.venueColumns);
      const venue=(await db.query(`INSERT INTO public.venues(${insert.names.join(',')}) VALUES(${insert.expressions.join(',')}) RETURNING to_jsonb(venues) AS row`,insert.parameters)).rows[0].row;
      const provenance={...packet.provenance[row.external_id],intake_metadata:{packet_sha256:packet.sha256,
        review_status:'inactive_pending_independent_review',publication_ready:false,raw_input_row:row}};
      const source=(await db.query(`INSERT INTO public.venue_source_records(source,external_id,venue_id,import_batch_id,source_release,provenance)
        VALUES('overture',$1,$2,$3,$4,$5::jsonb) RETURNING to_jsonb(venue_source_records) AS row`,[row.external_id,id,batchId,packet.report.release,JSON.stringify(provenance)])).rows[0].row;
      if(venue.is_active!==false||venue.needs_manual_review!==true)fail('UNSAFE_INSERT','Inserted row did not remain inactive');
      const expectedFacts=canonicalRow(row);
      if(digest(Object.fromEntries(Object.keys(expectedFacts).map(key=>[key,venue[key]])))!==digest(expectedFacts))fail('UNSAFE_INSERT','Stored canonical facts differ from the reviewed plan');
      snapshots.push({venue,source});outcomes.push({...outcome,venue_id:id});
    }
    report.inserted_snapshots=snapshots;
    await db.query(`UPDATE public.venue_import_batches SET inserted_count=$2,skipped_count=$3,outcomes=$4::jsonb,source_report=$5::jsonb WHERE id=$1`,
      [batchId,receipt.inserted,receipt.skipped+receipt.held,JSON.stringify(outcomes),JSON.stringify(report)]);
    // Verify the pre-existing full row and source ledger snapshots stayed exact.
    const after=await catalogState(db),newIds=new Set(snapshots.map(item=>item.venue.id));
    if(digest({venues:after.venues.filter(row=>!newIds.has(row.id)),sources:after.sources.filter(row=>row.import_batch_id!==batchId)})!==catalog.fingerprint)fail('BASELINE_CHANGED','Existing catalog or provenance changed during intake');
    return receipt;
  });
}
function parseArgs(args){
  const command=args.shift();
  if(!['validate','preview','apply'].includes(command))fail('USAGE','Use validate, preview or apply');
  const result={command},allowed=new Set(['packet','packet-sha','plan-sha','operator']);
  while(args.length){const flag=args.shift();if(!flag.startsWith('--')||!allowed.has(flag.slice(2))||Object.hasOwn(result,flag.slice(2))||!args.length)fail('USAGE','Unknown, duplicate or missing CLI option');result[flag.slice(2)]=args.shift();}
  if(!result.packet||!result['packet-sha']||(command!=='apply'&&(result['plan-sha']||result.operator)))fail('USAGE','Specify --packet and --packet-sha; apply additionally requires --plan-sha and --operator');
  return result;
}
async function main(){
  const args=parseArgs(process.argv.slice(2)),packet=loadPacket(args.packet,args['packet-sha']);
  if(args.command==='validate'){console.log(JSON.stringify({kind:KIND,packet_sha256:packet.sha256,input_count:packet.bundle.rows.length,database_accessed:false,publication_ready:false},null,2));return;}
  const target=targetFromEnv(),{Pool}=require('pg'),pool=new Pool({connectionString:target.connectionString,ssl:target.ssl,max:1,connectionTimeoutMillis:10000});
  pool.on('error',()=>{});
  try{console.log(JSON.stringify(await(args.command==='preview'?preview(pool,packet,target):apply(pool,packet,target,{planSha:args['plan-sha'],operator:args.operator})),null,2));}
  finally{await pool.end();}
}
module.exports={loadPacket,targetFromEnv,preview,apply,planRows,makePlan,hash,digest,identity,canonicalRow,MAX_ROWS};
if(require.main===module)main().catch(error=>{
  // Do not log connection strings, query parameters, or driver error details.
  const safeCodes=new Set(['PACKET_HASH_REQUIRED','PACKET_HASH_MISMATCH','INVALID_PACKET','TARGET_REQUIRED','INVALID_TARGET','UNSAFE_SCHEMA','AMBIGUOUS_RECEIPT','INVALID_RECEIPT','APPLY_REVIEW_REQUIRED','PLAN_CHANGED','UNSAFE_INSERT','BASELINE_CHANGED','USAGE']);
  const code=safeCodes.has(error.code)?error.code:'INTAKE_FAILED';
  console.error(JSON.stringify({error:code,message:safeCodes.has(error.code)?error.message:'Intake failed; inspect controlled operator diagnostics without logging credentials.'}));process.exitCode=1;
});
