'use strict';
const assert = require('node:assert/strict');

// Called only from the fresh, guarded localhost database integration harness.
module.exports = async function reviewIntegrityIntegration({api, pool, check, crypto, req}) {
    if (process.env.SCENELINK_TEST_ENGINE === 'pglite') {
        console.log('SKIP review transaction ordering: native PostgreSQL connections required');
        return;
    }
    await check('review writers wait before insertion and commit consistent aggregates across native connections', async () => {
        const actor = crypto.randomUUID(), venue = crypto.randomUUID(), suffix = crypto.randomBytes(4).toString('hex');
        const email = 'review-order-' + suffix + '@example.invalid';
        await pool.query(`INSERT INTO users(id,email,username,display_name,email_verified_at,verified_email)
            VALUES($1,$2::text,$3,'Fictional review ordering author',NOW(),$2::text)`, [actor, email, 'review_order_' + suffix]);
        await pool.query(`INSERT INTO venues(id,name,slug,type,is_active,rating,review_count)
            VALUES($1,'Fictional review ordering venue',$2,'restaurant',true,0,0)`, [venue, 'review-order-' + suffix]);
        const token = req('./src/middleware/auth').generateToken({id:actor, role:'user', auth_version:0});
        const blocker = await pool.connect();
        let submitted, waiting = 0, rowsWhileLocked;
        try {
            await blocker.query('BEGIN');
            // Non-key row updates permit foreign-key inserts. The writer must
            // acquire its own venue lock first to avoid the old partial commit.
            await blocker.query('SELECT id FROM venues WHERE id=$1 FOR NO KEY UPDATE', [venue]);
            submitted = Promise.allSettled([
                api('POST', '/reviews', {venue_id:venue, rating:3, content:'Fictional first review'}, token, 201),
                api('POST', '/reviews', {venue_id:venue, rating:4, content:'Fictional second review'}, token, 201),
            ]);
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
                waiting = (await pool.query(`SELECT count(*)::int n FROM pg_stat_activity
                    WHERE datname=current_database() AND pid<>pg_backend_pid()
                    AND wait_event_type='Lock' AND query ILIKE '%venues%'`)).rows[0].n;
                if (waiting >= 2) break;
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            rowsWhileLocked = (await pool.query('SELECT count(*)::int n FROM reviews WHERE venue_id=$1', [venue])).rows[0].n;
        } finally {
            try { await blocker.query('ROLLBACK'); } finally { blocker.release(); }
        }
        const outcomes = await submitted;
        assert.equal(waiting, 2, 'Both independent HTTP writers must reach the held venue lock');
        assert.equal(rowsWhileLocked, 0, 'No review may commit while its aggregate is blocked');
        for (const outcome of outcomes) assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
        assert.notEqual(outcomes[0].value.review.id, outcomes[1].value.review.id, 'Multiple reviews by one author remain supported');
        const saved = (await pool.query(`SELECT rating,review_count,
            (SELECT count(*)::int FROM reviews WHERE venue_id=$1) AS actual_count,
            (SELECT AVG(rating) FROM reviews WHERE venue_id=$1) AS actual_rating
            FROM venues WHERE id=$1`, [venue])).rows[0];
        assert.equal(saved.review_count, 2);
        assert.equal(saved.actual_count, 2);
        assert.equal(Number(saved.rating), 3.5);
        assert.equal(Number(saved.rating), Number(saved.actual_rating));
    });
};
