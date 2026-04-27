/**
 * SceneLink — Plans v2
 * Back-compat preserved:
 *   GET    /api/plans                 — list own plans (now includes stops + invited+accepted members)
 *   POST   /api/plans                 — { name, date } create plan (auto-owner member)
 *   POST   /api/plans/:id/venues      — { venue_id } (legacy: adds a plan_venue AND mirrors to plan_stops)
 *   DELETE /api/plans/:id             — delete own plan
 *
 * New:
 *   GET    /api/plans/:id             — plan detail (accessible to owner + accepted members + invitees)
 *   POST   /api/plans/:id/stops       — { venue_id, arrival_time?, notes?, sort_order? }
 *   PUT    /api/plans/:id/stops/:stopId  — update time/notes/sort_order
 *   DELETE /api/plans/:id/stops/:stopId
 *   POST   /api/plans/:id/invites     — { user_id | username }
 *   POST   /api/plans/:id/invites/:inviteId/accept
 *   POST   /api/plans/:id/invites/:inviteId/decline
 *   GET    /api/plans/invites/incoming
 *   POST   /api/plans/:id/share       — create a post referencing the plan
 */

const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function userCanViewPlan(planId, userId) {
  const r = await pool.query(
    `SELECT p.id
       FROM plans p
       LEFT JOIN plan_members pm ON pm.plan_id=p.id AND pm.user_id=$2
       LEFT JOIN plan_invites pi ON pi.plan_id=p.id AND pi.invitee_id=$2 AND pi.status='pending'
      WHERE p.id=$1 AND (p.user_id=$2 OR pm.user_id IS NOT NULL OR pi.invitee_id IS NOT NULL)
      LIMIT 1`,
    [planId, userId]
  );
  return r.rows.length > 0;
}
async function userIsOwnerOrMember(planId, userId) {
  const r = await pool.query(
    `SELECT 1 FROM plans p
       LEFT JOIN plan_members pm ON pm.plan_id=p.id AND pm.user_id=$2
      WHERE p.id=$1 AND (p.user_id=$2 OR pm.user_id IS NOT NULL) LIMIT 1`,
    [planId, userId]
  );
  return r.rows.length > 0;
}
async function userIsOwner(planId, userId) {
  const r = await pool.query('SELECT 1 FROM plans WHERE id=$1 AND user_id=$2', [planId, userId]);
  return r.rows.length > 0;
}
async function resolveUserIdFromBody(body) {
  if (body.user_id && UUID_RE.test(body.user_id)) return body.user_id;
  if (body.username) {
    const r = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
      [String(body.username).trim()]
    );
    if (r.rows.length) return r.rows[0].id;
  }
  return null;
}
async function fetchPlanFull(planId) {
  const p = await pool.query(
    `SELECT id, user_id, name, date, status, created_at, updated_at FROM plans WHERE id=$1`,
    [planId]
  );
  if (!p.rows.length) return null;
  const plan = p.rows[0];
  const [stops, members, invites] = await Promise.all([
    pool.query(
      `SELECT s.id, s.venue_id, s.sort_order, s.arrival_time, s.notes,
              v.name AS venue_name, v.slug AS venue_slug, v.image_url, v.neighborhood, v.type, v.rating, v.price_label
         FROM plan_stops s JOIN venues v ON v.id=s.venue_id
        WHERE s.plan_id=$1 ORDER BY s.sort_order ASC, s.created_at ASC`,
      [planId]
    ),
    pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, pm.role
         FROM plan_members pm JOIN users u ON u.id=pm.user_id
        WHERE pm.plan_id=$1`,
      [planId]
    ),
    pool.query(
      `SELECT pi.id AS invite_id, pi.status, pi.invitee_id, pi.inviter_id, pi.created_at,
              u.username, u.display_name, u.avatar_url
         FROM plan_invites pi JOIN users u ON u.id=pi.invitee_id
        WHERE pi.plan_id=$1`,
      [planId]
    )
  ]);
  // Legacy plan_venues (for rows created before stops) — show if no stop row for that venue
  const pvResult = await pool.query(
    `SELECT pv.venue_id, v.name, v.slug, v.image_url, v.neighborhood, v.type, v.rating, v.price_label
       FROM plan_venues pv JOIN venues v ON v.id=pv.venue_id
      WHERE pv.plan_id=$1`, [planId]
  );
  const stopVenueIds = new Set(stops.rows.map(s => s.venue_id));
  const legacyOnly = pvResult.rows.filter(pv => !stopVenueIds.has(pv.venue_id));

  return {
    ...plan,
    stops: stops.rows,
    legacy_venues: legacyOnly,
    members: members.rows,
    invites: invites.rows
  };
}

// ---------- LIST ----------
router.get('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const plansR = await pool.query(
      `SELECT DISTINCT p.id
         FROM plans p
         LEFT JOIN plan_members pm ON pm.plan_id=p.id AND pm.user_id=$1
        WHERE p.user_id=$1 OR pm.user_id IS NOT NULL
        ORDER BY p.id`,
      [me]
    );
    const out = [];
    for (const row of plansR.rows) {
      const full = await fetchPlanFull(row.id);
      if (full) out.push(full);
    }
    out.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : Infinity;
      const db = b.date ? new Date(b.date).getTime() : Infinity;
      if (da !== db) return da - db;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    res.json({ plans: out });
  } catch (err) {
    console.error('[plans] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- CREATE ----------
router.post('/', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const name = String((req.body && req.body.name) || '').trim();
    const date = (req.body && req.body.date) || null;
    if (!name) return res.status(400).json({ error: 'Plan name is required' });
    if (name.length > 200) return res.status(400).json({ error: 'name too long' });

    const r = await pool.query(
      `INSERT INTO plans (user_id, name, date) VALUES ($1,$2,$3)
         RETURNING id, user_id, name, date, status, created_at, updated_at`,
      [me, name, date]
    );
    await pool.query(
      `INSERT INTO plan_members (plan_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [r.rows[0].id, me]
    );
    res.status(201).json({ plan: { ...r.rows[0], stops: [], members: [], invites: [], legacy_venues: [] } });
  } catch (err) {
    console.error('[plans] create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- DETAIL ----------
router.get('/invites/incoming', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const r = await pool.query(
      `SELECT pi.id AS invite_id, pi.status, pi.plan_id, pi.inviter_id, pi.created_at,
              p.name AS plan_name, p.date AS plan_date,
              u.username AS inviter_username, u.display_name AS inviter_display_name, u.avatar_url AS inviter_avatar_url
         FROM plan_invites pi
         JOIN plans p ON p.id = pi.plan_id
         JOIN users u ON u.id = pi.inviter_id
        WHERE pi.invitee_id = $1 AND pi.status = 'pending'
        ORDER BY pi.created_at DESC`,
      [me]
    );
    res.json({ invites: r.rows });
  } catch (err) {
    console.error('[plans] incoming invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid plan id' });
    if (!(await userCanViewPlan(id, me))) return res.status(404).json({ error: 'Plan not found' });
    const full = await fetchPlanFull(id);
    if (!full) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: full });
  } catch (err) {
    console.error('[plans] detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- DELETE PLAN ----------
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid plan id' });
    const del = await pool.query(`DELETE FROM plans WHERE id=$1 AND user_id=$2 RETURNING id`, [id, me]);
    if (!del.rows.length) return res.status(404).json({ error: 'Plan not found' });
    res.json({ removed: true, id });
  } catch (err) {
    console.error('[plans] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- LEGACY VENUE-ADD (kept for AI Concierge "Save Plan" flow) ----------
router.post('/:planId/venues', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { planId } = req.params;
    const { venue_id } = req.body || {};
    if (!UUID_RE.test(planId)) return res.status(400).json({ error: 'Invalid plan id' });
    if (!venue_id || !UUID_RE.test(venue_id)) return res.status(400).json({ error: 'venue_id required' });
    if (!(await userIsOwnerOrMember(planId, me))) return res.status(404).json({ error: 'Plan not found' });

    await pool.query(
      `INSERT INTO plan_venues (plan_id, venue_id) VALUES ($1,$2)
         ON CONFLICT (plan_id, venue_id) DO NOTHING`,
      [planId, venue_id]
    );
    // Mirror into plan_stops with next sort_order (for V1 UI)
    const mx = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM plan_stops WHERE plan_id=$1`,
      [planId]
    );
    // Avoid duplicating stop for same venue
    const exists = await pool.query(
      'SELECT 1 FROM plan_stops WHERE plan_id=$1 AND venue_id=$2 LIMIT 1',
      [planId, venue_id]
    );
    if (!exists.rows.length) {
      await pool.query(
        `INSERT INTO plan_stops (plan_id, venue_id, sort_order) VALUES ($1,$2,$3)`,
        [planId, venue_id, mx.rows[0].next]
      );
    }
    await pool.query(`UPDATE plans SET updated_at=NOW() WHERE id=$1`, [planId]);
    res.json({ success: true, plan_id: planId, venue_id });
  } catch (err) {
    console.error('[plans] add venue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- STOPS ----------
router.post('/:id/stops', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id } = req.params;
    const { venue_id, arrival_time, notes, sort_order } = req.body || {};
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid plan id' });
    if (!venue_id || !UUID_RE.test(venue_id)) return res.status(400).json({ error: 'venue_id required' });
    if (!(await userIsOwnerOrMember(id, me))) return res.status(404).json({ error: 'Plan not found' });

    const mx = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM plan_stops WHERE plan_id=$1`,
      [id]
    );
    const order = Number.isInteger(sort_order) ? sort_order : mx.rows[0].next;

    const ins = await pool.query(
      `INSERT INTO plan_stops (plan_id, venue_id, sort_order, arrival_time, notes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, plan_id, venue_id, sort_order, arrival_time, notes, created_at`,
      [id, venue_id, order, arrival_time || null, notes || null]
    );
    await pool.query(`UPDATE plans SET updated_at=NOW() WHERE id=$1`, [id]);
    res.status(201).json({ stop: ins.rows[0] });
  } catch (err) {
    console.error('[plans] add stop error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/stops/:stopId', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id, stopId } = req.params;
    if (!UUID_RE.test(id) || !UUID_RE.test(stopId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await userIsOwnerOrMember(id, me))) return res.status(404).json({ error: 'Plan not found' });

    const { arrival_time, notes, sort_order } = req.body || {};
    const fields = [];
    const vals = [];
    let i = 1;
    if (typeof arrival_time !== 'undefined') { fields.push(`arrival_time=$${i++}`); vals.push(arrival_time); }
    if (typeof notes !== 'undefined')        { fields.push(`notes=$${i++}`);        vals.push(notes); }
    if (typeof sort_order !== 'undefined')   { fields.push(`sort_order=$${i++}`);   vals.push(sort_order); }
    if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(stopId, id);
    const up = await pool.query(
      `UPDATE plan_stops SET ${fields.join(', ')}
         WHERE id=$${i++} AND plan_id=$${i++}
         RETURNING id, plan_id, venue_id, sort_order, arrival_time, notes`,
      vals
    );
    if (!up.rows.length) return res.status(404).json({ error: 'Stop not found' });
    await pool.query(`UPDATE plans SET updated_at=NOW() WHERE id=$1`, [id]);
    res.json({ stop: up.rows[0] });
  } catch (err) {
    console.error('[plans] update stop error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/stops/:stopId', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id, stopId } = req.params;
    if (!UUID_RE.test(id) || !UUID_RE.test(stopId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await userIsOwnerOrMember(id, me))) return res.status(404).json({ error: 'Plan not found' });
    const del = await pool.query(
      `DELETE FROM plan_stops WHERE id=$1 AND plan_id=$2 RETURNING id, venue_id`,
      [stopId, id]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Stop not found' });
    // Also remove legacy plan_venues mirror row if no other stop uses that venue
    const other = await pool.query(
      'SELECT 1 FROM plan_stops WHERE plan_id=$1 AND venue_id=$2 LIMIT 1',
      [id, del.rows[0].venue_id]
    );
    if (!other.rows.length) {
      await pool.query('DELETE FROM plan_venues WHERE plan_id=$1 AND venue_id=$2', [id, del.rows[0].venue_id]);
    }
    await pool.query(`UPDATE plans SET updated_at=NOW() WHERE id=$1`, [id]);
    res.json({ removed: true, id: stopId });
  } catch (err) {
    console.error('[plans] delete stop error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- INVITES ----------
router.post('/:id/invites', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid plan id' });
    if (!(await userIsOwner(id, me))) return res.status(403).json({ error: 'Only the owner can invite' });

    const target = await resolveUserIdFromBody(req.body || {});
    if (!target) return res.status(400).json({ error: 'user_id or username required' });
    if (target === me) return res.status(400).json({ error: "Can't invite yourself" });

    // Already a member?
    const memberCheck = await pool.query(
      'SELECT 1 FROM plan_members WHERE plan_id=$1 AND user_id=$2', [id, target]
    );
    if (memberCheck.rows.length) return res.status(409).json({ error: 'User already in plan' });

    const existing = await pool.query(
      'SELECT id, status FROM plan_invites WHERE plan_id=$1 AND invitee_id=$2', [id, target]
    );
    if (existing.rows.length) {
      if (existing.rows[0].status === 'pending') return res.status(200).json({ invite_id: existing.rows[0].id, status: 'pending', already_invited: true });
      // re-open declined
      await pool.query(
        `UPDATE plan_invites SET status='pending', inviter_id=$1, responded_at=NULL WHERE id=$2`,
        [me, existing.rows[0].id]
      );
      await pool.query(
        `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id, data)
         VALUES ($1, $2, 'plan_invite', 'plan', $3, $4)`,
        [target, me, id, JSON.stringify({ invite_id: existing.rows[0].id })]
      );
      return res.json({ invite_id: existing.rows[0].id, status: 'pending', reopened: true });
    }

    const ins = await pool.query(
      `INSERT INTO plan_invites (plan_id, inviter_id, invitee_id)
       VALUES ($1,$2,$3) RETURNING id, status, created_at`,
      [id, me, target]
    );
    await pool.query(
      `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id, data)
       VALUES ($1, $2, 'plan_invite', 'plan', $3, $4)`,
      [target, me, id, JSON.stringify({ invite_id: ins.rows[0].id })]
    );
    res.status(201).json({ invite_id: ins.rows[0].id, status: 'pending' });
  } catch (err) {
    console.error('[plans] invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/invites/:inviteId/accept', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id, inviteId } = req.params;
    if (!UUID_RE.test(id) || !UUID_RE.test(inviteId)) return res.status(400).json({ error: 'Invalid id' });
    const inv = await pool.query(
      `SELECT id, plan_id, invitee_id, inviter_id, status FROM plan_invites WHERE id=$1`,
      [inviteId]
    );
    if (!inv.rows.length || inv.rows[0].plan_id !== id) return res.status(404).json({ error: 'Invite not found' });
    const row = inv.rows[0];
    if (row.invitee_id !== me) return res.status(403).json({ error: 'Not your invite' });
    if (row.status !== 'pending') return res.status(409).json({ error: `Cannot accept — status is ${row.status}` });

    await pool.query(`UPDATE plan_invites SET status='accepted', responded_at=NOW() WHERE id=$1`, [inviteId]);
    await pool.query(
      `INSERT INTO plan_members (plan_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [id, me]
    );
    await pool.query(
      `INSERT INTO notifications (user_id, actor_id, type, ref_type, ref_id)
       VALUES ($1, $2, 'plan_accept', 'plan', $3)`,
      [row.inviter_id, me, id]
    );
    res.json({ invite_id: inviteId, status: 'accepted' });
  } catch (err) {
    console.error('[plans] accept invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/invites/:inviteId/decline', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id, inviteId } = req.params;
    if (!UUID_RE.test(id) || !UUID_RE.test(inviteId)) return res.status(400).json({ error: 'Invalid id' });
    const inv = await pool.query(
      `SELECT id, plan_id, invitee_id, status FROM plan_invites WHERE id=$1`,
      [inviteId]
    );
    if (!inv.rows.length || inv.rows[0].plan_id !== id) return res.status(404).json({ error: 'Invite not found' });
    if (inv.rows[0].invitee_id !== me) return res.status(403).json({ error: 'Not your invite' });
    if (inv.rows[0].status !== 'pending') return res.status(409).json({ error: `Cannot decline — status is ${inv.rows[0].status}` });

    await pool.query(`UPDATE plan_invites SET status='declined', responded_at=NOW() WHERE id=$1`, [inviteId]);
    res.json({ invite_id: inviteId, status: 'declined' });
  } catch (err) {
    console.error('[plans] decline invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- SHARE TO FEED ----------
router.post('/:id/share', requireAuth, async (req, res) => {
  try {
    const me = req.user.id;
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid plan id' });
    if (!(await userIsOwnerOrMember(id, me))) return res.status(403).json({ error: 'Cannot share a plan you are not part of' });
    const planR = await pool.query(`SELECT name FROM plans WHERE id=$1`, [id]);
    if (!planR.rows.length) return res.status(404).json({ error: 'Plan not found' });
    const body = `Sharing my plan: ${planR.rows[0].name}`;
    const post = await pool.query(
      `INSERT INTO posts (user_id, body, ref_type, ref_id)
       VALUES ($1,$2,'plan_share',$3)
       RETURNING id, user_id, body, ref_type, ref_id, created_at`,
      [me, body, id]
    );
    res.status(201).json({ post: post.rows[0] });
  } catch (err) {
    console.error('[plans] share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;