# Signup welcome and newsletter rollout

Built on the integrated account candidate, not on the temporary one-send
verification canary. This is a paired release with migrations 018 and 019.
Do not deploy the frontend without the matching backend. A Netlify preview
proxies to production by default; do not submit test addresses there.

- A new account's existing durable welcome queue uses a branded thank-you.
  Signing up or signing in does not subscribe the account to the newsletter.
  The welcome message is not an account verification or password reset.
- Footer form requests a separate, link-confirmed newsletter opt-in. A request
  is not an active subscription. An opt-in link expires after 24 hours; a new
  request cannot automatically reactivate an unsubscribed address. The email
  also contains the genuine cancellation/unsubscribe link. Only confirmed
  active rows count as subscribers. There is no bulk mailing or signup alert.
- Migration 019 preserves legacy newsletter rows but does not interpret them
  as confirmed. Explicit legacy native launch waitlist requests remain
  separate. No existing addresses should receive marketing as part of rollout.
- The sender defaults to already configured SMTP. Optional server-only
  signup-scoped Resend settings are documented in .env.example. Use a new
  sending-only credential restricted to the verified mail.scenelink.app
  subdomain, with click tracking disabled for secret-bearing links. Set a
  deliberate UTC welcome cutoff to avoid sending the old queue via Resend.
  Do not reuse the revoked verification canary key. Never add the key to
  Netlify, source, screenshots or chat. The transport intentionally does not
  cover verification, password reset, contact, or marketing campaigns.
- Provider acceptance is not inbox proof. Verify two separately initiated
  messages with one authorized controlled test inbox against isolated source
  and data, before allowing public signup to depend on these flows. Confirm an
  account creates exactly one welcome and no marketing subscription. Then
  submit the public footer, verify pending then active, repeat without a second
  send, unsubscribe, and check resubscription requires confirmation again.
- For cutover, verify a fresh backup and isolated restore plus writer fencing,
  especially because previous code lacks subscription consent checks. Keep
  all campaigns off. If rolling back, stop the new sender first; never replay
  an unknown welcome or activate legacy pending rows with the old endpoint.
