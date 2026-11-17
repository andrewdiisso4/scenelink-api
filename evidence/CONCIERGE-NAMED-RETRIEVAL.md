# Concierge named retrieval candidate, 2026-11-17

Not deployed. No production writes, provider API calls or paid requests performed.
Base bb363e1 (frontend candidate), backend changes limited to concierge routes and one shared helper.

## Behavior
- Exact bare venue names probed across the visible active catalog before candidate limit.
- Explicit `look up NAME`, `tell me about NAME`, `find venue named NAME` and quoted names restrict both AI and rule-based candidates to that name. No fuzzy fallback for unknown explicit names.
- Name words such as Italian or Cafe are not treated as cuisine/type filters. Constraints outside quotes still pass through existing parsers, price evidence and neighborhood filters.
- Unquoted in/near/under/below/for suffixes remain constraints. Quote names containing those words to disambiguate.
- All SQL names are bound values, not patterns. Existing visibility, closure, provenance and price checks remain in candidate queries.

## Reproduction
`node --test qa/concierge-named-venue.test.cjs`
Eight passing focused tests. Query functions exercised with a mock catalog of 41 records, late-alphabet venue, SQL parameter/safeguard assertions, unknown name empty result, generic request parsing, quoted constraints and category/cuisine words in names. An additional PGlite test executes the AI candidate SQL using actual availability/duplicate predicates against 42 records, with neighborhood/price mismatches, reviewed duplicate, closed/inactive venue and blank/unknown names. The price expression is a test column. Native production PostgreSQL and full HTTP/provider integration remain untested.
`node --test qa/*.test.cjs qa/*.test.mjs` for full suite.

## Limitations / next gates
Exact matching only, no aliases/fuzzy matching. Generic recommendations remain alphabetic within current filters. Unquoted natural language is intentionally conservative; names with suffix words should be quoted. Existing parsers do not support every geography/budget expression; this change does not broaden that support. One additional equality lookup for generic requests; check query plans and request latency on staging. Existing timeout/history/privacy/rate limiter unchanged.
Need native database integration, live all-page launcher coverage, no-match UI checks and independently approved bounded provider smoke test before production claim.

## Existing AI runtime audit
Backend OpenAI Responses API; key env-gated, rule-based fallback. Defaults: gpt-4o-mini, 700 output tokens, 15s timeout, 20 requests/10min/IP. Saved profile/favorites excluded from provider context; user message and up to six capped history turns sent. Recommended IDs validated against DB candidates. Runtime key/provider availability not verified. Need global/user spend caps and operational error/latency monitoring before unbounded public AI access.

## Independent review corrections
Bare-name intent detection now checks exact names across the full catalog, including unavailable/suppressed rows, so those requests cannot fall through to unrelated recommendations. This probe is internal only; final candidate queries retain all visibility/availability guards. Public rule-based and AI-empty route tests assert no hidden name/status metadata disclosure. Quotes up to the accepted500-character message bound remain explicit named lookups, including names over200 characters.18 focused/catalog contract tests pass after these corrections. No provider call was made; test fetch is forbidden.

## Final coordinated candidate
Rebuilt on production RSVP merge ef96c1e9f9c8262af63621da86c21ddd87ca1c04; all deployed RSVP history behavior is preserved. Canonical header users/facet rendering, stale-session guards and relevance ordering are included. Cache tag connected-20261117-search1.
Independent review verified both fail-closed corrections (known unavailable bare names and oversized quotes) and passed18 focused tests. Full combined checks:174 backend,409 frontend,40 social checks and syntax passed. No new source data, provider activation, migration or production change. Remote exact-head CI and deployment verification remain gates.
