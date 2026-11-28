# Real data and social follow-up — November 27, 2026

## Scope: independent of the core release

The user explicitly requested that broader venue, social, profile, and business
work stay separate so it does not hold up the core release. These changes belong
in independent follow-up branches and pull requests. Veylo retains the existing
core candidate and rollout work. This document does not add a core-release
prerequisite, and the follow-up must not be merged into that candidate or
deployed as part of this continuation.

## Outcome and evidence boundary

The existing production administrator secret successfully signed in at
`https://scenelink.app/admin.html`. Protected Overview and Browse Venues loaded;
access survived a full reload. The Users section also loaded and explicitly
identified itself as read-only. No credential was replaced.

The current dataset cannot yet be described as all-real or fully verified.
Source-defined test accounts remain discoverable and have published activity.
The venue catalog also contains missing facts, duplicate candidates, and
conflicting provider identifiers. This review separates observed records from
verified human participation and verified business facts.

The database aggregates below were read on November 27, 2026 (Eastern) from
the production-named Render database `dpg-d7aolt6a2pns738u851g-a`. They agree
with the corresponding admin totals, but the active API's actual database
binding has **not been independently established**. No SQL mutations were made.
The public-business catalog snapshot used for duplicate review was observed at
`2026-11-28T00:57:18.874977Z` (November 27 at 7:57 p.m. Eastern), contained
1,710 unique IDs, and had SHA-256
`e3dbbf69e879a1e9be3ef3a0b18ac516bf6f4fbd2d29c470e806936857743b32`.

## Accounts, friend search, and social activity

| Check | Observed aggregate |
| --- | ---: |
| Accounts | 120 |
| Active / suspended accounts | 109 / 11 |
| Verified current email addresses | 0 |
| Exact demo/reviewer accounts defined in source | 3 |
| Additional accounts matching the two legacy social QA generators | 6 |
| Confirmed fixtures active / discoverable | 9 / 9 |
| Accounts in the historical seed-reviewer namespace | 0 |
| Public posts / distinct post authors | 10 / 6 |
| Posts authored by confirmed fixtures | 4 |
| Comments / likes authored by confirmed fixtures | 3 / 1 |
| Friendships involving confirmed fixtures | 3 |
| All friendships | 22: 11 accepted, 5 pending, 6 declined |

Fixture evidence comes from `src/seeds/seed.js`, `src/routes/demo.js`,
`qa/phase9a-social-api-smoke.mjs`, and `qa/phase9a-social-e2e.mjs`. The latter
two scripts generated `qa9a_` / `qa9e_` addresses with an `a` or `b` tag and a
13-digit timestamp at the reserved `scenelink.test` domain. The six observed
matches also had their generated usernames. Display names alone were not used
to classify accounts.

Seventeen other active accounts in two QA-looking domains authored five posts,
but a creation source was not found. These remain review candidates; that
heuristic is insufficient for automatic exclusion or removal. No remaining
account or post is certified as genuine merely by subtracting known fixtures.

The release candidate already uses server-backed feed, search, friendship,
profile, comment, and notification routes. The isolated follow-up implements
one shared, narrow fixture visibility rule across consumer results and direct
social interactions. Engagement counts reflect the visible actors. Recovery,
own settings, admin inventory, and existing block/privacy protections remain
available. No production accounts, posts, likes, or friendships were created
to simulate engagement.

The source change was committed locally as
`52e1c60fabf8d5647a5db06ac0b7ce5f19118af2`. Its full native PostgreSQL 18.3
integration harness passed 112 scenario groups, including six new groups for
fixture visibility, false-positive preservation, direct-ID interaction,
counts, account controls, and notifications. Focused friendship tests passed
5/5, and local mutation-target isolation guards passed 3/3. A second agent
reviewed the exact diff and native evidence and found no blocking defect.
This is source and isolated-test evidence, not production acceptance.

## Existing venue quality

| Check | Observed aggregate |
| --- | ---: |
| Total / active venues | 1,710 / 1,630 |
| Active venues missing an address | 387 |
| Active venues missing a website | 809 |
| Active venues missing coordinates | 4 |
| Active venues flagged for manual review | 49 |
| Active venues with any photo reference | 756 |
| Active venues with structured `hours_json` | 0 |
| Active venues marked temporarily closed | 8 |
| Active venues marked permanently closed | 0 |
| Per-record `venue_source_records` rows | 0 |
| Scalar source labels | 46 curated, 1,164 openstreetmap, 500 osm |

A photo reference or `has_real_photo` flag is not proof that an image renders,
is current, or has suitable reuse rights. Textual `hours_display` was not
assessed, so the structured-hours count does not imply every venue lacks all
hours information. Missing website and source history should remain explicit;
they must not be filled with fabricated values.

### Duplicate and identity review

- 102 groups share a normalized name and address. Ninety-four groups have
  multiple active rows, representing 94 extra active rows under that comparison.
- Eight groups share an exact provider ID, covering 16 active rows. Every group
  has conflicting normalized names. Six also have conflicting nonempty
  addresses; two include missing addresses. None is a simple same-name,
  same-address duplicate.
- Those 16 provider-collision rows have four event references and no post or
  review references; other relationship tables were not assessed.
- Five QA-looking venue names were observed, three active, but their fixture
  provenance was not established in tracked source/history. Names alone do not
  justify deleting or merging them.

Review the provider collisions individually and preserve IDs and references.
The normalized-name/address groups also require canonical identity review;
this comparison is a queue, not an automatic merge authorization.

## Intake requirements

Use the existing inactive-only import contract. New records must carry source
IDs, file hashes, per-record provenance, license and attribution evidence,
current-catalog duplicate checks, and manual-review status. Keep unknown
hours, photos, ratings, prices, availability, booking claims, and social counts
unknown. A municipal food-license record corroborates licensing and identity;
it does not prove current operation, public access, or a consumer category.

The operator must validate the exact packet, prepare a database-specific plan,
review all holds, and apply only the exact reviewed plan after the production
target and recovery path are established. No venue batch has been applied by
this continuation. Preparation and a passing local rehearsal are separate from
production import and publication.

## Coordination with Veylo

- PR45 (`release/signup-newsletter-20261127`) adds the branded signup thank-you,
  separate confirmed newsletter consent, and migration019. Its head
  `db294cfb98216a956414ec602ee8598fd0858f74` passed all ten GitHub jobs and remains
  draft/open. Controlled-inbox acceptance and restore/migration rehearsal are
  still required. Its Netlify preview targets production and is not an isolated
  mail-test environment.
- PR46's earlier `9977c5` failed its browser check because the isolated
  verification landing lacked `.sl-account-card`. Veylo's newer head
  `27c6915a89b6a8b5e240bb6f4d632c31d862089a` adds that class and a Chromium
  confirmation test; all ten checks now pass. It remains a QA-canary change,
  not evidence of production inbox delivery.
- The production-named database lacks migration018's marker and newsletter
  `confirmed_at`. Its 46 legacy newsletter rows labeled `active` do not prove
  confirmed subscription consent. The welcome queue is empty.

## Core release context owned by Veylo

These are the existing rollout checks recorded in the core handoff. The broader
follow-up does not add venue cleanup, a venue import, social expansion, profile
enhancements, or business enhancements as prerequisites.

1. Establish the active API's actual database target and all writers; obtain a
   fresh production export and verify a restore into a private, empty destination.
2. Prove current-email verification/recovery and controlled welcome/newsletter
   inbox behavior before publishing participation restrictions. Keep consent
   separate from signup and do not enroll the legacy list by inference.
3. Complete hosted acceptance and the remaining admin write/readback,
   logout/revocation, role denial, provider/media and physical-device gates.
4. Follow the backend-first paired rollout, including the reviewed migration set
   and recovery plan. Do not use `RUN_ALL_SQL_MIGRATIONS` as a shortcut.

## Follow-up continuation

Keep the social fix and venue packet in separately reviewable pull requests.
Review any additional profile or business change in its own scope. Venue
application requires its exact database-specific reviewed plan and recovery
checks; publication additionally requires business identity and factual review.
These steps can continue independently while Veylo completes the core release.

The valid admin secret remains unchanged. This review did not deploy code,
change credentials, send messages to users, modify account status, import
venues, or change production content.
