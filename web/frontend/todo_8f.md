# Phase 8F Launch-Polish TODO

## Steps 1-5: COMPLETE
- [x] STEP 1: Owner-browser acceptance gate (PASS from prior session)
- [x] STEP 2: Header modernization (all 20 pages: logo 34px/30px, consistent nav, no NEW badges, no href="#", search "Ask" pill)
- [x] STEP 3: Mobile drawer (all 3 header systems working, Escape/outside-tap/link-click close, tap targets ≥44px except index 42×42 minor)
- [x] STEP 4: Footer modernization (60px logo, 4-column, Events Coming Soon, Plan Builder Beta, newsletter working, no dead links)
- [x] STEP 5: Button/link audit (no silent dead buttons, no href="#" traps, onboarding non-trapping, Beta/Coming Soon labeled)

## Remaining Steps
- [x] STEP 6: Visual polish — gold consistency, CTA hierarchy, card/hero spacing, no map-heavy code, footer consistency across all pages
- [x] STEP 7: Performance guard — no 2MB hero (97KB webp), zero JS errors, zero 404s, all pages <220ms locally, SW stable
- [x] STEP 8: Versioning — bumped to phase8f/sl-v1.18.0-phase8f in version.json/sw.js/sl-version-marker.js/sl-stale-version-detector.js, cache-busters bumped across all pages, ZIP built, Netlify deploy 6a3e96c34a1c45173426b2ad LIVE
- [x] STEP 9: Final QA — Desktop Chrome (8 pages, zero errors, 400-530ms), Mobile Chrome (3 pages, zero errors, <400ms), Mobile drawer opens/closes with Escape, version meta confirmed 8F
- [x] STEP 10: Final report — see below

## Minor Fix Needed
- [x] index.html hamburger tap target 42×42 → bumped to 44×44 via sl-phase8f-polish.css
