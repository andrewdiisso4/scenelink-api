#!/usr/bin/env node
'use strict';
// Deliberately has NO production import mode. Dry-run is the default.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const TYPES=new Set(['restaurant','cafe','bar','club','music']);
const UNKNOWN=['rating','review_count','buzz_score','going_count','friends_going','price_level','image_url','cover_image_url','hours_display','hours_json','is_open_now','reservation_url'];
function fail(message){throw new Error(message);}
function string(v,name,max=255){if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail('Invalid '+name);return v.trim();}
function validate(bundle,provenance,report){
 if(!bundle||bundle.ifExists!=='skip'||!Array.isArray(bundle.rows)||!bundle.rows.length||bundle.rows.length>5000)fail('Require 1–5000 rows and ifExists=skip');
 if(!report||report.production_import_ready!==false||report.candidate_count!==bundle.rows.length)fail('Require matching offline report, not a production-ready claim');
 if(!/^[a-f0-9]{64}$/.test(report.input_sha256||''))fail('Require original downloaded-source hash in report');
 const release=string(report.release,'source release',100),ids=new Set();
 for(const row of bundle.rows){
  if(row.source!=='overture')fail('Only reviewed Overture candidate shape is supported');
  for(const [field,max] of Object.entries({name:255,address:500,city:100,state:10,external_id:255,category:50}))string(row[field],field,max);
  for(const [field,max] of Object.entries({phone:30,website:500,zip_code:20}))if(row[field]!=null)string(row[field],field,max);
  if(row.state!=='MA'||!TYPES.has(row.type))fail('Outside supported Massachusetts launch category');
  if(!Number.isFinite(row.lat)||!Number.isFinite(row.lng)||row.lng < -71.30||row.lng > -70.88||row.lat < 42.18||row.lat >42.50)fail('Invalid or out-of-area factual coordinates');
  if(ids.has(row.external_id))fail('Duplicate source ID in candidate');ids.add(row.external_id);
  for(const field of UNKNOWN)if(row[field]!=null)fail('Unverified metric or media must remain null: '+field);
  for(const field of ['featured','trending','spotlight'])if(row[field])fail('Popularity claims are not accepted');
  if(row.website){let u;try{u=new URL(row.website);}catch(_){fail('Invalid website');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail('Invalid website');}
  const p=Object.hasOwn(provenance||{},row.external_id)?provenance[row.external_id]:null;
  if(!p||p.release!==release||!Array.isArray(p.sources)||!p.sources.length||p.verification_status!=='provider_record_not_independently_verified'||!Number.isFinite(p.existence_confidence)||p.existence_confidence<0.8||p.existence_confidence>1)fail('Missing or inconsistent per-record provenance');
  if(p.sources.length>100||JSON.stringify(p).length>65536)fail('Provenance exceeds bounded record size');
  for(const source of p.sources){
   if(!source||typeof source!=='object'||Array.isArray(source))fail('Invalid source entry');
   string(source.dataset,'source dataset',255);
   if(source.record_id!=null)string(source.record_id,'source record ID',2048);
   if(source.property!=null)string(source.property,'source property',255);
   if(source.update_time!=null&&(typeof source.update_time!=='string'||!Number.isFinite(Date.parse(source.update_time))))fail('Invalid source update timestamp');
   if(source.confidence!=null&&(!Number.isFinite(source.confidence)||source.confidence<0||source.confidence>1))fail('Invalid source confidence');
  }
  if(['temporarily_closed','permanently_closed'].includes(p.operating_status))fail('Known-closed candidate must be held');
 }
 return {count:bundle.rows.length,release,source:'overture',activation:'inactive_staging_only'};
}
function validateTarget(connection,env=process.env){
 if(env.NODE_ENV==='production'||env.SCENELINK_ALLOW_LOCAL_IMPORT!=='yes')fail('Local staging import requires explicit opt-in and non-production NODE_ENV');
 let u;try{u=new URL(connection);}catch(_){fail('Missing or invalid IMPORT_DATABASE_URL');}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!/^\/scenelink_import_[a-z0-9_]+$/.test(u.pathname)||u.search||u.hash)fail('REFUSED: only localhost scenelink_import_* databases, without connection query overrides');
}
async function apply(pool,bundle,provenance,report,evidence){
 if(process.env.NODE_ENV==='production')fail('Production import is disabled');
 const target=pool.options?.connectionString;let targetURL;try{targetURL=new URL(target);}catch(_){fail('Explicit isolated pool connection required');}
 const testTarget=process.env.NODE_ENV==='test' && process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT==='yes' && /^\/scenelink_test_[a-z0-9_]+$/.test(targetURL.pathname);
 if(testTarget){if(!['127.0.0.1','localhost','[::1]'].includes(targetURL.hostname)||targetURL.search||targetURL.hash)fail('Isolated localhost test pool required');}
 else validateTarget(target);
 const summary=validate(bundle,provenance,report);
 for(const key of ['input_sha256','provenance_sha256','notices_sha256'])if(!/^[a-f0-9]{64}$/.test(evidence?.[key]||''))fail('Require complete input/provenance/license hashes');
 const db=await pool.connect(),batch=crypto.randomUUID(),outcomes=[];let discard=false;
 try{
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='10s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('scenelink:staged-venue-import',0))");
  const schema=await db.query("SELECT version FROM launch_schema_versions WHERE version='staged-venue-provenance-2026-10-27'");if(!schema.rows.length)fail('Run reviewed migration 011 in staging first');
  await db.query('INSERT INTO venue_import_batches(id,source,source_release,input_sha256,provenance_sha256,notices_sha256,input_count,source_report) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[batch,summary.source,summary.release,evidence.input_sha256,evidence.provenance_sha256,evidence.notices_sha256,summary.count,JSON.stringify(report)]);
  for(const row of bundle.rows){
   const existing=await db.query(`SELECT id FROM venues WHERE (source=$1 AND external_id=$2)
     OR (lower(trim(name))=lower(trim($3)) AND lower(trim(city))=lower(trim($4)) AND lower(trim(address))=lower(trim($5)))
     OR id IN (SELECT venue_id FROM venue_source_records WHERE source=$1 AND external_id=$2) LIMIT 2`,[row.source,row.external_id,row.name,row.city,row.address]);
   if(existing.rows.length){outcomes.push({external_id:row.external_id,action:'skipped',reason:'existing_identity_or_address_preserved'});continue;}
   const id=crypto.randomUUID(),slug='staged-'+id;
   await db.query(`INSERT INTO venues(id,slug,name,type,category,address,city,state,zip_code,lat,lng,website,phone,source,external_id,is_active,needs_manual_review,is_open_now,rating,review_count,price_level,buzz_score,going_count,friends_going,featured,trending,spotlight)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,true,NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,false,false)`,[id,slug,row.name,row.type,row.category,row.address,row.city,row.state,row.zip_code||null,row.lat,row.lng,row.website||null,row.phone||null,row.source,row.external_id]);
   await db.query('INSERT INTO venue_source_records(source,external_id,venue_id,import_batch_id,source_release,provenance) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[row.source,row.external_id,id,batch,summary.release,JSON.stringify(provenance[row.external_id])]);
   outcomes.push({external_id:row.external_id,action:'inserted_inactive',venue_id:id});
  }
  const inserted=outcomes.filter(x=>x.action==='inserted_inactive').length;
  await db.query('UPDATE venue_import_batches SET inserted_count=$2,skipped_count=$3,outcomes=$4::jsonb WHERE id=$1',[batch,inserted,outcomes.length-inserted,JSON.stringify(outcomes)]);
  await db.query('COMMIT');return{batch_id:batch,inserted,skipped:outcomes.length-inserted,activation:'inactive_staging_only'};
 }catch(e){discard=true;try{await db.query('ROLLBACK');}catch(_){}throw e;}finally{db.release(discard);}
}
async function main(){
 const args=process.argv.slice(2),dir=args[0];if(!dir)fail('Usage: node qa/tools/stage-venue-import.cjs CANDIDATE_DIRECTORY [--apply --reviewed-sha SHA --notices LICENSE_NOTICES_FILE]');
 const read=n=>{const file=path.join(dir,n);if(fs.statSync(file).size>64*1024*1024)fail('Candidate input file exceeds 64 MiB');return fs.readFileSync(file);};const input=read('candidate-import.json'),provenanceRaw=read('provenance.json');
 const bundle=JSON.parse(input),provenance=JSON.parse(provenanceRaw),report=JSON.parse(read('report.json')),summary=validate(bundle,provenance,report);
 const digest=hash(input);if(!args.includes('--apply')){console.log(JSON.stringify({...summary,dry_run:true,input_sha256:digest,database_accessed:false}));return;}
 if(args[args.indexOf('--reviewed-sha')+1]!==digest||!args.includes('--reviewed-sha'))fail('Reviewed candidate hash does not match');
 const noticePath=args.includes('--notices')?args[args.indexOf('--notices')+1]:null;if(!noticePath)fail('Supply reviewed source license/NOTICE bundle');const notices=fs.readFileSync(noticePath);if(notices.length<20)fail('License/NOTICE bundle is empty');
 validateTarget(process.env.IMPORT_DATABASE_URL);
 const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.IMPORT_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
 try{console.log(JSON.stringify(await apply(pool,bundle,provenance,report,{input_sha256:digest,provenance_sha256:hash(provenanceRaw),notices_sha256:hash(notices)})));}finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validate,validateTarget,apply,hash};
