#!/usr/bin/env node
'use strict';
// A full logical archive round-trip using fictional data and two fresh local
// databases. This is not a production backup, PITR, or cluster-role recovery.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {fork,spawnSync}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const ROOT=path.resolve(__dirname,'..');
const EXPECTED_VERSION='18.3';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const safeError=message=>Object.assign(new Error(message),{safe:true});
const must=(condition,message)=>{if(!condition)throw safeError(message);};

function target(raw) {
  let u;
  try {u=new URL(raw);} catch {throw safeError('Refused: invalid disposable database URL');}
  must(['postgres:','postgresql:'].includes(u.protocol)
    && ['127.0.0.1','[::1]'].includes(u.hostname)
    && /^\d+$/.test(u.port) && Number(u.port)>0 && Number(u.port)<=65535
    && /^\/scenelink_test_restore_[a-z0-9_]+$/.test(u.pathname)
    && !u.search && !u.hash && !/[?#]/.test(raw),
  'Refused: explicit loopback port and scenelink_test_restore_* database without overrides required');
  let user,password;
  try {user=decodeURIComponent(u.username);password=decodeURIComponent(u.password);}
  catch {throw safeError('Refused: malformed local database credentials');}
  must(user && !/[\0\r\n]/.test(user+password),'Refused: explicit local database user required');
  return {raw,host:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port),name:u.pathname.slice(1),user,password};
}

function validate(env=process.env,root=ROOT,cwd=process.cwd()) {
  must(env.SCENELINK_RESTORE_REHEARSAL==='yes','Refused: explicit restore rehearsal opt-in required');
  must(!fs.existsSync(path.join(root,'.env')) && !fs.existsSync(path.join(cwd,'.env')),
    'Refused: .env files are not permitted');
  const source=target(env.RESTORE_SOURCE_DATABASE_URL),destination=target(env.RESTORE_TARGET_DATABASE_URL);
  // Different names also rule out a same-database IPv4/IPv6 alias.
  must(source.name!==destination.name,'Refused: source and restored database names must differ');
  must(path.isAbsolute(env.RESTORE_PG_BIN||''),'Refused: absolute PostgreSQL client directory required');
  return {source,destination,bin:env.RESTORE_PG_BIN};
}

function poolFor(t) {
  const {Pool}=require('pg');
  return new Pool({host:t.host,port:t.port,database:t.name,user:t.user,password:t.password,
    ssl:false,max:3,connectionTimeoutMillis:5000,statement_timeout:10000});
}

async function inspectTarget(pool,t,empty) {
  const row=(await pool.query('SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting(\'server_version\') AS version')).rows[0];
  must(row.db===t.name && ['127.0.0.1','::1'].includes(row.host) && row.port===t.port,
    'Refused: actual database endpoint differs from local target');
  must(row.version.split(' ')[0]===EXPECTED_VERSION,'Refused: PostgreSQL 18.3 server required');
  if(empty) {
    // pg_dump archives the entire database. A public-only guard could silently
    // include private schemas, large objects, or standalone types in the dump.
    const catalogs=[['pg_class','relnamespace'],['pg_proc','pronamespace'],['pg_type','typnamespace'],
      ['pg_collation','collnamespace'],['pg_conversion','connamespace'],['pg_operator','oprnamespace'],
      ['pg_opclass','opcnamespace'],['pg_opfamily','opfnamespace'],['pg_ts_config','cfgnamespace'],
      ['pg_ts_dict','dictnamespace'],['pg_ts_parser','prsnamespace'],['pg_ts_template','tmplnamespace']];
    const counts=catalogs.map(([table,column])=>"(SELECT count(*) FROM "+table+" o JOIN pg_namespace n ON n.oid=o."+column+" WHERE n.nspname='public')");
    counts.push("(SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema','pg_toast') AND nspname !~ '^pg_(toast_)?temp_[0-9]+$')",
      "(SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql')");
    for(const table of ['pg_largeobject_metadata','pg_event_trigger','pg_foreign_data_wrapper','pg_foreign_server','pg_publication','pg_subscription'])counts.push('(SELECT count(*) FROM '+table+')');
    const objects=(await pool.query('SELECT '+counts.join('+')+' AS n')).rows[0];
    must(objects.n==='0','Refused: both disposable databases must contain no user objects');
  }
  return row.version;
}

function clientEnv(t) {
  return {PATH:process.env.PATH,LANG:'C.UTF-8',
    ...(process.env.LD_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH}:{}),
    PGHOST:t.host,PGPORT:String(t.port),PGDATABASE:t.name,PGUSER:t.user,PGPASSWORD:t.password,
    PGCONNECT_TIMEOUT:'5',PGSSLMODE:'disable'};
}

function tool(bin,name,args,t) {
  const result=spawnSync(path.join(bin,name),args,{env:clientEnv(t),encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  must(!result.error && result.status===0,'PostgreSQL '+name+' failed; no credential-bearing diagnostic was retained');
  return result.stdout.trim();
}

async function worker() {
  must(process.env.SCENELINK_RESTORE_REHEARSAL==='yes','Refused: worker opt-in required');
  must(!fs.existsSync(path.join(ROOT,'.env')) && !fs.existsSync(path.join(process.cwd(),'.env')),'Refused: .env files are not permitted');
  const t=target(process.env.DATABASE_URL),probe=poolFor(t);
  try {
    await inspectTarget(probe,t,false);
    const marker=(await probe.query('SELECT run_id FROM public.scenelink_restore_rehearsal')).rows;
    must(marker.length===1 && marker[0].run_id===process.env.RESTORE_RUN_ID,'Refused: foreign rehearsal database');
  } finally {await probe.end();}
  const guard=require('./acceptance/guard.cjs');
  guard.disableExternalServices(process.env,{origin:'http://127.0.0.1'});
  guard.fenceOutboundHttp();
  const app=require('../src/server'),pool=require('../src/config/database');
  let server;
  try {
    server=await require('../src/launch/bootstrap').start({
      app:{listen:(port,ready)=>app.listen(port,'127.0.0.1',ready)},
      pool,initialize:app.locals.initializeDatabase,port:0
    });
    process.send({event:'ready',port:server.address().port});
    let stopping=false;
    const close=async()=>{if(stopping)return;stopping=true;server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();process.exit(0);};
    process.once('SIGTERM',close);process.once('SIGINT',close);
  } catch(error) {await pool.end();throw error;}
}

async function launch(t,runId,jwt) {
  const child=fork(__filename,['--worker'],{cwd:ROOT,env:{
    PATH:process.env.PATH,LANG:'C.UTF-8',NODE_ENV:'test',
    SCENELINK_RESTORE_REHEARSAL:'yes',DATABASE_URL:t.raw,RESTORE_RUN_ID:runId,JWT_SECRET:jwt
  },stdio:['ignore','pipe','pipe','ipc']});
  // App logs can include driver diagnostics. Consume them but do not persist.
  child.stdout.resume();child.stderr.resume();
  try {
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(safeError('Local application readiness timed out')),30000);
      child.once('error',()=>{clearTimeout(timer);reject(safeError('Local application failed to start'));});
      child.once('exit',()=>{clearTimeout(timer);reject(safeError('Local application exited before readiness'));});
      child.on('message',message=>{if(message.event==='ready'){clearTimeout(timer);resolve(message.port);}});
    });
    return {child,base:'http://127.0.0.1:'+port+'/api'};
  } catch(error) {child.kill('SIGKILL');throw error;}
}

async function stop(app) {
  if(!app || app.child.exitCode!==null)return;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{app.child.kill('SIGKILL');reject(safeError('Local application shutdown timed out'));},5000);
    app.child.once('exit',()=>{clearTimeout(timer);resolve();});
    app.child.kill('SIGTERM');
  });
}

function requester(base) {
  return async(method,route,body,token,status=200)=>{
    const r=await fetch(base+route,{method,redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    must(r.status===status,'Restored API contract failed: '+method+' '+route.split('?')[0]+' expected '+status);
    return r.json();
  };
}

async function fixtures(pool,api,password) {
  const ids={admin:crypto.randomUUID(),member:crypto.randomUUID(),outsider:crypto.randomUUID(),
    venue:crypto.randomUUID(),list:crypto.randomUUID(),deletedMessage:crypto.randomUUID(),liveMessage:crypto.randomUUID()};
  const bcrypt=require('bcryptjs'),passwordHash=await bcrypt.hash(password,12);
  for(const role of ['admin','member','outsider']) {
    await pool.query('INSERT INTO users(id,email,username,display_name,password_hash,role,email_verified_at,verified_email,auth_version) VALUES($1,$2::text,$3,$4,$5,$6,NOW(),$2::text,3)',
      [ids[role],role+'.restore@example.invalid','restore_'+role,'Fictional restore '+role,passwordHash,role==='admin'?'admin':'user']);
  }
  await pool.query("INSERT INTO friendships(user_a_id,user_b_id,requester_id,status) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$1,'accepted')",[ids.admin,ids.member]);
  await pool.query("INSERT INTO venues(id,name,slug,type,is_active,source,description) VALUES($1,'Restore Fictional Cafe','restore-fictional-cafe','cafe',true,'synthetic_restore','Fictional test fixture, not a real venue')",[ids.venue]);
  const admin=await api('POST','/auth/login',{email:'admin.restore@example.invalid',password});
  const member=await api('POST','/auth/login',{email:'member.restore@example.invalid',password});
  const listPayload={client_id:ids.list,name:'Fictional private restore list',description:'Synthetic archive permission check'};
  const list=(await api('POST','/lists',listPayload,admin.token,201)).list;
  must(list.id===ids.list && list.is_public===false,'Private fixture list identity was not preserved');
  await api('POST','/lists/'+ids.list+'/venues',{venue_id:ids.venue},admin.token);
  const invite=await api('POST','/lists/'+ids.list+'/invitations',{user_id:ids.member},admin.token);
  await api('PUT','/lists/'+ids.list+'/invitation',{response:'accepted',invitation_id:invite.invitation_id},member.token);
  const conversation=await api('POST','/conversations',{user_id:ids.member},admin.token,201);
  ids.conversation=conversation.conversation.id;
  const original='Synthetic original message before archive';
  await api('POST','/conversations/'+ids.conversation+'/messages',{client_id:ids.deletedMessage,body:original},admin.token,201);
  await api('PATCH','/conversations/'+ids.conversation+'/messages/'+ids.deletedMessage,{body:'Synthetic edited text',revision:1},admin.token);
  await api('DELETE','/conversations/'+ids.conversation+'/messages/'+ids.deletedMessage,{revision:2},admin.token);
  await api('POST','/conversations/'+ids.conversation+'/messages',{client_id:ids.liveMessage,body:'Synthetic live message after archive'},admin.token,201);
  await api('POST','/conversations/'+ids.conversation+'/read',{through_id:ids.liveMessage},member.token);
  return {ids,listPayload,original,invitation:invite.invitation_id};
}

async function snapshot(pool) {
  const tables=(await pool.query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname")).rows;
  const rows={};
  for(const table of tables) rows[table.name]=(await pool.query('SELECT to_jsonb(t)::text AS row FROM public.'+quote(table.name)+' t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows.map(r=>r.row);
  const queries={
    columns:"SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
    constraints:"SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname",
    indexes:"SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
    triggers:"SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
    functions:"SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,args",
    extensions:"SELECT extname,extversion FROM pg_extension ORDER BY extname",
    sequenceDefinitions:"SELECT sequencename,data_type,start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename"
  };
  const schema={};
  for(const [name,sql] of Object.entries(queries)) schema[name]=(await pool.query(sql)).rows;
  const sequences={};
  for(const item of schema.sequenceDefinitions) sequences[item.sequencename]=(await pool.query('SELECT last_value::text,is_called FROM public.'+quote(item.sequencename))).rows[0];
  return {rows,schema,sequences};
}

async function restoredChecks(pool,api,password,f) {
  const {ids}=f,sessions={};
  for(const role of ['admin','member','outsider']) {
    sessions[role]=await api('POST','/auth/login',{email:role+'.restore@example.invalid',password});
    must(sessions[role].user.id===ids[role],'Restored account changed identity');
  }
  const a=sessions.admin.token,b=sessions.member.token,c=sessions.outsider.token;
  await api('GET','/admin/stats',undefined,a);
  await api('GET','/admin/stats',undefined,b,403);
  const owned=(await api('GET','/lists/'+ids.list,undefined,a)).list;
  const shared=(await api('GET','/lists/'+ids.list,undefined,b)).list;
  must(owned.is_owner===true && owned.can_manage===true && shared.can_edit===true && shared.can_manage===false,
    'Restored list consent/role boundary changed');
  must(owned.venues.length===1 && owned.venues[0].id===ids.venue && shared.venues[0].id===ids.venue,
    'Restored list venue reference changed');
  await api('GET','/lists/'+ids.list,undefined,c,404);
  await api('GET','/lists/'+ids.list,undefined,undefined,404);
  const replay=await api('POST','/lists',f.listPayload,a);
  must(replay.replayed===true && replay.list.id===ids.list,'Restored list creation receipt did not replay');
  const watermark=(await pool.query('SELECT message_version::text AS version FROM conversations WHERE id=$1',[ids.conversation])).rows[0].version;
  const changes=await api('GET','/conversations/'+ids.conversation+'/changes?after_seq=0',undefined,b);
  must(changes.messages.some(m=>m.id===ids.liveMessage && m.body==='Synthetic live message after archive')
    && changes.messages.some(m=>m.id===ids.deletedMessage && m.body===null && m.deleted_at),'Restored message/tombstone read changed');
  await api('GET','/conversations/'+ids.conversation+'/messages',undefined,c,404);
  const retry=await api('POST','/conversations/'+ids.conversation+'/messages',{client_id:ids.deletedMessage,body:f.original},a);
  must(retry.replayed===true && retry.message.id===ids.deletedMessage && retry.message.body===null && retry.message.deleted_at,
    'Restored original-body retry resurrected a tombstone');
  await api('POST','/conversations/'+ids.conversation+'/messages',{client_id:ids.deletedMessage,body:'Different retry'},a,409);
  const exact=(await pool.query('SELECT send_body_hash,revision,change_seq::text AS seq FROM messages WHERE id=$1',[ids.deletedMessage])).rows[0];
  must(exact.send_body_hash===hash(f.original) && exact.revision===3,'Restored immutable message identity changed');
  must((await pool.query('SELECT message_version::text AS version FROM conversations WHERE id=$1',[ids.conversation])).rows[0].version===watermark,
    'Replay advanced restored conversation watermark');
  const refs=(await pool.query("SELECT n.ref_id,n.data->>'message_id' AS message_id FROM notifications n JOIN conversations c ON c.id=n.ref_id JOIN messages m ON m.id::text=n.data->>'message_id' WHERE n.user_id=$1 AND n.ref_type='conversation' AND n.ref_id=$2 AND m.id=$3",[ids.member,ids.conversation,ids.liveMessage])).rows;
  must(refs.length===1 && refs[0].message_id===ids.liveMessage,'Restored JSON/non-FK reference no longer resolves');
  const pointer=(await pool.query('SELECT last_read_message_id FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2',[ids.conversation,ids.member])).rows[0];
  must(pointer.last_read_message_id===ids.liveMessage,'Restored non-FK read pointer changed');
  await api('POST','/conversations/'+ids.conversation+'/messages',{client_id:crypto.randomUUID(),body:'Synthetic write after restore'},a,201);
  const after=(await pool.query('SELECT message_version::text AS version FROM conversations WHERE id=$1',[ids.conversation])).rows[0].version;
  must(BigInt(after)>BigInt(watermark),'Restored sequence could not advance for a new write');
}

async function main() {
  const config=validate();
  // Do not let ambient libpq options affect either node-pg or command-line tools.
  for(const name of Object.keys(process.env))if(/^PG/.test(name))delete process.env[name];
  const runId=crypto.randomUUID(),jwt=crypto.randomBytes(48).toString('hex'),password=crypto.randomBytes(24).toString('hex');
  const source=poolFor(config.source),destination=poolFor(config.destination);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'scenelink-restore-'));
  fs.chmodSync(directory,0o700);
  const archive=path.join(directory,'synthetic.dump');
  let app,completed=false;
  const checks=[];
  const pass=name=>{checks.push(name);console.log('PASS '+name);};
  try {
    const sourceVersion=await inspectTarget(source,config.source,true);
    const targetVersion=await inspectTarget(destination,config.destination,true);
    const dumpVersion=tool(config.bin,'pg_dump',['--version'],config.source);
    const restoreVersion=tool(config.bin,'pg_restore',['--version'],config.destination);
    must(dumpVersion.includes(' '+EXPECTED_VERSION+' ')||dumpVersion.endsWith(' '+EXPECTED_VERSION),'Refused: PostgreSQL 18.3 pg_dump required');
    must(restoreVersion.includes(' '+EXPECTED_VERSION+' ')||restoreVersion.endsWith(' '+EXPECTED_VERSION),'Refused: PostgreSQL 18.3 pg_restore required');
    pass('fresh distinct native PostgreSQL 18.3 loopback targets and matching clients');
    await source.query('CREATE TABLE public.scenelink_restore_rehearsal(run_id uuid PRIMARY KEY,ordinal bigint GENERATED ALWAYS AS IDENTITY)');
    await source.query('INSERT INTO public.scenelink_restore_rehearsal(run_id) VALUES($1)',[runId]);
    app=await launch(config.source,runId,jwt);
    must((await source.query('SELECT count(*)::int n FROM venues')).rows[0].n===0,'Default catalog seeding must stay disabled');
    const fixture=await fixtures(source,requester(app.base),password);
    must((await source.query('SELECT count(*)::int n FROM users')).rows[0].n===3
      && (await source.query('SELECT count(*)::int n FROM venues')).rows[0].n===1,'Only bounded fictional fixtures may be present');
    await stop(app);app=null;
    pass('actual default startup and reference-rich fictional fixture graph; writers stopped');
    const before=await snapshot(source);
    tool(config.bin,'pg_dump',['--no-password','--format=custom','--no-owner','--no-acl','--file',archive],config.source);
    fs.chmodSync(archive,0o600);
    const archiveBytes=fs.statSync(archive).size,archiveSha256=hash(fs.readFileSync(archive));
    must(archiveBytes>0,'Logical archive was empty');
    await inspectTarget(destination,config.destination,true);
    tool(config.bin,'pg_restore',['--no-password','--dbname',config.destination.name,'--single-transaction','--exit-on-error','--no-owner','--no-acl',archive],config.destination);
    const restored=await snapshot(destination);
    must(isDeepStrictEqual(restored,before),'Full row/schema/sequence snapshot changed during archive restoration');
    pass('full logical custom archive restored atomically with exact rows, schema and sequence state');
    app=await launch(config.destination,runId,jwt);
    await restoredChecks(destination,requester(app.base),password,fixture);
    const ordinal=(await destination.query("SELECT nextval(pg_get_serial_sequence('public.scenelink_restore_rehearsal','ordinal'))::text AS value")).rows[0].value;
    must(ordinal==='2','Restored identity sequence did not resume after its preserved value');
    await stop(app);app=null;
    pass('restored real login, admin/member boundaries, private consent, tombstones and reference-safe writes');
    fs.rmSync(directory,{recursive:true,force:true});
    must(!fs.existsSync(directory),'Temporary logical archive cleanup failed');
    const report={
      schemaVersion:1,observedAt:new Date().toISOString(),status:'passed',scope:'synthetic_logical_database_restore',
      sourceCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout.trim(),
      harnessSha256:hash(fs.readFileSync(__filename)),
      versions:{sourceServer:sourceVersion,targetServer:targetVersion,pgDump:dumpVersion,pgRestore:restoreVersion,node:process.version},
      archive:{format:'custom',bytes:archiveBytes,sha256:archiveSha256,retained:false},
      restore:{singleTransaction:true,exitOnError:true,noOwner:true,noAcl:true,clean:false,createDatabase:false},
      fixtures:{users:3,venues:1,privateLists:1,acceptedInvitations:1,conversations:1,messagesBeforeArchive:2,realData:false},
      preserved:{schemaSha256:hash(JSON.stringify(before.schema)),sequenceStateSha256:hash(JSON.stringify(before.sequences)),
        sequenceCount:Object.keys(before.sequences).length,
        tables:Object.entries(before.rows).map(([name,rows])=>({name,count:rows.length,sha256:hash(JSON.stringify(rows))})),
        fullRows:true,schemaObjects:true,sequences:true,identities:true,foreignKeys:true,jsonAndNonForeignKeyReferences:true},
      checks,
      limitations:['Synthetic application-data/schema logical recovery only; no production backup or production data restore.',
        'No cluster roles, ownership, ACLs, tablespaces, PITR or provider recovery were restored.',
        'No production locking duration, old-writer cutover, browser acceptance or production deployment is established.'],
      cleanup:{applicationProcessesStopped:true,archiveRemoved:true,callerOwnsDisposableDatabases:true}
    };
    if(process.env.RESTORE_EVIDENCE_FILE)fs.writeFileSync(process.env.RESTORE_EVIDENCE_FILE,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('RESTORE_REHEARSAL '+JSON.stringify({status:report.status,sourceCommit:report.sourceCommit,checks:checks.length,tables:report.preserved.tables.length,archiveSha256}));
    completed=true;
  } finally {
    await stop(app).catch(()=>{});
    await Promise.allSettled([source.end(),destination.end()]);
    fs.rmSync(directory,{recursive:true,force:true});
    if(!completed)console.error('No successful restore receipt was written.');
  }
}

if(require.main===module) {
  (process.argv[2]==='--worker'?worker():main()).catch(error=>{
    console.error(error.safe?error.message:'Restore rehearsal failed ('+(/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'REDACTED_ERROR')+')');
    process.exitCode=1;
  });
}
module.exports={target,validate,poolFor,inspectTarget};
