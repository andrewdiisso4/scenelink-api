# SceneLink real venue data — review and Veylo handoff

## Priority and observed production state

The user's priority is to finish real venue data entry. The immediate work is
catalog identity, missing factual fields and an audited import path. Keep the
City Winery event pilot off; its separate release work does not populate venues.

Read-only production review on November 20, 2026 found:

| Measure | Observed result |
|---|---:|
| Venue rows | 1,710 |
| Active flags | 1,630 |
| Active rows passing the not-closed status check | 1,622 |
| Missing street addresses | 394 |
| Missing latitude/longitude pairs or components | 6 |
| Rows with websites | 849 |
| Rows with phones | 705 |
| Rows marked closed | 66 |
| Rows simultaneously active and marked closed | 8 |
| Recorded audited import batches / source ledger records | 0 / 0 |

There are 40 exact normalized name/city/address duplicate groups, representing
40 surplus rows by that limited rule. This is not a complete duplicate inventory
or permission to delete identities referenced by users. Recorded enrichment
timestamps remain in May. The legacy real-photo flag is not proof of current
photo validity, attribution, licensing or completeness.

The deployed API is at `7b11bc0`; reviewed main is `db579db`. Their backend source,
migrations and package manifests match; intervening changes chiefly concern the
frontend/QA. Deploying existing main alone would not populate this catalog.

## Release work reviewed

| Work | Current finding | Data implication |
|---|---|---|
| Accuracy, correction and duplicate tools (#7, #9) | Existing factual-display and review work; reviewed correction/duplicate operators remain local-only | No production migration 017 or fact-correction batch was observed |
| Catalog/named concierge lookup (#13) | Search/catalog behavior improved | Does not create missing venue identities |
| Photo proxy (#10) | Failure handling improved | Does not refresh all photo references or supply a licensed photo for every venue |
| Social, nearby, profile, saved and shared venue work (#21–#27) | On main/frontend release | Preserve user references during data reconciliation |
| Overture pointer fix (#28) | Draft; current CI passed at `674e655` | Included as this intake branch's parent; preserves the valid empty source pointer |
| Ticketmaster occurrence experiment (#29) | Separate draft, test-only | Not a venue catalog import |
| City Winery staging (#30) | Current head `6801ad9`, CI run 44712352787 passed; helper #32 integrated | Default off, not deployed/activated by this work |
| Admin portal (#31) | Current head `1c19127`, CI run 44711984195 passed | Login/search/flag UI repairs; actual import, activation and unsupported fact editing remain unavailable |

The earlier #31 failure was superseded by its newer passing head. The helper
event fix's 177-regression/13-native-group evidence remains associated with the
tested event candidate; it is not evidence that venue data was imported.

## Genuine source data now prepared

The fresh regional Overture release is `2026-11-18.0`: 127,405 unique place IDs
inside the retrieval envelope, including categories outside SceneLink. The fresh
Boston business-only Active Food snapshot has 3,355 records. Applicant/manager
personal fields were excluded. Raw source files, exact hashes, retrieval metadata
and full notices are retained in `scenelink-source-evidence-20261120.zip`.

The complete review catalog contains 14,557 launch/category-review records:

| Current machine disposition | Records |
|---|---:|
| Provider-only review | 7,552 |
| Held for identified issues | 5,583 |
| Existing-identity review | 940 |
| City-corroborated review | 482 |

These are distinct source-record dispositions, not counts of verified public
venues or new businesses. The food-license source does not cover all music or
club supply. The mapper preserves v2 taxonomy, includes dance clubs and ordinary
lounges, and holds theaters, comedy, airport lounges and ambiguous categories
instead of inventing a music/club classification.

The recovered 533-record November cohorts now have 468 screened review records
and 65 held records. Five older exclusions make the retained hold registry 70.
A further full-source pass holds 13 of the 468, leaving **455 prepared review
records, including the first 20**. The other 435 have not received the same
individual review as the first batch. Twenty-six of the 455 have conflicting
source ZIPs; canonical ZIP is null in those cases.

## The concrete first intake

The [repository packet](../data/venue-intake/boston-20261120/README.md) contains
20 source-derived identities: 13 restaurants, four bars and three cafes. Each
has current provider and City identity evidence. All optional public facts
(phone, website, photos, hours, open-now, rating, price, popularity and bookings)
remain unknown. Supplied provider contacts stay in provenance.

The original proposed 25 lost five potential existing identities after an
independent record review:

- Roadrunner already has an inactive Roadrunner-Boston record at the same street
  address with a coordinate disagreement of about 638 metres.
- Wink and Nod matches an existing Wink & Nod name/address/domain, despite a
  coordinate disagreement of about 341 metres.
- Fiskie's Cafe has an existing Fiskies candidate nearby with no address.
- Caffe Lil Italy has two nearby Lil Italy records that need reconciliation.
- Pollos A La Brasa Beto's has a nearby existing Beto's Pollos a la Brasa record
  with reordered name tokens and a missing street address.

These are holds, not automatic merges. Earlier review also found name/spelling
variants such as Chicken And Rice Guys, Aquapazza, Stephanie's and Taqueria
Jalisco. Existing identity review includes inactive records and does not rely on
coordinates alone.

Cafe sauvage remains in the first 20, but its provider ZIP 02115 conflicts with
the City ZIP 02215. The canonical ZIP is null and both source values are retained.

## Completing existing records

The final mapper produced 732 source-review proposal rows for 718 existing venue
IDs. Of those, 586 nonempty missing-field proposals cover **575 venues**; the
other 146 source rows contain only conflicts. Missing-field opportunities include
ZIPs for 575 venues, street addresses for **141**, and a coordinate pair for one.

These are review opportunities, not approved corrections. Competing providers,
malformed source text and geographically inconsistent points remain visible in
the proposal file. No correction was applied. Preserve existing IDs and all
user saves, lists, reviews, events and other references when resolving them.

## Implementation and validation

`src/operations/inactive-venue-intake.cjs` is a separate explicit operator. It
does not change existing local-only tools, expose an HTTP endpoint, run at startup
or enable public activation. Preview binds the target, schema, full venue/source
snapshot and packet. Apply takes table locks, recomputes the plan, and requires
the exact digest before a single insert-only transaction. It records the source
and batch audit and verifies unchanged existing rows. Repeated apply returns the
original receipt with no new inserts.

Verified locally with native PostgreSQL 18.3:

- The exact compact packet inserted 20 inactive rows against the hash-pinned
  1,710-row public identity fixture, preserving every pre-existing fixture row.
- Replay inserted zero rows. Public ID/slug detail routes returned 404 for every
  imported row, and optional public claims remained null/false.
- Native tests cover competing ordinary writers and concurrent importers with
  observed table-lock waits, stale plans, all-participant collision holds,
  second-row atomic failure, reference preservation, and numeric/schema drift.
- Sixteen Python regressions cover the real preparation failure modes, including
  category specificity, source/licensing integrity, aliases and ZIP conflicts.

This fixture exercise is not a full production backup or production restore.
Connected CI includes the native intake suite, mapper regressions and exact
repository-packet validation.

## Finish the live entry

The current application has no mounted batch importer. The available database
connector is read-only and exposes no one-off job, shell, backup/export or restore
action. **No production rows have been added or modified by this work.** The last
read-only check still found 1,710 rows and zero import/source audit records.

The normal execution path is a reviewed one-off job attached to the production
API, using its exact deployed build and a securely supplied intake connection.
The [operator guide](../qa/INACTIVE_VENUE_INTAKE.md) provides the commands. Establish
a current full backup and isolated restore as required by the existing import
review, refresh the production preview, and apply the exact 20-row plan through
that authenticated execution path. The current session cannot perform those
write/backup operations through its exposed connector.

After the first receipt is verified, process the existing-record correction
queue and independently review the remaining 435 expansion records in bounded
batches. Confirm operation, public access and any optional facts before making
rows discoverable. Keep event activation separate and off.

## Source and work references

- [Overture places and source quality](https://docs.overturemaps.org/guides/places/)
- [Overture place schema](https://docs.overturemaps.org/schema/reference/places/place/)
- [Boston active food licenses](https://data.boston.gov/dataset/active-food-establishment-licenses)
- [Render one-off jobs](https://render.com/docs/one-off-jobs)
- [Render database recovery](https://render.com/docs/postgresql-backups)
- [PR #28](https://github.com/andrewdiisso4/scenelink-api/pull/28)
- [PR #29](https://github.com/andrewdiisso4/scenelink-api/pull/29)
- [PR #30](https://github.com/andrewdiisso4/scenelink-api/pull/30)
- [PR #31](https://github.com/andrewdiisso4/scenelink-api/pull/31)
- [Merged helper #32](https://github.com/andrewdiisso4/scenelink-api/pull/32)
