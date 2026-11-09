# Private collaborative lists

Local candidate only. No deployment, real invitations, production data, credentials or provider calls were made.

## Migration and rollout

Apply `migrations/016_private_list_invitations.sql` before this backend. It depends on the existing list/user/friend/block/notification schema through migrations 007–014, not on the separate media migration 015. The migration preserves all existing lists, venues and explicit public choices. New lists default private. Normal startup selects migration 016 without RUN_ALL_SQL_MIGRATIONS, and refuses traffic if it is missing. Reapplying it preserves populated records.

Pair with the new connected Lists frontend. Existing metadata/delete/remove-venue callers must send `revision`; invitation answers must carry `invitation_id`. Do not use the legacy `/share` endpoint for friend invitations. Publication is a separate authorized step, not part of this candidate.

## API contract

All routes are under `/api/lists`. Identity-sensitive responses use `Cache-Control: private, no-store`. Private lists are unavailable with 404 to unauthorized viewers. Public detail remains public only when the owner's profile/privacy and active-account policy allows it. Public readers never receive the member roster.

- `GET /`: owned and accepted shared lists, including venues. Restricted accepted memberships return a generic `Unavailable shared list` row with `access_restricted:true` and `can_leave:true`, without owner identity, contents or revision, so members can withdraw safely. Supports `limit` (default/max 100) and `offset`; returns `lists`, `has_more`, `offset`.
- `POST /`: `{client_id?, name, description?, is_public?}`. Returns `{list,replayed}` with 201 for first creation and 200 for exact retry. UUID client IDs are recommended. A changed payload with the same ID returns 409. A delayed retry after deletion returns 410 rather than recreating a list. Identifier-only reservations survive account deletion and cover pre-feature lists, so old public references cannot be claimed by another account. They retain no owner, content or timestamps.
- `GET /:id`: `{list}` with `id`, `owner_id`, `user_id`, `name`, `description`, `is_public`, `revision`, `venues`, `venue_count`, `members`, `is_owner`, `can_manage`, `can_edit`, `can_add_venues`, `can_remove_venues`.
- `PATCH /:id`: owner only, `{revision,name?,description?,is_public?}`. Returns `{list}`.
- `DELETE /:id`: owner only, `{revision}`. Returns `{success:true}`.
- `POST /:id/venues`: owner or accepted collaborator, `{venue_id}`. Idempotent set-add, returns `{success,list_id,venue_id,revision,replayed}`.
- `DELETE /:id/venues/:venueId`: owner or accepted collaborator, `{revision}`. Returns `{success,list_id,venue_id,revision}`. Removed/unavailable venues remain removable.
- `GET /invitations`: safe pending invitation headers only: `{invitations:[{id,name,owner_id,owner_name,owner_username,invitation_id,expires_at}]}`. No contents, description or roster before consent. Supports `limit` (default/max 100) and `offset`, returning `has_more` and `offset`.
- `POST /:id/invitations`: owner only, `{user_id}`, accepted friends only. Returns `{ok,revision,invitation_id,already_invited?}`. Retries of a current pending invitation or accepted membership do not send duplicate notifications. Limit 20 people including owner; pending invitations expire after 7 days.
- `PUT /:id/invitation`: recipient only, `{response:'accepted'|'declined',invitation_id}`. The generation ID is mandatory to prevent a delayed old answer approving a newer invitation. Current answer retries are idempotent. Expired acceptance returns 410; declined/removed/left acceptance returns 409; old generation returns404. Decline is permitted after expiry.
- `DELETE /:id/members/:userId`: owner revoke/remove requires `{revision}`; self-leave does not require revision and remains available if peer blocks hide the list. The owner cannot leave their own list. Returns `{ok,revision}`. Unverified accounts can withdraw memberships or decline but cannot accept or participate.
- `POST /:id/share`: retained explicit public-share legacy action, owner only with `{revision}`. This changes privacy and posts publicly; the new private-invitation UI must not call it.

`revision` is a positive integer, not a numeric string. Missing destructive-edit revision returns 428; stale revision 409 with code `STALE_LIST`. Owner membership revocation/reissue and other list changes increment revision. Block/unfriend invalidation revokes memberships without touching list content revision, avoiding cross-list lock inversion.

## Consent and permissions

Owners manage metadata, privacy, invitations and deletion. Accepted collaborators may add/remove venues but cannot invite others, rename, publish or delete a list. List contents do not change anyone's private favorites. No external messages, emails or bookings are generated.

Accepted owner/member friendship must remain active. Blocking or unfriending either direction permanently marks owner/member memberships removed, so unblock or re-friend does not restore access. Fresh invitation and fresh consent are required. A block between collaborators hides the shared list from the affected collaborators, including its roster. The owner can still recover by removing a member. Self-leave works without readable contents. Suspended/inactive owners are unavailable.

Notifications are re-filtered on read/count/summary. Expired, answered, revoked, blocked, deleted or old-generation invitations are suppressed. A fresh invitation replaces its own prior notice. The top-level destination is `{kind:'list',href:'/my-lists?list=ID'}`. Pending invitations are also directly available through the Lists page.

## Atomicity and concurrency

Mutations serialize by list advisory lock, then sorted user-pair locks. Friendship changes use the same pair lock and durable membership invalidation. List creation/name changes serialize by owner. Invitation, notification and revision writes commit or roll back together. Duplicate venue adds and invitation retries do not increase counts/revisions. Revision checks protect destructive writes. Foreign keys cascade deletion of lists/accounts and preserve create-request tombstones while an account remains. Content-free ID reservations survive account deletion.

## Validation and remaining gates

Run `npm run check`, `npm test`, and `qa/connected-launch-integration.cjs` through its existing literal-loopback, fresh-database guard. `qa/list-invitations-integration.cjs` is included in that aggregate native gate. Tests cover private defaults, replay/tombstones, owner/collaborator permissions, required generations, pending-content isolation, expiry, decline/leave/revoke, notifications, permanent block/unfriend effects, peer privacy, suspension, public roster privacy, unavailable venues, capacity, migration replay, failure rollback, account deletion and native concurrent mutations.

Native PostgreSQL 18.3 evidence and commands are recorded separately by the reviewer/parent. Frontend browser acceptance, deployment/release ordering and real-device testing remain separate gates. This document does not claim those passed.
