# Separate PR55 QA

`render-pr55.yaml` describes a new synthetic acceptance environment. Keep the
existing email-acceptance service `srv-dc2b7nifngtc73bbu81g` and its database intact.
No provider credentials, production data, environment groups, or secret files
belong in this environment.

## Source and plan review

1. Reconcile PR55 with current main, complete candidate checks, and include this
   Blueprint and the final acceptance launcher in the same reviewed source tree.
2. Publish `qa/profile-social-pr55-20261128` at that exact candidate and record its
   full SHA in the acceptance evidence. Freeze the branch for the QA run: the
   Blueprint's `branch` field is a branch reference, not a commit-SHA lock.
3. Validate with an authenticated Render CLI in the confirmed workspace:

   ```sh
   render blueprints validate qa/acceptance/render-pr55.yaml \
     --workspace tea-d7aoksma2pns73dv3iog --output json
   ```

   CLI v2.39.0 requires authentication for this operation. Local JSON-schema and
   application-guard validation do not replace the platform plan review.
4. For the Render planning tool, use these arguments:

   ```json
   {
     "workspaceId": "tea-d7aoksma2pns73dv3iog",
     "repoUrl": "https://github.com/andrewdiisso4/scenelink-api",
     "branch": "qa/profile-social-pr55-20261128",
     "path": "qa/acceptance/render-pr55.yaml",
     "name": "scenelink-pr55-qa-20261128",
     "autoSync": false,
     "existingResources": "create_new"
   }
   ```

5. Review the returned plan before approval. It must create only a separate free
   web service, paid PostgreSQL instance, and their project/environment. Stop if
   it modifies existing resources, changes the selected plans, or cannot resolve
   the frozen source branch. Planning alone does not apply these resources.

## Cost and storage

As checked on 2026-11-28, [Render pricing](https://render.com/pricing.md) lists the
free web service at $0/month and PostgreSQL `0.1c-256mb` at $6/month. PostgreSQL
storage is $0.30/GB; 1 GB gives an estimated $6.30/month resource baseline before
taxes or other usage charges. Compute is prorated to the second. The current
[Blueprint specification](https://render.com/docs/blueprint-spec.md#disksizegb)
allows `diskSizeGB: 1`; omitting it would default this plan to 15 GB. Storage
autoscaling is disabled. The workspace's existing free database remains in use,
so this plan does not request another free database. Record a cleanup owner and
remove only this disposable environment after the acceptance evidence is kept.
The free web service shares the workspace's [750 monthly free instance
hours](https://render.com/docs/free.md#free-instance-hours) and can have a cold
start after idle time; plan acceptance runs around those limits.

## Guard and credential checks

- `fromDatabase` resolves all three database bindings to the same new private
  database; `ipAllowList: []` blocks public database connections. Both resources
  use Virginia. This is not a claim of cross-environment private-network isolation.
- The requested database name `scenelink_release_qa_20261123_pr55` passes the guard.
  Inspect the actual planned name before approval: the runtime allows only
  `^scenelink_release_qa_20261123(?:_[a-z0-9]{1,16})?$`. An additional underscore
  suffix such as `_pr55_abcd` fails and must be reconciled before applying.
- Render may suffix resource names. Service/origin suffixes are supported by the
  guard. Keep `ACCEPTANCE_ENVIRONMENT_ID` unchanged and use Render's supplied
  external URL; do not hardcode a guessed public origin.
- Render generates independent 256-bit base64 values for the JWT secret, access
  gate secret, and fixture password. Their 44-character encoding fits the existing
  guard and bcrypt limits. Retrieve them only through the authorized secret
  workflow; never put their values in evidence, logs, or repository files.
- After creation, verify the live `RENDER_GIT_COMMIT` matches the frozen SHA, the
  public health endpoint responds, and the gate requires its separate secret.
  Use the seeded fictional accounts. First boot seeds once; restarts preserve
  fixture changes. Mail, external providers, model calls, and service workers
  remain disabled, so this run cannot certify inbox delivery or live-model behavior.
