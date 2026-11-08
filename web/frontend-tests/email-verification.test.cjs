const fs=require('fs'),vm=require('vm'),assert=require('assert');
const confirmSource=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-email-verification.js'),'utf8');
const bannerSource=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-verification-banner.js'),'utf8');
const TOKEN='a'.repeat(64);
function node(){return {children:[],attrs:{},disabled:true,setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this[k]=v},appendChild(n){this.children.push(n)},prepend(n){this.children.unshift(n)},remove(){this.removed=true},style:{}}}
function confirmation(hash='#token='+TOKEN,status=200,fail=false){
 const nodes={verifySubmit:node(),verifyStatus:node()},calls=[],urls=[];
 vm.runInNewContext(confirmSource,{URLSearchParams,window:{location:{hash,pathname:'/verify-email.html'},history:{replaceState(...a){urls.push(a)}}},document:{readyState:'complete',getElementById:k=>nodes[k]},fetch:async(...a)=>{calls.push(a);if(fail)throw Error('offline');return {ok:status>=200&&status<300,status}}});
 return {nodes,calls,urls,async click(){if(nodes.verifySubmit.click)await nodes.verifySubmit.click()}};
}
function banner(flag,status=202,auth=true,fail=false){
 const body=node(),events={},calls=[],timers=[];let current=flag===undefined?{}:{email_verified:flag};
 const window={SLAuth:{user:()=>current,getToken:()=>auth?'fake-auth-token':''},addEventListener(k,fn){events[k]=fn}};
 vm.runInNewContext(bannerSource,{window,document:{readyState:'complete',body,createElement:node},Date,setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},fetch:async(...a)=>{calls.push(a);if(fail)throw Error('offline');return {status,ok:status<300,headers:{get:()=> '60'}}}});
 return {body,calls,events,timers,change(value){current={email_verified:value};events['sl-auth-changed']()},async click(){const b=body.children[0];if(b)await b.children[2].click()}};
}
(async()=>{
 for(const hash of ['', '#token=bad','#token='+TOKEN+'&token='+TOKEN]){const t=confirmation(hash);assert.equal(t.calls.length,0);await t.click();assert.equal(t.calls.length,0);assert.equal(t.urls[0][2],'/verify-email.html')}
 let t=confirmation();assert.equal(t.calls.length,0);await t.click();assert.equal(t.calls.length,1);assert.equal(t.calls[0][0],'/api/auth/verification/confirm');assert.deepEqual(JSON.parse(t.calls[0][1].body),{token:TOKEN});assert.match(t.nodes.verifyStatus.textContent,/log in again/);await t.click();assert.equal(t.calls.length,1);
 for(const status of [400,429,503]){t=confirmation('#token='+TOKEN,status);await t.click();assert.equal(t.nodes.verifyStatus.attrs['data-kind'],'error')}
 t=confirmation('#token='+TOKEN,200,true);await t.click();assert.match(t.nodes.verifyStatus.textContent,/not confirmed/);
 for(const [flag,auth] of [[undefined,true],[true,true],[false,false]]){const b=banner(flag,202,auth);assert.equal(b.body.children.length,0);assert.equal(b.calls.length,0)}
 let b=banner(false);assert.equal(b.body.children.length,1);assert.equal(b.calls.length,0);await b.click();assert.equal(b.calls[0][0],'/api/auth/verification/request');assert.equal(b.calls[0][1].body,'{}');assert.equal(b.calls[0][1].headers.Authorization,'Bearer fake-auth-token');assert.match(b.body.children[0].children[1].textContent,/If verification is needed.*requested/);await b.click();assert.equal(b.calls.length,1);b.change(true);assert.equal(b.body.children[0].removed,true);
 b=banner(false,429);await b.click();assert.equal(b.body.children[0].children[2].disabled,true);assert(b.timers.length);
 b=banner(false,503);await b.click();assert.match(b.body.children[0].children[1].textContent,/temporarily unavailable/);
 b=banner(false,202,true,true);await b.click();assert.match(b.body.children[0].children[1].textContent,/not confirmed/);
 for(const s of [confirmSource,bannerSource]){assert(!s.includes('localStorage'));assert(!s.includes('console.'))}
 console.log('PASS verification: hash token validation+scrub, explicit-only confirm, success/error/network; banner false flag+auth only, no auto email, empty body, bearer auth,202 conditional request,429 cooldown,503/network honest errors, verified hides banner. Mock requests only.');
})().catch(e=>{console.error(e);process.exit(1)});
