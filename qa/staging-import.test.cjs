'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validate,validateTarget}=require('./tools/stage-venue-import.cjs');
const fixture=()=>({bundle:{ifExists:'skip',rows:[{name:'Fictional QA Cafe',address:'10 Fictional Street',city:'Quincy',state:'MA',lat:42.25,lng:-71.0,type:'cafe',category:'cafe',source:'overture',external_id:'fixture-1'}]},provenance:{'fixture-1':{release:'fixture-release',sources:[{dataset:'fictional-test-only'}],verification_status:'provider_record_not_independently_verified',existence_confidence:0.9}},report:{release:'fixture-release',candidate_count:1,production_import_ready:false,input_sha256:'d'.repeat(64)}});
test('staging importer accepts mapper-shaped fixtures without claiming production readiness',()=>{const x=fixture();assert.equal(validate(x.bundle,x.provenance,x.report).activation,'inactive_staging_only');});
test('staging importer refuses manufactured ratings, missing provenance and known closures',()=>{
 for(const change of [x=>x.bundle.rows[0].rating=4.9,x=>delete x.provenance['fixture-1'],x=>x.provenance['fixture-1'].operating_status='permanently_closed',x=>x.bundle.rows[0].lat=null,x=>x.bundle.ifExists='update',x=>x.provenance['fixture-1'].existence_confidence=1.2,x=>x.provenance['fixture-1'].sources=[{}]]){const x=fixture();change(x);assert.throws(()=>validate(x.bundle,x.provenance,x.report));}
});
test('staging importer refuses production, remote hosts, wrong DB names and URL override routes',()=>{
 const env={NODE_ENV:'test',SCENELINK_ALLOW_LOCAL_IMPORT:'yes'};
 for(const u of ['postgresql://example.com/scenelink_import_qa','postgresql://127.0.0.1/scenelink','postgresql://127.0.0.1/scenelink_import_qa?host=remote'])assert.throws(()=>validateTarget(u,env));
 assert.throws(()=>validateTarget('postgresql://127.0.0.1/scenelink_import_qa',{...env,NODE_ENV:'production'}));
 assert.throws(()=>validateTarget('postgresql://127.0.0.1/scenelink_import_qa',{NODE_ENV:'test'}));
 assert.doesNotThrow(()=>validateTarget('postgresql://127.0.0.1/scenelink_import_qa',env));
});
module.exports={fixture};
test('exported apply refuses remote pool before a connection can be acquired',async()=>{
 const {apply}=require('./tools/stage-venue-import.cjs'),x=fixture();let connected=false;
 await assert.rejects(apply({options:{connectionString:'postgresql://remote.invalid/scenelink_import_qa'},async connect(){connected=true;throw Error('must not connect');}},x.bundle,x.provenance,x.report,{}));
 assert.equal(connected,false);
});
test('CLI default dry-run never accesses even a configured production database',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scenelink-dryrun-')),x=fixture();
 try{
  for(const [name,value] of [['candidate-import.json',x.bundle],['provenance.json',x.provenance],['report.json',x.report]])fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
  const result=spawnSync(process.execPath,[path.join(__dirname,'tools/stage-venue-import.cjs'),dir],{encoding:'utf8',env:{...process.env,NODE_ENV:'production',IMPORT_DATABASE_URL:'postgresql://remote.invalid/production'}});
  assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);assert.equal(output.database_accessed,false);assert.equal(output.dry_run,true);assert.equal(output.count,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
