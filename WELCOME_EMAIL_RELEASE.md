# Signup welcome email increment

Isolated candidate based on `release/connected-20261108` commit `4aa5983eb17dc53bad2e8df7022088927364372f`. No production database, active release tree, real account or live mailbox was used by this work.

## Behavior

- A successful new password, Google or Apple signup queues one welcome email atomically with account creation. Login, provider linking, verification and verification resends do not enqueue another welcome. There is no existing-account backfill.
- The existing SMTP configuration and sender are reused. No new provider, credential, frontend change or newsletter subscription is introduced. The CI workflow adds a separate native PostgreSQL welcome-queue matrix job.
- Unverified password signups receive a generic welcome that explains the separate verification step. Untrusted signup names are not reflected into that email. Provider-verified accounts can receive an HTML-escaped greeting. Unsupported venue counts and AI promises were removed.
- Verification tokens, read-only restrictions, ownership checks, session revocation and sign-in responses are unchanged. Welcome emails neither verify accounts nor contain verification tokens.
- SMTP sending is asynchronous and does not delay or invalidate successful signup. If SMTP is disabled, pending jobs remain for later processing by the API instance. The queue is scanned on startup and every 30 seconds, with an immediate wake after signup, up to 10 jobs per pass.

## Duplicate and privacy protection

- Migration014 adds `signup_welcome_emails`, keyed by user ID with a SHA256 recipient fingerprint and delivery state/timestamps. It stores no copied email address, name, content, token or provider error. Deleting the account cascades its queue row. A disabled, suspended or readdressed account is skipped before sending.
- A PostgreSQL atomic `FOR UPDATE SKIP LOCKED` claim protects against multiple API instances. Claimed/unknown work is never automatically replayed. Welcome sends turn off the generic mailer's transient-error retries and suppress address, subject and provider-error logging.
- `accepted` means SMTP accepted the message, not inbox delivery. SMTP cannot provide exactly-once guarantees. A crash after claiming, timeout, uncertain provider failure, or database failure after send leaves `sending`/`unknown` and intentionally requires operator review instead of risking duplicates. Do not reset these states or retry until the provider confirms the original was not accepted.
- A known account-read/template failure before invoking the mailer is returned to pending and deferred to a later pass. An explicit `mailer-not-ready` response is also safe to put back in pending, because no transport was attempted. No automatic retry is made for any other provider failure.
- Deletion or address changes racing after the final eligibility read cannot recall a message already submitted to SMTP. This standard send-time race is not an inbox guarantee.

## Integration

1. Apply the reviewed patch to the exact baseline, not by copying unrelated files. Include migration014, the new welcome service, both signup route hooks, the startup worker and migration gate, the narrowly scoped mailer changes, and QA tests together.
2. `src/server.js` must include migration014 in the explicit startup allowlist. `src/launch/bootstrap.js` refuses HTTP startup if its schema marker is missing.
3. Re-run the normal unit/frontend and native PostgreSQL18.3 API, ingestion, existing-schema upgrade and welcome-queue gates against the resulting exact commit. The existing release's green checks and restored-DB rehearsal do not cover this increment.
4. Rehearse migration014 on the authorized disposable restored clone before any production rollout. The migration creates a new empty table and index; it does not update existing user rows or enqueue historical accounts.
5. After approved deployment, verify one newly created, authorized test account using the ordinary signup flow and one recipient inbox. Do not invoke a send from an interactive console. Tests here mock SMTP and do not establish live welcome delivery.
6. If rolling back app code, stop the new worker first. Keep the additive table for investigation; do not replay it with the old untracked welcome sender. The old application may send untracked welcomes for subsequent new signups; those are not in this queue.

The queue has no operator resend endpoint. It does not promise delivery after an ambiguous result, provider rejection, API downtime, or spam filtering. Operational monitoring should inspect aggregate counts of pending, sending and unknown jobs, without exposing account-level details in public health endpoints.
