'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {validate,poolFor,inspectTarget}=require('./native-restore-rehearsal.cjs');
const source='postgres://test:synthetic-guard-value@127.0.0.1:5432/scenelink_test_restore_source';
const destination='postgres://test:synthetic-guard-value@127.0.0.1:5432/scenelink_test_restore_target';
const env=()=>({SCENELINK_RESTORE_REHEARSAL:'yes',RESTORE_SOURCE_DATABASE_URL:source,
  RESTORE_TARGET_DATABASE_URL:destination,RESTORE_PG_BIN:'/synthetic-client-bin'});

test('both restore targets reject remote, ambiguous and override-bearing URLs before client execution',()=>{
  for(const key of ['RESTORE_SOURCE_DATABASE_URL','RESTORE_TARGET_DATABASE_URL']) {
    for(const bad of [
      'postgres://test:synthetic-guard-value@remote.example.invalid:5432/scenelink_test_restore_bad',
      'postgres://test:synthetic-guard-value@localhost:5432/scenelink_test_restore_bad',
      'postgres://test:synthetic-guard-value@127.0.0.1/scenelink_test_restore_bad',
      'postgres://test:synthetic-guard-value@127.0.0.1:5432/production',
      destination+'?host=remote.example.invalid',destination+'?',destination+'#'
    ]) {
      const input=env();input[key]=bad;
      const r=spawnSync(process.execPath,[path.join(__dirname,'native-restore-rehearsal.cjs')],
        {env:{PATH:process.env.PATH,...input},encoding:'utf8',timeout:5000});
      assert.equal(r.status,1);
      assert.match(r.stderr,/Refused:/);
      assert(!r.stdout.includes('PASS '),'No database/tool operation may be reached');
      assert(!r.stderr.includes('synthetic-guard-value'),'Credential values must not enter diagnostics');
    }
  }
});

test('explicit opt-in and distinct names prevent accidental same-database or IPv4/IPv6 reuse',()=>{
  assert.throws(()=>validate({...env(),SCENELINK_RESTORE_REHEARSAL:''}),/opt-in/);
  assert.throws(()=>validate({...env(),RESTORE_TARGET_DATABASE_URL:source}),/names must differ/);
  assert.throws(()=>validate({...env(),RESTORE_TARGET_DATABASE_URL:source.replace('127.0.0.1','[::1]')}),/names must differ/);
  assert.throws(()=>validate({...env(),RESTORE_PG_BIN:'relative/bin'}),/absolute/);
  const result=validate(env());
  assert.equal(result.source.host,'127.0.0.1');
  assert.equal(result.destination.name,'scenelink_test_restore_target');
});

test('.env protection applies to both repository and invocation directory',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'restore-guard-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  fs.writeFileSync(path.join(directory,'.env'),'SYNTHETIC_GUARD_ONLY=yes\n');
  assert.throws(()=>validate(env(),directory,__dirname),/\.env/);
  assert.throws(()=>validate(env(),__dirname,directory),/\.env/);
});

test('native whole-database guards refuse private data, standalone types and large objects before any source initialization',
  {skip:process.env.SCENELINK_RESTORE_REHEARSAL!=='yes'},async()=>{
  const config=validate(),pools=[poolFor(config.source),poolFor(config.destination)];
  const cases=[
    {index:1,setup:"CREATE SCHEMA restore_private_guard; CREATE TABLE restore_private_guard.sentinel(value text); INSERT INTO restore_private_guard.sentinel VALUES('fictional private sentinel')",
      verify:"SELECT value FROM restore_private_guard.sentinel",expected:[{value:'fictional private sentinel'}],
      cleanup:"DROP SCHEMA restore_private_guard CASCADE"},
    {index:0,setup:"CREATE TYPE public.restore_type_guard AS ENUM ('fictional sentinel')",
      verify:"SELECT enumlabel FROM pg_enum WHERE enumtypid='public.restore_type_guard'::regtype",expected:[{enumlabel:'fictional sentinel'}],
      cleanup:"DROP TYPE public.restore_type_guard"},
    {index:1,setup:"SELECT lo_from_bytea(543210,decode('73796e746865746963','hex'))",
      verify:"SELECT encode(lo_get(543210),'hex') AS content",expected:[{content:'73796e746865746963'}],
      cleanup:"SELECT lo_unlink(543210)"},
    {index:0,setup:"CREATE TABLE public.restore_table_guard(value integer); INSERT INTO public.restore_table_guard VALUES(7)",
      verify:"SELECT value FROM public.restore_table_guard",expected:[{value:7}],
      cleanup:"DROP TABLE public.restore_table_guard"}
  ];
  try {
    await inspectTarget(pools[0],config.source,true);
    await inspectTarget(pools[1],config.destination,true);
    for(const item of cases) {
      await pools[item.index].query(item.setup);
      try {
        const r=spawnSync(process.execPath,[path.join(__dirname,'native-restore-rehearsal.cjs')],{
          env:{PATH:process.env.PATH,...process.env,RESTORE_EVIDENCE_FILE:''},encoding:'utf8',timeout:10000});
        assert.equal(r.status,1);
        assert.match(r.stderr,/both disposable databases must contain no user objects/);
        assert(!r.stdout.includes('PASS '));
        assert.deepEqual((await pools[item.index].query(item.verify)).rows,item.expected);
        const other=1-item.index;
        await inspectTarget(pools[other],other===0?config.source:config.destination,true);
      } finally {await pools[item.index].query(item.cleanup);}
    }
    await inspectTarget(pools[0],config.source,true);
    await inspectTarget(pools[1],config.destination,true);
  } finally {await Promise.all(pools.map(pool=>pool.end()));}
});
