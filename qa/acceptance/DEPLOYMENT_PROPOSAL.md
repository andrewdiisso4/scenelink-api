# SceneLink combined release acceptance — November 23, 2026

## Decision requested

Confirm **Andrew's workspace** (`tea-d7aoksma2pns73dv3iog`) and approve the isolated
synthetic acceptance deployment described here. The Render connector currently
has no confirmed workspace. The user's November 21 instruction reserves GitHub
merges, deployments, imports, and production changes for approval of the exact
proposed action.

The proposed deployment uses the reviewed head of
`release/acceptance-candidate-20261123` in
`andrewdiisso4/scenelink-api`, with Blueprint path
`qa/acceptance/render.yaml`. Record the final commit and successful CI run in the
PR before requesting a Render plan. Compare the plan with this document before
applying it; return for review if the source, resources, plans, or scope differ.

### Resource scope

| Setting | Proposed value |
| --- | --- |
| Blueprint name | `scenelink-release-acceptance-20261123` |
| Existing resource handling | `create_new` |
| Blueprint auto-sync | `false` |
| Project / environment | `scenelink-release-qa-20261123` / `acceptance` |
| Web service name prefix | `scenelink-release-qa-20261123` |
| Web compute | `free`, one instance, 0.1 CPU / 512 MB |
| Database resource name prefix | `scenelink-release-qa-db-20261123` |
| Database name prefix | `scenelink_release_qa_20261123` |
| Database compute | `free`, PostgreSQL 18, 256 MB RAM / 1 GB storage |
| Region | `virginia` for both resources |
| Database public access | Empty IP allowlist; internal connections only |
| Service auto-deploy | `off` |
| Blueprint previews | `off`; service PR previews omitted/disabled |
| Build | `npm ci --omit=dev --ignore-scripts` |
| Start | `node qa/acceptance/start.cjs` |
| Health | `/__acceptance/health` |
| Hostname | A new Render-generated `onrender.com` hostname |

Render's `create_new` mode adds a Blueprint-specific suffix to resource names.
The runtime accepts a constrained QA suffix and binds the URL's database name
and host to `fromDatabase` references from the new database. Record the actual
service/database IDs and hostname after creation.

The base compute charge for these Free plans is **$0/month**. Build minutes and
bandwidth use the workspace's shared allowances and can incur overage charges.
Only one Free Postgres instance can be active in a workspace. Its availability
is unverified until the workspace is confirmed. A Free database expires after
30 days and has no backups. Free web services sleep after 15 minutes of
inactivity and block SMTP ports 25, 465, and 587. A paid fallback requires a
separate, explicit plan/cost decision; this Blueprint contains no paid fallback.

### Concrete operations after approval

1. Read the confirmed workspace's current resource inventory and verify the Free
   database slot, quota, and unique QA name prefixes.
2. Verify the candidate branch still equals the approved commit and all required
   checks passed on that commit.
3. Create the Blueprint using the repository and file above, with
   `existingResources: create_new` and `autoSync: false`.
4. Review the returned plan. Require only the new QA project/environment, one
   Free web service, and one Free database, with generated secrets and database
   references. Any existing-resource adoption, paid resource, provider key,
   production domain, or additional resource requires a new review.
5. Apply the authorized matching plan, then wait for the database and deployment
   to become ready. Verify the deployed commit, application health, and QA
   environment identity.
6. Run hosted browser acceptance with synthetic accounts. Record exact build,
   URLs, browsers/devices, outcomes, and redacted evidence in the PR and tracker.

GitHub `main`, the current Netlify project, production Render services, DNS,
production records, venue imports, and provider pilots are outside this action.
The production `render.yaml` is unchanged. A production rollout needs its own
reviewed deployment and migration/rollback plan after the remaining gates pass.

## Why a separate same-origin service

The current Netlify frontend uses `/api` in browser code. Root `netlify.toml`,
`web/frontend/netlify.toml`, and published `web/frontend/_redirects` route that
path to `scenelink-api-prod.onrender.com`. The environment generator does not
change the API target. Ordinary previews therefore cannot establish isolated
write acceptance.

The acceptance launcher serves the combined frontend files and the actual
Express API from one new origin. Render does not interpret the Netlify proxy
files. The launcher applies the same-origin connection policy, sets its own
public origin, and requires the dedicated database identity before schema
initialization. It creates only synthetic fixtures and records a persistent QA
marker so that a nonempty unmarked database is rejected.

The environment unlock gate uses a separate signed HttpOnly cookie. SceneLink's
normal member/admin/business bearer tokens continue through the normal API
authentication code. Access and fixture passwords are generated by Render and
must be retrieved through the service's Environment page; they are never placed
in this file, PRs, screenshots, or logs. The account roster is available behind
the gate.

External mail, model calls, OAuth, analytics, Sentry, media providers, imports,
and provider pilots are disabled for this initial synthetic environment. The
launcher exposes their disabled status. Service-worker caching is suppressed
on the QA origin so that cached content cannot outlive the environment unlock.
Full offline/update behavior needs a separate production-equivalent cache check.

## Combined candidate contents

The branch combines these exact reviewed source heads from base
`db579dbca96d57edcca5a36cb3d009c1724f2262`:

| Area | Source PR | Exact source head |
| --- | --- | --- |
| Admin portal and actual auth-session repair | #38, including #31 | `032b1925e87d8adbc300e3fe8e980d78ba960658` |
| Concierge conversations and saved-itinerary reopening | #36, including #33/#35 | `0d28c35a2ae366b94b7f5b76a5eb71a25a745ca2` |
| Business owner access, management and reporting | #37 | `8dc47db2cebbca354143f4b0afa2fd52d152bcae` |
| Reviewed inactive venue intake tooling and packet | #34, including #28 | `3a3bf568b8750b0f75bf0dfb104b9e4a0c0076d4` |

The shared asset/cache tag is `connected-20261123-release-acceptance`.
`version.json` declares the paired backend requirement and backend-first rollout.
Integration preserved the native admin DOM tests, business recovery page, and
all six original PostgreSQL CI suites. The new acceptance service has an
additional independent native smoke gate.

City Winery/Ticketmaster pilot branches and the old standalone AI branch are
excluded. The reviewed 20-venue packet remains unapplied and not publication-ready.

## Verification and remaining release gates

The combined product tree at local integration commit
`268f7c6bb61ca610c4d06bf77a21b9311849b672` passed:

| Check | Result |
| --- | --- |
| Backend regression | 213/213 |
| Frontend regression | 625/625 |
| Social contract regression | 40/40 |
| Offline venue preparation | 16/16 |
| Native API, including actual admin DOM/HTTP/database flows | 106/106 |
| Native Concierge conversation acceptance | 33/33 |
| Native inactive intake | 7 substantive groups plus completion |
| Reviewed packet validation | 20 records; no database accessed |
| Frontend hash manifest | All 471 listed assets match |

The three native suites used separate fresh PostgreSQL 18.3 loopback clusters.
The runner verified 650 source-file hashes remained unchanged during testing.
The Concierge suite used nine in-memory model responses and zero external calls.
CI on the final published PR head is the authoritative combined check receipt;
record its link in the PR when completed. The acceptance launcher has separate
guard/gate and real-database startup/restart checks: **7/7 unit, HTTP and shipped
browser-client tests**, and **6/6 substantive native PostgreSQL 18.3 lifecycle
groups** passed. Independent review verified the cookie/bearer interaction,
bundled API configuration, reset-page referrer policy, encoded configuration
paths, and external string/URL/Request rejection.

The local real-browser attempt remained **blocked**. Chromium could not start
because its process-singleton socket was denied. The supported cloud browser
could not reach the loopback application; its error-page observation was also
denied by browser URL policy, and that route was stopped. No browser clicks,
Secure-cookie behavior, transport trace, or physical-device result was accepted.
The browser probe report records this limitation separately from passing
HTTP/JSDOM/database checks.

Hosted acceptance must cover actual admin sign-in, user search/pagination,
member denial, session revocation/logout, flag persistence/reload, owner login,
approval boundaries and venue/report management, and Concierge saved-plan
reopening after reload and account changes. Test writes must stay inside the
new synthetic database.

Before production approval, also complete physical iPhone/Safari acceptance,
real inbox verification/recovery, explicitly consented real-model acceptance,
production-equivalent cache/update behavior, and the applicable database
migration/rollback evidence. SMTP delivery cannot be established on the proposed
Free web service. Enabling delivery/providers requires a separately approved
configuration and suitable compute. Synthetic success must not be labeled as
real mail/model or production acceptance. The dedicated reset and verification
pages scrub tokens before loading application code and omit `/env.js`; a later
mail-enabled QA stage also needs its cookie adapter after token scrubbing.

## Current production observations

On November 23, the Netlify project `3ddfad46-169e-437d-ba6d-d9d47474bacf`
reported published deploy `6afe482a2eb9cb5bc8323d68`, built from `main`
`db579dbca96d57edcca5a36cb3d009c1724f2262`. The public frontend version still
reports `connected-20261119-been-with-friends`. The production API health request
returned HTTP 200 with a connected database; its capability response reported
release `7b11bc0cd4edd0b1f7ebb8b6af3f3df096b79b7a`. These observations establish
availability, not acceptance of this candidate. The Render resource-to-deploy
mapping still requires the confirmed workspace read.

## Configuration references and validation

The Blueprint was checked against Render's current JSON Schema fetched on
November 23, 2026 (SHA-256
`6c6721a602ef6d368d5c9384c473cefaae99980e43dd4b1adcf8a2f258fc54f4`).
The Render CLI was unavailable, so this is JSON Schema validation; it is not a
Render account-level plan or platform validation.

- [Blueprint specification](https://render.com/docs/blueprint-spec.md)
- [Current Blueprint JSON Schema](https://render.com/schema/render.yaml.json)
- [Compute plans](https://render.com/docs/compute-plans.md)
- [Pricing](https://render.com/pricing.md)
- [Free service and database limits](https://render.com/docs/free.md)
- [Default environment variables](https://render.com/docs/environment-variables.md)
- [Web service port and health requirements](https://render.com/docs/web-services.md)
- [Health checks](https://render.com/docs/health-checks.md)

No workspace plan upgrade, paid network-isolation feature, external database
allowlist, or production credential reuse is included in this proposal.
