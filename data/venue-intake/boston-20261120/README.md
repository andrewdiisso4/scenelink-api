# Boston venue intake — November 20, 2026

This packet contains **20 real source-derived business identities** for a first
inactive intake: 13 restaurants, four bars and three cafes. The provider is
Overture's November 18, 2026 places release. Each identity is corroborated against
the City of Boston's November 20 business-only Active Food snapshot.

**No production import has run.** These records are not independently verified as
currently operating or publicly accessible. `is_active` is false, manual review
is required, and optional public claims remain unknown. Publication requires a
separate review.

## Exact reviewed packet

Manifest SHA-256:

`cbc0d3e4c93748d8feef25ad496e01125494eba15c8c3034e5080cf0aef6b008`

From the repository root, validate the local files without database access:

```sh
node src/operations/inactive-venue-intake.cjs validate \
  --packet data/venue-intake/boston-20261120 \
  --packet-sha cbc0d3e4c93748d8feef25ad496e01125494eba15c8c3034e5080cf0aef6b008
```

See [the operator guide](../../../qa/INACTIVE_VENUE_INTAKE.md) for the separate
preview/apply procedure and actual production execution prerequisites. There is
no startup hook, HTTP endpoint, automatic import or activation in this change.

The compact packet preserves the full prepared packet's candidate and provenance
bytes. It includes all 20 selected provider features, all 20 matching City rows,
source metadata, the retained hold registry, and complete source licenses and
notices. The full regional extract, City snapshot and saved municipal boundary
are retained in the accompanying source/review archives named in
`evidence/full-evidence-reference.json`.

## Venue identities

| Venue | Source street address | Broad type |
|---|---|---|
| Jules on Devonshire | 54 Devonshire St | Bar |
| Corner Cafe | 87 Prince St | Bar |
| Irish Village | 224 Market St | Bar |
| Corrib Pub | 396 Market St | Bar |
| Sip of Joy Cafe and Bakery | 661 Tremont St | Cafe |
| Green Haus Cafe | 1520 Tremont St | Cafe |
| The Square Root | 2 Corinth St | Cafe |
| Lenox Sophia | 87 A St | Restaurant |
| Asta | 47 Massachusetts Ave | Restaurant |
| Antico Forno | 93 Salem St | Restaurant |
| Amelia's Taqueria | 1076 Boylston St | Restaurant |
| Lucky Cafe | 1107 Dorchester Ave | Restaurant |
| Central Wharf Co. | 160 Milk St | Restaurant |
| Comfort Kitchen | 611 Columbia Rd | Restaurant |
| Hong Kong 888 Cafe | 888 South St | Restaurant |
| Richy's | 1461 River St | Restaurant |
| Charlie's Pizza & Cafe | 177 Allston St | Restaurant |
| Brigham Circle Chinese Food | 728 Huntington Ave | Restaurant |
| Cafe sauvage | 25 Massachusetts Ave | Restaurant |
| Latino Restaurant | 302 Centre St | Restaurant |

Cafe sauvage's provider ZIP is 02115; its City record says 02215. Canonical ZIP
is deliberately null, with both values retained in provenance.

The original 25-record shortlist lost five possible existing identities after
independent review: Roadrunner, Wink and Nod, Fiskie's Cafe, Caffe Lil Italy and
Pollos A La Brasa Beto's. These remain held. No replacement rows were added to
reach an arbitrary batch size. A nearby or inactive existing record is still an
identity that must be reconciled.

## Source terms and attribution

Source data retains its per-record licenses; the repository's code license does
not relicense these records. Preserve `sources`, the full license texts, current
Foursquare NOTICE, Overture attribution snapshot, City PDDL text and the
modification notice when redistributing applicable data. No restaurant website
or Google Maps scraping was used to prepare this packet.

- [Overture places](https://docs.overturemaps.org/guides/places/)
- [Overture attribution](https://docs.overturemaps.org/attribution/)
- [Boston Active Food establishment licenses](https://data.boston.gov/dataset/active-food-establishment-licenses)

## Verification completed

Native PostgreSQL 18.3 accepted this exact compact packet against a hash-pinned
1,710-row public venue-identity fixture: 20 inactive inserts, no skips or holds,
no changes to existing fixture rows, and zero additional rows on replay. Every
inserted ID and slug remained unavailable through public venue detail routes.
Optional public facts stayed null/false. This fixture is not a full production
backup or a production restore.
