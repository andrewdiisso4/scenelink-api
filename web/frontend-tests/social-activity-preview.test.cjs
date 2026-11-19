'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('guest landing explains sharing and never calls the legacy member activity stream',t=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../frontend/social-feed.html'),'utf8');
 const d=new JSDOM(html);t.after(()=>d.window.close());
 const preview=d.window.document.getElementById('slHeroActivityFeed');
 assert.match(preview.textContent,/accepted friends choose to share/i);
 assert.match(preview.textContent,/saved places stay private/i);
 assert.equal(preview.querySelectorAll('.sl-preview-item').length,0);
 assert(!html.includes('/api/activity'),'Guest landing does not use legacy named activity');
});
