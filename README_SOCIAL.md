# SceneLink social functionality and release limits

**Paired website/API candidate. Not production deployment or launch acceptance.**
The profile/messaging backend described below is unchanged by the frontend notification/plan increment. See `SOCIAL_REFINEMENTS_RELEASE.md` for that increment’s verification and `RELEASE_CHECKLIST.md` for coordinated cutover gates.

## Implemented

- Atomic profile edits with optimistic revisions, semantic retry detection, unique normalized usernames, owned-avatar checks and safe removal. Avatar uploads also advance profile revisions. Privileged/email fields cannot be changed through this endpoint.
- User-supplied external social profile links on seven strictly validated provider hosts. Links are explicitly **not verified ownership or OAuth connections**; no provider API, account import or follower data was introduced.
- Authenticated friend search with relationship state, exact-handle-only private discovery, discoverability opt-out, mutual blocks/suspension filtering and minimal identity fields. Universal search follows the same policy and exposes no people to anonymous viewers.
- Current-state earned milestones from actual distinct saved venues, accepted friends, shared posts and accepted collaborative-plan membership. No fake counts, points, messaging spam rewards, social-import claims or real-world-attendance claims. Counts are owner-only; optional public display shares earned badges only through profile privacy controls.
- Persistent direct messaging now supports sender-only revision-safe edits, synchronized deletions with body scrubbing and tombstones, current-state change polling, retry-safe original sends after edits/deletion, exact microsecond ordering, older-page cursors, monotonic read-through and opt-in read receipts. Message policy changes update `can_send`; blocking hides thread content while sender-owned deletion remains possible.
- Additional legacy-route fences and sanitized PG pool error logging; driver client/session internals are not dumped into logs.

## Notification and private-plan refinement

- Canonical notification destinations open the relevant plan invitation or conversation. Account transitions clear notification UI and discard responses from older sessions; network failures offer retry instead of pretending the inbox is empty.
- Owners can edit a planning-state plan's name, optional date and notes. Confirmed API readback is required before reporting saved success. Drafts survive supported in-app refresh and plan switching, and revision conflicts require explicit review.
- When privacy restrictions prevent normal detail access, owner-only recovery exposes safe unavailable-member labels and supported member removal/cancellation controls. It does not reveal restricted detail or undo a block.
- Unsaved drafts live only in tab memory, are cleared on account change/logout, and do not survive full browser reload or tab closure. SceneLink cancellation does not cancel a venue reservation or ticket.

## Historical backend verification

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:embedded
```

Target Node24.22.1; dependency manifests are unchanged by the frontend refinement. Dependencies are excluded from delivered source. A fresh checkout must run `npm ci --ignore-scripts`.

The earlier backend review reported syntax checks, **41 unit tests** and **68 real localhost HTTP/JWT/bcrypt/embedded-PostgreSQL scenarios**. These historical counts are not a fresh backend test run for the frontend refinement; current release CI remains a gate. New scenarios cover profile retry/revision conflicts, unsafe links/privileged fields/foreign avatars, discovery/block privacy, owner-only and opt-in badge visibility, earned eligibility changes, message edits/deletes/pagination/retry identity/read receipts, unverified cleanup and migration013 repeatability. Unit coverage includes additive backfill of original message hashes and monotonic sequences over legacy messages.

**Supplemental adapter warning:** the final embedded log contains two sanitized PGlite socket pool warnings after intentionally rejected SQL transactions. All corresponding HTTP response, rollback and readback assertions pass. This warning is retained, not treated as a native PostgreSQL pass.

Independent paired DOM/HTTP testing is recorded separately by the release coordinator, not inferred from backend SQL checks. PGlite uses one SQL connection to its single embedded PostgreSQL backend (logical concurrent HTTP requests queue SQL rather than prove parallel database transactions): **this is not native PostgreSQL multi-connection concurrency proof**, external provider success, live-device/browser acceptance or a production deployment.

## Migration and release gates

Migration **013_social_profile_messaging.sql** is additive and startup-required. It adds profile/settings fields, message revisions/deletion timestamps, original-send SHA256 fingerprints and per-conversation change watermarks. Existing message text/relationships remain intact on first migration; repeated application preserves edits, deletions and watermarks. Deleted message body is scrubbed from the live row while synchronization metadata and its original-send fingerprint remain; this does not recall screenshots, already received copies, logs or backups.

Before any authorized deployment:

1. Rehearse migrations007–013 on an authorized nonproduction copy, including data preservation, backup/restore, lock timing and backfill runtime. No production migrations were executed here.
2. Coordinate schema/service cutover and matching frontend. The release includes a legacy INSERT storage shim, but it does not make mixed-version APIs safe. Old readers/writers still bypass new privacy, revision and session semantics. Stop or isolate old writers as specified in `RELEASE_CHECKLIST.md`; do not use a normal mixed-version rolling deployment.
3. Pass the native PostgreSQL gate and independent two-account/two-device/mobile privacy, reconnection, retry, edited/deleted-history and logout/relogin acceptance against the exact release commits.
4. Retain existing email/OAuth/uploads/moderation/provider-access gates. Media upload is capability-gated and unavailable without previously authorized storage configuration; no new credentials/provider calls were performed. In-site restaurant/ticket booking remains a separate provider access/confirmation integration and is **not implemented by this increment**.

## Deliberately not claimed

This is a tested foundation, not Snapchat/Facebook-scale parity. Group creation/management, message attachments, true realtime sockets, typing/presence, expiring messages, voice/video, push-delivery guarantees, end-to-end encryption, automated moderation operations, third-party social OAuth and in-site provider reservations remain unimplemented or separately gated. Existing decision rooms are private planning, not group messaging or bookings. Capabilities explicitly report these limitations.

This frontend refinement adds no backend code, schema, external provider, production-data or deployment change.
