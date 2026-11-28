# Social and business follow-up integration

## Review scope

This is a separate follow-up candidate for Veylo to review after the core release. It combines the already-reviewed discovery, social, profile, and business work on current main. It is not a production deployment or a request to replace the current isolated email-acceptance service.

| Component | Exact source |
| --- | --- |
| Current core and newsletter readability | `a63ae2634f9ec7293dcd37957b35c455c12ee427` |
| PR #47: documented social fixture exclusions | `5d9f5aa4e68c72fd629e4e854117ad28d11eecba` |
| PR #48: current profile counts and saved identity, including manifest repair | `361525306c65b3223d1c7f01fc50ddb98ceb9f2a` |
| PR #49: search, floating Concierge, and connected social screens | `1d9f8114b3decbd48e58116576a06a18a2e66f56` |
| PR #50: protected business location switching | `95829e292cf618e131c7292bccf1a1945a7edfa5` |

The candidate includes the source-proven fixture policy, current-request profile counts, confirmed profile/header identity synchronization, cancellable accessible search, persistent lazy Concierge entry, linked social screens and message drafts, and confirmed business location switching with stale-location rejection. Opening the launcher does not submit a model request.

## Integration decisions

- Compose on current main so the live mailer wiring, newsletter confirmation, and readable email templates remain present.
- Preserve main's human support form and removed dedicated support AI entry. PR #49's older contact page would restore `sl-contact-support-ai.js` if its conflict were accepted wholesale. Contact and privacy retain main's content; only asset revisions change.
- Keep both PR #48's request-order/identity protections and PR #49's workspace navigation in `sl-social-profile.js`.
- Use one fresh frontend revision, `connected-20261128-social-business`, after composing every frontend change. Run the existing finalizer with `SOURCE_DATE_EPOCH=1795833955`, then regenerate the complete asset manifest. Release assertions are retained; only their expected revision strings change.
- Keep fixture handling narrow: exact source-defined demo accounts and the documented generator patterns. Similar addresses, ordinary users, account recovery, and admin inventory remain available. No account or content is deleted, and no venue is imported or activated.
- Close the review route gap identified during composition: reject documented fixture review submissions before review/rating writes and apply the same predicate to business-owner review reads. Do not rewrite historical aggregate ratings or perform a data cleanup.

## Validation evidence

The repaired PR #48 passed all ten jobs in [run 46099350630](https://github.com/andrewdiisso4/scenelink-api/actions/runs/46099350630). Its repair changes only two stale asset hashes.

The combined frontend passed **798 tests** and **40 social VM checks** locally. The targeted review-policy, business, publication, owner DTO, support-off, mailer-wiring, and welcome-mailer checks passed **27 tests** on the completed source. Syntax and whitespace checks passed.

The review-policy regression reproduced both gaps before the handler changes. Its five reported tests exercise the real server mount order and JWT middleware against disposable embedded PostgreSQL: seven documented fixture variants are rejected before any write, eight similar legitimate addresses can publish normally, owner/public reads exclude fixture rows without mutating them, and admin inventory retains every account.

An independent read-only integration review confirmed:

- the intended PR #48/#49 runtime composition;
- current core support, email, and newsletter guardrails;
- all **475 frontend files** match the manifest;
- all **764 inspected local HTML JS/CSS execution references** use the new revision and resolve to existing files;
- service worker, release marker, finalizer, and metadata agree on that revision.

The final PR records the GitHub Actions run for its exact published head. Results from the component branches alone do not establish acceptance of this combined source.

## Veylo handoff

1. Review the combined diff and exact-head CI, including the native API fixture-policy groups, business routes, account/social browser journey, and six-width discovery browser gate.
2. Coordinate a dedicated follow-up QA deployment. The existing guarded QA host is serving the email-acceptance branch; replacing it is a separate operator decision. Ordinary Netlify previews proxy to production and are not an isolated mutation environment.
3. On the combined QA build, verify a previously cached browser session, confirmed profile/avatar saves, Inbox/Friends/Profile navigation, and an authorized owner's location switch with cancelled edits, failed requests, and another tab changing the active location.
4. Once the follow-up is approved for publication, deploy its paired backend before the matching frontend. Preserve the existing provider and pilot controls, including City Winery OFF. The original component branches do not by themselves represent this combined candidate.

The automated browser gate uses fictional local responses at widths 320, 390, 820, 1024, 1280, and 1440. Physical iPhone, hosted owner acceptance, real provider/model behavior, and production inbox delivery remain separate acceptance work. This source review does not certify every existing account, venue, review, or post as genuine.
