'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../frontend');
const tool=path.resolve(__dirname,'../frontend-tools/sync_auth_css.py');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const section=/\/\* === css\/sl-auth-ui\.css === \*\/([\s\S]*?)(?=\/\* === css\/[^ ]+ === \*\/|$)/g;

test('published homepage auth CSS exactly matches standalone source',()=>{
 assert.match(read('index.html'),/href=["']\/?css\/sl-bundle-7d\.css\?/);
 const matches=[...read('css/sl-bundle-7d.css').matchAll(section)];
 assert.equal(matches.length,1);
 assert.equal(matches[0][1].trim(),read('css/sl-auth-ui.css').trim());
 assert.match(matches[0][1],/\.sl-auth-overlay\s+\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test('release finalization synchronizes auth CSS without changing unrelated sections',()=>{
 const finalizer=fs.readFileSync(path.resolve(__dirname,'../frontend-tools/finalize.py'),'utf8');
 assert.match(finalizer,/from sync_auth_css import sync_auth_css/);
 assert.match(finalizer,/sync_auth_css\(root\)/);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'scenelink-auth-css-'));
 try{
  fs.mkdirSync(path.join(temp,'css'));
  const before='/* === css/before.css === */\n.before{display:flex}\n';
  const after='/* === css/after.css === */\n.after{display:grid}\n';
  const source='.sl-auth-overlay [hidden] { display: none !important; }\n';
  const bundle=path.join(temp,'css/sl-bundle-7d.css');
  fs.writeFileSync(bundle,before+'/* === css/sl-auth-ui.css === */\n.stale{display:flex}\n'+after);
  fs.writeFileSync(path.join(temp,'css/sl-auth-ui.css'),source);
  execFileSync('python3',[tool,temp]);
  const expected=before+'/* === css/sl-auth-ui.css === */\n'+source+after;
  assert.equal(fs.readFileSync(bundle,'utf8'),expected);
  execFileSync('python3',[tool,temp]);assert.equal(fs.readFileSync(bundle,'utf8'),expected,'idempotent');
  fs.writeFileSync(bundle,before+after);
  assert.throws(()=>execFileSync('python3',[tool,temp],{stdio:'pipe'}));
  assert.equal(fs.readFileSync(bundle,'utf8'),before+after,'fail closed on missing marker');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
