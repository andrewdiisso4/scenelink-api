# Reviewed venue corrections: operator-only local release

This tool prepares narrow exact-ID factual edits. It never merges/deletes venues,
changes their broad source/verified state, touches images, or automatically applies
anything at startup. Production execution is intentionally not enabled by the CLI.
Evidence URLs are recorded, **not independently fetched or authenticated** by this
tool. An operator must review the actual source and the field/value correspondence.

## Manifest v1

```json
{
  "version": 1,
  "corrections": [{
    "venue_id": "11111111-1111-4111-8111-111111111111",
    "expected_identity": {"name": "Test Cafe", "address": "10 Test St", "city": "Old City"},
    "changes": {
      "city": {
        "expected": "Old City",
        "value": "New City",
        "source_url": "https://example.org/contact",
        "observed_at": "2026-11-10",
        "note": "Optional source-specific explanation"
      }
    }
  }]
}
```

The fictional example is not a real correction. Use a fresh exact database snapshot
for IDs, identity, and expected values. Public DTOs may hide/coerce null/empty values;
they are not a guaranteed substitute for raw storage values. Drift causes refusal,
not fuzzy matching. Batch limit is 50 unique IDs / 200 KB. Identity must include
name, address, city exactly, including nulls where applicable. Changed fields are
restricted to name, address, city, state, zip_code, neighborhood, website, phone,
hours_display, hours_json, lat, lng, price_level, price_label.

Each field requires its own HTTPS source URL and real observation date, not a future
date. Evidence remains dated and may become stale. Do not infer missing coordinates
from a map viewport, turn incomplete service hours into complete intervals, or
reuse a source to support a fact it does not establish. Hours JSON keeps the source
representation; this operator does not compute open-now. Latitude/longitude changes
must occur together; numeric values must exactly survive database storage coercion.
A null replacement additionally requires `status: "unknown"` and an explanatory
`note`; this is not verified evidence of absence. Non-null replacements default to
`status: "reviewed"`. Unchanged values can receive field evidence after review.
No-op field evidence does not establish correctness of other venue fields.

`field_provenance[field]` stores status, value, source_url, observed_at, optional note.
Prior metadata remains in the audit, even when replaced by a newer review.

## Offline review (no database import or connection)

```sh
node qa/review-venue-corrections.mjs --manifest reviewed.json
```

Read the complete returned manifest and digest. This dry-run validates input only;
it does **not** check database existence/identity or confirm that a source says the
claimed fact. No database URL is read or connection attempted in dry-run mode.

## Disposable local rehearsal only

Apply `migrations/017_venue_fact_reviews.sql` deliberately to a disposable local
schema first. It adds a default-empty provenance object and a separate audit table.
It is NOT added to the server's default migration allowlist. Migration SQL is
idempotent; runtime module never creates or modifies schema.

```sh
SCENELINK_CORRECTIONS_LOCAL_ONLY=yes \
CORRECTIONS_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/scenelink_test_reviews' \
node qa/review-venue-corrections.mjs --manifest reviewed.json --apply \
  --confirm '<exact dry-run digest>' --operator '<reviewer name>'
```

Only literal loopback addresses, explicit port, and `scenelink_test_*` database names
are allowed; no URL options/query fragments. The ambient app DATABASE_URL is never
used. No dotenv loading. Remote or production database targets are refused.

All changes occur in one transaction, with deterministic row locking and 3-second
lock / 15-second statement / 20-second idle transaction timeouts. Before edits,
identity and every changed field's old value must match exactly. Audit records retain
full before/after venue rows, changed field names, operator, digest and timestamp.
A digest can be applied only once, including after rollback. Audit failure aborts
all edits. This appends audit history, never updates or removes earlier audit rows.
Database administrators can still alter tables; this is not a tamper-proof ledger.

## Rollback

Use the returned apply audit ID. Default rollback invocation is also offline:

```sh
node qa/review-venue-corrections.mjs --rollback '<apply audit UUID>'
```

Apply with the same explicit local environment, `--apply --confirm '<apply audit
UUID>' --operator '<reviewer name>'`. Rollback compares the **entire current venue
row** to its recorded after-image. Any drift (including unrelated fields or the
update timestamp) refuses the whole rollback batch. It restores only edited fields
and the previous provenance object, advances updated_at, and appends a separate
rollback event referencing the original. It never deletes history. Review drift
manually rather than force-overwriting someone else's work.

## Verification and release gates

```sh
node --test qa/reviewed-venue-corrections.test.mjs
npm run check
npm test
```

Focused SQL tests use PGlite and fictional venues. They are not proof of native
PostgreSQL lock contention/concurrency behavior. Before any future production
release, separately review the production execution pathway, permissions, migration,
backup/recovery, raw snapshots and factual evidence; rehearse on native PostgreSQL.
Do not remove the local-only CLI restriction merely to make a correction run.
The library expects a dedicated connected pg-compatible client (not a shared pool
query API), owns BEGIN/COMMIT/ROLLBACK, and must not be called inside another
transaction. It has no startup imports/call sites and is not an HTTP endpoint.
