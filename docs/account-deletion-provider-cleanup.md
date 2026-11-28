# Account deletion: provider cleanup design and launch gates

Reviewed: 2026-11-24. Status: local candidate implementation plus an explicit design for unfinished provider work. This document does not certify a deployed service or an App Store build.

## Current implementation and limits

Canonical account routes are installed by `src/launch/identity.js`; the legacy `src/routes/auth.js` is not mounted. The current candidate supports password confirmation and a five-minute, server-issued proof from a verified Google or Apple sign-in. Provider-only accounts do not need to create a password. Deletion holds the user row lock, rechecks session validity, removes account data in a transaction, and ends all sessions by removing the account.

The new `src/services/analytics-writes.js` serializes identified analytics with account deletion. Authenticated insertion holds a `users FOR KEY SHARE` lock through its INSERT and COMMIT. Deletion takes `FOR UPDATE` before deleting analytics and the user. All three current writers use this helper: analytics batches and both Concierge paths. Native PostgreSQL tests cover both orderings and failures. This closes the currently identified write race without a schema change; every future identified analytics writer must use the same boundary.

New deletion receipts retain the account ID, deletion timestamp, and receipt ID, but not email hashes, IP addresses, or free-text reasons. Historical receipt schema variants must be normalized by the separately reviewed receipt compatibility migration before this receipt format is released. Existing historical receipt contents and retention periods are not silently changed.

Current Apple deletion reports `apple_revocation_required: true` when the locked account's current provider is Apple. The UI shows Apple's manual instructions and does not automatically redirect away. No automatic revocation is claimed. A false flag only means the current provider field is not Apple; it is not evidence that no Apple authorization ever existed.

| Item | Current evidence | Remaining condition |
| --- | --- | --- |
| Local account and authored data removal | Actual HTTP, JWT, schema, cascade, rollback, and session tests | Verify exact integrated revision and upgraded schema in release CI |
| Analytics deletion ordering | Actual native PostgreSQL 18 multi-connection tests for all three writers | Keep new writers on the shared transaction helper |
| Cloudinary object deletion | No destroy adapter, durable upload receipt, or cleanup worker is implemented | Implement owned-asset cleanup and reconcile legacy ownership |
| Apple automated revocation | Current sign-in verifies identity tokens only | Exchange codes, secure revocable tokens, and implement durable revocation |
| Historical Apple links | Current schema has one `oauth_provider` and `oauth_id` pair | Review identities lost when another provider replaced that pair |
| Physical provider behavior | No provider credentials, callback, upload, destroy, or revoke was exercised during this audit | Configuration owner must perform authorized staging and device acceptance |

Deleting `media_assets` rows is not evidence that hosted images were destroyed. A local database success response is not evidence of Apple revocation, CDN invalidation, or backup expiry.

## Cloudinary: bounded architecture

### Persist verified ownership and upload intent

Add a migration containing provider receipt fields and two durable structures. Exact migration numbering must be selected from the integrated branch; do not reuse an existing migration ID.

| Structure | Minimum fields and constraints |
| --- | --- |
| `media_assets` provider receipt | Provider, cloud/product environment, immutable asset ID, generated public ID, resource type, delivery type, and verified receipt time. Only server-verified responses may populate these fields. |
| Upload intent | Generated intent ID, owner identity, generated public ID, cloud, intended kind, state, creation time, upload lease, cancellation request, and verified receipt when available. Persist before making the provider request. |
| Cleanup job | Receipt or intent reference, provider operation, deduplication key, restricted payload, state, attempt count, next attempt time, lease owner/expiry, and sanitized failure category. It must survive deletion of the user and media row. |

The existing server generates IDs in the shape `scenelink/<user UUID>/<avatar or post>/<random UUID>`. Keep that namespace, but persist the verified provider identifiers directly. Do not reconstruct a destructive request from a client-submitted avatar URL.

For account deletion, gather owned asset receipts and pending upload intents while holding the user lock, record cleanup obligations in the same transaction, then delete the user and cascading content. Pending uploads must be marked for cleanup before their ownership linkage can disappear. The upload handler must honor that state and the account/session recheck already required before attachment.

### Handle every upload outcome

1. For a successful, valid upload, atomically attach the verified receipt and media row to the still-eligible account.
2. If the account was deleted, the revision changed, moderation prevents attachment, or attachment fails, enqueue compensating destruction for the known-owned upload.
3. If the request times out or the process crashes, retain the intent and reconcile its generated identifier. An HTTP timeout does not establish that the provider created nothing.
4. Do not treat an early `not found` response as final while the upload is still in flight. Reconciliation must handle a late provider completion before declaring the intent clean.
5. After confirmed cleanup, purge unnecessary object identifiers and personal job payload, preserving only the approved operational receipt fields.

### Worker behavior

Claim jobs with a bounded `FOR UPDATE SKIP LOCKED` transaction and a renewable lease. Commit the claim before network access. Perform a bounded, signed Cloudinary destroy request for the validated product environment and image identifier, with `invalidate=true`. Accept only documented successful/deleted or already-absent outcomes. Treat authentication failures, rate limits, malformed responses, and uncertain network outcomes as pending or blocked work, not completed deletion.

Use retry/backoff and restart-safe deduplication. A dead or expired worker lease must be reclaimable. Keep sanitized operational alerts for old or blocked jobs; do not log account identifiers, tokens, provider secrets, or full provider payloads. A missing credential is a blocked configuration state, never success.

Cloudinary documents that deleting an asset can leave a backup when backups are enabled, and that cached copies require explicit invalidation. The operations owner must therefore confirm backup settings and cache invalidation behavior before making a complete-removal claim. See [Cloudinary destroy documentation](https://cloudinary.com/documentation/image_upload_api_reference#destroy_by_public_id).

### Legacy ownership is a separate gate

The old `src/routes/media.js` record endpoint accepted arbitrary HTTPS URLs. Existing rows from that path have no reliable provider ownership receipt. A matching hostname or a user-controlled `owner_id` row is not sufficient permission to destroy an arbitrary Cloudinary asset.

Before enabling legacy destruction, obtain an authorized read-only provider inventory and reconcile it with trusted upload evidence, generated identifiers, and account ownership. Classify rows as verified owned, external/unowned, or unresolved. Queue automatic deletion only for verified owned assets. Retain an explicit unresolved-work queue and a reviewed process for the remainder. Never delete by broad filename prefix or URL substring merely to make the inventory appear complete.

## Apple: authorization code and revocation architecture

### Preserve the provider authorization safely

Apple's current browser callback exposes an authorization code, but the SceneLink UI presently forwards only the identity token. Add `authorization_code` to the frontend request. Exchange the code immediately on the backend using Apple's token endpoint; codes are single-use and short-lived. Validate the returned identity token against the configured issuer, audience, subject, and server-issued nonce binding. See [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens).

Use a server-generated ES256 client secret based on the approved Apple developer team, key ID, private key, and exact client identifier. Keep it off the client. Client IDs, redirect URIs, bundle identifiers, and web/native audiences must be checked against the real provider configuration. Do not infer that `APPLE_ENABLED` in browser configuration proves a working backend setup.

Persist every Apple identity bound to the account rather than replacing the single provider pair when a user later signs in with Google. A separately reviewed credentials table should key the account, provider, client identifier, and provider subject binding. Existing provider-link behavior must retain its verified-email and identity protections.

### Encryption policy

Use authenticated encryption with a dedicated versioned key, independent of the application JWT secret. Bind encrypted material to the account, provider, client identifier, and subject using authenticated additional data. Retain the key version, nonce, authentication tag, and ciphertext; do not persist plaintext access or refresh tokens.

The configuration owner must choose and provision the production key custody and rotation mechanism. A versioned secret-manager key or approved KMS envelope scheme is a deployment decision, not an invented environment value. Support old-key decryption during rotation and prove that a mismatched key or tampered record fails closed.

Extend error-reporting redaction to authorization codes and client secrets before adding these request fields. Keep provider response bodies, signing keys, decrypted tokens, and request forms out of logs and release artifacts. An uncertain token exchange must not become an authenticated success; ask for a fresh sign-in and preserve the manual revocation path when needed.

### Delete locally and retain a durable revocation obligation

Inside the account deletion transaction, move the required encrypted token material and immutable provider binding to a cleanup job that does not cascade with the user. Commit local deletion and the job together. Perform revocation outside the database lock using the same configured Apple client and `/auth/revoke` endpoint. On confirmed success, purge the encrypted revocation payload. Handle failures and worker crashes through the same durable lease/retry mechanism used for media cleanup.

Apple documents refresh-token and access-token revocation and treats an already invalidated token as a successful outcome. See [Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens). Do not label an invalid client configuration, a malformed request, or a timeout as a successful revocation.

For older accounts without any revocable token or authorization code, fulfill local account deletion and direct the user to manual revocation. Apple's [TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple) describes this legacy path and the associated revocation notification handling. The current bounded UI fallback links to [Apple's account settings instructions](https://support.apple.com/102571). It does not replace the automated flow for newly captured authorizations or resolve historical provider identities that the current schema has lost.

Add verified Apple server notification handling, and native credential-state handling where the shipped native implementation uses it. Authenticate notifications, reject wrong audiences and replayed event IDs, and invalidate the corresponding local sessions. Do not trust an unsigned notification body.

## Completion contract and user wording

Local deletion, provider cleanup, and receipt retention are separate facts. Preserve `deleted:true` for a committed local account deletion, and add explicit provider-cleanup status when the durable worker exists, for example `pending`, `complete`, `blocked`, or `manual_action_required`. Do not report `complete` merely because a job was queued.

If status is available after sign-out, use an unguessable, scoped receipt token stored as a hash with an approved lifetime. Return only cleanup status, never former account details or provider credentials. A user must not have to recreate an account to see an outstanding deletion obligation.

Keep the Apple manual instructions available until the user chooses to leave. Retain the explicit receipt disclosure. Define historical receipt and provider-backup retention with the owner; do not invent a legal requirement or an expiry period.

## Acceptance and launch gates

| Gate | Required evidence |
| --- | --- |
| Integrated account routes | Password, Google-only, Apple-only, linked-password, unverified, stale session, revoked session, malformed confirmation, rollback, and other-account preservation all pass against the integrated revision. |
| Upgrade compatibility | Both historical deletion-receipt DDL variants normalize idempotently without losing prior receipts. |
| Analytics serialization | `qa/analytics-account-deletion-native.cjs` passes on native PostgreSQL 18+: both writer/delete orderings for batch and both Concierge branches, actual lock blocking, failure rollback, and anonymous guest preservation. |
| Analytics QA barrier | Concierge acceptance observes the shared writer's returned promise through COMMIT, retains original identity/privacy assertions, and fails on captured INSERT or COMMIT errors. |
| Cloudinary ownership | New uploads have verified immutable receipts; legacy inventory has a reviewed ownership classification. No arbitrary URL destruction. |
| Cloudinary recovery | Pending moderation, account deletion during upload, attachment rollback, crash, upload timeout, late completion, worker restart, duplicate delivery, and destroy failure are covered with injected fixtures. |
| Apple credential storage | Subject/audience/nonce mismatch, code replay, encryption tampering, key rotation, provider outage, token replacement, and multi-provider linking are covered without real credentials in tests. |
| Apple revocation | Real staging authorization and deletion demonstrate confirmed revoke, retry after a controlled outage, payload purge, and credential-revoked handling. Legacy fallback remains available. |
| Physical device | Actual release build on supported iPhone/iPad and relevant browsers verifies keyboard/focus behavior, Google/Apple callbacks, deletion, sign-out, local caches, push-token removal, and manual instructions. DOM tests do not prove this gate. |
| Provider configuration | Veylo/configuration owner verifies exact Apple identities/redirects and signing capability; Cloudinary environment/permissions, backup settings, moderation behavior, and invalidation are reviewed. Secrets stay in approved storage. |
| Operations and wording | Cleanup backlog/blocked-job monitoring has an owner; retention and escalation are documented; UI distinguishes local deletion from pending or manual provider cleanup. |

No provider schema, encryption key, token exchange, cleanup worker, production object destruction, or live revocation is implemented or activated by this design document. The physical provider and device gates remain open until their evidence exists.
