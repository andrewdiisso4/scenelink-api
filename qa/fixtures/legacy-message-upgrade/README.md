# Synthetic upgrade fixtures

These fixtures contain schema only, never user data or credentials. Historical schema and compliance SQL are pinned to andrewdiisso4/scenelink-api commit f852f97d69414cab819ca916fb67599d1159b57a. Migrations002–006 in the reviewed candidate have identical Git blob hashes to that commit.013-before-compat.sql is the reviewed candidate before the INSERT shim; it exists only to reproduce the previous failure in the disposable test database. It must not be installed as a production migration.

SHA256.json records content digests. The regression also embeds and checks these hashes, so unreviewed fixture changes fail. Historical SQL writer shapes are embedded directly in qa/legacy-message-upgrade.mjs. No GitHub or production service is contacted by the test.

All users, venues, posts and messages are freshly generated synthetic test records using example.invalid identities. The oldAPI HAZARD assertions intentionally prove that the shim does NOT make mixed-version privacy/session/profile behavior safe.
