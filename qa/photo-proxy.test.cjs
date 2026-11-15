const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const express=require('express');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/routes/photo_proxy.js'),'utf8');
async function run(steps, check, query='name=places/abc/photos/def', key='test-secret') {
 const calls=[]; const requests=[];
 const fake={get(url,callback){
  calls.push(url); const step=steps.shift(); const req=new EventEmitter();req.destroy=()=>{req.destroyed=true;};requests.push(req);req.setTimeout=(ms,cb)=>{if(ms && step?.timeout)setImmediate(cb);if(ms && step?.lateTimeout)req.lateTimeout=cb;};
  setImmediate(()=>{
   if(step?.timeout)return;
   if(step?.error)return req.emit('error',new Error('private key'));
   const stream=new PassThrough();stream.statusCode=step.status;stream.headers=step.headers||{};
   callback(stream);
   if(step.streamError)stream.emit('error',new Error('private truncated payload'));
   if(step.aborted)stream.emit('aborted');
   if(step.lateTimeout)setImmediate(req.lateTimeout);
   if(step.delay)setTimeout(()=>stream.end(step.body||''),step.delay);else stream.end(step.body||'');
  });return req;
 }};
 const module={exports:{}};
 vm.runInNewContext(source,{require:n=>n==='https'?fake:require(n),module,URL,process:{env:{GOOGLE_PLACES_API_KEY:key}}});
 const app=express();app.use('/api/photo',module.exports);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try {const r=await fetch(`http://127.0.0.1:${server.address().port}/api/photo?${query}`);const body=await r.text();await check(r,body,calls,requests);} finally {await new Promise(r=>server.close(r));}
}
const errorCheck=status=>(r,b)=>{assert.equal(r.status,status);assert.match(r.headers.get('content-type'),/^application\/json/);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(b,'{"error":"photo unavailable"}');assert(!b.includes('secret'));};
test('Google expired resource is 404 without cached error payload',()=>run([{status:400,headers:{'content-type':'application/json'},body:'{"error":{"message":"INVALID_ARGUMENT secret"}}'}],errorCheck(404)));
test('successful JSON never masquerades as photo',()=>run([{status:200,headers:{'content-type':'application/json'},body:'secret'}],errorCheck(502)));
test('direct image is streamed with no-store',()=>run([{status:200,headers:{'content-type':'image/jpeg'},body:'imagebytes'}],(r,b)=>{assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(b,'imagebytes');assert.equal(r.headers.get('cache-control'),'no-store');}));
test('approved CDN redirect streams image without browser redirect or key',()=>run([{status:302,headers:{location:'https://lh3.googleusercontent.com/photo'}},{status:200,headers:{'content-type':'image/webp'},body:'webp'}],(r,b,c)=>{assert.equal(r.status,200);assert.equal(b,'webp');assert.equal(c.length,2);assert(!r.headers.get('location'));assert(!c[1].includes('test-secret'));}));
test('CDN error is not HTTP200',()=>run([{status:302,headers:{location:'https://lh3.googleusercontent.com/photo'}},{status:404,headers:{'content-type':'text/html'}}],errorCheck(404)));
for(const url of ['http://lh3.googleusercontent.com/a','https://evil.test/a','https://lh3.googleusercontent.com.evil.test/a','https://user@lh3.googleusercontent.com/a','https://127.0.0.1/a'])test('reject redirect '+url,()=>run([{status:302,headers:{location:url}}],(r,b,c)=>{errorCheck(502)(r,b);assert.equal(c.length,1);}));
test('nested redirects rejected',()=>run([{status:302,headers:{location:'https://lh3.googleusercontent.com/a'}},{status:302,headers:{location:'https://lh3.googleusercontent.com/b'}}],errorCheck(502)));
test('upstream network errors sanitized',()=>run([{error:true}],errorCheck(502)));
test('upstream timeout bounded',()=>run([{timeout:true}],errorCheck(504)));
test('SVG rejected',()=>run([{status:200,headers:{'content-type':'image/svg+xml'}}],errorCheck(502)));
test('invalid name never calls upstream',()=>run([], (r,b,c)=>{errorCheck(400)(r,b);assert.equal(c.length,0);},'name=../../etc/passwd'));
test('missing key fails closed',()=>run([],errorCheck(503),undefined,''));

test('discarded provider error stream cannot crash response',()=>run([{status:400,streamError:true,headers:{'content-type':'application/json'}}],errorCheck(404)));
test('retired redirect stream error cannot fail CDN image',()=>run([{status:302,streamError:true,aborted:true,headers:{location:'https://lh3.googleusercontent.com/a'}},{status:200,delay:20,headers:{'content-type':'image/png'},body:'png'}],(r,b)=>{assert.equal(r.status,200);assert.equal(b,'png');}));
test('stale redirect timeout cannot cancel CDN request',()=>run([{status:302,lateTimeout:true,headers:{location:'https://lh3.googleusercontent.com/a'}},{status:200,delay:20,headers:{'content-type':'image/png'},body:'png'}],(r,b)=>{assert.equal(r.status,200);assert.equal(b,'png');}));
test('image stream failure before data yields sanitized error',()=>run([{status:200,streamError:true,headers:{'content-type':'image/png'}}],errorCheck(502)));
test('image stream abort before data yields sanitized error',()=>run([{status:200,aborted:true,headers:{'content-type':'image/png'}}],errorCheck(502)));
test('missing image content type is rejected',()=>run([{status:200,body:'private'}],errorCheck(502)));
for(const [w,expected] of [['1','100'],['99999','1600'],['bad','800']])test('width is bounded '+w,()=>run([{status:200,headers:{'content-type':'image/png'},body:'png'}],(r,b,c)=>{assert.equal(r.status,200);assert.equal(new URL(c[0]).searchParams.get('maxWidthPx'),expected);},'name=places/abc/photos/def&w='+w));
