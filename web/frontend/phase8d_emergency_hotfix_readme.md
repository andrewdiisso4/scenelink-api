# SceneLink Phase 8D Emergency Frontend Hotfix Overlay

Use this only as an overlay on top of the complete SceneLink frontend folder.
Do not deploy this ZIP as the entire Netlify site.

Purpose:
- Fix missing icons caused by FontAwesome webfont files being absent from the no-font deployment package.
- Add CDN FontAwesome fallback without distributing font binaries.
- Correct stale `sl-version-marker.js` from old Phase 7D metadata to current Phase 8D hotfix metadata.
- Bump service worker/cache version to `sl-v1.16.0-phase8d-hotfix`.
- Add `sl-phase8d-recovery.js` to recover AI Concierge CTAs, mobile nav clicks, and stranded loading overlays.

Required deployment method:
1. Start from the complete current `scenelink-frontend` folder that includes all vendor/icon/image assets.
2. Apply this overlay on top of that folder.
3. Deploy the full merged frontend folder to Netlify production.
4. Do not run a frontend build. This app is build-less static HTML/CSS/JS.
5. Confirm `/version.json` says `8D-hotfix` and `sl-v1.16.0-phase8d-hotfix`.

Do not include or transmit font binaries through chat. Restore local font assets from the repo/platform, or rely on the CDN fallback included here.
