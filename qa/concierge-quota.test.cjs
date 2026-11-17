'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {quotaConfig,reserveProviderAttempt}=require('../src/services/concierge-quota');
const env={CONCIERGE_AI_ENABLED:'true',CONCIERGE_AI_DAILY_REQUEST_LIMIT:'3'};
test('quota defaults disabled and malformed/out-of-range limits fail closed',async()=>{
 for(const e of [{},{...env,CONCIERGE_AI_ENABLED:'false'},...['','0','-1','1.5','Infinity','10001','3oops'].map(x=>({...env,CONCIERGE_AI_DAILY_REQUEST_LIMIT:x}))]){
 assert.equal(quotaConfig(e).enabled,false);assert.equal((await reserveProviderAttempt({query:()=>assert.fail('no DB when disabled')},e)).allowed,false);
 }
});
test('atomic quota caps competing promise calls and retains consumed allowance',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();try{
 await db.exec(fs.readFileSync('qa/proposed-migrations/concierge_ai_quota.sql','utf8'));
 const results=await Promise.all(Array.from({length:20},()=>reserveProviderAttempt(db,env)));assert.equal(results.filter(x=>x.allowed).length,3);
 assert.equal((await reserveProviderAttempt(db,env)).allowed,false);assert.equal((await db.query('SELECT attempts FROM concierge_ai_daily_quota')).rows[0].attempts,3);
 assert.equal((await reserveProviderAttempt(db,{...env,CONCIERGE_AI_DAILY_REQUEST_LIMIT:'2'})).allowed,false);
 await db.query("UPDATE concierge_ai_daily_quota SET quota_day=quota_day-1");assert.equal((await reserveProviderAttempt(db,env)).allowed,true);
 }finally{await db.close();}
});
test('missing table and DB errors fail closed without error-body disclosure',async()=>{
 const result=await reserveProviderAttempt({query:async()=>{throw new Error('private connection string');}},env);assert.deepEqual(result,{allowed:false,reason:'quota_unavailable'});
});
function providerHarness(allowed=true,stalledBody=false){
 const source=fs.readFileSync('src/routes/conciergeAI.js','utf8');const start=source.indexOf('async function callOpenAI');const end=source.indexOf('function extractStructured',start);const calls=[];
 const call=vm.runInNewContext(source.slice(start,end)+'\ncallOpenAI',{process:{env:{OPENAI_API_KEY:'test-only-not-a-secret'}},pool:{},summarizeVenueForLLM:v=>v,MAX_CONTEXT_HISTORY:6,DEFAULT_MODEL:'fixture-model',SYSTEM_PROMPT:'fixture system',MAX_OUTPUT_TOKENS:700,RESPONSE_SCHEMA:{},MAX_PROVIDER_INPUT_BYTES:24000,REQUEST_TIMEOUT_MS:25,OPENAI_URL:'https://example.invalid/never-network',Buffer,AbortController,setTimeout,clearTimeout,reserveProviderAttempt:async()=>{calls.push('reserve');return{allowed};},fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return{ok:true,json:async()=>stalledBody ? new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted body')),{once:true})) : {}};}});
 return{call,calls};
}
test('provider dispatch requires successful durable reservation and disables response storage',async()=>{
 for(const allowed of [true,false]){const {call,calls}=providerHarness(allowed);const input={message:'test',history:[],filters:{},candidates:[],userContext:null};if(allowed){await call(input);assert.equal(calls[0],'reserve');assert.equal(calls[1].store,false);assert.equal(calls[1].max_output_tokens,700);}else{await assert.rejects(call(input),/unavailable/);assert.deepEqual(calls,['reserve']);}}
});
test('oversized payload never reaches reservation or provider',async()=>{const {call,calls}=providerHarness();await assert.rejects(call({message:'x'.repeat(25000),history:[],filters:{},candidates:[],userContext:null}),/safe bound/);assert.deepEqual(calls,[]);});

test('timeout remains active while response body is pending',async()=>{const {call,calls}=providerHarness(true,true);await assert.rejects(call({message:'test',history:[],filters:{},candidates:[],userContext:null}),/aborted body/);assert.equal(calls.length,2);});

test('output and timeout environment values cannot remove hard bounds',()=>{
 const source=fs.readFileSync('src/routes/conciergeAI.js','utf8');const code=source.slice(source.indexOf('function boundedInteger'),source.indexOf('const MAX_PROVIDER_INPUT_BYTES'));
 for(const value of ['NaN','0','-5','99999999','Infinity','broken']){const limits=vm.runInNewContext(code+';({output:MAX_OUTPUT_TOKENS,timeout:REQUEST_TIMEOUT_MS})',{process:{env:{OPENAI_MAX_OUTPUT_TOKENS:value,OPENAI_TIMEOUT_MS:value}}});assert.equal(limits.output,700);assert.equal(limits.timeout,15000);}
});
