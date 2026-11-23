# Admin portal account acceptance

This repair builds on PR #31 at `1c19127e1a96a743807338cf436e1c27e7de6ccb`. It addresses account access and session ownership. The supported portal controls remain those in PR #31; venue imports, source approval and public activation are separate release decisions.

## Local verification — November 23, 2026

- 178 backend regressions, 589 frontend checks and 40 social VM checks passed.
- The frontend total includes 14 new tests with the shipped authentication module and six existing admin contracts. The signed-out regression fails against the original PR #31 controller and passes against this repair.
- All 106 native integration checks passed on disposable PostgreSQL 18.3, including seven admin DOM/API cases. The admin portion used 30 fictional accounts, one inactive venue and four individual flag writes, with the flags restored afterward. Protected reads and writes used real HTTP and JWT sessions. External fetches and redirects were forbidden.
- The native run verified unchanged SHA256 hashes for its HTML, authentication/controller scripts and both integration modules. It stopped and removed its disposable database cluster afterward.

These are local results. Consult the exact pull-request head's GitHub Actions run for its separate CI result.

## Reproduce the checks

Install the locked backend and frontend dependencies with the Node version in `.node-version`:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix web
npm test --prefix web
```

The existing native API job also runs the admin page, shipped authentication module and portal controller against the real local Express API. Use a newly created, empty PostgreSQL database on literal loopback with an explicit port and a name beginning with `scenelink_test_`.

```sh
SCENELINK_API_ROOT="$PWD" \
SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes \
TEST_DATABASE_URL=postgresql://postgres:local_test_password@127.0.0.1:5432/scenelink_test_admin \
node --unhandled-rejections=strict qa/connected-launch-integration.cjs
```

The harness refuses a remote connection, URL query overrides, a nonempty public schema, or a checkout containing `.env`. It creates fictional accounts and venues, disables email and external-provider credentials, and exercises real JWT sessions and SQL. Its account and venue writes must never run against a production or shared database. The CI API job provisions its own disposable PostgreSQL service.

## Hosted acceptance remains a separate gate

Before a hosted run, record the frontend commit, API commit, exact test frontend URL and isolated API/database identity. Confirm the frontend's API requests terminate at that isolated API: the normal Netlify preview configuration routes `/api/*` to production. Do not use that preview for mutation tests.

Use fictional admin and member accounts and one synthetic venue. Start in a clean browser and verify:

1. A signed-out visitor sees the sign-in form without protected data requests. Sign in with the test admin, then reload Overview and Users.
2. Search Users by email, display name and username. Check totals and first/last pages. A failed search or capability rollback must display the fallback state accurately.
3. Edit Featured and Trending independently on the synthetic venue. Verify each saved value after a fresh session and restore the fixture's original values. A rejected or unconfirmed save must report failure.
4. A member, revoked token or expired token cannot read or modify protected data. Sign out while a read is pending; old results must not restore the protected view.
5. A temporary session-verification outage must leave the portal locked and allow a retry. A cached admin role is not sufficient for entry.
6. Repeat the account and navigation flow in physical iPhone Safari. Record iOS/browser version and redacted results.

Local DOM automation and native database checks do not establish a hosted preview, production deployment, real inbox delivery or physical-device acceptance. Merge and deployment require Andrew's approval of the exact proposed actions.
