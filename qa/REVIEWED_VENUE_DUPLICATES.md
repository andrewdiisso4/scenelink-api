# Reviewed duplicate suppression, not merging

Operator-only local release. No real venue pair is selected or activated by this
code. It never deletes venue/user rows, rewrites saved references or moves content.
Canonical and alias retain their IDs and existing records. No startup mutation.

## Exact review manifest

```json
{
  "version": 1,
  "pairs": [{
    "alias_id": "11111111-1111-4111-8111-111111111111",
    "canonical_id": "22222222-2222-4222-8222-222222222222",
    "expected_alias": {"name": "Fictional Cafe", "address": "10 Test Street", "city": "Test City"},
    "expected_canonical": {"name": "Fictional Cafe", "address": "10 Test Street", "city": "Test City"},
    "evidence": {
      "source_url": "https://example.org/contact",
      "observed_at": "2026-11-10",
      "note": "Fictional official address matches both records; same branch."
    }
  }]
}
```

This is a fictional shape example only. Actual pairs need explicit human review of
first-party evidence, both exact IDs, raw stored name/address/city snapshots and
canonical choice. The tool records evidence but does not fetch it or independently
verify authorship. A URL alone is not proof of duplication. Both identities must
match each other after only case/whitespace normalization; factual discrepancies
must be reviewed and corrected separately first. No fuzzy names, street-number
removal, city equivalence or address-geocoding heuristics. Distinct branches must
never be paired. This narrow approach intentionally refuses some legitimate
aliases rather than risking an incorrect suppression.

Maximum 25 pairs / 100 KB. Self-links, repeated aliases, chains and cycles are
refused. Both records must exist, be active and not closed. Existing alias links
require separate rollback; the canonical may not itself be an alias, and an alias
may not already be someone else's canonical. Several aliases may point to the same
reviewed canonical. Full identity equality is checked again under transaction lock.

## Offline plan and local rehearsal

```sh
node qa/review-venue-duplicates.mjs --manifest reviewed-pairs.json
```

Dry-run is strictly offline: validates shape/constraints and returns a SHA-256
manifest digest, without opening or importing database code. It does not validate
live records or factual truth. Apply additive migration017 deliberately to a
**disposable local** database first. Neither schema migration nor suppression is
run automatically by this tool or default app startup.

```sh
SCENELINK_CORRECTIONS_LOCAL_ONLY=yes \
CORRECTIONS_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/scenelink_test_reviews' \
node qa/review-venue-duplicates.mjs --manifest reviewed-pairs.json --apply \
  --confirm '<exact digest>' --operator '<reviewer identity>'
```

The CLI refuses non-loopback/non-test targets and never uses ambient DATABASE_URL.
All operations are in one transaction with a 3-second lock timeout, 15-second
statement timeout, and 20-second idle transaction timeout. SHARE ROW EXCLUSIVE
locks serialize this small operation against venue writers without blocking normal
SELECTs. This intentionally coarse lock is appropriate only for bounded reviewed
batches; native PostgreSQL lock behavior remains a release gate.

Audit includes full before/after alias rows and the canonical snapshot, operator,
digest and timestamp. A digest is single-use, including after rollback. Audit
failure aborts edits. An independent rollback audit preserves the original record.
Audit is append-only through this operator, not tamper-proof against DB admins.

## Discovery behavior and reference safety

The separate `visibleDiscoveryVenueSQL` helper is added only to catalog browse,
map, facets, search and concierge candidate selection. It is NOT part of global
`availableVenueSQL`. Direct detail/by-ID reads, saved venues, favorites, lists,
events, messages, and user-reference writes remain on their original venue IDs.
The patch also covers legacy browse/search routes in case route mounting changes.
Explicit concierge by-ID rehydration remains usable for existing references.

Suppression requires a reviewed link, matching current identities on both rows,
and a canonical that exists, is active/not closed and is not itself an alias.
Otherwise the alias becomes visible again. This prevents an unavailable/deleted/
changed canonical or malformed legacy link from hiding a usable alias. Changes to
unrelated canonical fields do not affect visibility, but may block rollback.
Before migration017, `to_jsonb(outer_row)` yields no alias metadata and all rows
remain visible; no missing-column error. No FK on duplicate_of is intentional:
canonical deletion must never cascade-delete aliases or their history.

HTTP/browser caches may retain pre-change results until their normal expiry. Counts
and facets use the same filtering as discovery rows. No user-data counts or histories
are reassigned. This is suppression only, not a canonical redirect or a row merge.

## Reversal

```sh
node qa/review-venue-duplicates.mjs --rollback '<suppression audit UUID>'
```

This is an offline preview. To execute on the same local-only target, append
`--apply --confirm '<suppression audit UUID>' --operator '<reviewer identity>'`.
Rollback refuses if ANY field on either the alias or canonical differs from its
audit snapshot. It restores the prior duplicate columns **and the exact prior
updated_at**, checks
the full restored row against its original before-image, and appends a reversal
event whose audit created_at records reversal time. This permits a preceding factual
correction to be rolled back afterward without weakening either full-row drift guard.
Caveat: consumers using only a monotonically increasing venues.updated_at watermark
will not discover this reversal; use the independent audit or explicit cache refresh
for operator changes. Normal discovery caches still expire normally. A missing
canonical also blocks automatic rollback;
review such drift manually rather than overwriting someone else's work. Discovery
already fails visible in that case. No force flag or remote override exists.

## Tests and remaining gates

`node --test qa/reviewed-venue-duplicates.test.mjs`, `npm run check`, `npm test`.
Synthetic PGlite tests cover migration compatibility, duplicate safeguards, exact
identity drift, transactional audit, saved/direct references, canonical failures,
rollback drift and local CLI gating. PGlite is not native PostgreSQL concurrency
proof. Before any production pathway is enabled, independently review permission,
backups, native database locking, operator identity, exact pair evidence and the
chosen canonical. This code does not authorize or perform production activation.
The library requires a dedicated connected pg-compatible client, owns its
transaction and must not be called inside an existing transaction/shared pool API.
