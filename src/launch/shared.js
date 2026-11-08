'use strict';
/* SceneLink launch API: shared validation, SQL privacy policy and transaction helpers. */
const crypto = require('node:crypto');
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const AUDIENCES = new Set(['public', 'friends', 'private']);
class HttpError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}
function id(value, name = 'id') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, `Invalid ${name}`);
  return value.toLowerCase();
}
function text(value, name, max, { required = false, fallback = '' } = {}) {
  if (value == null && !required) return fallback;
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text`);
  const s = value.trim();
  if ((required && !s) || s.length > max || /\u0000/.test(s)) throw new HttpError(400, `Invalid ${name} (maximum ${max} characters)`);
  return s;
}
function integer(value, fallback, min, max, name = 'limit') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new HttpError(400, `Invalid ${name}`);
  const n = Number(value); if (!Number.isSafeInteger(n) || n < min || n > max) throw new HttpError(400, `Invalid ${name}`);
  return n;
}
function audience(value, fallback = 'friends') {
  if (value === undefined) return fallback;
  if (!AUDIENCES.has(value)) throw new HttpError(400, 'Audience must be public, friends, or private');
  return value;
}
function like(value) { return String(value).replace(/[\\%_]/g, '\\$&'); }
function https(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw new HttpError(400, 'Invalid image URL');
  try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || /[\s\\]/.test(value)) throw Error(); return u.href; }
  catch (_) { throw new HttpError(400, 'Invalid image URL'); }
}
function actorSQL(alias = 'u', viewer = '$1') {
  return `(${alias}.is_active IS TRUE AND COALESCE(${alias}.is_suspended, false) = false
    AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
      (b.blocker_id = ${viewer}::uuid AND b.blocked_id = ${alias}.id) OR
      (b.blocked_id = ${viewer}::uuid AND b.blocker_id = ${alias}.id)))`;
}
function friendSQL(owner, viewer = '$1') {
  return `EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
    AND f.user_a_id = LEAST(${owner}, ${viewer}::uuid) AND f.user_b_id = GREATEST(${owner}, ${viewer}::uuid))`;
}
function profileSQL(alias = 'u', viewer = '$1') {
  return `(${actorSQL(alias, viewer)} AND (${alias}.id = ${viewer}::uuid OR COALESCE(${alias}.is_private, false) = false OR ${friendSQL(alias + '.id', viewer)}))`;
}
function audienceSQL(owner, expression, viewer = '$1') {
  return `(${owner} = ${viewer}::uuid OR ${expression} = 'public' OR (${expression} = 'friends' AND ${friendSQL(owner, viewer)}))`;
}
function postSQL(p = 'p', u = 'u', viewer = '$1') {
  // Old is_public=false posts remain private. Never reinterpret them as friends-visible.
  const visibility = `COALESCE(${p}.audience, CASE WHEN ${p}.is_public THEN 'public' ELSE 'private' END)`;
  return `(${profileSQL(u, viewer)} AND ${audienceSQL(p + '.user_id', visibility, viewer)}
    AND (${p}.ref_type IS DISTINCT FROM 'list_share' OR EXISTS (SELECT 1 FROM lists l WHERE l.id = ${p}.ref_id AND (l.user_id = ${viewer}::uuid OR l.is_public IS TRUE)))
    AND (${p}.ref_type IS DISTINCT FROM 'plan_share' OR EXISTS (SELECT 1 FROM plans pl WHERE pl.id = ${p}.ref_id AND (pl.user_id = ${viewer}::uuid OR EXISTS (SELECT 1 FROM plan_invites pi WHERE pi.plan_id=pl.id AND pi.invitee_id=${viewer}::uuid AND pi.status='accepted')))))`;
}
// Microsecond timestamp strings from PostgreSQL are preserved, not rounded by Date.
function cursor(value, scope) {
  if (!value) return null;
  try {
    if (typeof value !== 'string' || value.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (c.v !== 1 || c.s !== scope || typeof c.t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(c.t) || !Number.isFinite(Date.parse(c.t))) throw Error();
    id(c.i); if (!['post','checkin','review','comment','message'].includes(c.k)) throw Error();
    return c;
  } catch (_) { throw new HttpError(400, 'Invalid or expired pagination cursor', 'INVALID_CURSOR'); }
}
function encodeCursor(row, scope) {
  const value = {v:1,s:scope,t:row.cursor_at || (row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at),i:row.id,k:row.kind || 'post'};
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function page(rows, limit, scope) {
  const more = rows.length > limit, selected = rows.slice(0, limit);
  const next = more && selected.length ? encodeCursor(selected[selected.length - 1], scope) : null;
  return { items: selected.map(({cursor_at, ...r}) => r), has_more: !!next, next_cursor: next };
}
function timeSQL(alias) { return `to_char(${alias}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at`; }
async function transaction(pool, fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout = '8000ms'"); const value = await fn(db); await db.query('COMMIT'); return value; }
  catch (error) { try { await db.query('ROLLBACK'); } catch (_) {} throw error; }
  finally { db.release(); }
}
async function lockPair(db, a, b) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['scenelink:pair:' + [id(a),id(b)].sort().join(':')]);
}
async function relation(db, me, target, { lock = false } = {}) {
  if (lock) await lockPair(db, me, target);
  const r = await db.query(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.is_private,u.allow_messages,
    ${friendSQL('u.id')} AS is_friend,
    EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id)) AS blocked
    FROM users u WHERE u.id=$2 AND u.is_active IS TRUE AND COALESCE(u.is_suspended,false)=false`, [me,target]);
  if (!r.rows.length || r.rows[0].blocked) throw new HttpError(404, 'User unavailable');
  return r.rows[0];
}
async function notify(db, target, actor, type, refType, refId, data = {}) {
  if (!target || target === actor) return;
  await db.query(`INSERT INTO notifications (user_id,actor_id,type,ref_type,ref_id,data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [target,actor,type,refType,refId,JSON.stringify(data)]);
}
function wrap(fn) { return async (req,res,next) => {
  try { await fn(req,res,next); }
  catch (e) {
    if (res.headersSent) return next(e);
    let status = e instanceof HttpError ? e.status : 500;
    if (e.code === '23505') status = 409;
    if (e.code === '57014') status = 503;
    if (status >= 500) console.error('[launch-api]', e.code || e.name || 'ERROR');
    res.status(status).json({error: status >= 500 ? 'Service temporarily unavailable. Please retry.' : e instanceof HttpError ? e.message : 'Conflicting request. Refresh and retry.', code:e instanceof HttpError ? e.code : 'REQUEST_FAILED'});
  }
}; }
function noStore(req,res,next) { res.setHeader('Cache-Control','private, no-store'); res.vary('Authorization'); next(); }
function newId(value) { return value === undefined ? crypto.randomUUID() : id(value, 'client_id'); }
module.exports = { UUID,HttpError,id,text,integer,audience,like,https,actorSQL,friendSQL,profileSQL,audienceSQL,postSQL,cursor,encodeCursor,page,timeSQL,transaction,lockPair,relation,notify,wrap,noStore,newId };
