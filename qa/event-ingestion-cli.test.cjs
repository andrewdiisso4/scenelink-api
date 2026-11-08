'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const net = require('node:net'), path = require('node:path'), {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
function invoke(env, args = ['qa/fixtures/event-ingestion.json','00000000-0000-4000-8000-000000000001']) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['qa/run-event-ingestion.cjs',...args], {
      cwd:root, env:{...process.env,QA_ISOLATED_DATABASE:'',DATABASE_URL:'',ENABLE_PROVIDER_FETCH:'',...env},
      stdio:['ignore','pipe','pipe'], timeout:5000,
    });
    let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
    child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));
  });
}
test('ingestion CLI refuses absent isolation, remote and malformed DB targets without exposing URLs', async () => {
  for (const env of [{}, {QA_ISOLATED_DATABASE:'true'},
    {QA_ISOLATED_DATABASE:'true',DATABASE_URL:'postgresql://fixture-secret@example.invalid:5432/scenelink_test_fixture_test'},
    {QA_ISOLATED_DATABASE:'true',DATABASE_URL:'not-a-url'}]) {
    const result=await invoke(env);assert.equal(result.code,1);assert.equal(result.stdout,'');
    assert.match(result.stderr,/Event ingestion rehearsal failed/);assert.doesNotMatch(result.stderr,/fixture-secret|example.invalid/);
  }
});
test('ingestion CLI validates DB guard and provider opt-in before any connection', async () => {
  let connections=0; const trap=net.createServer(socket=>{connections++;socket.destroy();});
  await new Promise(resolve=>trap.listen(0,'127.0.0.1',resolve));
  const url=`postgresql://postgres@127.0.0.1:${trap.address().port}/scenelink_test_fixture_test`;
  try {
    for (const target of [url.replace('/scenelink_test_fixture_test','/production'),url+'?host=example.invalid',url+'#fragment']) {
      assert.equal((await invoke({QA_ISOLATED_DATABASE:'true',DATABASE_URL:target})).code,1);
    }
    assert.equal((await invoke({QA_ISOLATED_DATABASE:'true',DATABASE_URL:url},['--ticketmaster','00000000-0000-4000-8000-000000000001'])).code,1);
    assert.equal((await invoke({QA_ISOLATED_DATABASE:'true',DATABASE_URL:url},['qa/fixtures/event-ingestion.json','bad-run-id'])).code,1);
    assert.equal(connections,0);
  } finally { await new Promise(resolve=>trap.close(resolve)); }
});
