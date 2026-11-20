# Official venue staging/retry candidate (City Winery Boston only)

Local review only; this does not deploy, seed Boston listings, contact ticket
providers, publish content, or enable an automatic source. Default OFF: stage
and publication require `NODE_ENV=test`, explicit
`SCENELINK_OFFICIAL_EVENT_STAGE_MODE=local-test`, a fixed literal-loopback
disposable `scenelink_test_official_occurrences` PostgreSQL database with
explicit port and no URL overrides, and explicitly applied migration 018.
In that same isolated test target, a verified administrator may still retract
an exact bound occurrence when the stage switch is OFF. No startup migration or
production activation is part of this change.

## Reviewed contract

1. An operator separately verifies an individual City Winery Boston official
   page, its single performance, Boston-local date/time and exact active venue
   at 80 Beverly Street. Use the exact official, per-performance URL of the
   form `https://tickets.citywinery.com/event/<slug>`. Reject shared series or
   multi-performance pages until authoritative per-performance identities are
   established; the route does not fetch nor independently verify a page.
2. A verified administrator bearer session submits the same admin POST
   `/api/admin/events` explicitly with `source: "official_venue"`,
   `source_url`, `external_id` (the literal page slug), `venue_id`,
   `title`, `date`, `start_time` (HH:MM Boston-local),
   optional `category` and optional `event_url` (only the identical source
   link when appropriate, not a booking). Do not supply a sales link for
   sold-out or unverified inventory. No prices, images, approval or arbitrary
   fields are accepted.
3. One unique durable key maps the issuer-scoped slug to one event UUID and
   immutable submitted facts; same-facts retries return that UUID and current
   review status without writing again. Conflicting facts, legacy records that
   could be the same show, changed managed state, or unresolved venues hold
   for manual reconciliation, never overwrite or adopt.
4. Stage is non-public. Use the existing explicit source-review PUT for the
   returned UUID, exact source URL and returned namespaced external ID, with a
   verified administrator session. Authentication is rechecked within the
   write transaction. The generic source-review route cannot attach an
   unbound pilot URL while enabled. A repeated identical review records no
   second audit. Explicit rejection hides the event, retains RSVPs and cannot
   be undone by replay; generic edit/delete cannot bypass the hold. Disabling the switch stops
   new stages and reviews, but does not itself hide already-reviewed events.
   Retract the exact occurrence explicitly while the mapping and restrictive
   runtime still exist. Verify guest list/search and detail and the signed-in
   RSVP readback before considering any runtime rollback. Do not hard-delete.

The existing manual path and review of unrelated sources remain in place.
Historical events are not modified. Any necessary ingest from previously
published, manually reviewed records, publisher slug changes or venue
revisions needs a separately reviewed reconciliation procedure; neither title,
date nor an HTTP redirect is assumed to be durable identity. Before any wider
enablement, recheck source identity and scope, same-name/duplicate venue rows
and concurrent writers, migration/index footprint, release order, staffed
approval and correction workflows, backup and backout. Do not drop the mapping
while source-managed events remain.

## Legacy writer concurrency and retraction

Official staging, manual event creation, manual PATCH and source review share
one transaction advisory gate, acquired before event, reviewer or venue row
locks. A manual write checks its complete database-coerced event before commit;
a collision rolls the whole transaction back. Source review checks the proposed
identity before appending its audit. This makes a legacy-first write hold the
stage, and a stage-first write hold the conflicting legacy write.

Both current reserved facts and immutable occurrence facts remain protected,
including after rejection or disabling the stage switch. Comparison includes
the issuer-scoped ID, canonical HTTPS source/event links, and ambiguous matching
venue/date/title/time. Blank time is not evidence of a separate performance;
`HH:MM` and `HH:MM:00` are equivalent. URL parsing covers query/fragment,
trailing slash/dot, hostname case, default port and encoded-host aliases.
Distinct identified performances and unrelated manual events remain supported.
The optional occurrence table is not required for ordinary manual writes.

A historical duplicate can still be explicitly rejected by a verified current
administrator using its exact stored source, URL and identifier. That operation
does not rebind identity, retains private RSVPs and history, and adds only one
rejection audit on retries. Changing source identity while rejecting does not
bypass the collision guard.

The shared gate coordinates these application routes only. It does not protect
against direct SQL, a separately running older binary, or any newly mounted
writer that omits the gate. Retire old writers and review all write paths before
considering wider enablement. No production setting, migration, provider job or
activation is included in this helper patch.

## Native test

`node qa/official-event-stage-native.cjs` with Node 24 and a previously empty
native PostgreSQL 18 isolated loopback `scenelink_test_official_occurrences`
database, supplied as `TEST_DATABASE_URL` and
`SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes`. Test creates fixture events and
accounts only, starts Express on loopback, applies migration itself after
checking disabled/missing-migration behavior, and makes no provider calls.
Discard the test database afterward. The `official-events` matrix entry in
`.github/workflows/connected-release.yml` runs this harness on PostgreSQL 18.3.
It observes real advisory-lock waiters before releasing ordered POST, PATCH
and source-review races in both directions, and verifies exact event, mapping,
review-audit and private-RSVP preservation on rejected writes.
