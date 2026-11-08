const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-fetch-guard.js'),'utf8');
function harness(fetch){let fire,cleared=false;const c={fetch,AbortController,Promise,Proxy,Reflect,Date,Error,Object,setTimeout:fn=>(fire=fn,1),clearTimeout:()=>{cleared=true;}};c.window=c;vm.runInNewContext(code,c);return{fetch:c.fetch,tick:()=>fire(),cleared:()=>cleared};}
(async()=>{
 let options;let h=harness((u,o)=>(options=o,new Promise(()=>{})));const pending=h.fetch('/api/venues');h.tick();await assert.rejects(pending,{name:'TimeoutError'});assert(options.signal.aborted);
 h=harness(async()=>({status:200,body:{},json:()=>new Promise(()=>{})}));const response=await h.fetch('/api/venues');assert(!h.cleared());const body=response.json();h.tick();await assert.rejects(body,{name:'TimeoutError'});
 const ctrl=new AbortController();h=harness((u,o)=>(options=o,new Promise(()=>{})));const caller=h.fetch('/api/venues',{signal:ctrl.signal});ctrl.abort();await assert.rejects(caller,{name:'AbortError'});assert(options.signal.aborted);
 h=harness(async()=>({status:200,body:{},json:async()=>({venues:[]})}));assert.deepEqual(await (await h.fetch('/api/venues')).json(),{venues:[]});assert(h.cleared());
 h=harness(async()=>({status:200,body:{},clone(){return {status:200,body:{},json:()=>new Promise(()=>{})}}}));const cloned=(await h.fetch('/api/venues')).clone();const cloneBody=cloned.json();h.tick();await assert.rejects(cloneBody,{name:'TimeoutError'});
 let untouched={};h=harness(async(u,o)=>(assert.equal(o,untouched),'external'));assert.equal(await h.fetch('/images/logo.png',untouched),'external');
 console.log('PASS 6 HOTFIX API guard scenarios (including cloned body): pending headers, pending body, caller cancellation, normal JSON cleanup, non-API untouched');
})().catch(e=>{console.error(e);process.exitCode=1});
