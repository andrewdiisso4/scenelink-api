# SceneLink OAuth reliability repair

This auth repair was originally based on main `c73585b07f593b5eb3753ce8a4e0a191136f1cbd`. PR8 now includes a normal merge of released main `c2eac302813322c3211538ba2710ec51521044d7`, preserving its venue-code changes without executing data corrections or migration activation. It is not a claim that production sign-up now works. The implementation includes both provider-modal handling and session ownership guards with regression coverage.

## Changes

- Render Google's official, visible sign-in button directly. Remove the One Tap fallback and hidden synthetic click. Preload both provider SDKs with bounded loading and retry.
- Call Apple's popup synchronously from its ready button click. Handle cancellation, readiness, timeout and provider errors without leaving the controls stuck.
- Give each modal lifetime and provider attempt ownership. Use a fresh Google nonce, reject stale callbacks, prevent duplicate exchanges, and keep a keyboard-accessible Cancel action outside the inert provider area.
- Preserve session ownership across password login, sign-up, Google, Apple, logout, refresh and cross-tab changes. Obsolete results cannot replace a newer session. Provider exchange completion also checks that its modal attempt remains current.
- Validate bounded ID-token input. Report invalid credentials as 401, unavailable accounts as 403, provider outages as 503, and account-processing failures as 500. Log only fixed error categories rather than raw provider messages, which may contain credentials or profile data.
- Synchronize the named auth CSS section in the shipped CSS bundle, including its hidden-state, Google button and Cancel rules. Add source/bundle parity and hidden-state transition regression tests, and fail finalization if the named section is missing. Unrelated CSS sections remain unchanged.
- Rebuild named frontend bundles and advance the service-worker/cache identity to `connected-20261112-auth2`.

## Security and scope

Google signature/audience verification and Apple RS256/signature/issuer/audience verification remain in place. Verified email is still required. Existing unverified accounts cannot be silently linked by email. Inactive and suspended accounts remain blocked. No credentials, provider grants, environment variables, allowed origins, database migrations, venue data or media-storage configuration are changed.

## Provider acceptance remains open

The November 10 public production check reached Apple's `invalid_client` before credential entry for the configured Services ID. Frontend and backend public client identifiers matched when checked that day. Apple Developer configuration has not been verified or changed by this code candidate. The Services ID, primary App ID association, domain and exact return URL still need authorized inspection before any provider-setting change. This code alone cannot repair an unregistered Apple client.

Google's public UI timeout was reproduced on November 10; that browser used One Tap plus a hidden programmatic button click. The new visible official button addresses that independently established defect. No successful real Google or Apple account creation/session is claimed. Fixture tests use fictional accounts and local provider adapters, never production credentials or accounts.

## Release safeguards

Release requires exact-head CI and hosted-preview checks for this auth-only revision. Preview origins may be rejected by provider registration and must not be added to provider settings merely for testing. After authorized production rollout, verify real provider sign-up with the account owner. Keep venue/photo changes in a separate increment and retest any later combined release.

## Fresh local verification

Completed on November 12 against the finalized auth2 candidate with Node 24.22.1:

- Syntax check passed.
- Backend regression suite: 112 passed, 0 failed.
- Full frontend suite: 380 passed, 0 failed.
- Social VM suite: 40 passed.
- Native PostgreSQL 18.3 on the preceding auth1 revision: 97 API checks, 14 inactive-ingestion tests, 26 synthetic-upgrade checks and 18 welcome-queue tests passed in separate fresh loopback databases. The temporary server was stopped after testing. Backend source, migrations and native test inputs are byte-identical in auth2; these native checks were not repeated for the CSS/cache-only correction.
- Named-bundle source parity, execution-asset/cache references and asset SHA256 manifest passed.

The final frontend run emitted JSDOM teardown warnings from unchanged visual-refresh tests; its exit status and all 380 assertions passed. Earlier local iterations found a test-only rate-limit collision and an outdated release-marker expectation; both were corrected and the complete affected suites reran successfully. Focused test counts overlap the full suites and are not additive independent guarantees. The preceding auth1 revision passed all five exact-head CI jobs and built a hosted preview. That preview exposed a stale auth CSS bundle, corrected in auth2. Exact-head CI and hosted visual acceptance must rerun for auth2. Real-provider account/session success and physical Safari/iPhone checks remain unverified.

Useful provider references:

- https://developers.google.com/identity/gsi/web/reference/js-reference
- https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/
- https://developer.apple.com/documentation/technotes/tn3107-resolving-sign-in-with-apple-response-errors

## Integration with released main

The November 13 merge preserves every PR7 venue file byte-for-byte except the shared API acceptance test, where both sets of assertions combine cleanly. Served frontend bytes remain identical to auth2, so the cache marker stays `connected-20261112-auth2`. Fresh combined checks passed: 137 backend tests, 387 frontend tests, 40 social VM tests, syntax, 97 native API checks and 26 synthetic upgrade checks. Native tests used new loopback PostgreSQL 18.3 databases with fictional fixtures; the server was stopped and its stopped state verified. Exact-head remote CI is recorded separately for the merge revision. This draft update does not merge PR8 or deploy production.
