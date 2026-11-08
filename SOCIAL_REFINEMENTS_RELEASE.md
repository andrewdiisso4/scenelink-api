# Social refinement release: connected-20261108-6

Prepared November 8, 2026. This frontend-only increment is layered on the frozen paired website/API candidate. It does not change backend source, schema, dependency locks, provider configuration or deployment settings. It was prepared locally without committing, publishing, deploying or changing production.

## Included behavior

- Account-safe notifications: canonical plan/conversation destinations, full session teardown, stale-response rejection and honest loading/error/retry/read-success states. Canonical pages suppress the legacy duplicate bell.
- Private plan links reopen authorized detail or an invitation preview. Viewing a link does not join a plan or grant membership.
- Owners can edit name, optional date and notes of a planning-state plan through existing revisioned API contracts. Success requires confirmed readback. Stale revisions retain the draft until explicit review.
- Drafts remain in tab memory through supported in-app refresh and plan switching. Account change/logout clears them. Full browser reload and tab closure do not retain drafts.
- Restricted-plan recovery uses the existing owner-only management contract, with safe unavailable-member labels and member-removal/cancellation controls. It does not reconstruct restricted notes, identities, venues or votes, and does not undo blocks. Cancellation does not cancel a venue reservation or ticket.

## Provenance and release assets

The separately reviewed notification/session patch was applied first, followed by the separately reviewed plan-edit/recovery patch. Every expected base and candidate SHA-256 matched. The final seven reviewed source/test identities still match the cumulative browser-tested candidate exactly, including the rebuilt main bundle.

Input patch SHA-256 values:

- `notifications-session-fix.patch`: `3b3e58b9ac1c67870ef68cd2f9105daac9de3a70f0b3639443fd6aa995f117fc`
- `plan-edit-recovery.patch`: `1e5d15bfac917549ffa0a417268c67ea2f653b8fb7f31446411dff29877dff86`

The browser acceptance report's SHA-256 is `3ea79d097b442afdc85d95dbf4dae0848662f313e9faf30c02ba3129e5e08bdb`. It is a separate review artifact, not deployed website content. Only the frontend sources/tests and release metadata were integrated; no browser harness, account bootstrap, session records or runtime test data were copied.

The finalizer now emits `connected-20261108-6`, including HTML/dynamic execution URLs, service-worker cache version, runtime marker and version.json. Named bundle modules match their standalone sources. `web/frontend-evidence/candidate-sha256.json` lists every static publish file's exact SHA-256. Publication must use the separately supplied full changed-file SHA-256/Git-blob manifest and replay patch, not a generated runtime test directory.

## Verification

- The accepted upstream candidate passed 162 frontend tests and 40 social assertions. Independent patch reviews reported no remaining blockers.
- Cumulative real Chromium acceptance passed 18 checks against the actual frontend and real local Express API, with a disposable PGlite database and fictional account bootstrap. It exercised invitations/acceptance, editing/readback/conflicts, retained drafts, restricted member removal/cancellation, cross-tab logout, delayed notifications and timeout/retry. The inspected narrow viewport was 490 CSS pixels.
- Final integrated release: **166 frontend tests passed, 0 failed, 0 skipped** with serial test-file execution; **40 social assertions passed**. Four additional release checks cover asset-manifest/version parity, service-worker install/activation rollover, API/mutation cache bypass and the isolated Netlify build entrypoint. Changed JavaScript sources/tests passed syntax checks. Exact publication identities and replay results are recorded in the accompanying integration verification report.

The pre-existing nonblocking observation remains: a successful “Notifications marked read.” status can remain visible after reopening the drawer in the same session. This increment preserves the reviewed product source rather than introducing an unreviewed feedback change.

## What this does not establish

- Fictional account bootstrap did not exercise real credential entry, production authentication, email verification/recovery, SMTP or OAuth/provider delivery.
- Narrow Chromium layout is not physical iOS/Android or Safari acceptance. A new wide-desktop geometry pass was not established by the patch acceptance.
- Local PGlite does not establish native PostgreSQL multi-connection concurrency. This frontend increment did not rerun backend integration suites, restore backups, rehearse populated production migrations or touch production data.
- No assertion here means a commit is remotely published, CI is green, a production rollout is complete or an App Store launch is approved. Follow `RELEASE_CHECKLIST.md` on the exact final release commits.
