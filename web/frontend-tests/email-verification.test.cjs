const fs=require('fs'),vm=require('vm'),assert=require('assert');
const confirmSource=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-email-verification.js'),'utf8');
const bannerSource=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-verification-banner.js'),'utf8');
const TOKEN='a'.repeat(64);
function node(){return {children:[],attrs:{},disabled:true,setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this[k]=v},appendChild(n){this.children.push(n)},prepend(n){this.children.unshift(n)},remove(){this.removed=true},style:{}}}
function confirmation(hash='#token='+TOKEN,status=200,fail=false){
 const nodes={verifySubmit:node(),verifyStatus:node()},calls=[],urls=[];
 vm.runInNewContext(confirmSource,{URLSearchParams,setTimeout,clearTimeout,AbortController,window:{location:{hash,pathname:'/verify-email.html'},history:{replaceState(...a){urls.push(a)}}},document:{readyState:'complete',getElementById:k=>nodes[k]},fetch:async(...a)=>{calls.push(a);if(fail)throw Error('offline');return {ok:status>=200&&status<300,status,json:async()=>({ok:true})}}});
 return {nodes,calls,urls,async click(){if(nodes.verifySubmit.click)await nodes.verifySubmit.click()}};
}
function banner(flag,status=202,auth=true,fail=false,layout){
 const body=node(),events={},calls=[],timers=[];let current=flag===undefined?{}:{email_verified:flag};
 const window={SLAuth:{user:()=>current,getToken:()=>auth?'fake-auth-token':''},addEventListener(k,fn){events[k]=fn},removeEventListener(k,fn){if(events[k]===fn)delete events[k]}};
 let header,observer;
 if(layout){
  header=node();header.parentNode=body;body.appendChild(header);
  header.getBoundingClientRect=()=>({bottom:layout.headerBottom});
  header.insertAdjacentElement=(where,n)=>{assert.equal(where,'afterend');body.children.splice(body.children.indexOf(header)+1,0,n)};
  window.scrollY=layout.scrollY||0;window.getComputedStyle=()=>({position:layout.position});
  window.ResizeObserver=function(callback){observer=this;this.callback=callback;this.observe=n=>{this.target=n};this.disconnect=()=>{this.disconnected=true}};
 }
 function createElement(tag){const n=node();if(tag==='aside'&&layout)n.getBoundingClientRect=()=>({top:layout.flowTop-window.scrollY+(parseFloat(n.style.marginTop)||0)});return n}
 vm.runInNewContext(bannerSource,{window,document:{readyState:'complete',body,getElementById:()=>header,createElement},Date,setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},fetch:async(...a)=>{calls.push(a);if(fail)throw Error('offline');return {status,ok:status<300,headers:{get:()=> '60'}}}});
 return {body,calls,events,timers,window,header,get observer(){return observer},change(value){current={email_verified:value};events['sl-auth-changed']()},async click(){const b=body.children.find(n=>n.id==='slVerificationBanner');if(b)await b.children[2].click()}};
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
 const layout={position:'fixed',headerBottom:114,flowTop:70};b=banner(false,202,true,false,layout);
 const aside=b.body.children[1];assert.equal(b.body.children[0],b.header);assert.equal(aside.id,'slVerificationBanner');assert.equal(aside.style.marginTop,'44px');assert.equal(b.observer.target,b.header);
 layout.headerBottom=140;b.observer.callback();assert.equal(aside.style.marginTop,'70px');
 b.window.scrollY=400;b.events.resize();assert.equal(aside.style.marginTop,'70px','scroll position must not accumulate header spacing');
 layout.position='relative';b.events.resize();assert.equal(aside.style.marginTop,'0px','mobile header already reserves its height');
 layout.position='fixed';layout.flowTop=160;b.events.resize();assert.equal(aside.style.marginTop,'0px','do not add spacing when the fixed header already clears the banner');
 b.change(true);assert.equal(aside.removed,true);assert.equal(b.observer.disconnected,true);assert.equal(b.events.resize,undefined);
 for(const s of [confirmSource,bannerSource]){assert(!s.includes('localStorage'));assert(!s.includes('console.'))}
 console.log('PASS verification: hash token validation+scrub, explicit-only confirm, success/error/network; banner false flag+auth only, no auto email, empty body, bearer auth,202 conditional request,429 cooldown,503/network honest errors, verified hides banner; banner follows header, measured fixed overlap, resize/scroll stability, mobile flow and layout cleanup. Mock requests and geometry only.');
})().catch(e=>{console.error(e);process.exit(1)});
