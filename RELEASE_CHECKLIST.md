# Coordinated release checklist

This review branch is not permission to skip verification. No production migrations or deployments were performed to prepare it.

## Verified release context

- Website: https://scenelink.app ; Netlify project https://app.netlify.com/projects/scenelink . It was still serving the October28 deployment during inspection. Its existing Git link targets this repository/main, builds are active, and PR previews are enabled. UI base is `/`; build and publish directories are unset. The root netlify.toml in this branch supplies the correct static build context.
- API production: `scenelink-api-prod`, Render `srv-d7aspskvjg8s73emqoo0`, auto-deploy OFF, current application commit `09c8b6f7bb1caa1ed007bdca9b4220b2ce127252`.
- Secondary API: `scenelink-api`, Render `srv-d7aoom14tr6s73c5ul40`, auto-deploy ON from this repository's main branch. Its relationship to the production database must be established before main changes.
- Database: `scenelink-db`, PostgreSQL18.3, paid basic_256mb. Candidate007–013 schema was absent during read-only inspection. The declared database in render.yaml is historical configuration, not the actual live plan/version.
- Production Node was verified as20.20.2. This candidate pins24.22.1; account for that upgrade explicitly.
- Dashboard recovery offered a three-day PITR window, with latest available timestamp2026-11-08T02:34:03Z when inspected. No logical export was listed. Recovery availability is not a successful restore rehearsal.

## Before main or deployment

1. Verify the frozen commit, complete CI and preserve the exact build/source identities.
2. Verify both API services' database targets without exposing credentials. Stop/drain every old writer or isolate it from the upgraded data. Do not allow the secondary auto-deployment to start migrations unexpectedly.
3. Verify actual Node version and arrange the pinned supported runtime. Verify real provider configuration by presence and operation without putting secrets in logs or source.
4. Verify actual backup/PITR availability and recoverable timestamps. Rehearse restoration and populated-data migrations in an authorized isolated destination. Synthetic upgrade tests do not establish backup restoration or production locking times.
5. Verify existing users' email-verification transition, recovery delivery and account access. Migration010 makes legacy accounts unverified; do not surprise users with an unusable verification path.
6. Review existing event source provenance. Migration012 makes unreviewed events ineligible for public display. Never label them reviewed merely to preserve counts.
7. Verify Netlify honors the branch's build base `web/frontend`, publish `.`, build command `node scripts/generate-env.js`, API proxy and TLS/domain behavior. Existing GitHub linkage is confirmed; no additional grant was needed for inspection. Keep `.netlify/` ignored. Review-branch commits and PR title use `[skip netlify]` until the paired backend is ready, so an incompatible public preview does not run automatically.

## Cutover

Coordinate a maintenance window and prevent old API traffic before new privacy/session behavior is available. Back up, deploy the exact backend commit, verify migrations/schema and authenticated API contracts, then publish the matching frontend and verify actual site journeys. Keep ingestion schedules and external providers inactive unless specifically authorized and tested.

Migration013 includes a legacy INSERT storage shim to preserve original message hashes and synchronization sequences. It does not make mixed-version APIs safe: old feed readers ignore new check-in privacy; old profile writers bypass revisions; old password resets do not invalidate versioned sessions. A normal rolling deployment is therefore insufficient.

Migrations commit independently before server readiness. Failed startup can leave committed schema changes. Code rollback alone does not restore the database or the old privacy/session semantics. Prefer a tested fix-forward recovery, or a rehearsed coordinated database/code recovery with writes stopped and explicit handling of newer writes. Do not point old code back at upgraded state as a shortcut.

## Post-release

Confirm deployed commit/version, health, HTTPS, cache updates, API proxy, verification/recovery, two-account social/message/plan/RSVP flows and provider failure behavior. Keep unavailable booking capabilities honest. Continue physical-device, accessibility, licensed-data and App Store preparation as separate milestones.
