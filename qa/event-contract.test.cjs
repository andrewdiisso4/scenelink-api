'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../src/launch/events');
test('event dates reject impossible or coerced values',()=>{
  assert.equal(E.calendarDate('2028-02-29'),'2028-02-29');
  for(const value of ['2026-02-29','2026-13-01','2026-02-31','tomorrow',null,{},20261030])assert.throws(()=>E.calendarDate(value),{status:400});
});
test('external event links never establish reservations and unsafe links disappear',()=>{
  for(const url of ['javascript:alert(1)','http://example.invalid','https://user:pass@example.invalid','https://example.invalid/ bad','https:\\evil.invalid']){
    const event=E.publicEvent({event_url:url,source_url:url,image_url:url});
    assert.equal(event.event_url,null);assert.equal(event.source_url,null);assert.equal(event.image_url,null);
    assert.equal(event.booking.status,'not_available');assert.equal(event.booking.reservation_confirmed,false);
    assert.equal(event.booking_status,'not_booked');assert.equal(event.rsvp_is_reservation,false);
  }
  const event=E.publicEvent({event_url:'https://example.com/isolated-qa-event',my_rsvp:'going',my_rsvp_audience:'private'});
  assert.equal(event.booking.status,'external_link');assert.equal(event.my_rsvp,'going');assert.equal(event.booking.reservation_confirmed,false);
});
test('event public policy requires source review and counts only explicitly public real RSVPs',()=>{
  assert.match(E.PUBLIC_EVENT(),/source_review_status='reviewed'/);
  assert.match(E.PUBLIC_EVENT(),/source_reviewed_at IS NOT NULL/);
  assert.match(E.EVENT_COLUMNS,/er\.audience='public'/);
  assert.match(E.EVENT_COLUMNS,/attendee\.is_private,false\)=false/);
  assert.doesNotMatch(E.EVENT_COLUMNS,/e\.attending_count|e\.rating/);
});
test('startup selects migration012 and refuses traffic when RSVP schema is absent',async()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
  assert.match(source,/011_\|012_/);
  const {start}=require('../src/launch/bootstrap');
  let listening=false;
  await assert.rejects(start({initialize:async()=>{},port:0,app:{listen(){listening=true;}},
    pool:{query:async sql=>({rows:sql.includes('event-rsvps-2026-10-30')?[]:[{version:'fixture-only'}]})}}),/migration 012 is missing/);
  assert.equal(listening,false);
});
