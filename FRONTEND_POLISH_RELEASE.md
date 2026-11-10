# Frontend polish release: connected-20261110-3

This bounded frontend increment has two changes:

1. Social uses the same intentional Ask AI lazy-loading path as Messages and My Lists, rather than mounting an unstyled assistant below the guest landing. The greeting now says it explores venues listed on SceneLink instead of claiming knowledge of every Boston venue. Existing assistant behavior and backend requests are retained.
2. Canonical venue details replace a failed hero image with the existing non-photo placeholder and the alt text “Venue photo unavailable”. The DOM error listener runs once, also checks an already-completed failed load, and cannot repeatedly retry a failing placeholder. Healthy images and venue data are unchanged.

The existing finalizer regenerated bundles, execution-cache references, service-worker/version markers and the asset hash manifest for connected-20261110-3. Historical static status wording is unchanged and is not evidence of live deployment. Build-generated observability environment metadata is untouched and remains the deployment build's responsibility.

## Checks

- Frontend: 316/316 passed, including lazy activation with its styles, absent guest widget, truthful greeting, pending response feedback, retry response, repeated close/reopen and Escape, hero error event, already-completed image failure, healthy/missing photo, placeholder loop guard and existing venue navigation tests.
- Backend unit/contract checks: 91/91 passed. No backend or migration source changed.
- Social mocked regression checks: 40/40 passed.
- Backend/QA syntax and all frontend JavaScript syntax checks passed.
- Tests used local synthetic responses and existing local dependencies. No live API, account, email, database or provider writes occurred.

Native-browser acceptance is separate and pending coordinator review. Headless Chromium could not start in this runtime because local socket creation was restricted, so no rendered-browser pass is claimed here. A loopback-only fixture outside the source tree is available for supported native-browser validation. No new database integration, mail/OAuth, provider, deployment or production acceptance is claimed by this source increment.
