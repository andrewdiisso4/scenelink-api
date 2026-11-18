'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {EVENT_TIME_ZONE,EVENT_TODAY_SQL}=require('../src/services/event-calendar');
test('Boston event date survives UTC midnight and expires at local midnight, including DST',async()=>{
  const db=new PGlite();
  try {
    const fixtures=[
      ['2026-11-18T00:00:00Z','2026-11-17'],
      ['2026-11-18T04:59:59Z','2026-11-17'],
      ['2026-11-18T05:00:00Z','2026-11-18'],
      ['2026-07-18T03:59:59Z','2026-07-17'],
      ['2026-07-18T04:00:00Z','2026-07-18'],
      ['2026-03-08T06:59:59Z','2026-03-08'],
      ['2026-03-08T07:00:00Z','2026-03-08'],
      ['2026-11-01T05:59:59Z','2026-11-01'],
      ['2026-11-01T06:00:00Z','2026-11-01'],
    ];
    for(const zone of ['UTC','Asia/Tokyo','America/Los_Angeles']) {
      await db.exec(`SET TIME ZONE '${zone}'`);
      for(const [instant,date] of fixtures) {
        const expression=EVENT_TODAY_SQL.replace('CURRENT_TIMESTAMP','$1::timestamptz');
        const result=await db.query(`SELECT to_char(${expression},'YYYY-MM-DD') AS day,
          ($2::date >= ${expression}) AS visible_today,
          (($2::date - 1) >= ${expression}) AS visible_yesterday`,[instant,date]);
        assert.deepEqual(result.rows[0],{day:date,visible_today:true,visible_yesterday:false});
      }
    }
    assert.equal(EVENT_TIME_ZONE,'America/New_York');
  } finally {await db.close();}
});
test('listing, new RSVPs, concierge and admin use shared calendar; historical access remains',()=>{
  const source=p=>fs.readFileSync(path.join(__dirname,'../',p),'utf8');
  const events=source('src/launch/events.js');
  const concierge=source('src/routes/concierge.js');
  for(const text of [events,concierge,source('src/routes/adminEvents.js')]) {
    assert.match(text,/EVENT_TODAY_SQL/);assert.doesNotMatch(text,/CURRENT_DATE/);
  }
  assert.match(events,/include_past!=='true'/);
  assert.match(events,/upcoming\?`AND e.date>=\$\{EVENT_TODAY_SQL\}/);
  assert.match(concierge,/BETWEEN \$\{EVENT_TODAY_SQL\} AND \(\$\{EVENT_TODAY_SQL\} \+ \$1::integer\)/);
  const history=events.split("router.get('/events/rsvps/mine'")[1].split("router.get('/events/:eventId'")[0];
  assert.doesNotMatch(history,/EVENT_TODAY_SQL|DELETE FROM|UPDATE events/);
});
