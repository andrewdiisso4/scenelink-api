# SceneLink release audit and Veylo handoff
## November 24, 2026 — America/New_York

## Decision

SceneLink is suitable for continued controlled release testing. The evidence does not yet support declaring the full product or an App Store release complete.

The focused production admin-access repair is live. The broader candidate remains draft PR #39 in isolated QA. This audit prepared a separate assistance patch for publication safeguards and truthful admin diagnostics; it does not perform a production deployment, account recovery, venue import, or venue activation.

**User story:** a person discovers a real venue, signs in with the appropriate consumer/admin/owner account, persists permitted changes, and sees only reviewed public venue content. The audit traces browser, API, data and deployment boundaries for that story.

## Current source and deployment map

| Surface | Independently checked during this audit | Implication |
| --- | --- | --- |
| Production frontend | Netlify current deployment `6b04fe26fc45f94f82790ad4`, commit `0741fc91105ce886984c9888b64b6f7a90864ff6`, ready; published November 23 at 10:02 p.m. Eastern | PR #40's focused admin access repair is live |
| Production backend | Render `dep-dbug852fngtc73cmslg0`, commit `7b11bc0cd4edd0b1f7ebb8b6af3f3df096b79b7a`, live; automatic deploy off | Newer candidate API behavior is not yet production behavior |
| Full candidate | PR #39 open, draft, unmerged; head `49eb15070504213b048bc9b9b9c1f750e62f214e` | Integration work remains in a release branch |
| Isolated QA | Render `dep-dc2gb1s0916s73a1o1u0`, live at exact `49eb150` | Current candidate is hosted separately |
| Candidate verification | All eight jobs in Actions run `45320027017` succeeded on `87f114c`; candidate has identical tree `1a87190cbc64ed321f299067df0af28a3c405b65` | Automated evidence applies to that tree, not every production journey |
| Vercel | `scenelink-ai-pilot`, deployment `dpl_HTYZ14YYoS2xDMf81pfuBsTzpVzt`, READY, commit `935880c8598c661a4c5d952e23c362df010585e9` | Vercel hosts a separate pilot project; this is not the main SceneLink deployment |

The inspected Vercel pilot repository contains controlled workflow/scripts. Its four recorded Actions runs were rehearsal runs, including successful mock/no-secret rehearsals. The installed live-once workflow requires a separate exact-commit manual dispatch; no run of it appeared in the inspected run list. A READY Vercel deployment does not establish live model quality or integration into the main app.

Sources: [PR #39](https://github.com/andrewdiisso4/scenelink-api/pull/39), [PR #40](https://github.com/andrewdiisso4/scenelink-api/pull/40), [PR #41](https://github.com/andrewdiisso4/scenelink-api/pull/41), [candidate CI](https://github.com/andrewdiisso4/scenelink-api/actions/runs/45320027017), [production frontend](https://app.netlify.com/projects/scenelink/deploys/6b04fe26fc45f94f82790ad4), [Vercel pilot](https://vercel.com/scenelink/scenelink-ai-pilot/HTYZ14YYoS2xDMf81pfuBsTzpVzt), [pilot live-once source](https://github.com/andrewdiisso4/scenelink-ai-pilot/blob/935880c8598c661a4c5d952e23c362df010585e9/.github/workflows/pilot-live-once.yml).

## Live browser observations

- Homepage navigation, venue search, map pins, and a venue-detail overlay loaded in the supported desktop browser.
- Searching **360 Cafe** returned **two results**, both in Beacon Hill. The two database rows have essentially identical coordinates: 42.356229/-71.061974 and 42.356230/-71.061974. One has a neighborhood-level address and a review flag; the other lacks a street address. This is a strong duplicate-review candidate, not permission to delete a record or discard saved references.
- Opening the first result showed an unavailable venue photo, no description, no hours, no phone, and no price. The page correctly states that no reservation has been made.
- The production admin page rendered its email/password gate and separate “use admin secret” option. It did not show the earlier false Access Denied screen while signed out.
- The Business Login dialog and Forgot password form opened. No credentials were submitted, no recovery email was sent, and no signed-in business journey was claimed.
- The observed console sample contained browser-extension errors; these were not attributed to SceneLink.
- “Powered by Netlify” remains visible in the live interface. This is a lower-priority branding follow-up from Andrew's earlier request.

Verified live pages: [duplicate search and detail](https://scenelink.app/explore.html?q=360+cafe#venue=360-cafe-m5ddx), [admin entry](https://scenelink.app/admin.html), [business entry](https://scenelink.app/business).

These observations are limited to the desktop browser and sampled flows. They do not establish physical iPhone/Safari, OAuth, authenticated persistence, payment, mail-delivery, or full mobile-app acceptance.

## Current venue-data state

The following are fresh, aggregate, read-only production database observations from this audit. No venue rows were altered.

| Measure | Count |
| --- | ---: |
| Stored venues | 1,710 |
| Marked active | 1,630 |
| Marked inactive | 80 |
| Eligible under active/not-closed predicate; live directory also reported this count | 1,622 |
| Stored records marked for manual review | 49 |
| Active/not-closed records still marked for manual review | 41 |
| All records missing a street-address field | 394 |
| Active/not-closed records missing a street-address field | 386 |
| All records missing latitude or longitude | 6 |
| Active/not-closed records missing latitude or longitude | 4 |
| All records missing a website field | 861 |
| Rows in the new source ledger | 0 |
| Rows in the new audited intake-batch ledger | 0 |

Image readiness is **not certified**. There are 469 nonblank direct image URLs and 809 records with stored Google photo references; these are storage counts, not proof of availability, correct venue identity, license, or visual quality. Missing `image_url` alone is not a valid missing-photo measure because the public API can use provider references.

The 20-venue source-derived packet remains staged for **inactive** intake, with manifest `cbc0d3e4c93748d8feef25ad496e01125494eba15c8c3034e5080cf0aef6b008`. Its offline validation passes; the report declares `publication_ready:false`. Current hours, images, contacts, prices, booking, and operational status still need review. Importing the packet would not automatically make those venues visible.

Historical preparation includes 455 candidates including the first 20, and 141 proposed address corrections. Those are review queues, not new verified or applied records. Source: [venue intake PR #34](https://github.com/andrewdiisso4/scenelink-api/pull/34).

## Reproduced defects addressed by this assistance patch

### 1. Direct admin updates could publish review-pending venues

The actual admin PATCH handler accepted `is_active:true`. Against a disposable PGlite fixture, that changed an inactive, review-pending venue into a result returned by the canonical discovery predicate.

The patch validates a supplied activation value as a JSON boolean, rejects activation with HTTP 409 and `venue_publication_requires_review`, and continues permitting withdrawal. A combined activation/Featured request rejects before any update. Featured, Trending, and Spotlight remain available.

This intentionally rejects every `is_active:true` request on this generic route, including a no-op request for an already active venue. A separately reviewed publication workflow is still required. This change does not retroactively hide the 41 currently public review-flagged records.

### 2. Owner-created listings became public before review, and link failure left orphan rows

Both business creation endpoints previously accepted a name-only listing and inserted `is_active:true`. Real routes with signed business JWTs and synthetic data in embedded PostgreSQL (PGlite) reproduced public discoverability with missing address/coordinates. Injected ownership-link failure left an active, unlinked venue despite an HTTP 500 response.

The patch locks the approved owner row, checks capacity inside a transaction, inserts the venue as inactive and review-pending, and commits its ownership association atomically. New submissions return HTTP 202 with explicit pending status. The owner interface presents pending-review copy, keeps pending records editable, and hides their public listing link. Existing published listing edits preserve publication state. Creating the first venue through either entry point now establishes a primary association atomically, so edit and reload work immediately.

The patch also corrects adjacent HTML encoding for venue names in the multi-venue table and selector, so a submitted HTML-like name remains text.

Real multi-connection lock contention is not established by the embedded PostgreSQL tests. The locking design received independent source review.

### 3. Filtered contact totals silently reported zero

A status-filtered list used `$2`; its count query reused that predicate with only one parameter. A two-message fixture returned two rows and `total:0` after the count failed.

The patch binds the count independently and returns an error when either query fails. It no longer represents a failed query as an empty inbox.

### 4. A failed health check displayed ONLINE in green

The admin status view treated any parsed JSON object as a successful API result. An HTTP 500 with `status:error` and a failed DB summary still produced a green ONLINE indicator.

The patch checks HTTP status and the explicit health contract, renders errors distinctly, and treats malformed/unavailable evidence as unknown. A healthy public check plus unavailable summary shows DB UNKNOWN. Updated controller URLs and asset hashes identify the revised assets; hosted and existing-browser cache-transition acceptance remains pending.

### 5. The native Concierge check read analytics before the writes completed

The first assistance CI run passed seven of eight jobs. Its only failure was the authenticated analytics assertion in the native Concierge privacy scenario. The route starts an analytics INSERT without awaiting it; a completed HTTP response does not guarantee that a SELECT on another pooled connection can already see that write.

A deterministic actual-handler regression held the analytics promises unresolved and confirmed this ordering. The QA-only correction observes the original INSERT promises and awaits this session's writes before the existing identity and privacy assertions. Those assertions remain unchanged. Rejected writes still fail QA, even when the application catches the rejection. The observer does not retry writes or introduce a timed sleep.

The four new deterministic regressions passed. The full native gate then passed all 33 groups on a fresh literal-loopback PostgreSQL 18.3 database, with nine in-memory model responses, zero external network attempts, and unchanged private fixtures. The receipt records the tested source hashes. No production Concierge behavior changed.

Sources: [initial assistance CI](https://github.com/andrewdiisso4/scenelink-api/actions/runs/45341797020), [native receipt](../evidence/concierge-analytics-native-20261124.json). The latest [PR #42 checks](https://github.com/andrewdiisso4/scenelink-api/pull/42/checks) establish CI status for the corrected remote head.

## Work still needed for release

| Priority | Work | Acceptance criteria | Suggested coordination |
| --- | --- | --- | --- |
| P0 | Successful production admin access | Intended credential method succeeds; server-confirmed admin role; protected read; supported reversible edit/readback; refresh; logout/revocation; member denied | Veylo owns credential/session continuation |
| P0 | Production backup and release recovery | Fresh verified backup/export; applicable isolated production-data restore; migration 016 rehearsal; old writers stopped/coordinated; rollback path documented | Veylo / authorized infrastructure operator |
| P1 | Integrate this audit patch into the candidate | Review changes, passing exact-head CI, refresh QA, repeat affected owner/admin flows | Veylo can review the assistance draft |
| P1 | Hosted business acceptance | Pending claimant denied dashboard; approved owner login; create pending record; edit/reload; switch venues; verify scope; recovery invalidates old session | QA tester with disposable accounts/mailbox |
| P1 | Venue cleanup and first-batch review | Resolve identity/duplicates while preserving references; verify address/coordinates/photo evidence; explicitly review 41 public review flags; exact inactive preview/apply receipt | Venue-data workstream |
| P1 | Controlled publication workflow | Verified facts and review receipt required server-side; explicit activation; public readback; withdrawal and audit trail | Separate implementation and operator review |
| P1 | Customer-visible owner features | A saved gallery photo/promotion appears in the intended public consumer view, with scope and moderation rules | Business/consumer integration workstream |
| P1 | Real-device and external-service checks | iPhone/Safari; real inbox recovery/verification; Google/Apple sign-in; production-equivalent caches; consented model acceptance where in scope | Veylo and Andrew |
| P2 | Ledger and readiness reporting | New intake ledger is visible; query errors differ from empty state; public counts differ from stored-active counts | Bounded admin follow-up |
| P2 | Branding cleanup | Remove the remaining hosting badge through the supported hosting configuration | Frontend/hosting follow-up |

### Credential distinction

SceneLink email/password checks the user's account password. The separate admin-secret option checks Render's `ADMIN_SECRET`. The secret does not belong in the account-password field. Email verification is required for some protected writes, but it does not explain an invalid-password login response.

The prior production receipt records an actual account attempt returning “Invalid email or password.” This audit did not repeat it, inspect credential values, reset a password, or grant a role. Successful hosted QA admin login is separate from production authentication.

### Business and App Store limits

Owner gallery and promotion tables are read by owner-management routes, but the inspected canonical consumer detail path does not expose them as a public gallery/promotion experience. Saving within the dashboard therefore does not yet prove customer-visible publication. The current photo form accepts an HTTPS URL; direct phone-photo upload is a separate requirement.

The inspected repository contains a Capacitor bridge but no tracked native Xcode/Capacitor project or signed iOS build. This is a limit of the inspected evidence, not a claim that a native project exists nowhere else.

The synthetic restore rehearsal verifies logical application recovery over 52 fictional-data tables. It does not establish a fresh production backup, production-data restore, PITR, cluster roles/ACLs, or coordinated production cutover.

## Handoff boundary

Review and integrate the assistance draft into `release/acceptance-candidate-20261123`, then refresh isolated QA and verify the changed journeys. Keep the full candidate's paired-backend requirement and backend-first rollout. The focused frontend-only compatibility of PR #40 does not apply to this broader release.

The 20-venue intake remains a separate operation and publication remains a separate review. The City Winery and real-model pilots retain their existing gates. No production deployment, credential change, email/message send, data import, payment, or public activation was performed by this audit.

Veylo's previously documented coordination thread is [the PR #35 handoff](https://github.com/andrewdiisso4/scenelink-api/pull/35#issuecomment-7115042537). This report and the assistance draft make the work reviewable; no acknowledgement from Veylo is claimed.

## Verification receipt

See [release-audit-20261124.json](../evidence/release-audit-20261124.json) for the inspected baseline, aggregate observations, local test results, and remaining limitations. [Draft PR #42](https://github.com/andrewdiisso4/scenelink-api/pull/42) contains the assistance patch and current handoff. Its attached CI is the authority for that draft's exact remote head.
