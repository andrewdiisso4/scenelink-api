'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../frontend'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const rules=read('_redirects').split('\n').map(l=>l.trim().split(/\s+/)).filter(([p,q])=>p.startsWith('/')&&q);
const catchall=rules.findIndex(([p])=>p==='/*');
const known=new Map(rules.slice(0,catchall).map(([p,q,status])=>[p,{q,status}]));
function target(pathname){
 const rule=known.get(pathname);
 if(rule){assert.match(rule.status,/^(200|301)$/);return rule.q;}
 return pathname;
}
function assertInternal(pathname,detail){
 const file=target(pathname);
 assert(file.startsWith('/')&&fs.statSync(path.join(root,file),{throwIfNoEntry:false})?.isFile(),detail+': '+pathname);
}
test('company footer and mail calls to action resolve before any fallback',()=>{
 for(const page of ['careers','press'])assert.deepEqual(known.get('/'+page),{q:'/'+page+'.html',status:'200'});
 for(const pathname of ['/explore.html','/profile','/contact.html','/privacy.html','/terms.html','/verify-email.html','/reset-password.html','/business-reset-password.html']){
  assertInternal(pathname,'first-party email destination');
 }
});
test('published page headers and footers resolve internal anchor destinations without implicit pretty URLs',()=>{
 let count=0, pages=0;
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
  const pageUrl='https://scenelink.app/'+f,dom=new JSDOM(read(f),{url:pageUrl});
  try{
   const local=Array.from(dom.window.document.querySelectorAll('header a[href], footer a[href]'),a=>new URL(a.href,pageUrl))
      .filter(u=>u.origin==='https://scenelink.app' && u.protocol==='https:');
   if(local.length)pages++;
   for(const u of local){assertInternal(u.pathname,f);count++;}
  }finally{dom.window.close();}
 }
 assert(pages>=10);assert(count>=100);
});
