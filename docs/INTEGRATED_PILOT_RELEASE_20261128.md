# Integrated SceneLink pilot candidate

This branch uses the exact PR #61 source (itself based on PR #60) and composes
only the product/runtime repairs and regression tests from the separately
tested PR #62 audit. The guarded PR #55 fixture diagnostic is not imported.
The source-of-truth and audit-fix documents describe the historical audit
and its branch, not this integrated deployment. No branch has been merged.

- Existing member startup, social privacy, profile plans, Search, opt-in
  Concierge handoff, and visible mobile sign-in stay in the release candidate.
- The audit adds verified OAuth username handling including unchanged legacy
  usernames, atomic venue review writes, own-comment withdrawal after a
  visibility change, and retry on the next explicit Concierge request after
  a temporary outage. An outage never enables a less restrictive client answer.
- A fresh shared asset marker is generated for the combined build; CI must
  test this exact commit rather than inheriting the standalone green results.

## December scope recommendation

Serve the organizer of an existing small friend group: one shortlist, one
chosen time and venue, and a confirmation the group can act on. Keep the
legacy saved-itinerary to private decision room continuity gap open. Showing
saved stops on a personal profile does not transfer them into a group room.
A manually assisted pilot can validate the loop before guest voting, public
feed expansion, native launch, or a live recommendation model.

Before inviting a cohort, verify freshly checked venues for the pilot geography
and run hosted sign-up, real inbox confirmation, sign-out/sign-back-in,
two-account collaboration, and session isolation on the frozen artifact.
None of those is proven by local/CI output alone. No new external model usage,
venue publishing, email delivery or booking was executed by this composition.

## Recovery evidence reconciliation

The November 24 synthetic rehearsal inspected in the audit is not the only
restore check. A completed production Render logical export dated November 27
at 11:07 p.m. Eastern was restored twice into isolated PostgreSQL 18.3 for
the separate venue-intake rehearsal. Both copies agreed on aggregate table
counts and the same 40 proposed inactive inserts across four packets. There
were no production writes. See the venue publication pilot evidence for what
this does and does not establish: it is not a hosted application acceptance
run, a live target-bound intake plan, or evidence of a successful publication.
