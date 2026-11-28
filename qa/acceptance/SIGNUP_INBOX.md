# One-off private QA test: welcome and newsletter inbox

Never deploy this candidate as production or add its credentials to Netlify.
The canary is off by default. The host, service ID, dedicated database and
private access gate must already match the existing isolated acceptance host.
To arm, at a coordinated time, set the six ACCEPTANCE_SIGNUP_INBOX settings
in that QA service only: MODE=welcome-and-newsletter, RECIPIENT to the owned
inbox configured in code, KEY to a temporary sending-only credential bound to
the verified mail subdomain, RUN to a fresh 32-digit random hex test identifier,
WELCOME_NOT_BEFORE to the current UTC time shortly before deploy, and UNTIL to
a UTC timestamp less than one hour ahead. Keep link tracking disabled. Secret
values never go into chat, logs or the browser address bar.

From the unlocked QA browser, register the reserved fictional address
scenelink-mail-check@example.invalid using a fresh disposable password. This
accounts for one welcome email to the owned mailbox, not an opt-in. Then
submit the fictional address once in the footer. In the same unlocked QA
browser, follow the second message to confirm, then use the cancellation link
to unsubscribe. Do not paste links or tokens into messages. Check provider
acceptance separately from both physical inbox messages. New requests for any
other addresses cannot send mail. Persistent claims plus provider idempotency
limit this run to one attempt per purpose. Do not automatically retry a
restart or failure or reuse an unsuccessful run.

Existing verified-email QA evidence came from a separate branch. This test
does not verify production SMTP, password recovery, or onboarding at the live
domain. Revoke the temporary credential, remove all six settings and redeploy
the QA service with the canary disarmed when complete.
