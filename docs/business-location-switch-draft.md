# Business workspace: location integrity

Based on the live discovery/social frontend. Deploy the paired backend first and the fresh asset revision second. No schema migration, external provider change, data cleanup, or launch of paid features.

- Owners explicitly open a location. Failed or cancelled switches leave draft hours and listing fields intact. The server rejects a stale location switch or listing save after another tab moved the dashboard.
- Listing writes and the active account's venue label update in one transaction under the same owner lock as location switching. Legacy explicit writes stay scoped to the authorized listing.
- Owner reads are private and uncacheable. Reviews use the displayed location, not an implicit recent choice in another tab. Invalid or unowned listing IDs cannot reveal owner data.
- Analytics endpoints share measured event counts. An unmeasured metric is absent (or null in the legacy view); unavailable collection is not a measured zero. The legacy dashboard API no longer estimates traffic from unrelated activity.
- QA uses fictional businesses, a disposable database and local Chromium at phone width. The mounted test also covers one-time password recovery, two separate owner identities, stale saves, scoped reviews, and original hours after switching. No physical iPhone or external inbox is part of this run. Team roles, owner replies, direct phone uploads and checkout remain separate.
