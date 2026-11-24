# Reviewed inactive venue intake operator

`src/operations/inactive-venue-intake.cjs` is a distinct, insert-only operator for
a bounded, independently reviewed source packet. It has no HTTP route, scheduler,
startup hook, public activation, upsert, deletion, or rollback command. The
existing local-only staging and recovered rehearsal tools keep their original
execution restrictions.

The operator uses the existing migration 011 `venue_import_batches` and
`venue_source_records` ledger. It requires the complete reviewed application
schema; it does not run migrations or initialize a database.

## Production prerequisites

Before an actual production apply, an authorized operator must establish and
retain evidence of a **current complete database backup and successful isolated
restoration**, inspect the current schema/reference inventory, independently
review source identity/licensing and the intended packet, and pass native
acceptance on the exact reviewed artifact. Include private references and
non-FK/JSON references in the restoration/inventory review. A public venue
identity export is insufficient. A hash, an operator label, a receipt, or a
successful disposable test does not prove that backup/restore work occurred.

These are operating prerequisites, not a fictitious CLI attestation flag. This
operator has not created or verified a production backup, connected to production,
or imported production records as part of its development.

A normal [Render one-off job](https://render.com/docs/one-off-jobs) is an appropriate
execution mechanism after the reviewed code and packet are available in the base
service's exact successful build. Verify that artifact before starting a job:
jobs use the base service's latest successful build and inherit its environment.
Use ordinary authenticated Render access with appropriate permissions. The
connector available during this work exposes read-only database queries and
deployment/metadata operations; it does not expose job creation, shell access,
database writes, backup/export creation, or restore. No credentials were retrieved.
There is no alternate HTTP route or automatic import to bypass that limitation.

Render documents backup/recovery and logical export mechanisms separately:
[Recovery and Backups](https://render.com/docs/postgresql-backups) and
[Create PostgreSQL export](https://api-docs.render.com/reference/create-postgres-export).
The eligibility and freshness of a particular production recovery point must be
checked in the actual account; these links are not evidence of an existing backup.

## Reviewed packet

The packet directory contains:

| File | Required content |
| --- | --- |
| `candidate-import.json` | `{ "ifExists": "skip", "rows": [...] }`, 1–500 Overture candidates in the reviewed Massachusetts launch shape |
| `provenance.json` | Exact source-ID keys, provider/source pointers, original evidence and optional conservative identity keys |
| `report.json` | Matching `candidate_count`, original source `input_sha256`, release, and `production_import_ready:false` |
| `intake-manifest.json` | Version 1, scope `inactive_venue_intake`, exact SHA-256 for the three data files, evidence entries, and the explicit held registry |
| Evidence files | Hashed source/City evidence and hashed license/NOTICE evidence listed by safe relative path in the manifest |

Manifest shape:

```json
{
  "version": 1,
  "scope": "inactive_venue_intake",
  "files": {
    "candidate-import.json": "<64 lowercase hex characters>",
    "provenance.json": "<64 lowercase hex characters>",
    "report.json": "<64 lowercase hex characters>"
  },
  "evidence": [
    { "kind": "source", "path": "evidence/source.json", "sha256": "<sha256>" },
    { "kind": "notice", "path": "evidence/NOTICE.txt", "sha256": "<sha256>" }
  ],
  "held": [
    { "external_id": "a source ID requiring review", "reasons": ["identity review"] }
  ]
}
```

Evidence kinds are `source`, `city`, `license`, or `notice`. At least one
source/City item and one license/NOTICE item are required. Files are bounded to
64 MiB each and 256 MiB in total; there are at most 64 evidence files. Paths may
not escape the packet directory. Every supplied digest is checked against bytes.
The manifest's own SHA-256 comes from the independently reviewed packet; merely
computing a new hash after changing facts does not constitute review.

The pure PR #28 staging validator checks shape, coordinates, category, source
provenance and JSON Pointer syntax. Its local apply function is never invoked.
An empty `sources[].property` remains the exact empty root pointer throughout
validation and insertion. Source contacts remain raw provenance only. Canonical
phone, website, hours, price, descriptions, media, metrics, opening/booking claims
and other optional fields remain null. Explicit flags require `is_active:false`
and `needs_manual_review:true`; source contents cannot request publication.

`provenance[id].intake_identity_keys` may contain conservative namespaced join
keys. The current mapper's `city-food-identity:<sha256>` represents normalized
business name, DBA name, address, property identifier and license category. It is
**not an official unique permit/license identifier**. Boston's dataset `_id` is
a volatile internal row index, retained only in raw corroboration. City/provider
evidence does not establish current operation, public access, hours or bookings.

Validation proves bounded structure and byte identity, not factual accuracy,
license sufficiency, or independent approval. Preserve the excluded-source hold
registry, full source collision review and source/license evidence in the reviewed
packet. Do not manufacture approved evidence to satisfy structural checks.

## Validate, preview, apply

Offline validation performs no database access:

```sh
node src/operations/inactive-venue-intake.cjs validate \
  --packet /reviewed/venue-packet --packet-sha REVIEWED_MANIFEST_SHA256
```

For preview/apply, explicitly provide `INTAKE_DATABASE_URL` through the authorized
job's secret environment. The operator never falls back to `DATABASE_URL` and
never loads `.env`. It requires a PostgreSQL URL with explicit host, port, user
and database, without query/fragment overrides. Credentials are not printed.
TLS certificate verification is enabled by default. `INTAKE_TLS_MODE=disable`
is permitted only for literal `127.0.0.1`/`::1` disposable native tests. Check that
the authorized endpoint supports verified TLS before an actual production job;
do not weaken certificate verification to make a connection succeed.

```sh
node src/operations/inactive-venue-intake.cjs preview \
  --packet /reviewed/venue-packet --packet-sha REVIEWED_MANIFEST_SHA256

node src/operations/inactive-venue-intake.cjs apply \
  --packet /reviewed/venue-packet --packet-sha REVIEWED_MANIFEST_SHA256 \
  --plan-sha EXACT_REVIEWED_PREVIEW_SHA256 --operator AUTHORIZED_OPERATOR_ID
```

Review the actual preview output: target/schema/catalog fingerprints, counts,
canonical facts, per-record actions, matched catalog IDs, and holds. Source/ID,
normalized identity and supplied identity keys are reconciled against both the
current venue catalog and source ledger. Every participant in a candidate cohort
collision is held. Conflicting catalog matches and potential aliases require
review; they are not merged or adopted. A single exact existing identity is
skipped without mutation. A source in the held registry cannot be inserted.

Apply requires the exact preview digest. It locks all three intake tables in
`SHARE ROW EXCLUSIVE` mode before inspecting the current schema/catalog and
recomputing the plan. Ordinary INSERT/UPDATE/DELETE writers conflict with these
locks, including old binaries that know no intake-specific advisory key. Reads
remain available. A stale catalog, schema or target produces `PLAN_CHANGED`; get
and review a fresh preview instead of retrying with changed expectations. Locks
time out after five seconds; statements time out after thirty seconds.

The lock protects this transaction. It cannot prevent a separate writer from
introducing a new duplicate later, after the transaction commits. Publication and
subsequent edits still require their own reviewed controls.

## Results and failure handling

One transaction inserts a new batch audit, new inactive venue rows, their source
ledger records, reconciled outcomes and full inserted snapshots. All optional
venue defaults are suppressed explicitly; coordinates are rounded to the schema's
six decimal places while raw values remain provenance. Schema fingerprints include
numeric, character and datetime bounds; coordinates must remain `NUMERIC(10,6)`.
Generated venue columns require separate review, and persisted canonical facts
must equal the plan. Existing full venue and
source rows are fingerprinted again before commit to verify preservation. New
records remain hidden by the existing public list/detail filters.

Any error rolls back the entire transaction, including its audit. A successful
receipt contains batch ID, packet/plan hashes, operator ID, inserted/skipped/held
counts and inactive-only status. It is an intake audit, not a publication or
backup certificate. The original preparation report is retained under
`preparation_report` with its exact file SHA-256; preparation flags such as
`production_writes:false` do not become runtime audit claims. The executed audit
records `database_write_mode:'insert_only_inactive'` without assuming whether the
target was QA or production. Repeating the exact packet and original plan returns its
original receipt with `replayed:true` and `newly_inserted:0`; it creates no second
audit or source row. A preview of an applied packet reports `already_applied`.
That replay does not certify that no later independent edit has occurred.

Do not use this command to correct, activate, hide or delete existing records.
There is intentionally no automatic destructive undo. Any later correction or
withdrawal needs a separately reviewed operation that respects retained source
and private references. The inherited old local-only rehearsal's rollback is
not a production escape hatch.

## Native acceptance

`qa/inactive-venue-intake-native.cjs` requires a new native PostgreSQL 18+ database
named exactly `scenelink_test_official_occurrences` or `scenelink_test_ci`, an explicit literal-loopback
connection, `SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes`, and an empty public schema. It
initializes the complete application schema, clears external provider settings,
and makes only local HTTP requests. Never point it at a production database.

Generic acceptance covers packet/target rejection; duplicate cohorts and catalog
holds; exact source-pointer preservation; inactive/public exclusion; baseline
venue/source/private-reference preservation; idempotency; stale schema/catalog
rejection (including coordinate-scale changes that leave existing JSON facts
identical and generated optional claims); atomic rollback after a second-row SQL failure; and concurrent apply
and ordinary-writer races observed through native `pg_stat_activity` lock waits.

The optional real-packet mode requires all three explicit environment variables:
`SCENELINK_INTAKE_PACKET_DIR`, `SCENELINK_INTAKE_PACKET_SHA`, and
`SCENELINK_INTAKE_BASELINE_FILE`. It restores a 1,710-row **public identity fixture**
into a disposable complete schema, applies the corrected reviewed packet, verifies
all fixture rows remain unchanged and new rows remain inactive/unknown, and
repeats idempotently. It fails on any newly found hold or skip. This mode is not a
complete production backup/restore test; private production data is absent.
