const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-reset-password.js'),'utf8');
const TOKEN='a'.repeat(64);
function load({hash='#token='+TOKEN,search='',result={ok:true,status:200},reject=false}={}){
 const el={};for(const id of ['resetForm','newPassword','confirmPassword','resetSubmit','resetStatus'])el[id]={value:'',disabled:true,hidden:false,attrs:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(e,cb){this[e]=cb},focus(){this.focused=true}};
 const calls=[],urls=[];
 const ctx={URLSearchParams,TextEncoder,window:{location:{search,hash,pathname:'/reset-password.html'},history:{replaceState(...args){urls.push(args)}}},document:{readyState:'complete',getElementById:id=>el[id]},fetch:async(...args)=>{calls.push(args);if(reject)throw Error('offline');return result}};
 vm.runInNewContext(source,ctx);
 return {el,calls,urls,async submit(pass='a password',confirm=pass){el.newPassword.value=pass;el.confirmPassword.value=confirm;if(el.resetForm.submit)await el.resetForm.submit({preventDefault(){}})}};
}
(async()=>{
 for(const config of [{hash:''},{hash:'#token=broken'},{hash:'#token='+TOKEN+'&token='+TOKEN},{hash:'#token='+TOKEN,search:'?token='+'b'.repeat(64)}]){const t=load(config);assert.equal(t.el.resetSubmit.disabled,true);await t.submit();assert.equal(t.calls.length,0);assert.equal(t.urls[0][2],'/reset-password.html')}
 let t=load();assert.equal(t.calls.length,0);assert.equal(t.urls[0][2],'/reset-password.html');await t.submit('short');assert.equal(t.calls.length,0);await t.submit('password1','password2');assert.equal(t.calls.length,0);await t.submit('é'.repeat(37));assert.equal(t.calls.length,0);
 await t.submit();assert.equal(t.calls.length,1);assert.equal(t.calls[0][0],'/api/auth/reset-password');assert.deepEqual(JSON.parse(t.calls[0][1].body),{token:TOKEN,password:'a password'});assert.equal(t.calls[0][1].redirect,'error');assert.equal(t.el.newPassword.value,'');assert.equal(t.el.confirmPassword.value,'');assert.equal(t.el.resetForm.hidden,true);assert.equal(t.el.resetSubmit.disabled,true);await t.submit();assert.equal(t.calls.length,1);
 t=load({hash:'',search:'?token='+TOKEN});await t.submit();assert.equal(t.calls.length,1);
 for(const status of [400,429,500]){t=load({result:{ok:false,status}});await t.submit();assert.equal(t.el.resetForm.hidden,false);assert.equal(t.el.resetStatus.attrs['data-kind'],'error');assert.equal(t.el.resetSubmit.disabled,false)}
 t=load({reject:true});await t.submit();assert.match(t.el.resetStatus.textContent,/not confirmed/);
 assert(!source.includes('localStorage'));assert(!source.includes('sessionStorage'));assert(!source.includes('console.'));
 console.log('PASS reset: hash + legacy query, URL scrubbing, malformed/missing/ambiguous token, min/max UTF8, mismatch, no automatic POST, success clears inputs, single-use in page, 400/429/500/network errors. Mocked fetch only.');
})().catch(e=>{console.error(e);process.exit(1)});
