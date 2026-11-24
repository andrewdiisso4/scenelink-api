# Synthetic native PostgreSQL restore rehearsal

This bounded check exercises a real PostgreSQL custom-format archive and restore
of the candidate's application schema and fictional records. It complements the
existing upgrade and API tests. It does **not** establish a current production
backup or successful restoration of production data.

## What it checks

The harness starts the actual application initializer and bootstrap on a new
empty database, with default catalog seeding and all external services disabled.
It creates three fictional verified accounts, one fictional venue, a private
list with an accepted collaborator, and a conversation with a live message and
an edited/deleted message. The real API creates the invitation, replay receipts,
notifications and read pointer.

After stopping the source application, it dumps the entire database using
**pg_dump --format=custom --no-owner --no-acl**. It restores into a different empty
database using **pg_restore --single-transaction --exit-on-error --no-owner
--no-acl**, without --clean or --create.

Before starting the restored application, it compares every public table's full
row contents, columns, constraints, indexes, non-internal triggers, functions,
extension versions and sequence state. SQL JSON text preserves timestamp
microseconds and bigint values. A used identity sequence on the test's own
ownership marker makes sequence restoration non-vacuous. The message watermark,
original-body hash, invitation generation, list revision, JSON notification
reference and non-FK read pointer must also survive.

The restored actual API then verifies fresh password login with preserved user
IDs, admin success/member denial, owner/collaborator private-list access and
outsider/anonymous denial, list-creation replay, message tombstones and original
send retries, resolvable references, and a new message advancing the restored
watermark. A new identity-sequence value must resume after the archived value.

## Reproduction

Use Node 24 and **PostgreSQL 18.3** for both servers and both client binaries.
Install the repository's ordinary backend dependencies. There is no Docker or
production-service requirement.

Create two new, empty databases in a disposable local PostgreSQL cluster that
has no other writers. Their different names must match
**scenelink_test_restore_[a-z0-9_]+**. Configure these environment variables:

| Variable | Requirement |
| --- | --- |
| SCENELINK_RESTORE_REHEARSAL | Exactly yes |
| RESTORE_SOURCE_DATABASE_URL | New empty source; literal 127.0.0.1 or [::1], explicit port and user |
| RESTORE_TARGET_DATABASE_URL | Different new empty target with the same restrictions |
| RESTORE_PG_BIN | Absolute directory containing the verified 18.3 pg_dump and pg_restore |
| RESTORE_EVIDENCE_FILE | Optional new output JSON path; an existing file is never overwritten |

Supply connection values through the local environment. Do not put credentials
in command arguments, source, logs or the evidence file. If unpacked client
binaries need an adjacent libpq, set their verified library directory through
LD_LIBRARY_PATH for this invocation only.

~~~sh
node --test qa/native-restore-rehearsal.test.cjs
node qa/native-restore-rehearsal.cjs
~~~

The guards reject missing opt-in, non-loopback/ambiguous hosts, missing ports,
query/fragment overrides, reused database names, preexisting user objects
(including private schemas, standalone types and large objects), version
mismatches, and .env files in either the repository or invocation directory.
Both actual connected database names, addresses and ports are checked.
Inherited libpq configuration is cleared; subprocesses receive a minimal
environment. Worker startup requires this run's random database marker.

The application uses the existing acceptance-host provider/mail fence. No
welcome worker, imported/default catalog, real model, mail or external HTTP is
started. Child operations are bounded; sensitive driver output is not retained.

## Evidence and cleanup

The receipt records the application baseline commit, separate harness hash, server/client versions,
archive size/hash, table counts/hashes, schema/sequence hashes and explicit
acceptance limits. It does not contain rows, account passwords, JWTs, connection
URLs or the archive. The temporary archive directory is private and removed
before the receipt is written; application processes are stopped.

For this first run, sourceCommit identifies the unchanged application baseline
fe39d8bebf662f7d1a1d038e402dc67f4dbcbc0d. The newly added rehearsal itself is
identified independently by harnessSha256; it did not exist in that baseline.

The harness does not drop caller-owned databases. Dispose of the dedicated local
cluster after inspecting the result. The recorded November 24 UTC rehearsal also
tested refusal of preexisting private schema data, a standalone enum, a large
object and a public table across the two targets. Existing values and the other
empty database were preserved. The owning local runner then stopped and removed its own
disposable cluster. See evidence/native-restore-20261124.json for observed
results, including package provenance.

## Scope of recovery evidence

The --no-owner and --no-acl options deliberately exclude ownership and access
privileges. This is **application-data/schema logical recovery**, not a recovery
of cluster roles, grants, tablespaces, PITR history or managed-provider settings.
See PostgreSQL's [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html) and
[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html) references.

A real release or venue import still needs the separately documented current
production backup, a successful isolated production-data restore including
private and JSON references, applicable populated-data migration evidence, and
a coordinated old-writer cutover. This synthetic result cannot close those
production gates or establish production locking duration.
