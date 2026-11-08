'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/launch/profile'),A=require('../src/launch/achievements');
test('social links normalize allowed profile hosts and never imply verification',()=>{
 const examples={instagram:'https://www.instagram.com/alex.test/',facebook:'https://facebook.com/alex.test',tiktok:'https://tiktok.com/@alex.test',x:'https://twitter.com/alex_test',youtube:'https://youtube.com/@alex-test',linkedin:'https://linkedin.com/in/alex-test',snapchat:'https://snapchat.com/add/alex.test'};
 const links=P.socialLinks(Object.entries(examples).map(([provider,url])=>({provider,url})));
 assert.equal(links.length,7);assert(links.every(l=>l.verified===false&&l.kind==='external_profile'));
 assert.equal(links.find(l=>l.provider==='x').url,'https://x.com/alex_test');
 assert.equal(links.find(l=>l.provider==='instagram').url,'https://instagram.com/alex.test');
 assert.deepEqual(P.socialLinks([]),[]);
});
test('social links reject active schemes, credentials, redirects, query tracking and mismatched hosts',()=>{
 for(const url of ['javascript:alert(1)','http://instagram.com/alex','https://instagram.com.evil.invalid/alex','https://evil.invalid@instagram.com/alex','https://instagram.com/alex?next=https://evil.invalid','https://instagram.com/alex#section','https://instagram.com:444/alex','https://instagram.com/accounts','https://instagram.com/%61lex','https://127.0.0.1/alex','https:\\instagram.com\\alex','https://instagram.com/alex name','https://x.com/alex'])assert.throws(()=>P.socialLinks([{provider:'instagram',url}]),{status:400},url);
});
test('social link collection rejects duplicates, unsupported providers and false verification claims',()=>{
 const link={provider:'instagram',url:'https://instagram.com/alex'};
 for(const value of [null,{},'text',[link,link],Array(8).fill(link),[{provider:'website',url:'https://example.com'}],[{...link,verified:true}],[{...link,kind:'verified_account'}],[null]])assert.throws(()=>P.socialLinks(value),{status:400});
 assert.deepEqual(P.socialLinks([{...link,verified:false,kind:'external_profile'}]),P.socialLinks([link]));
});
test('profile revision accepts only positive safe JSON integers',()=>{
 assert.equal(P.expectedRevision(undefined),null);assert.equal(P.expectedRevision(1),1);
 for(const v of [null,'1',0,-1,1.5,true,{},NaN,Infinity,2147483647])assert.throws(()=>P.expectedRevision(v),{status:400});
});
test('earned milestones derive only from supplied actual counts with bounded progress and no points',()=>{
 const empty=A.fromCounts({saved_venues:0,friends:0,shared_posts:0,collaborative_plans:0});
 assert(empty.badges.every(b=>!b.earned&&b.progress===0));assert.equal(empty.points,null);assert.equal(empty.real_world_attendance_verified,false);
 const earned=A.fromCounts({saved_venues:999,friends:1,shared_posts:0,collaborative_plans:0});
 assert(earned.badges.filter(b=>b.metric==='saved_venues').every(b=>b.earned&&b.progress===b.threshold));
 const publicResult=A.publicView(earned);assert.equal(publicResult.counts,undefined);assert(publicResult.badges.every(b=>b.earned&&b.progress===undefined));
});
test('startup requires social schema and canonical prefixes cannot fall through to weaker handlers',async()=>{
 const fs=require('node:fs');const router=fs.readFileSync(require.resolve('../src/launch/router'),'utf8');
 for(const prefix of ["'/search'","'/social'","'/notifications'","'/reports'"])assert(router.includes(prefix));
 let listening=false;await assert.rejects(require('../src/launch/bootstrap').start({initialize:async()=>{},port:0,app:{listen(){listening=true;}},pool:{query:async sql=>({rows:sql.includes('social-profile-messaging-2026-10-30')?[]:[{version:'fixture'}]})}}),/migration 013 is missing/);assert.equal(listening,false);
});
test('database pool errors never dump driver clients or connection credentials',()=>{
 const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../src/config/database'),'utf8');
 assert.doesNotMatch(source,/console\.error\([^\n]*, err\)/);assert.match(source,/CONNECTION_ERROR/);
});
