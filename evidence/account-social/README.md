# Account and social acceptance evidence

This folder preserves the successful fictional-account run for [PR #43](https://github.com/andrewdiisso4/scenelink-api/pull/43). It contains the original browser receipt and all 20 PNG captures from [CI run 45351331962](https://github.com/andrewdiisso4/scenelink-api/actions/runs/45351331962), plus a structured summary of the completed jobs. The evidence follow-up changes documentation and captures only; the runtime files are unchanged.

## Provenance and result

| Record | Value |
| --- | --- |
| Code candidate | `9eca790fc4abc85c9076ca9b4e01df0726c3bc95` |
| Candidate tree | `30fa692dedfeadb157d979a555e7a0448f4b3559` |
| Tested PR merge commit | `9e7b19d2eed4a5fcddd497954ed7f84054a8a8e1` |
| CI result | All 10 jobs passed |
| Browser result | Eight stages passed; zero uncaught browser errors |
| Database / browser | Native PostgreSQL 18.3 / Chromium 151.0.7922.34 |
| Source integrity | All 21 receipt hashes matched the candidate runtime files when archived |
| Backend regression | 285 passed; zero failed; one opt-in native restore-fixture guard skipped |
| Frontend / social / host guards | 766 / 40 / 9 passed |
| Native analytics / synthetic upgrade | 14 / 26 passed |
| Original artifact | [14900985573](https://github.com/andrewdiisso4/scenelink-api/actions/runs/45351331962/artifacts/14900985573) |
| Artifact ZIP SHA-256 | `68a294edb72fee7152853288a1cc694938fec9d164e67cab9ff513062093ad47` |

The [browser receipt](browser-receipt.json) records the exact source hashes, eight stage results, response statuses, and limitations. The [verification summary](verification-summary.json) records job names/IDs and regression counts. The artifact ZIP is not duplicated here; its extracted screenshots and original receipt are committed so they remain available after workflow artifact retention expires.

## Captures

| Flow | Screenshots |
| --- | --- |
| Login | [Desktop](login-desktop.png) · [Mobile](login-mobile.png) |
| Signup | [Mobile form](signup-mobile.png) · [Form ready to submit](signup-mobile-submit.png) |
| Newly created account | [Desktop verification banner](new-account-desktop.png) · [Mobile verification banner](new-account-mobile.png) |
| Profile | [Desktop](profile-desktop.png) · [Mobile](profile-mobile.png) · [Mobile editor](profile-editor-mobile.png) |
| Friends and search | [Mobile](friends-mobile.png) |
| Account settings and deletion | [Settings](account-settings-mobile.png) · [Permanent deletion confirmation](delete-mobile.png) |
| Recovery and verification | [Recovery](recovery-mobile.png) · [Unavailable mail feedback](recovery-error-mobile.png) · [Reset password](reset-mobile.png) · [Verify email](verify-mobile.png) |
| Welcome for an unverified signup | [Desktop](welcome-unverified-desktop.png) · [Complete mobile layout](welcome-unverified-mobile.png) |
| Welcome for a verified signup | [Desktop](welcome-verified-desktop.png) · [Complete mobile layout](welcome-verified-mobile.png) |

The reviewed login, profile/settings, deletion, recovery/verification, and welcome layouts retain the official SceneLink logo and charcoal/gold style. Automated browser assertions also check mobile overflow, login control size and error contrast, and header/banner clearance. The welcome captures include the complete body and footer. The [HTML and plain-text previews](../welcome-email/) are generated from the production template with fictional data.

## What this proves

The real application ran against an isolated PostgreSQL database. The browser signed in with a password, saved and reloaded profile changes, searched for another fictional member, sent and accepted a friendship request, applied messaging privacy and blocking, logged out across tabs, created a fresh signup with exactly one pending welcome job, and permanently deleted that new account through Privacy & settings. Signup returned 201 and account deletion returned 200. The receipt's forgot-password 503 is the intentional mail-disabled error-state check; logout returning 401 after deletion reflects the already-invalidated session.

## Limits and remaining gates

External providers were disabled and all account data was fictional. No real Apple/Google exchange, Cloudinary upload/destruction, SMTP delivery, or production account was exercised. Reset and verification captures establish layout; token lifecycle has separate route/DOM coverage. Actual inbox arrival and Gmail, Outlook, and Apple Mail rendering still require controlled mailbox checks. Chromium screenshots and keyboard checks do not establish signed iPhone, VoiceOver, or App Store readiness.

The backend regression's one skipped restore fixture is explicit; a real deployment backup/restore rehearsal remains required. Deployment must apply migration 018 before the matching frontend, and finish the provider cleanup, signed-device, moderation, privacy, and submission gates in the [Veylo handoff](../../docs/ACCOUNT_SOCIAL_RELEASE_20261124.md).
