'use strict';

// QA only: Concierge starts best-effort analytics writes before sending its HTTP
// response, but does not await their commits. Preserve that production behavior
// while giving acceptance assertions an explicit completion barrier.
function observeConciergeAnalytics(pool) {
    const original = pool.query;
    const writes = [];
    function observedQuery(...args) {
        const query = args[0];
        const sql = typeof query === 'string' ? query : query?.text;
        const values = typeof query === 'string' ? args[1] : query?.values;
        const result = original.apply(this, args);
        if (/^\s*INSERT\s+INTO\s+(?:public\.)?analytics_events\b/i.test(sql || '') &&
            Array.isArray(values) && values[0] === 'concierge_query') {
            if (!result || typeof result.then !== 'function') {
                throw new Error('Concierge analytics QA requires promise-based queries');
            }
            // Observe the original promise without replacing what the application
            // receives. Keep failures even when the route's best-effort catch runs.
            writes.push({ session: values[3], outcome: result.then(
                () => ({ ok: true }), error => ({ ok: false, error })
            ) });
        }
        return result;
    }
    pool.query = observedQuery;
    return {
        async settleSession(session) {
            // Called after the relevant HTTP requests have returned, so all of
            // their INSERT calls are already registered. Await actual completion;
            // do not poll, sleep, retry writes, or substitute fabricated rows.
            const selected = writes.filter(write => write.session === session);
            if (!selected.length) throw new Error('No Concierge analytics writes were observed for the expected QA session');
            const outcomes = await Promise.all(selected.map(write => write.outcome));
            const failures = outcomes.filter(outcome => !outcome.ok).map(outcome => outcome.error);
            if (failures.length) throw new AggregateError(failures, 'Concierge analytics INSERT failed before the acceptance assertion');
            return selected.length;
        },
        restore() {
            if (pool.query === observedQuery) pool.query = original;
        }
    };
}

module.exports = { observeConciergeAnalytics };
