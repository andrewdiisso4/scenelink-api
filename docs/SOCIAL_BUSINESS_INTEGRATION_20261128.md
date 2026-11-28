# Profile and social follow-up QA reconciliation

## Current release and remaining scope

PR #55 was originally composed on `a63ae2634f9ec7293dcd37957b35c455c12ee427`. While that draft awaited hosted QA, PR #56 and PR #57 were merged and the production API advanced to `13b27539764f42736e4cdd5f40bdf9d9d3026302`. This candidate merges that current main into the existing PR #55 history and preserves both parents. It does not rebase or replace the shipped discovery and owner work.

| Component | Exact source |
| --- | --- |
| Current main, including PR #56 and PR #57 | `13b27539764f42736e4cdd5f40bdf9d9d3026302` |
| Published PR #55 parent | `77547f5a29a9f2a0996405a7c12d0d9744c4f729` |
| PR #47: documented social fixture exclusions | `5d9f5aa4e68c72fd629e4e854117ad28d11eecba` |
| PR #48: current profile counts and confirmed saved identity | `361525306c65b3223d1c7f01fc50ddb98ceb9f2a` |
| Review-write and owner-read fixture guard | `66b3890da578395779076a4a6746b2b73b08262c` |

The remaining behavior change consists of the narrow source-proven fixture policy, current-request profile counts, confirmed profile/header identity synchronization, and the review-route guard. Search, floating Concierge, social workspace navigation, and protected owner location switching are already in current main and remain intact.

## Reconciliation decisions

- Keep PR #56's warm-gold underlined social links, explicit search text colors, and browser assertions requiring at least 4.5:1 contrast for selected search names and metadata.
- Keep PR #57's owner lock and expected-location checks for listing saves and switches; atomic listing/name updates; explicitly owned venue review, photo, promotion and reporting reads; private no-store responses; and measured-only analytics. The only additional business-handler change is the shared fixture predicate on its existing owned-venue review query.
- Preserve the current-main business frontend, expanded owner API and DOM tests, second-owner authorization checks, and mobile-width Chromium journey in the release workflow. The owner API test's minimal users schema gains its real `email` column for the shared fixture predicate; its assertions are unchanged. Do not restore the older PR #50 implementations over this work.
- Retain PR #48's request-order and identity protections alongside current-main workspace navigation. A stale activity response cannot overwrite newer counts; a confirmed own profile/avatar change updates the header without allowing stale fetches or account changes to restore older identity.
- Keep fixture handling narrow: exact source-defined demo accounts and documented generator patterns. Similar addresses, ordinary users, account recovery, and admin inventory remain available. The mounted legacy review POST rejects documented fixtures before review/rating writes; public and owner reads use the same policy.
- Preserve live core support, mailer, newsletter, privacy and provider-control behavior. No account/content deletion, historical aggregate rewrite, schema migration, venue import or activation is introduced.
- Use the fresh frontend revision `connected-20261128-profile-social-qa`. The existing finalizer runs with `SOURCE_DATE_EPOCH=1795837113`, regenerates named bundles and execution references, and writes the complete asset manifest. Existing release assertions are retained with their expected cache revision updated.

## Validation evidence

Local validation on the reconciled source passed **800 frontend tests**, **40 social VM checks**, and **32 targeted backend checks** across the final runs. The backend scope includes the mounted review policy, current-main owner portal, business publication and DTO, friendship/privacy, support-off, mailer dispatch wiring, and welcome-mailer tests. The owner API test was rerun separately after correcting its minimal fixture schema; all API assertions passed. Syntax and whitespace checks also passed. Earlier passing PR #55 and component-branch runs remain historical evidence and do not certify this new tree.

All **475 frontend files** match the regenerated manifest. All **764 inspected local HTML execution references** use the new revision and resolve. After normalizing the revision and build timestamp, frontend differences from current main are limited to the two intended profile scripts and release metadata. The current-main owner frontend, contrast styles, discovery contrast browser test, and release workflow remain unchanged.

The review-policy regression exercises the real server mount order and JWT middleware with disposable embedded PostgreSQL: seven documented fixture variants are rejected before any write, eight similar legitimate addresses can publish normally, owner/public reads exclude fixture rows without mutating them, and admin inventory retains every account. No production data or external mail transport is involved.

The current-main owner test also covers a stale save after another tab switches location, explicit owned-venue reviews, separate authorized owners, and one-time mocked recovery. Its optional phone-width browser journey remains wired into CI. A local Chromium attempt was blocked before opening a page: the Playwright executable is absent, and `/usr/bin/chromium` exits 127 because its target `/usr/lib/chromium/chromium` is missing. No local browser acceptance is claimed; the exact-head CI browser gate and hosted QA remain required.

## Hosted QA and publication boundary

1. Review this remaining diff against current main and require exact-head CI, including the native API fixture-policy groups, current owner API/browser test, account/social browser journey, and six-width discovery contrast gate.
2. Coordinate a separate follow-up QA deployment. At the reconciliation check, the existing guarded host still ran email-acceptance commit `15369df83106ed319e4bf00ff217d6338213d30e`; no release of that host was established. Ordinary Netlify previews proxy to production and are not isolated mutation environments.
3. On the guarded QA build, use its seeded verified member/admin identities to verify profile-name and header-initials synchronization, current profile counts, friendship acceptance, Inbox send/reply, social navigation, and normal permitted-account participation. Require exact-head CI's native fixture-policy and mounted review regressions to verify excluded-actor negative cases. Use the fictional owner with two venues to verify persisted hours remain isolated, cancelled/failed switches preserve drafts, and a stale second tab cannot save into a changed location. Preserve current-main contrast and reporting behavior.
4. The isolated launcher disables media/uploads and service-worker caching. It cannot establish positive avatar upload/removal or an existing cached-browser upgrade. Those remain explicit acceptance gates in a suitable isolated environment with the required media and cache behavior; do not weaken the guarded host or loopback test controls to simulate them.
5. Publication remains a separate approved action. Deploy the paired backend before the matching frontend, preserving provider and pilot controls, including City Winery OFF. No deployment, external message, provider activation, or production mutation is part of this reconciliation.

The automated discovery browser gate uses fictional local responses at widths 320, 390, 820, 1024, 1280, and 1440. Physical iPhone, hosted owner acceptance, positive avatar upload/removal, old-cache transition, real provider/model behavior, and production inbox delivery remain separate acceptance work. This source review does not certify every existing account, venue, review, or post as genuine.
