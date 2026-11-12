// Deliberately independent of application DB imports and startup/migration runners.
import {createHash, randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const fields = new Set(['name','address','city','state','zip_code','neighborhood','website','phone','hours_display','hours_json','lat','lng','price_level','price_label']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function assert(ok, message) { if (!ok) throw new Error(message); }
function keys(obj, allowed, label) { assert(plain(obj) && Object.keys(obj).every(k => allowed.includes(k)), `Invalid ${label}`); }
function url(value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } }
function validValue(field, value) {
  if (value === null) return field !== 'name';
  if (field === 'hours_json') return plain(value) || Array.isArray(value);
  if (field === 'lat' || field === 'lng') return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= (field === 'lat' ? 90 : 180);
  if (field === 'price_level') return Number.isInteger(value) && value >= 1 && value <= 4;
  if (field === 'website') return typeof value === 'string' && value.length <= 500 && url(value);
  const limits = {name:255,address:500,city:100,state:10,zip_code:20,neighborhood:100,phone:30,hours_display:255,price_label:10};
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limits[field];
}
function canonical(x) { if (Array.isArray(x)) return x.map(canonical); if (plain(x)) return Object.fromEntries(Object.keys(x).sort().map(k => [k,canonical(x[k])])); return x; }
export function validateManifest(input, today = new Date().toISOString().slice(0,10)) {
  // JSON round trip prevents undefined/non-JSON values from changing digest semantics.
  const m = JSON.parse(JSON.stringify(input));
  keys(m,['version','corrections'],'manifest');
  assert(m.version === 1 && Array.isArray(m.corrections) && m.corrections.length >= 1 && m.corrections.length <= 50, 'Expected version 1 and 1–50 corrections');
  const seen = new Set();
  for (const c of m.corrections) {
    keys(c,['venue_id','expected_identity','changes'],'correction');
    assert(uuid.test(c.venue_id) && !seen.has(c.venue_id), 'Invalid or repeated venue ID'); seen.add(c.venue_id);
    keys(c.expected_identity,['name','address','city'],'identity');
    for (const k of ['name','address','city']) assert(Object.hasOwn(c.expected_identity,k) && (typeof c.expected_identity[k] === 'string' || (k !== 'name' && c.expected_identity[k] === null)), `Exact identity ${k} required`);
    assert(plain(c.changes) && Object.keys(c.changes).length > 0, 'Changes required');
    for (const [field, change] of Object.entries(c.changes)) {
      assert(fields.has(field), `Field not allowed: ${field}`);
      keys(change,['expected','value','source_url','observed_at','status','note'],'field change');
      assert(Object.hasOwn(change,'expected') && Object.hasOwn(change,'value'), 'Expected and replacement values required');
      assert(validValue(field,change.value), `Invalid replacement: ${field}`);
      assert(url(change.source_url), 'HTTPS factual source required');
      assert(/^\d{4}-\d{2}-\d{2}$/.test(change.observed_at) && !Number.isNaN(Date.parse(change.observed_at)) && new Date(change.observed_at).toISOString().slice(0,10) === change.observed_at && change.observed_at <= today, 'Invalid/future observation date');
      assert(change.status === undefined || ['reviewed','unknown'].includes(change.status), 'Invalid fact status');
      assert(change.note === undefined || (typeof change.note === 'string' && change.note.trim().length > 0 && change.note.length <= 2000), 'Invalid evidence note');
      assert(change.value !== null || (change.status === 'unknown' && change.note), 'Clearing a value requires unknown status and explanation');
      assert(change.status !== 'unknown' || change.value === null, 'Unknown status requires null value');
    }
    assert(Object.hasOwn(c.changes,'lat') === Object.hasOwn(c.changes,'lng'), 'Coordinates must be reviewed together');
  }
  assert(JSON.stringify(m).length <= 200000, 'Manifest too large');
  return m;
}
export function planCorrections(input) {
  const manifest = validateManifest(input);
  const digest = createHash('sha256').update(JSON.stringify(canonical(manifest))).digest('hex');
  return {mode:'dry-run', database_accessed:false, digest, manifest};
}
function gate(digest, options) {
  assert(options?.apply === true && options.confirmDigest === digest, 'Explicit apply and exact digest confirmation required');
  assert(typeof options.operator === 'string' && options.operator.trim().length >= 3 && options.operator.length <= 200, 'Operator identity required');
}
async function transaction(client, work) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '20s'");
    const result = await work(); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
async function row(client, id) {
  const r = await client.query('SELECT to_jsonb(v) AS record FROM venues v WHERE id=$1 FOR UPDATE',[id]);
  assert(r.rows.length === 1, `Venue missing: ${id}`); return r.rows[0].record;
}
async function write(client, id, changes) {
  const names = Object.keys(changes);
  // names originate exclusively in validated manifests or our stored changed_fields.
  assert(names.every(k => fields.has(k) || k === 'field_provenance'), 'Unexpected write field');
  const values = names.map(k => ['hours_json','field_provenance'].includes(k) && changes[k] !== null ? JSON.stringify(changes[k]) : changes[k]);
  await client.query(`UPDATE venues SET ${names.map((k,i)=>`"${k}"=$${i+2}`).join(',')}, updated_at=NOW() WHERE id=$1`,[id,...values]);
}
export async function applyCorrections(client, input, options) {
  const {manifest,digest} = planCorrections(input); gate(digest,options);
  return transaction(client, async () => {
    const records = [];
    // Deterministic lock order prevents overlapping manifests deadlocking each other.
    for (const c of [...manifest.corrections].sort((a,b)=>a.venue_id.localeCompare(b.venue_id))) {
      const before = await row(client,c.venue_id);
      for (const [k,v] of Object.entries(c.expected_identity)) assert(isDeepStrictEqual(before[k],v), `Identity drift: ${c.venue_id}/${k}`);
      assert(plain(before.field_provenance), 'Migration 017 required / invalid provenance');
      const next = {field_provenance:{...before.field_provenance}};
      for (const [k,v] of Object.entries(c.changes)) {
        assert(isDeepStrictEqual(before[k],v.expected), `Value drift: ${c.venue_id}/${k}`);
        next[k] = v.value;
        next.field_provenance[k] = {status:v.status || 'reviewed',value:v.value,source_url:v.source_url,observed_at:v.observed_at,...(v.note ? {note:v.note} : {})};
      }
      await write(client,c.venue_id,next);
      const after = await row(client,c.venue_id);
      for (const [k,v] of Object.entries(c.changes)) assert(isDeepStrictEqual(after[k],v.value), `Database coercion changed reviewed value: ${c.venue_id}/${k}`);
      records.push({venue_id:c.venue_id,changed_fields:Object.keys(c.changes),before,after});
    }
    const id = randomUUID();
    await client.query('INSERT INTO venue_fact_review_audit (id,operation,manifest_digest,operator,records) VALUES ($1,\'apply\',$2,$3,$4::jsonb)',[id,digest,options.operator,JSON.stringify(records)]);
    return {mode:'applied',audit_id:id,digest,count:records.length};
  });
}
export async function rollbackCorrections(client, auditId, options) {
  assert(uuid.test(auditId), 'Invalid audit ID'); gate(auditId,options);
  return transaction(client, async () => {
    const result = await client.query("SELECT * FROM venue_fact_review_audit WHERE id=$1 AND operation='apply' FOR UPDATE",[auditId]);
    assert(result.rows.length === 1, 'Apply audit not found');
    const original = result.rows[0];
    const prior = await client.query('SELECT id FROM venue_fact_review_audit WHERE reverses=$1',[auditId]);
    assert(prior.rows.length === 0, 'Already rolled back');
    const records = [];
    for (const entry of [...original.records].sort((a,b)=>a.venue_id.localeCompare(b.venue_id))) {
      const before = await row(client,entry.venue_id);
      assert(isDeepStrictEqual(before,entry.after), `Post-edit drift: ${entry.venue_id}`);
      const restore = Object.fromEntries(entry.changed_fields.map(k=>[k,entry.before[k]]));
      restore.field_provenance = entry.before.field_provenance;
      await write(client,entry.venue_id,restore);
      records.push({venue_id:entry.venue_id,changed_fields:entry.changed_fields,before,after:await row(client,entry.venue_id)});
    }
    const id = randomUUID();
    await client.query("INSERT INTO venue_fact_review_audit (id,operation,manifest_digest,operator,reverses,records) VALUES ($1,'rollback',$2,$3,$4,$5::jsonb)",[id,original.manifest_digest,options.operator,auditId,JSON.stringify(records)]);
    return {mode:'rolled-back',audit_id:id,reverses:auditId,count:records.length};
  });
}
