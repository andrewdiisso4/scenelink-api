# Single real verification email, isolated QA only
- Before configuring the sender, verify sending DNS and disable clicks/opens/receiving for the isolated sending subdomain. Use a temporary sending-only Resend key restricted to the approved sending domain. Do not reuse production credentials.
- The approved operator puts the nominated `ACCEPTANCE_RESEND_RECIPIENT`, `ACCEPTANCE_RESEND_KEY`, `ACCEPTANCE_RESEND_MODE=one-verification`, `ACCEPTANCE_RESEND_UNTIL` (UTC YYYY-MM-DDTHH:MM:SSZ, at most one hour), and a unique random 32-character lowercase hex `ACCEPTANCE_RESEND_RUN` in the existing isolated QA service's secure configuration only. The real address is not checked in. Do not send or store credentials or tokens in chat, logs, or Git.
- Use the exact isolated service, gate, disposable database, and a single instance. Sign up with a fictional profile and the authorized recipient address in QA only. Initiate one signed-in verification. Separate welcome and reset mail remain disabled. Check one provider ID, one actual inbox message, once-only link redemption, fresh sign-in, then a harmless protected write/readback. Stop on duplicates or unknown outcome. Do not retry or restart while armed. Provider acceptance alone is not delivery.
- Disarm, remove canary settings, restart for disabled config and revoke the restricted key. No production use. No welcome, reset, OAuth, outgoing customer mail, or production release validation is claimed by this test.

### Inbox link landing

The isolated host serves only the exact, static `/verify-email.html` landing
on direct top-level inbox navigation. The token remains in the browser
fragment and is removed before any request. No fixture content is public.
The confirm POST still requires the same QA origin and the signed access
cookie. If the tab asks you to unlock the environment, use the link in a
new tab, then return to the confirmation tab and retry the same button.
Do not forward, screenshot the address bar, or paste the link in chat.
A locked or unaccepted origin does not consume the verification token.
