# SceneLink integrated release candidate

Release identity: `connected-20261110-1`. This is a newly rebuilt local candidate from published draft PR #5 head `cbc78a31d425d113d4499e9f831a6662c52cd388`, exact tree `2eab23c5b5c130c542f7e267368364f0e48b1053`. The cbc predecessor passed GitHub Actions run42552093352. This new visual increment is not the earlier November9 visual artifact and has not been pushed or deployed. It requires its own publication, exact-head CI and production release gates. No production migration, provider change or service cutover was performed to prepare it.

## Included work and provenance

- Frozen user-audit baseline: account/session recovery, social draft/feed safety, navigation and explicit map-area discovery, based on published source commit `13f1217` plus the audited local changes.
- Design patch: official logos, unified controls and accessible newsletter/signup treatment across 22 pages; official logo bytes retained.
- Private list backend: explicit invitation consent, permission enforcement, revisions, replay protection, revoked/blocked membership handling and migration 016.
- List/plan journeys: server-backed lists, saves and shared picker, account isolation, paginated friends/lists/invitations, draft and navigation safety.
- Integration verification: combined release/cache invariants and full My Lists route execution against the real local API and disposable native PostgreSQL.
- Post-review visual corrections: removed legacy logo height caps, prevented chip shrink/clipping, placed the Concierge search action in normal flow, corrected compound-input specificity, replaced duplicated font fallbacks and newsletter glyphs with SVGs, and removed the eager unstyled Messages Concierge include. Real-browser retest remains separate.

The separately persisted release handoff includes the frozen visual source manifest, complete file hashes, exact patch and source-only archive. Recovery tools, private backups and database results are excluded from the product tree. Deployment topology is unchanged.

## Overlap resolution

1. Kept the design patch's My Lists head, official header and accessible footer. Replaced only its former local-only main with the server-backed list journey, removed the old inline renderer and removed the forced authentication body flags so public deep links can be read.
2. Combined both service-worker additions: design stylesheet/logos and the new connected-list runtime.
3. Rebuilt both named JavaScript bundles from the final standalone sources, retaining auth/newsletter and favorite/venue action changes together.
4. Regenerated every local JS/CSS cache reference and frontend asset hash with the new release identity. Corrected inherited frontend-only metadata to require the paired backend and migration 016, and to state local/not-deployed status.
5. Added local DOM/native-API acceptance to the existing guarded native suite, with its web development dependency installation in CI. The cbc predecessor passed exact-head CI. This new increment must pass its own exact-head CI after publication.

## Migration and deployment order

Migration 016 is additive to migrations through 014 and has no dependency on storage migration 015. The separate storage/media candidate is deliberately excluded. Do not renumber 016 or silently import storage changes. The final manifest records the exact ordered migration file hashes. The production startup allowlist must include 016 before bootstrap requires its schema marker.

For a separately authorized release, preserve the existing coordinated maintenance requirements in `RELEASE_CHECKLIST.md`: verify exact commits and provider readiness, establish database targets, stop old writers, verify and rehearse recovery, apply the paired backend/schema, verify readiness and authenticated contracts, and only then publish this matching frontend. Migration files commit independently; rolling back application code alone cannot undo schema/privacy changes. No production cutover is authorized by this document.

## Validation boundaries

The final evidence manifest and test report state exact executed checks and counts. Native tests use fresh literal-loopback `scenelink_test_*` databases, fictional accounts/venues, ephemeral session keys and disabled providers. The paired frontend test executes actual first-party route scripts in JSDOM with real local HTTP and SQL; it blocks external fetches and asserts precisely the ten intentional UI mutations with no automatic hydration/account-switch writes.

DOM/API checks are not visual browser acceptance. Mobile/desktop rendered layout, keyboard/focus with a real browser, physical phones/Safari, real identity/email/provider operations, live venue coverage, production-data migration/locking and backup restoration remain separate gates. Synthetic legacy-schema upgrade tests do not establish production restore readiness. In-site reservations/tickets, media/storage deployment and provider integrations are not completed by this candidate.

## Reproduction

Use Node 24.22.1 and native PostgreSQL 18.3. Install dependencies with `npm ci --ignore-scripts` and `npm ci --ignore-scripts --prefix web`.

- `npm run check`
- `npm test`
- `npm test --prefix web`
- `npm run test:social --prefix web`
- `SCENELINK_API_ROOT="$PWD" SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes node --unhandled-rejections=strict qa/connected-launch-integration.cjs`, with `TEST_DATABASE_URL` set to a new empty literal-loopback test database.
- Native ingestion, welcome queue and legacy-upgrade suites use separate fresh test databases as documented in the repository and CI. Never substitute a production connection.

`python3 web/frontend-tools/finalize.py` regenerates bundles, release metadata and asset hashes locally; rerun all frontend checks after any runtime change. It never publishes.

## New visual increment

See VISUAL_REFRESH_RELEASE.md for the newly rebuilt visual scope, validation and limits. All backend code and migrations remain byte-identical to cbc78a31. Cache references, bundles, service worker and asset manifest are regenerated together. This candidate does not claim completion of real venue verification, booking/provider capabilities, separate media/storage migration015, physical-device/Safari or live account/email/provider acceptance.
