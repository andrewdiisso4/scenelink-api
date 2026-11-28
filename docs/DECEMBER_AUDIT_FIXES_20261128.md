# December launch audit: scoped repairs

## Baseline and review scope

The source decision was recorded in `SOURCE_OF_TRUTH_20261128.md` before runtime
changes. This follow-up starts at PR #55's exact public head
`e39d388befcf2b7870d0f75df82411ffb1071c36`. Production is a separate baseline,
`13b27539764f42736e4cdd5f40bdf9d9d3026302`.

The changes address four reproduced defects. They add no schema migration,
provider activation, data import, deployment, paid resource, or new product
feature. Review this as a follow-up to PR #55; its prerequisites remain required.

## Reproductions and repairs

| Defect reproduced on the baseline | Resulting behavior | Regression evidence |
| --- | --- | --- |
| Review POST accepted nonnumeric ratings, accepted unavailable venues, and committed the review before an aggregate failure | Finite numeric rating from 1 through 5; existing 2,000-character limit; shared availability predicate; per-author write limit; venue lock before insertion and atomic review/aggregate commit | `qa/review-integrity.test.cjs`, existing fixture-policy test, native `qa/review-integrity-integration.cjs` wired into connected API acceptance |
| Authors could not withdraw their own comments after a block or parent visibility change | Own-comment withdrawal remains possible; moderation of other comments still requires a visible owned post; hidden-parent responses omit counts; deletion and count update are atomic | `qa/comment-withdrawal.test.cjs` |
| OAuth-generated usernames exceeded the profile policy, preventing unrelated profile edits | Generated names pass the shared 3–24-character policy with bounded database-arbitrated collision retries; an exact unchanged legacy name is preserved under row lock; every rename is validated | `qa/oauth-username-policy.test.cjs`, existing OAuth/profile/deletion controls |
| One Concierge transport/server failure disabled later canonical requests and substituted weaker client results | Each explicit request can reach the canonical backend again; failure is explicit, with no substituted cards or automatic replay; successful bounded context/history survives; capability and per-request consent are reevaluated | `web/frontend-tests/concierge-outage-recovery.test.cjs`, existing context/consent/session/planner controls |

Fractional ratings and multiple reviews by one author remain supported. Existing
verification and documented-fixture restrictions remain enforced. No account is
silently renamed. The backend's validated model-to-directory fallback remains
available; the removed path was the weaker browser fallback after transport or
server failure.

## Local verification

- Backend composition: 73/73 focused actual-route HTTP/JWT/SQL checks passed
  against disposable PGlite databases, with no skips. OAuth verification was
  substituted offline; no external identity provider was called.
- Concierge: all five new outage regressions first failed against the baseline;
  the repaired source passed them and 24 existing controls (29/29).
- Integrated frontend revision/cache/static checks: 34/34 passed, including the
  five new outage regressions. These overlapping counts must not be added as if
  they were disjoint tests.
- Syntax and whitespace checks passed.
- The new concurrent review check requires real PostgreSQL connections. It is
  part of the existing native CI gate; local PGlite results do not prove its
  concurrency behavior.

The frontend revision is `connected-20261128-december-audit`. The finalizer ran
with `SOURCE_DATE_EPOCH=1795844400`; published asset hashes, execution URLs,
service-worker shell, version metadata and standalone/bundled source composition
were checked together.

Exact-source CI results belong in the pull request receipt. The earlier green
PR #55 run is baseline evidence and does not certify this changed tree.

## Remaining launch gates

The current audit does not certify hosted member acceptance, live Google/Apple
sign-in, email delivery, model-provider recommendations, or native app acceptance.
The user requested continuation without login; fictional local/CI accounts are
the acceptance evidence available for authenticated flows.

Material follow-up work remains: freshly reviewed launch venue/event inventory;
legacy saved-itinerary to collaborative-room continuity; end-to-end provider
asset cleanup and Apple token revocation; operational handling of content
reports; current production recovery evidence; and a signed native package if
native distribution is part of the intended launch. None of these gaps is made
complete by a green test suite or a historical version named “done.”
