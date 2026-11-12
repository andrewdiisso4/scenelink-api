#!/usr/bin/env node
// Offline dry-run by default. No dotenv or app database module imports.
import {readFile} from 'node:fs/promises';
import {planDuplicateSuppression,suppressDuplicates,rollbackDuplicates} from '../src/operations/reviewed-venue-duplicates.mjs';
async function main() {
  const args = process.argv.slice(2), opts = {};
  for (let i=0;i<args.length;i++) {
    const key=args[i];
    if (key === '--apply') { if (opts.apply) throw new Error('Duplicate flag'); opts.apply=true; }
    else if (['--manifest','--rollback','--confirm','--operator'].includes(key) && args[i+1] && !args[i+1].startsWith('--')) {
      if (opts[key]) throw new Error('Duplicate option'); opts[key]=args[++i];
    } else throw new Error('Unknown/incomplete option');
  }
  if (Boolean(opts['--manifest']) === Boolean(opts['--rollback'])) throw new Error('Supply exactly one --manifest or --rollback');
  let manifest, plan;
  if (opts['--manifest']) {
    const raw = await readFile(opts['--manifest'],'utf8');
    if (raw.length > 100000) throw new Error('Manifest too large');
    manifest=JSON.parse(raw); plan=planDuplicateSuppression(manifest);
  } else {
    if (!/^[0-9a-f-]{36}$/.test(opts['--rollback'])) throw new Error('Invalid audit ID');
    plan={mode:'dry-run',database_accessed:false,rollback_audit_id:opts['--rollback'],note:'Rollback preview is offline; live drift checks occur only on explicit apply.'};
  }
  if (!opts.apply) { console.log(JSON.stringify(plan,null,2)); return; }
  const confirmation=plan.digest || opts['--rollback'];
  if (opts['--confirm'] !== confirmation || !opts['--operator']?.trim() || opts['--operator'].trim().length < 3) throw new Error('Explicit matching --confirm and --operator required');
  // Initial release intentionally cannot operate on a remote/production database.
  if (process.env.SCENELINK_CORRECTIONS_LOCAL_ONLY !== 'yes') throw new Error('Local-only acknowledgement required');
  let u;
  try { u=new URL(process.env.CORRECTIONS_DATABASE_URL); } catch { throw new Error('Explicit local CORRECTIONS_DATABASE_URL required'); }
  if (!['postgres:','postgresql:'].includes(u.protocol) || !['127.0.0.1','[::1]'].includes(u.hostname) || u.search || u.hash || !u.port || !/^\/scenelink_test_[a-z0-9_]+$/.test(u.pathname)) throw new Error('Only explicit loopback scenelink_test_* databases are allowed');
  const {default:pg}=await import('pg');
  const client=new pg.Client({connectionString:u.href,connectionTimeoutMillis:5000});
  try {
    await client.connect();
    const gate={apply:true,confirmDigest:confirmation,operator:opts['--operator']};
    console.log(JSON.stringify(manifest ? await suppressDuplicates(client,manifest,gate) : await rollbackDuplicates(client,opts['--rollback'],gate),null,2));
  } finally { await client.end(); }
}
main().catch(error=>{ console.error('Duplicate suppression refused:', error.code ? String(error.code).replace(/[^A-Z0-9_]/g,'').slice(0,30) : error.message); process.exitCode=1; });
