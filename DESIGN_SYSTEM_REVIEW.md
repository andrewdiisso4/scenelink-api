# SceneLink shared visual system

## Status

This is an isolated, local-only design candidate based on the audited user-experience candidate. It has not been pushed, uploaded or deployed. Production remains unchanged. Browser-rendered desktop/mobile acceptance is still required before release; the available preview route could not be completed in this environment.

## Changes

- One shared charcoal/gold visual system is loaded last on all 22 HTML routes. It defines shared input, native-select, button, filter, tab, modal and search styling without changing feature visibility or availability.
- Buttons use a consistent 12px radius, 44px minimum touch height, clear primary/secondary states, and visible keyboard focus. Text fields use 16px text and 48px height. Browser zoom is no longer disabled. Reduced motion and forced-color modes are respected.
- Both user-supplied SceneLink PNGs are integrated unchanged. The transparent wordmark is framed in headers; the full logo appears in footers and authentication. SHA-256 tests verify that the asset pixels have not been modified.
- Footer Instagram, X, Facebook and YouTube links use self-contained SVG glyphs from the existing Font Awesome Free brand font, with 44px targets and accessible names. Existing destinations are preserved. Brand glyph licensing is CC BY 4.0, https://fontawesome.com/license/free.
- Email-list signup has a visible email label, autocomplete, privacy link, responsive layout, an inline live status, and pending/error/success feedback. Login/signup labels are also explicitly associated with their fields, and their dialog has an accessible name.
- Newsletter submission is protected against repeated clicks and legacy double-binding. The typed email survives failure; a successful older request does not erase a newer edit. Success is shown only for an explicit successful API response. The form no longer promises email delivery, which the current API does not guarantee.

## Verified

- Frontend suite: 249 passed, zero failed.
- API suite: 86 passed, zero failed. No backend code changed in this candidate.
- Social VM regressions: all 40 passed.
- Repository JavaScript syntax check and changed frontend JavaScript checks passed.
- Patch whitespace check passed.
- Shared normal-text color pairs pass WCAG AA 4.5:1 contrast by calculation. This is not a claim of a full accessibility audit.
- The existing cache/hash validation passes after regeneration, and the new stylesheet and brand assets are included in the service-worker shell.

These tests use local synthetic/mocked data. They do not validate production behavior, physical phones, Safari, live email delivery or provider connections.

## Remaining acceptance

1. Render home, Explore/Nightlife search and filters, newsletter/footer, login/signup, profile/messages and list/plan flows at narrow and desktop widths. Check wrap, overlap, keyboard focus, dropdown scrolling, closed/disabled states, and reduced motion.
2. Verify the two exact official images are readable at their displayed sizes and that footer SVG glyphs align in the browser.
3. Merge the independently owned list/plan and search work carefully. This candidate does not include or activate the optional AI-assisted search provider.
4. After any merge, regenerate bundles and the asset manifest, run the full suites again, and choose a new release tag. If the search backend is later approved and integrated, the merged release must mark its paired-backend requirement accurately. The design-only candidate has no backend change.

## Integration boundaries

Primary sources are `web/frontend/css/sl-design-system.css`, the two `web/frontend/images/brand/` files, all HTML head/header/footer improvements, and bounded changes to `sl-auth-ui.js`, `sl-phase8-completion.js` (newsletter only) and `sl-newsletter.js` (ownership guard only). Generated bundles, service worker and hash metadata accompany them.

When merging `my-lists.html`, preserve the separately implemented server-backed main content. The design change is confined to the shared head, brand images, footer, newsletter and accessible static field labels. Do not overwrite new list/plan behavior with this candidate's baseline.

The loopback-only `web/frontend-tests/design-preview.cjs` is an optional synthetic local fixture, not production code. It supports `?guest=1` and `?fixture=1`, and a responsive frame at `/_qa?route=/&width=390`. External connections are blocked by its content security policy.
