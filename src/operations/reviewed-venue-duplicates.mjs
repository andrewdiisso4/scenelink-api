import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object=x=>x!==null && typeof x==='object' && !Array.isArray(x);
function check(ok,message) { if(!ok) throw new Error(message); }
function exactKeys(x,keys) { check(object(x) && Object.keys(x).length===keys.length && keys.every(k=>Object.hasOwn(x,k)), 'Unexpected or missing manifest properties'); }
const normal=x=>x.trim().toLowerCase().replace(/\s+/g,' ');
const identity=r=>({name:r.name,address:r.address,city:r.city});
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export function planDuplicateSuppression(input,today=new Date().toISOString().slice(0,10)) {
  const m=JSON.parse(JSON.stringify(input));
  exactKeys(m,['version','pairs']);
  check(m.version===1 && Array.isArray(m.pairs) && m.pairs.length>0 && m.pairs.length<=25 && JSON.stringify(m).length<=100000,'Expected 1–25 reviewed pairs, max 100 KB');
  const aliases=new Set(),targets=new Set();
  for(const p of m.pairs) {
    exactKeys(p,['alias_id','canonical_id','expected_alias','expected_canonical','evidence']);
    check(UUID.test(p.alias_id) && UUID.test(p.canonical_id) && p.alias_id!==p.canonical_id && !aliases.has(p.alias_id),'Invalid/repeated alias or self reference');
    aliases.add(p.alias_id);targets.add(p.canonical_id);
    for(const i of [p.expected_alias,p.expected_canonical]) {
      exactKeys(i,['name','address','city']);
      for(const v of Object.values(i)) check(typeof v==='string' && v.trim().length>0 && v.length<=500,'Complete nonempty branch identity required');
    }
    for(const k of ['name','address','city']) check(normal(p.expected_alias[k])===normal(p.expected_canonical[k]),'Incompatible branch identity; resolve factual discrepancies separately');
    exactKeys(p.evidence,['source_url','observed_at','note']);
    let u;try{u=new URL(p.evidence.source_url);}catch{throw new Error('Official HTTPS evidence required');}
    check(u.protocol==='https:' && !u.username && !u.password && u.href.length<=2048,'Official HTTPS evidence required');
    const d=p.evidence.observed_at;
    check(typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d && d<=today,'Invalid/future observation date');
    check(typeof p.evidence.note==='string' && p.evidence.note.trim().length>=10 && p.evidence.note.length<=2000,'Explain official evidence and same-branch decision');
  }
  check([...aliases].every(id=>!targets.has(id)),'Chains and cycles are prohibited');
  return {mode:'dry-run',database_accessed:false,digest:createHash('sha256').update(JSON.stringify(canonical(m))).digest('hex'),manifest:m};
}
function gate(token,o) { check(o?.apply===true && o.confirmDigest===token,'Explicit apply and exact confirmation required');check(typeof o.operator==='string' && o.operator.trim().length>=3 && o.operator.length<=200,'Operator identity required'); }
async function transact(db,fn) {
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
    // Serialize graph changes against other writers, bounded to this tiny batch.
    // Ordinary discovery SELECTs remain usable. Native lock rehearsal is required.
    await db.query('LOCK TABLE venues IN SHARE ROW EXCLUSIVE MODE');
    const result=await fn();await db.query('COMMIT');return result;
  }catch(e){await db.query('ROLLBACK');throw e;}
}
async function get(db,id) {
  const r=await db.query('SELECT to_jsonb(v) AS record FROM venues v WHERE id=$1 FOR UPDATE',[id]);check(r.rows.length===1,`Missing venue: ${id}`);return r.rows[0].record;
}
function available(r) { return r.is_active===true && !/^closed/i.test(r.business_status||'') && !['temporarily_closed','permanently_closed'].includes((r.business_status||'').toLowerCase()); }
export async function suppressDuplicates(db,input,o) {
  const {manifest,digest}=planDuplicateSuppression(input);gate(digest,o);
  return transact(db,async()=>{
    const records=[];
    for(const p of [...manifest.pairs].sort((a,b)=>a.alias_id.localeCompare(b.alias_id))) {
      const before=await get(db,p.alias_id),target=await get(db,p.canonical_id);
      check(equal(identity(before),p.expected_alias) && equal(identity(target),p.expected_canonical),'Identity drift');
      check(Object.hasOwn(before,'duplicate_of') && Object.hasOwn(target,'duplicate_of') && object(before.duplicate_review),'Migration 017 required');
      check(available(before) && available(target),'Both venues must be active and not closed');
      check(before.duplicate_of===null && target.duplicate_of===null,'Existing duplicate links require separate rollback; chains prohibited');
      const incoming=await db.query('SELECT id FROM venues WHERE duplicate_of=$1 LIMIT 1',[p.alias_id]);check(incoming.rows.length===0,'Alias is already a canonical target; chains prohibited');
      const review={status:'reviewed_duplicate',canonical_id:p.canonical_id,alias_identity:p.expected_alias,canonical_identity:p.expected_canonical,...p.evidence};
      await db.query('UPDATE venues SET duplicate_of=$2,duplicate_review=$3::jsonb,updated_at=NOW() WHERE id=$1',[p.alias_id,p.canonical_id,JSON.stringify(review)]);
      records.push({alias_id:p.alias_id,canonical_id:p.canonical_id,before,after:await get(db,p.alias_id),canonical_before:target});
    }
    const id=randomUUID();await db.query("INSERT INTO venue_duplicate_review_audit(id,operation,manifest_digest,operator,records) VALUES ($1,'suppress',$2,$3,$4::jsonb)",[id,digest,o.operator,JSON.stringify(records)]);
    return {mode:'suppressed',audit_id:id,digest,count:records.length};
  });
}
export async function rollbackDuplicates(db,id,o) {
  check(UUID.test(id),'Invalid audit ID');gate(id,o);
  return transact(db,async()=>{
    const a=await db.query("SELECT * FROM venue_duplicate_review_audit WHERE id=$1 AND operation='suppress' FOR UPDATE",[id]);check(a.rows.length===1,'Suppression audit not found');
    check((await db.query('SELECT id FROM venue_duplicate_review_audit WHERE reverses=$1',[id])).rows.length===0,'Already rolled back');
    const records=[];
    for(const r of a.rows[0].records) {
      const before=await get(db,r.alias_id),target=await get(db,r.canonical_id);
      check(equal(before,r.after) && equal(target,r.canonical_before),'Post-edit drift on alias or canonical');
      // Restore the exact guarded before-image, including its timestamp. This lets
      // independently audited fact corrections be reversed after suppression is undone.
      // The appended reversal audit (not venues.updated_at) records reversal time.
      await db.query('UPDATE venues SET duplicate_of=$2,duplicate_review=$3::jsonb,updated_at=$4::timestamptz WHERE id=$1',[r.alias_id,r.before.duplicate_of,JSON.stringify(r.before.duplicate_review),r.before.updated_at]);
      const after=await get(db,r.alias_id);
      check(equal(after,r.before),'Exact duplicate before-image restoration failed');
      records.push({alias_id:r.alias_id,canonical_id:r.canonical_id,before,after,canonical_before:target});
    }
    const auditId=randomUUID();await db.query("INSERT INTO venue_duplicate_review_audit(id,operation,manifest_digest,operator,reverses,records) VALUES ($1,'rollback',$2,$3,$4,$5::jsonb)",[auditId,a.rows[0].manifest_digest,o.operator,id,JSON.stringify(records)]);
    return {mode:'rolled-back',audit_id:auditId,reverses:id,count:records.length};
  });
}
