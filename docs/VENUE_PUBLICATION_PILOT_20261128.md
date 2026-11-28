# Boston venue publication pilot: evidence, not approval

Rechecked November 28, 2026. A fresh Render database export restored twice in a
sealed PostgreSQL 18.3 environment. The two independent copies agreed on table
counts and replayed the same read-only intake previews: 20 + 10 + 7 + 3 eligible
inserts, zero skips and zero holds, against the 1,710-row snapshot. This proves
neither a live target-bound plan nor public listing readiness. The live connector
remains read-only. Its fresh counts observed 1,710 rows, zero import batches and
zero source-ledger rows.

These reviewed intake candidates also have recent first-party public-location
evidence. Each should remain inactive until provenance is checked and a dedicated
audited activation workflow accepts the exact persisted record. These sources
are links for identity review; do not reuse their photos/text or infer availability,
in-app reservations, live events or last-minute schedule changes from them.

| Venue | Intake address | First-party evidence | Review note |
| --- | --- | --- | --- |
| Comfort Kitchen | 611 Columbia Rd | [Restaurant home and location](https://www.comfortkitchenbos.com/) | Public service and matching street address. Café, brunch and dinner are distinct time windows; keep canonical hours unknown until schedule is modeled. |
| Antico Forno | 93 Salem St | [Restaurant contact and opening schedule](https://anticofornoboston.com/contact-us/) | Exact address and public Italian restaurant. Exclude phone from pilot because the current and legacy sites list different numbers. |
| The Square Root | 2 Corinth St | [Café home](https://squarerootrozzie.com/) | Matching address and public café with entertainment. Keep canonical hours unknown because the posted times omit AM/PM. Don't infer specific dated events. |
| The Greatest Bar | 262 Friend St | [Bar contact](https://thegreatestbar.com/contact/) | Matching address, public venue. No event availability claimed. |
| Flight Club | 60 Seaport Blvd, Suite 215 | [Boston location](https://www.flightclubdartsusa.com/boston/) | Operator confirms exact suite and public food/beverage and darts concept. No availability or booking claimed. |
| Tavern of Tales | 1478 Tremont St | [Venue contact](https://www.tavernoftales.com/contactus) | Matching public café/bar address. General operation does not imply private rooms are available. |
| Tonino | 669A Centre St | [Restaurant location and hours](https://www.toninojp.com/location-hours) | Matching location and dining use. Retain only the reviewed identity and first-party link initially. |

Asta remains in the inactive intake packet. Direct operator-site evidence was
not confirmed in this review, so it is not in the public pilot shortlist.
No duration-based "open now", hours, photos, reviews or bookings were approved.

## Execution order
1. Use the reviewed insert-only operator from the exact deployed artifact in
   an authenticated Render execution context that can securely connect to the
   intended database with certificate verification. Preview against live data
   and review the exact digest before any apply; staging is still not publication.
2. Add and test a separate, audited publication path for explicit reviewed rows.
   Leave generic admin activation denied. Require staged source provenance,
   unchanged identity, current owner-source evidence and independent review.
3. Before broadening, verify public venue details, discovery and Concierge
   visibility, existing saves/references, and a withdrawal path. Publish no
   unverified photos, ratings, hours, open-now or in-app booking claims.
