'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const filename=path.join(__dirname,'connected-launch-integration.cjs');
const source=fs.readFileSync(filename,'utf8');

// Execute the actual entry point with only inert builtins. Never load node-pg,
// application code, providers or real network APIs, even if the guard regresses.
function evaluate(connection, approval='yes') {
  const operations=[];
  const environment={TEST_DATABASE_URL:connection,SCENELINK_TEST_ALLOW_SCHEMA_INIT:approval,SCENELINK_API_ROOT:root};
  const context={process:{env:environment,chdir(){operations.push('chdir');throw Error('GUARD_ACCEPTED_STOP');}},require(name){
    if(name==='node:fs')return {existsSync(target){operations.push('filesystem');return target.endsWith('router.js');}};
    if(name==='node:path')return path;
    if(name==='node:assert/strict')return assert;
    if(name==='node:crypto')return {randomBytes(){operations.push('crypto');throw Error('Unexpected initialization');}};
    if(name==='node:module')return {createRequire(){operations.push('application-loader');throw Error('Application loading forbidden');}};
    operations.push('unexpected-module');throw Error('Unexpected module load');
  },URL};
  let error;
  try{vm.runInNewContext(source,context,{filename,timeout:1000});}catch(caught){error=caught;}
  return {operations,error,environment};
}

test('direct integration refuses query host/port/database overrides before any I/O or application loading',()=>{
  const base='postgresql://fixture:fictional-password@127.0.0.1:5432/scenelink_test_fixture';
  for(const suffix of ['?host=example.invalid&port=6432','?host=127.0.0.1&host=example.invalid',
    '?hostaddr=203.0.113.1','?port=6432','?dbname=production','?database=production',
    '?sslmode=require','?options=anything','?','##fragment','#']){
    const {operations,error}=evaluate(base+suffix);
    assert.match(error.message,/REFUSED:/);assert.deepEqual(operations,[]);
    assert.doesNotMatch(error.message,/fictional-password|example.invalid|203\.0\.113/);
  }
});

test('direct integration rejects remote, ambiguous or malformed targets without network-capable modules',()=>{
  for(const connection of ['postgresql://example.invalid:5432/scenelink_test_fixture',
    'postgresql://localhost:5432/scenelink_test_fixture',
    'postgresql://127.0.0.2:5432/scenelink_test_fixture',
    'postgresql://127.0.0.1/scenelink_test_fixture',
    'postgresql://127.0.0.1:0/scenelink_test_fixture',
    'postgresql://127.0.0.1:5432/production',
    'http://127.0.0.1:5432/scenelink_test_fixture',
    'postgresql://fictional-password@127.0.0.1:bad/scenelink_test_fixture',
    'not-a-url']){
    const {operations,error}=evaluate(connection);
    assert.match(error.message,/REFUSED:/);assert.deepEqual(operations,[]);
    assert.doesNotMatch(error.message,/fictional-password/);
  }
  for(const [connection,approval]of [['','yes'],['postgresql://127.0.0.1:5432/scenelink_test_fixture','no']]){
    const {operations,error}=evaluate(connection,approval);
    assert.match(error.message,/Set TEST_DATABASE_URL/);assert.deepEqual(operations,[]);
  }
});

test('direct integration accepts explicit loopback test URLs with ordinary URL-encoded authentication',()=>{
  for(const connection of ['postgresql://postgres:fictional-password@127.0.0.1:5432/scenelink_test_fixture',
    'postgres://fixture%40user:fictional%3A%40%3F%23password@[::1]:5432/scenelink_test_fixture',
    'postgresql://127.0.0.1:6543/scenelink_test_fixture']){
    const {operations,error}=evaluate(connection);
    assert.equal(error.message,'GUARD_ACCEPTED_STOP');
    assert.deepEqual(operations,['filesystem','filesystem','chdir']);
  }
});
