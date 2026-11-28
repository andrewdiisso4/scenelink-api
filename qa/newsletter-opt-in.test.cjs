'use strict';
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const fs = require('node:fs');
const express = require('express');
const pg = require('pg');
const {PGlite} = require('@electric-sql/pglite');
const {createHash} = require('node:crypto');
process.env.EMAIL_PROVIDER='disabled';
process.env.ADMIN_SECRET='fictional-newsletter-test';
const templates = require('../src/services/mailer');
const {createRouter} = require('../src/routes/newsletter');
let pool, close, server, origin, ready=true, result={ok:true};
const sends = [];
const migration = fs.readFileSync(require.resolve('../migrations/019_newsletter_opt_in.sql'),'utf8');
before(async()=>{
 const target = process.env.TEST_NEWSLETTER_DATABASE_URL;
 if (target) {
   const u=new URL(target);
   assert(process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT==='yes' && u.protocol==='postgresql:' &&
     u.hostname==='127.0.0.1' && u.port && /^\/scenelink_test_[a-z0-9_]+$/.test(u.pathname) && !u.search && !u.hash);
   pool=new pg.Pool({connectionString:target}); close=()=>pool.end();
   assert.equal((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
 } else {
   const db=new PGlite(); await db.waitReady;
   pool={query:(sql,params)=>params?db.query(sql,params):db.exec(sql).then(items=>items.at(-1))};close=()=>db.close();
 }
 await pool.query(`CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE SQL AS 'SELECT gen_random_uuid()';
   CREATE TABLE users(id uuid PRIMARY KEY);
   CREATE TABLE launch_schema_versions(version text PRIMARY KEY);
   `+migration);
 await pool.query(`INSERT INTO newsletter_subscribers(email,status) VALUES ('Legacy@Example.invalid','active')`);
 await pool.query(migration);
 const app=express(); app.use(express.json()); app.use('/api/newsletter',createRouter({pool,mailer:{
   isReadyFor:p=>ready && p==='newsletter-confirm',newsletterConfirmEmail:templates.newsletterConfirmEmail,
   sendMail:async msg=>{sends.push(msg);return result;},
 },logger:{warn(){}}}));
 server=app.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve)); await close?.();});
async function req(path,body,headers={}){
 const response=await fetch(origin+'/api/newsletter/'+path,body?{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}:{headers});
 return [response.status,await response.json(),response.headers.get('cache-control')];
}
const row=async email=>(await pool.query('SELECT * FROM newsletter_subscribers WHERE LOWER(email)=$1',[email])).rows[0];
const tokenOf=(mail,mode)=>{
 const url=mail.text.match(new RegExp('https://[^\\s]+#mode='+mode+'&token=[A-Za-z0-9_-]+'))[0];
 return new URLSearchParams(new URL(url).hash.slice(1)).get('token');
};
test('footer submits anonymously, sends one confirmation, stores only hash, and opts in once',async()=>{
 const recipient='new@example.invalid';
 const [a,b]=await Promise.all([req('subscribe',{email:'  NEW@Example.invalid ',name:'ignored'}),req('subscribe',{email:recipient})]);
 assert.deepEqual(a,b);assert.equal(a[0],202);assert.equal(a[2],'no-store');
 assert.equal(sends.length,1);assert.equal(sends[0].purpose,'newsletter-confirm');assert.equal(sends[0].to.address,recipient);assert.equal(sends[0].retry,false);
 const token=tokenOf(sends[0],'confirm');assert.equal(tokenOf(sends[0],'unsubscribe'),token);
 const pending=await row(recipient);assert.equal(pending.status,'pending');assert.equal(pending.name,null);assert.equal(pending.user_id,null);
 assert.equal(pending.opt_in_hash,createHash('sha256').update(token).digest('hex'));
 assert(!JSON.stringify(pending).includes(token));
 assert.equal((await req('confirm',{token}))[0],200); assert.equal((await row(recipient)).status,'active');
 assert.equal((await req('confirm',{token}))[0],400);
 assert.equal((await req('subscribe',{email:recipient}))[0],202); assert.equal(sends.length,1);
 assert.equal((await req('unsubscribe',{token}))[0],200); assert.equal((await req('unsubscribe',{token}))[0],200);
 assert.equal((await row(recipient)).status,'unsubscribed');assert.equal((await req('confirm',{token}))[0],400);
});
test('legacy subscriber can explicitly reconfirm; only confirmed active subscribers count and admin credential is header only',async()=>{
 assert.equal((await req('subscribers?secret=fictional-newsletter-test'))[0],403);
 const headers={'x-admin-secret':'fictional-newsletter-test'};
 assert.equal((await req('subscribers',null,headers))[1].total,0);
 assert.equal((await req('subscribe',{email:'legacy@example.invalid'}))[0],202);
 const token=tokenOf(sends.at(-1),'confirm');
 assert.equal((await req('confirm',{token}))[0],200);
 const list=(await req('subscribers',null,headers))[1];
 assert.deepEqual(list.subscribers.map(r=>r.email),['Legacy@Example.invalid']);assert.equal(list.total,1);
});
test('unavailable mail does not create a record; failed delivery does not subscribe; expired token cannot activate',async()=>{
 ready=false; const away='not-ready@example.invalid';assert.equal((await req('subscribe',{email:away}))[0],503);assert.equal(await row(away),undefined);
 ready=true;result={ok:false}; const fail='failure@example.invalid';assert.equal((await req('subscribe',{email:fail}))[0],503);
 result={ok:true};assert.equal((await row(fail)).status,'pending');
 const token=tokenOf(sends.at(-1),'confirm');
 await pool.query("UPDATE newsletter_subscribers SET opt_in_requested_at=NOW()-INTERVAL '25 hours' WHERE email=$1",[fail]);
 assert.equal((await req('confirm',{token}))[0],400);
 assert.equal((await req('subscribe',{email:'name@example.invalid,other@example.invalid'}))[0],400);
});
test('native waitlist does not opt into newsletter or consume a confirmation email',async()=>{
 const n=sends.length,email='app@example.invalid';
 assert.equal((await req('subscribe',{email,source:'app_waitlist_ios'}))[0],200);
 assert.equal((await pool.query('SELECT platform FROM app_launch_waitlist WHERE email=$1',[email])).rows[0].platform,'ios');
 assert.equal(await row(email),undefined); assert.equal(sends.length,n);
});
