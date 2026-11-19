# Offline staged event review
This experiment is not enabled in production or on remote databases. No provider collection configuration or scheduler is changed. It does not affect the existing manual event-create route or process direct organizer events.

With Node 24 and repository dependencies installed, create an **empty, disposable PostgreSQL 18.3** database on 127.0.0.1 with a non-default port and database name `scenelink_test_event_review`. Set only the following test-specific context, using generated local credentials; do not place a `.env` in the checkout:

```sh
NODE_ENV=test SCENELINK_TEST_ALLOW_SCHEMA_INIT=yes \
  TEST_DATABASE_URL='<disposable-loopback-postgresql-connection-string>' \
  node qa/event-ingestion-review-native.cjs
```

The harness refuses non-loopback, non-empty, or unexpected databases. It installs both QA schema files and the catalog review dependency in the disposable test database, creates fictional rows and real signed-in test sessions, verifies visible outcomes through the HTTP API, and makes no provider calls. Discard the test database afterward. Do not add these QA schema files to the application startup migration list.

The reviewed source is identified by Ticketmaster occurrence ID, not title or date. An operator must explicitly approve the exact current signed-in session preview revision and choose the single active canonical venue whose Boston name, address, and postal code match the source. Retried review creates no duplicate event or audit row. Date corrections keep the ID and RSVPs; reviewed cancellation hides the event but retains history. Manual changes, duplicate venue matches, existing legacy identities, ambiguous source data and attempted reactivation after cancellation are held.

A future production release needs validated provider usage rights, real reviewed samples, exact identity collision review, a tested backout plan, and a production review interface and enablement plan. The experiment deliberately does not provide those.
