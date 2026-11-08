'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/launch/messages');
test('message sequence parsing preserves bigint precision and rejects coercion',()=>{
  assert.equal(M.sequence(undefined),'0');assert.equal(M.sequence('00012'),'12');assert.equal(M.sequence('9223372036854775807'),'9223372036854775807');
  for(const value of [null,{},[],1,'-1','1.5','1e2',' 1','9223372036854775808','999999999999999999999999'])assert.throws(()=>M.sequence(value),{status:400});
});
test('message revisions must be explicit bounded integers',()=>{
  assert.equal(M.revision(1),1);
  for(const value of [undefined,null,'1',0,-1,NaN,Infinity,1.5,2147483647,{}])assert.throws(()=>M.revision(value),{status:400});
});
test('send fingerprints identify original UTF-8 content without retaining it in responses',()=>{
  assert.match(M.bodyHash('Local integration only 🗨️'),/^[a-f0-9]{64}$/);
  assert.equal(M.bodyHash('hello'),M.bodyHash('hello'));assert.notEqual(M.bodyHash('hello'),M.bodyHash('hello '));
  assert.doesNotMatch(M.MESSAGE_FIELDS,/send_body_hash/);assert.match(M.MESSAGE_FIELDS,/CASE WHEN m\.deleted_at IS NULL THEN m\.body ELSE NULL END AS body/);
});
test('deleted messages never contribute unread counts',()=>{
  assert.match(M.UNREAD,/m\.deleted_at IS NULL/);assert.match(M.UNREAD,/last_read_message_id/);
});
