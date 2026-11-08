# SceneLink website and API

SceneLink brings discovery, profiles, friends, direct messages and night-out planning into one website. This branch contains the paired website/API release candidate. It is not a claim that production or App Store launch is complete.

## Layout

- `src/`, `migrations/`, `package.json`: Express/PostgreSQL API, kept at the existing repository root for Render.
- `web/frontend/`: complete static website for Netlify. Publish only this directory.
- `web/frontend-tests/`, `web/frontend-tools/`: frontend regression checks and cache-safe asset finalization.
- `qa/`: API, ingestion and migration regression tests using fictional data and disposable local databases.
- `netlify.toml`: website build context, preserving the existing API proxy and deployment rules.
- `RELEASE_CHECKLIST.md`: required production checks and cutover order.
- `SOCIAL_REFINEMENTS_RELEASE.md`: notification/plan integration provenance and exact acceptance limits for cache release `connected-20261108-6`.

Node24.22.1 is pinned in `.node-version`. Production PostgreSQL18.3 was identified during release inspection. Test databases must be fresh, literal-loopback `scenelink_test_*` databases; test scripts reject production-looking targets.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm ci --ignore-scripts --prefix web
npm test --prefix web
npm run test:social --prefix web
```

The GitHub workflow additionally runs native PostgreSQL18.3 API, inactive ingestion and synthetic upgrade tests in separate disposable databases. It has read-only repository permissions and no deployment credentials.

## Current functionality and limits

The candidate includes editable profiles, consent-based friendships, persistent direct text messaging, venue discovery/saves, private collaborative plans, voting and private-by-default event RSVPs. Local two-account browser checks covered these journeys and narrow layouts. The notification/plan refinement adds account-safe notification handling, direct plan invitation links, owner editing with retained drafts and revision-conflict review, and privacy-safe owner recovery. Its browser acceptance used fictional bootstrapped accounts with the real local API, not production credential entry or provider authentication. Physical phones, Safari, production account verification/recovery and real media/OAuth providers remain separate acceptance work.

RSVPs and venue selections are not bookings. In-site reservations and ticket purchases remain unavailable until an authorized provider is integrated. Event ingestion stages inactive records for review and is not enabled automatically. Existing unreviewed events must not be automatically promoted.

Explore/Nightlife use standard OpenStreetMap raster tiles with visible attribution, viewport-only loading, browser caching and an origin Referer policy. This public service is best-effort, has no SLA and is unsuitable for unrestricted bulk/offline requests. Review expected production traffic against https://operations.osmfoundation.org/policies/tiles/ and arrange a suitable provider before higher-volume launch.

Do not put `.env`, `.netlify`, credentials, database exports, test session files or production data into this repository or the static publish directory.
