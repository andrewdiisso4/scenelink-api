# Phase 9A Social Connectivity — Frontend TODO

## DONE (backend + client)
- [x] STEP 0-6 backend: audit, migrations, API completion, SSE realtime, media gate, notifications backend
- [x] STEP 7 frontend social client: js/sl-social-core.js (window.SL.social.*) — 29 methods, syntax OK
- [x] Backend deployed live (dep-d8vk09jsq97s738eis60), 10/10 new endpoints PASS in prod

## IN PROGRESS
- [ ] STEP 8 social-feed.html: new driver sl-social-feed-9a.js consuming SL.social.*
      - toggle #socialLanding (logged out) vs #socialFeed (logged in)
      - composer (post), check-in, photo (capability-gated), plan
      - feed cards (post/checkin/review) + like + comments
      - sidebar: real stats, suggestions (friend req actions), trending venues
      - friend requests panel, messages preview, notifications preview
      - pagination / load more (cursor)
      - empty + error states, loader timeouts, no fake data
- [ ] STEP 9 messages.html: conversation list, unread badges, send/receive, mark read, realtime/fallback
- [ ] STEP 10 profile.html + public profiles: avatar, friend-status btn, message/report/block, edit own
- [ ] STEP 11 cross-app integration: header badges (notif+msg), profile avatar; footer Social link live
- [ ] STEP 12 privacy/safety/moderation verify
- [ ] STEP 13 UI quality polish (dark/gold, mobile-first, skeletons, 44px targets, Esc closes)
- [ ] STEP 14 testing matrix A/B
- [ ] STEP 15 qa/phase9a-social-api-smoke.mjs + qa/phase9a-social-e2e.mjs
- [ ] STEP 16 deploy frontend: version.json (9A-social), sw.js (sl-v1.20.0-phase9a-social), markers, ?v=9a, ZIP, Netlify
- [ ] STEP 17 final production verification (two real accounts)
- [ ] STEP 18 final report (LAUNCH-READY or BLOCKED + exact missing dep)

## KNOWN GATES
- Media/photos: needs Cloudinary creds (CLOUDINARY_URL) in Render secret store. Currently capability=false. Photo UI capability-gated; reported, not hidden.
- Web push: needs VAPID keys. Not configured → in-app notifications only.
