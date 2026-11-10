'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../frontend/js');
for(const file of ['sl-onboarding.js','sl-bundle-7d-ui.js'])test('welcome copy is bounded and truthful in '+file,()=>{
 const source=fs.readFileSync(path.join(root,file),'utf8');
 assert(source.includes('Discover Boston restaurants, bars, and nightlife. Confirm current details with each venue.'));
 assert(source.includes('Ask AI Concierge for venue ideas.'));
 assert(!/powered by real-time data and AI|ask anything, get real answers/i.test(source));
});
