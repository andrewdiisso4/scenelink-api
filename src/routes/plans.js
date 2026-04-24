const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/plans
router.get('/', requireAuth, async (req, res) => {
  try {
    const plansResult = await pool.query(
      `SELECT p.id, p.name, p.date, p.status, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM plan_venues pv WHERE pv.plan_id = p.id) as venue_count,
              (SELECT COUNT(*) FROM plan_members pm WHERE pm.plan_id = p.id) as member_count
       FROM plans p WHERE p.user_id = $1 ORDER BY p.date ASC NULLS LAST, p.created_at DESC`,
      [req.user.id]
    );

    const plans = [];
    for (const plan of plansResult.rows) {
      const venuesResult = await pool.query(
        `SELECT v.id, v.slug, v.name, v.type, v.image_url, v.rating, v.neighborhood, v.price_label
         FROM plan_venues pv JOIN venues v ON pv.venue_id = v.id
         WHERE pv.plan_id = $1 ORDER BY pv.added_at DESC`,
        [plan.id]
      );
      const membersResult = await pool.query(
        `SELECT u.id, u.display_name, u.avatar_url, pm.role
         FROM plan_members pm JOIN users u ON pm.user_id = u.id
         WHERE pm.plan_id = $1`,
        [plan.id]
      );
      plans.push({ ...plan, venues: venuesResult.rows, members: membersResult.rows });
    }

    res.json({ plans });
  } catch (err) {
    console.error('Plans list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/plans
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, date } = req.body;
    if (!name) return res.status(400).json({ error: 'Plan name is required' });

    const result = await pool.query(
      `INSERT INTO plans (user_id, name, date) VALUES ($1, $2, $3)
       RETURNING id, name, date, status, created_at, updated_at`,
      [req.user.id, name, date || null]
    );

    // Add creator as owner member
    await pool.query(
      `INSERT INTO plan_members (plan_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [result.rows[0].id, req.user.id]
    );

    res.status(201).json({ plan: { ...result.rows[0], venue_count: 0, member_count: 1, venues: [], members: [] } });
  } catch (err) {
    console.error('Create plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/plans/:planId/venues
router.post('/:planId/venues', requireAuth, async (req, res) => {
  try {
    const { venue_id } = req.body;
    if (!venue_id) return res.status(400).json({ error: 'venue_id is required' });

    // Verify plan access
    const planCheck = await pool.query(
      `SELECT p.id FROM plans p
       LEFT JOIN plan_members pm ON pm.plan_id = p.id AND pm.user_id = $2
       WHERE p.id = $1 AND (p.user_id = $2 OR pm.user_id IS NOT NULL)`,
      [req.params.planId, req.user.id]
    );
    if (planCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    await pool.query(
      `INSERT INTO plan_venues (plan_id, venue_id) VALUES ($1, $2)
       ON CONFLICT (plan_id, venue_id) DO NOTHING`,
      [req.params.planId, venue_id]
    );

    await pool.query('UPDATE plans SET updated_at = NOW() WHERE id = $1', [req.params.planId]);

    res.json({ success: true, plan_id: req.params.planId, venue_id });
  } catch (err) {
    console.error('Add venue to plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/plans/:planId
router.delete('/:planId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM plans WHERE id = $1 AND user_id = $2', [req.params.planId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;