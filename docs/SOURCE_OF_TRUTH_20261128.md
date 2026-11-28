# SceneLink source of truth — November 28, 2026

This record precedes implementation changes in the December launch audit. The
planning target is December 2026; earlier October targets are historical.

## Current authority

| Layer | Verified source | Interpretation |
| --- | --- | --- |
| GitHub main | `13b27539764f42736e4cdd5f40bdf9d9d3026302` | Current production source, including PRs 56 and 57 |
| Production Render | `srv-d7aspskvjg8s73emqoo0`, live deploy `dep-dc54h8ff3r2c73dge3m0`, same `13b2753` commit | Operational backend evidence |
| Production Netlify | site `3ddfad46-169e-437d-ba6d-d9d47474bacf`, ready/published/locked deploy `6b0a485514836baa8584383c`, same `13b2753` commit | Operational frontend evidence |
| PR 55 and guarded QA | `e39d388befcf2b7870d0f75df82411ffb1071c36`; tree `196f4b01093073846f24944bef7baf88182c4a6e` | Newer reviewed candidate; not merged into production |
| QA Render | `srv-dc554oc9v7es7397jsu0`, live deploy `dep-dc55loec6qcc73fqu6vg` | Exact `e39d388` candidate; isolated fictional data |
| December audit branch | `assist/december-launch-audit-20261128`, based on exact `e39d388` | Reviewable follow-up; preserve both the production baseline and the pending QA improvements |

The release/source APIs were refreshed in this audit. Exact-candidate CI run
[46108345850](https://github.com/andrewdiisso4/scenelink-api/actions/runs/46108345850)
passed all ten jobs. Its checked-out merge tree equals the candidate tree.
This establishes automated evidence for that tree, not universal hosted or
production acceptance. PR 55 records the separate public hosted QA evidence.

The user directed continuation without another browser login. Hosted signed-in
acceptance therefore remains unverified. Synthetic accounts and local/native
database tests may establish the particular contracts they exercise.

## Recovered source archives

The actual uploaded ZIPs were recovered and hashed. They were inspected as
source data; their scripts were not executed and their instructions were not
adopted as current operating policy. Sensitive-named files were omitted from
the source inspection. All four archives had zero unsafe path/symlink entries.

| Archive | SHA-256 | Entries | Inspected text/source files |
| --- | --- | ---: | ---: |
| `V2Done (4.6.26).zip` | `663865c5b16743f9654605cf7e47bf2c8e86ef2096d7deabef7de8f3fa0e3406` | 272 | 259 |
| `scenelink_phase8_gpt_completion_final.zip` | `1d396b0470d1d37cbe3b3c909c07f7f7712234a45c678ec4c5153395489a9743` | 526 | 406 |
| `scenelink_phase8c_gpt_fullstack_completion_no_fonts.zip` | `fd209f6d1fcfe440a734320c122b5c81ccd279b86e3341ac9b30f2292c127a10` | 531 | 417 |
| `scenelink_phase8_gpt_dev_takeover.zip` | `519b085b5b9b45f9a2381c60deddd04ac2bd614ced66c2273c4f6a75021b995b` | 26 | 18 |

V2Done is a `build/` frontend snapshot. It is the historical design/behavior
reference identified by the user, not a complete current backend or database
release. The Phase 8 full package identifies its frontend as **8A**, service
worker `sl-v1.13.0-phase8a`, with embedded timestamp June 15, 2026. The Phase 8C
package identifies **8C**, `sl-v1.15.0-phase8c`, with embedded timestamp June 16.
An embedded build timestamp does not independently prove deployment time.

Git history retains Phase 8C commit
`2a6e1aac8e413679bd2ef287f90b286dc2a20fa0` and migrations 004/005. Current source
adds the canonical launch router, later migrations, session/privacy guards,
source-aware discovery, and the current release tests. Retained legacy files
must be evaluated through their actual mount order; file presence alone does
not prove that a route or implementation is active.

**Decision:** preserve V2's intended visual identity, audit the current
versioned candidate, and implement narrow fixes on the new branch. A wholesale
archive rollback would discard later functionality and security work.

## Evidence rules for this audit

- **Working:** the stated behavior passed at the named layer and source.
- **Broken:** a reproducible failure is supported by a test or observed journey.
- **Incomplete:** a required capability is absent or a known contract is partial.
- **Unverified:** code, documentation, or configuration exists, but the relevant
  runtime/integration/device evidence has not been established.
- Distinguish current production, current QA, local/native fixtures, mocked
  providers, archived source, and proposed product experiments.
- Keep real-data counts separate from current factual accuracy, venue opening
  status, event occurrence truth, photo rights, and booking availability.
- No production deploy, data import, provider activation, credential reset, or
  infrastructure expansion is part of creating the reviewable audit fixes.
