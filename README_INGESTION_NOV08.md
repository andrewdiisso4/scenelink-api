# SceneLink inactive event-ingestion reconciliation — November 8, 2026

Local candidate integration, not a deployment or an automatic public event feed. This document supersedes the November 1 patch's candidate-transfer blocker. The authoritative connected social candidate was recovered and the patch was reconciled against it, not applied over its social implementation.

## What changed

- Added a read-only Ticketmaster collector, atomic inactive staging store, durable UUID attempt receipts, per-provider 15-minute lease, expired-owner write/request fencing and atomic per-UTC-day local request budgets (maximum 1,000). Every HTTP attempt reserves budget. Quota information does not account for other applications sharing a provider account.
- Fixed-host GET requests reject redirects, use a 15-second timeout, pace requests and retry only bounded network failures or selected transient HTTP statuses. Retry-After is respected within the bounded run budget; longer or invalid values end the attempt without retrying early. No real provider calls were made.
- At most five search pages and ten known-ID lookups per run. Provider IDs deduplicate records. Cancellation requires an explicit provider cancellation state; missing search results, detail 404s and stale age do not imply cancellation. Known-ID lookup timestamps rotate checks fairly without falsifying last-seen evidence.
- Partial, truncated, malformed-record or changing-page-count collection does not update staged records. A provider failure records a terminal failed attempt, preserving previous records. A new attempt UUID is required for a later retry. Lease-busy attempts can retry because they create no receipt.
- All staging rows are database-constrained inactive and requiring review. The staging schema is deliberately only in `qa/migrations/event_ingestion_staging.sql`, outside startup migrations. No promotion API, scheduler, public-event writer or new release migration number is introduced.
- Removed synthetic event insertion/deletion from the guarded demo seeder and retired the standalone generator. The historical `adminEvents.js` synthetic and direct Ticketmaster handlers now return 410 without DB/provider calls. That historical router is **not mounted** by this candidate; it was not mounted here. Existing HTTP routes remain unavailable. Manual operator event editing and the existing explicit source-review audit are preserved.
- Hardened the direct candidate integration entry point against node-pg query-based host/port/database overrides. It accepts only literal loopback hosts, an explicit port and a test database, without query/fragment delimiters. Inert VM tests execute the actual entry point and prove rejection occurs before filesystem/config/database work; standard URL-encoded authentication is retained. Earlier isolated native results used generated safe URLs and were unaffected.
- Imported the legacy QA clients' explicit local-target and redirect guards. The fixture/ingestion CLI refuses remote/default databases and requires explicit disposable-loopback configuration. Its provider mode remains opt-in and unconfigured. Provider freshness scopes now include the exact date window.

## Candidate preservation

All 28 existing files under `migrations/` and `src/launch/` were compared byte-for-byte with the authoritative archive and remain unchanged. This includes migrations 007–013, verification, privacy, messaging, profiles, event-source review and RSVP handlers. The dependency lockfile is unchanged. There are no production schema changes or new startup requirements.

The ingestion tests apply the actual candidate schema and migrations, then apply the separate staging SQL twice. Existing reviewed public event data, source-review audit rows, private RSVP intent and private profile data remain unchanged. Exact-candidate HTTP checks prove that a staged event cannot appear in public event APIs or receive RSVPs. An RSVP still does not create a ticket or reservation.

## Verification on Node 24.22.1

- `npm run check`: passed, all backend source/QA JavaScript syntax.
- `npm test`: 64 unit, provider-fixture and local safety tests passed, including inherited social tests.
- `npm run test:embedded`: 70 actual localhost HTTP/JWT/bcrypt/SQL scenarios passed. Embedded single-backend serialization is not native concurrency evidence. The 2 inherited sanitized PGlite pool warnings following deliberately rejected transactions remain visible in the log.
- `npm run test:ingestion`: 13 ingestion scenarios plus parent, 14 TAP tests passed in supplemental PGlite.
- Native PostgreSQL **16.15**, with real parameterized node-pg transport, disposable loopback cluster and no production connection: 70 candidate HTTP scenarios and 13 ingestion scenarios plus parent (14 TAP tests) passed in the release coordinator's final reruns. Provider HTTP was mocked throughout. The earlier 18.4 availability probe is not this acceptance result.

Evidence: `evidence/unit-nov08.log`, `evidence/syntax-nov08.log`, `evidence/integration-embedded-nov08.log`, `evidence/ingestion-embedded-nov08.log`, `evidence/ingestion-native-nov08.log`; the native HTTP log is in root `evidence/nov08/native-postgres-integration.log`. `evidence/ingestion-changed-files-nov08.json` records source changes and protected-file comparison.

## Safe reproduction

From this backend directory after `npm ci --ignore-scripts`:

    npm run check
    npm test
    npm run test:embedded
    npm run test:ingestion

The default ingestion suite creates its own in-memory embedded database. It never reads DATABASE_URL or connects to an existing service. For native SQL, first create a NEW empty isolated database, then explicitly select it:

    SCENELINK_INGESTION_ENGINE=native \
    SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes \
    TEST_DATABASE_URL=postgresql://USER:LOCAL_TEST_PASSWORD@127.0.0.1:PORT/scenelink_test_UNIQUE \
    node --test qa/event-ingestion-integration.cjs

Use lowercase letters/digits/underscores in the test database suffix. The harness refuses remote hosts, URL query/fragment overrides, a backend `.env`, and nonempty databases. It does not drop or reset an existing database. The root `qa/native-postgres-audit.mjs` wrapper can create and stop a disposable cluster from the separately installed official registry package; consult the root QA handoff.

For a manually provisioned disposable CLI-only test database, review and apply the staging SQL first. `qa/run-event-ingestion.cjs` requires `QA_ISOLATED_DATABASE=true`, an explicit loopback port and a database named `scenelink_<unique>_test`. The supplied fixture has only fictional events; stable UUID repetition is a no-op. Do not point either harness at production or an existing application database.

## Remaining release gates

1. Design and approve a promotion/review workflow that preserves provider identity, supports status changes/cancellations of previously published events and existing RSVPs, and displays source/freshness accurately. This increment has no automatic public feed.
2. Verify actual provider authorization, licensing/terms, geography/window coverage, production quotas and realistic freshness targets. Five pages and ten detail refreshes are bounded safety limits, not complete catalog coverage.
3. Approve and implement operational scheduling, attempt IDs, retry timing, health alerts and failure handling only after provider and publication review. The commented cron example is inactive.
4. Rehearse production-version migrations with authorized nonproduction existing data, backup/restore, lock/backfill timing and migration013's coordinated old-writer cutover. Passing fresh isolated PostgreSQL16.15 tests is not a production backup/restore rehearsal or permission to migrate.
5. Complete real provider/SMTP/OAuth/media, two-account browser/mobile and coordinated frontend/backend acceptance. In-site booking still needs an authorized provider/venue integration and real confirmation/cancellation semantics.
6. Publish only through an explicitly approved release process. No credentials, production database, schedule, real invitation, booking, repository branch/PR/main or deployment was changed here.
