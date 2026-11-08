'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {seedDatabase}=require('../src/seeds/seed');
test('production and non-opted-in demo seeding fail before any database query',async()=>{
 const oldEnv=process.env.NODE_ENV,oldSeed=process.env.ALLOW_DEMO_SEED;
 let queries=0;
 try {
  for (const [env,allow] of [['production','true'],['test','false']]) {
   process.env.NODE_ENV=env;process.env.ALLOW_DEMO_SEED=allow;
   await assert.rejects(seedDatabase({query(){queries++;throw Error('must not query');}}),/Demo seeding requires/);
  }
  assert.equal(queries,0);
 } finally {
  if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;
  if(oldSeed===undefined)delete process.env.ALLOW_DEMO_SEED;else process.env.ALLOW_DEMO_SEED=oldSeed;
 }
});

test('event seeding and generation cannot erase or manufacture public listings',()=>{
 const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const source=fs.readFileSync(path.join(__dirname,'../src/seeds/seed.js'),'utf8');
 assert.doesNotMatch(source,/(?:INSERT INTO|DELETE FROM|UPDATE) events/i);
 assert.doesNotMatch(source,/loadJSON\('events\.json'\)/);
 const result=spawnSync(process.execPath,[path.join(__dirname,'../src/seeds/generate_events.js')],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Synthetic event generation is disabled/);
});
