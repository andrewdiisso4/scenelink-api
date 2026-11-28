# Concierge release handoff — November 20, 2026

## Integration target and status

This assistance branch starts at PR #33 commit `fe27f4f4151e39c0c83c7b29811a57a449d3f3e5` and targets `fix/catalog-concierge-intent-20261120`. It is a draft for Veylo's review, with no production deployment, provider configuration change, account migration, or venue import.

The real-venue work remains separate in [PR #34](https://github.com/andrewdiisso4/scenelink-api/pull/34). That packet contains 20 individually reviewed candidate identities for **inactive** intake. The broader prepared set contains 455 candidates including those 20; the remaining candidates still need individual review. This Concierge change does not activate, alter, or certify those records. Keep the City Winery event pilot OFF.

## Reproduced problems and resulting behavior

| Area | Reproduced problem | Behavior in this branch |
| --- | --- | --- |
| Hard venue preferences | Provider and catalog parsers interpreted restaurant/cocktail requests differently. `Show cocktail bars instead` could become an event request. | One shared parser handles both entry paths. Single requested place classes constrain the actual query; imperative “show” is distinct from a show/event noun. Cocktail-bar classification retains PR #33's conservative treatment of generic bars and excludes known pubs/breweries. |
| Exclusions | `No Italian` selected Italian venues. An excluded name in quotes became the positive named lookup. `not bars, in Seaport` could consume the area as another exclusion. | Supported cuisine, location, type, and quoted-name exclusions are removed from positive parsing and enforced with bound SQL values. Unknown facts do not establish an exclusion. Unsupported negative conditions ask for clarification. |
| Area precision | `Back Bay, Boston` broadened the AI query to the entire city. Page context could be added to a different explicit area. | A specific area stays restrictive. An explicit area replaces the previous/page area. Shared aliases preserve Southie, Eastie, Cambridge squares and Chinatown. |
| Conversation | Follow-ups lost cuisine/type, and the original preference fell out of the client's six-turn history window. | Bounded public `search_context` is returned and sent back as `context.search`. Area, price, type and exclusions can be refined independently. Only user history supplies fallback preferences; session IDs never load account state. |
| Reset and alternatives | Location-only resets discarded every preference. Named alternatives stayed pinned to the old venue. Overlapping requests could overwrite newer state. | “Anywhere” clears location only; “start over” clears all preferences. Named alternatives exclude the previous name and retain relevant already-public facts. The client serializes requests and rejects completions from an old session. |
| Events | A Cambridge concert request for tonight returned a Back Bay lecture tomorrow. Explicit dates were ignored. | Event reads enforce a New York calendar window, canonical area and a supported event category. An empty event search does not fall back to unrelated venue cards. Unsupported date/time or event-filter requests clarify before querying. |
| Build My Night | The frontend read `.venues` from a normalized response that exposes `.venueCards`, producing empty stops even after a successful match. | It uses actual returned cards, validates identities, chooses unique venue IDs, preserves unfilled segments and excludes broad client fallback results. It describes venue options and does not claim confirmed hours, capacity or reservations. |
| Transport recovery | An old-session failure could mark the new session's backend unavailable. | Generation checks guard asynchronous state changes; reset restores backend eligibility and clears search context. |

## Search contract and limits

`search_context.version` is `1`. The client carries only bounded public preferences: cuisine, area, vibe/time hints, a reviewed price tier, party size, venue type/name, exclusions, and event window/category. Unknown keys are ignored. Account IDs, profile data, favorites, lists, plans and authorization do not belong to this object. Authentication continues to come from the existing middleware.

Current explicit preferences take priority over prior search state. Independent requests and new named lookups reset unrelated preferences. For older clients, up to six recent history turns are inspected; only valid user turns contribute filters. Unsupported or contradictory exclusions request clarification instead of silently dropping a condition. Exact names remain exact and unavailable identities do not disclose their status.

Reviewed venue price categories remain distinct from per-person dollar totals. Unknown/unreviewed prices do not satisfy a budget query. No price, hours, popularity, availability or capacity fact is synthesized. Free-form dietary, ingredient, noise and other unsupported negative conditions are not treated as verified facts.

The event helper supports:

- Today/tonight as the current New York calendar date, displayed as **today** rather than a verified clock-time promise.
- An exact valid ISO date (`YYYY-MM-DD`).
- This weekend as upcoming Friday–Sunday, or the remaining current weekend.
- No explicit date as today through six days later.
- Concert, comedy, theater, DJ, festival and lecture categories through bounded category aliases.

Other relative dates (including “tomorrow” and “next Tuesday”), conflicting dates and clock-time constraints currently request an exact supported date. Venue price tiers are not event ticket prices. Unsupported food, venue-type or price constraints on an event search also clarify. Public source review, safe booking links, available-venue checks and public-only RSVP counts remain in force.

The provider still writes free-form narrative and selects from constrained database candidates. These checks establish deterministic retrieval and response-contract behavior; they do not establish flawless live-model reasoning. Mixed free-text multi-stage requests still use broad candidate retrieval and need a separate stage-by-stage planning evaluation. The repaired Build My Night flow queries its segments separately and leaves missing segments explicit.

## Validation evidence

The branch adds parser/SQL/event regressions, actual frontend DOM tests, and a dedicated native Concierge CI matrix job. The compact native report is in `evidence/concierge-release-20261120-native.json`; its recorded SHA-256 hashes match the tested source files.

Local validation completed:

- Backend regression: 201 existing/new cases passed, followed by 2 additional SQL normalization/exclusion cases (203 total distinct cases).
- Frontend suite: 579 cases initially passed and the asset-manifest check identified the changed Concierge script. After refreshing that script's manifest hash, all 4 cache/release checks passed; the suite contains 580 distinct cases.
- 11 new actual-DOM Concierge cases cover itinerary cards, duplicates, failures, session resets, retained context, overlapping sends and transport recovery.
- Native PostgreSQL 18.3 + real Express: **30/30 groups passed**, using 17 fictional venues, 7 fictional events and 3 local accounts.
- The native run made **5 entirely in-memory model adapter calls and 0 external network attempts**. Private plans, lists, favorites and RSVP rows remained unchanged.
- Syntax and whitespace checks passed. GitHub CI should be read on the published helper head before integration.

Run the ordinary gates with `npm run check`, `npm test`, `npm test --prefix web` and `npm run test:social --prefix web`. The native script is `qa/concierge-conversation-native.cjs`. It requires an empty, explicitly opted-in PostgreSQL 18+ database named exactly `scenelink_test_concierge_context` or `scenelink_test_ci`, on literal loopback with an explicit port and no URL overrides. It refuses a checkout containing `.env` and blocks external provider requests. The new CI matrix entry supplies the disposable database.

## Veylo's next release steps

1. Review/integrate this draft into the Concierge QA branch and check the resulting head's CI. This branch makes no decision to merge the release into `main` or deploy it.
2. Keep the front-end version/service-worker release cut with the final combined release. The changed asset's SHA-256 manifest is current; this assistance patch preserves the existing release tag rather than announcing a deployment. A production cut must give the changed frontend a fresh cache version.
3. Continue the authenticated, backed-up, inactive intake path documented in PR #34. Available read-only production access cannot execute that job. Review/activation of new venue identities remains separate from intake.
4. Evaluate live model narrative and mixed multi-stop planning using the agreed provider configuration before calling Concierge release-complete. Keep unknown menu, timing, capacity and booking facts explicit.

The GitHub handoff is a repository delivery. It is not evidence that Veylo has read a private message or approved either draft.

## Follow-up: explicit AI pilot consent

The earlier provider and validation descriptions above apply to the original draft commit, not this follow-up. The Concierge model is now off by default. Server-side pilot eligibility requires the exact opt-in flag, a configured key, authenticated verified participation, and inclusion in the configured test-account allowlist. The browser checks eligibility without caching and presents the choice again for each request. Declining or an unavailable pilot uses the directory. Cross-page actions draft rather than submit, and guided Build My Night remains directory-only.

Only the current prompt, parsed search preferences and public venue candidates go to OpenAI; raw previous turns and signed-in profile/saved venues are not included as provider context. The application displays only rechecked catalog IDs and controlled copy, never model-written hours, availability or reservation claims. Source labels distinguish AI ranking from directory results.

All provider validation in this draft uses a mock. Before enabling a pilot, require a separate exact-commit checkout and synthetic local PostgreSQL fixture, a restricted pilot-only credential, a hard request cap, redacted diagnostics and no retry or production routing. The standard Netlify preview is not isolated. A bounded real-model test and signed-in iPhone save/reopen test are still pending. No changes here authorize production enablement or venue intake.
