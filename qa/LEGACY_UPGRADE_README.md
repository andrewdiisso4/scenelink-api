# Portable013 compatibility regression

Copy this directory's qa/ contents into the backend repository beside its existing qa/ files. Use with the separately reviewed013 INSERT compatibility migration. No embedded-postgres package or absolute workspace path is needed by these files.

Requirements: Node24.22.1, normal backend npm dependencies, and an already-created NEW EMPTY disposable PostgreSQL18.3 database on literal127.0.0.1 or::1, with explicit port and a name matching scenelink_test_[a-z0-9_]+. CI can provide a PostgreSQL service container published to localhost. Database credentials stay in CI secret/environment configuration, never arguments or logs.

Run from the backend with TEST_DATABASE_URL configured:

    SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes node qa/legacy-message-upgrade.mjs

Optional package script:

    "test:upgrade": "node qa/legacy-message-upgrade.mjs"

Default expected server version is18.3; QA_EXPECTED_PG_VERSION can explicitly select another native version for supplementary tests. The test rejects remote hosts, absent ports, non-test database names, query/fragment overrides, a backend.env file, and nonempty public schemas. It never drops the supplied database or preexisting tables. Run existing connected-launch-integration.cjs against a DIFFERENT fresh database, because this test intentionally leaves its synthetic records for inspection until CI destroys the disposable service.

Coverage:24 checks spanning pinned old schema,007–012 old INSERT compatibility, original013 failure, hash-only cursor-loss failure, reviewed shim, populated migration reruns, legacy signup/post/checkin SQL, three clearly labeled oldAPI policy hazards, concurrent old/new writers,12 simultaneous legacy writers, atomic rollback, and actual candidate HTTP edit/delete/send/retry/change-sync semantics. The concurrency assertion observes pg_stat_activity lock waiting before releasing the canonical transaction. Normal PostgreSQL users can inspect their own sessions.

A passing result is storage-compatibility evidence, NOT approval for a rolling production release. The oldAPI HAZARD passes deliberately demonstrate privacy/session/profile incompatibilities that still require a coordinated old-writer cutover.
