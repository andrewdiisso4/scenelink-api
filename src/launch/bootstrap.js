'use strict';
// Refuse traffic before required schema exists. Initialization errors are fatal.
async function start({app,pool,initialize,port,env=process.env}) {
  await initialize();
  const r=await pool.query("SELECT version FROM launch_schema_versions WHERE version='social-search-2026-09-09'");
  if(!r.rows.length)throw new Error('Required launch migration 007 is missing');
  const rooms=await pool.query("SELECT version FROM launch_schema_versions WHERE version='connected-rooms-2026-09-09'");
  if(!rooms.rows.length)throw new Error('Required decision-room migration 008 is missing');
  const accounts=await pool.query("SELECT version FROM launch_schema_versions WHERE version='account-compatibility-2026-09-15'");
  if(!accounts.rows.length)throw new Error('Required account compatibility migration 009 is missing');
  const ownership=await pool.query("SELECT version FROM launch_schema_versions WHERE version='email-ownership-2026-10-27'");
  if(!ownership.rows.length)throw new Error('Required email ownership migration 010 is missing');
  const rsvps=await pool.query("SELECT version FROM launch_schema_versions WHERE version='event-rsvps-2026-10-30'");
  if(!rsvps.rows.length)throw new Error('Required event RSVP migration 012 is missing');
  const social=await pool.query("SELECT version FROM launch_schema_versions WHERE version='social-profile-messaging-2026-10-30'");
  if(!social.rows.length)throw new Error('Required social profile/messaging migration 013 is missing');
  await pool.query('SELECT auth_version FROM users LIMIT 0');
  await pool.query('SELECT audience FROM posts LIMIT 0');
  await pool.query('SELECT last_read_message_id FROM conversation_participants LIMIT 0');
  return await new Promise((resolve,reject)=>{
    const server=app.listen(port,()=>{console.log('[launch] API ready');resolve(server);});server.once('error',reject);
  });
}
module.exports={start};
