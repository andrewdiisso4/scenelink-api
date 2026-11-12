# SceneLink in-site reservation readiness

Reviewed 2026-11-10 against main `c73585b07f593b5eb3753ce8a4e0a191136f1cbd`.

## Current result

**Real in-site reservations are blocked on approved provider access and a completed integration.** This is not an environment-variable switch. No provider account, application, contract, credential, real availability search, slot hold, booking, cancellation or payment was created by this review. No production changes were made.

- `src/launch/router.js` returns `features.provider_reservations: false`.
- `src/services/venue-helpers.js` classifies stored URLs as external links only and suppresses legacy confirmation flags.
- `web/frontend/js/sl-connected-api.js` normalizes all incoming booking data without claiming confirmation.
- `web/frontend/js/sl-venue-detail.js` displays the unavailable state and does not redirect to booking providers.
- `web/frontend/js/booking-system.js` routes legacy booking controls to canonical venue details. It does not book anything.
- No reservation lifecycle, provider adapter, provider reservation ID storage, reconciliation worker or cancellation API currently exists.

The new `web/frontend-tests/reservation-boundary.test.cjs` protects these boundaries, including fabricated availability/confirmation fields, repeated legacy entry points and missing identity. These tests prove honest behavior while disconnected, **not** provider readiness or real reservation success.

## Provider decision and access

### OpenTable: a documented candidate, not an approved integration

OpenTable's online product is Consumer API v2. Its separate Voice AI API is not permitted for website bookings. Access requires partnership approval and the applicable agreement; API availability and pricing depend on that approval. OAuth credentials and approved restaurant identities are needed. The public documentation describes search, slot locks, creation, retrieval and cancellation. Payment-required bookings need provider-supported payment handling and current fee disclosures. A directory link alone does not grant booking access. Sources: [API documentation](https://docs.opentable.com/), [partner FAQs](https://www.opentable.com/restaurant-solutions/api-partners/faqs/).

The [official application](https://www.opentable.com/restaurant-solutions/api-partners/become-a-partner/) asks for applicant name/job title/email/phone, verified contact details, company website/address/registration date, operating countries, product status, intended functionality and usage/restaurant context. It contains an explicit terms checkbox. This review only read the form; it did not submit information, accept terms, trigger contact verification or solve a CAPTCHA.

Next required decisions:

1. Confirm whether SceneLink should pursue OpenTable or another named provider, and who is authorized to represent the business.
2. Approve the exact business/contact data and application submission, including applicable terms, before sending it.
3. Have the provider confirm web/aggregator use, eligible venues, commercial terms and a booking-capable test environment. Generic sandbox access is not proof that the booking endpoints are enabled.
4. Review any agreement or fee commitment separately. Do not assume the application or free documentation means free production access.
5. Configure approved credentials through the hosting secret store, never chat, source files or the frontend.

### Resy and venue-supplied integrations

[Resy's official integrations page](https://resy.com/join/integrations/) describes reservation/discovery partnerships and real-time reservation synchronization. The public page does not establish SceneLink's eligibility, provide an authorized implementation contract or grant access. Obtain written confirmation of the specific SceneLink use case and supported integration before implementation. A widget or link obtained from an individual restaurant is not permission to enable arbitrary restaurants across the catalog.

## Engineering acceptance plan after access is approved

This is a proposed SceneLink design, not a claim about provider guarantees. Implement against the provider's approved, versioned contract rather than guessed endpoints.

1. Store a reviewed mapping between a SceneLink venue and its provider identity, with source, verification date and supported operations. Unmapped/inactive venues remain unavailable.
2. Keep credentials server-side. Set bounded timeouts and rate budgets. Do not convert provider failure into invented availability or silently use a different provider.
3. Bind each offer to venue, party size, local date/time/time zone, terms and expiration. Show current provider-returned policies and totals before the user confirms. A search, selection or temporary hold is never a reservation.
4. Require authenticated ownership and explicit diner confirmation. Minimize contact fields; never infer consent to share profile information or health-related notes. Avoid storing card data; use the provider's approved tokenized payment interface if paid flows are separately enabled.
5. Use durable idempotency and a persistent operation record. A timed-out create/cancel request becomes an uncertain result requiring reconciliation, not an automatic second booking or optimistic success.
6. Display confirmation only when the provider's result verifies the intended venue, time, party and reservation identity and has no unresolved required action. Preserve cancellation policies and truthful payment status.
7. Implement authorized retrieval, modification/cancellation and reconciliation. Cancellation success requires provider confirmation, not merely deleting a SceneLink row. Saved plans/RSVPs remain independent.
8. Test two-account isolation, duplicate submits, stale offers, concurrency, expiry, daylight-saving boundaries, interrupted payment, provider timeouts, rate limits, partial failure and cancellation cutoffs in a provider-approved test environment.
9. Verify keyboard/mobile flows and Back/Forward/Close behavior. Enable only the venues and operations that passed. Publish capability status from verified runtime configuration and integration health, never a browser flag.

## Verified external-link candidates, not in-site booking

These official links were read on 2026-11-10. They establish the venue's published booking destination only, not current availability, ownership permission to embed, or a reservation. Verify the current production row before a reversible correction. No catalog values were written by this review.

- **Mamma Maria:** [official website](https://www.mammamaria.com/) links its Reservations control directly to [SevenRooms](https://www.sevenrooms.com/reservations/mammamaria). The venue lists 3 North Square, Boston, MA 02113 and 617-523-0077. The repository seed `mamma-maria-4418911096` instead has a neighborhood-only address, no website and generic OpenTable/Resy search links. The official website and exact SevenRooms destination are correction candidates; remove unsupported provider search claims when the matching current row is reviewed.
- **Contessa Boston:** [official Boston website](https://contessaristorante.com/boston) links Reserve a Table directly to [the exact Resy venue](https://resy.com/cities/boston-ma/venues/contessa). The [hotel's official page](https://www.thenewburyboston.com/dine/contessa) corroborates Resy. Preserve the Boston location identity; do not confuse it with Contessa Miami.

Keep the current no-redirect UI unless a separate decision authorizes an external-link experience. Repairing catalog provenance does not fulfill the requested in-site reservation feature.

## Verification

Run from the repository root:

```sh
node --test web/frontend-tests/reservation-boundary.test.cjs
npm run check
npm test
npm test --prefix web
npm run test:social --prefix web
```

This change adds documentation and regression tests only. It contains no runtime enablement, database migration or provider network code. Real provider, browser/device and production booking acceptance remain unrun and blocked on access.
