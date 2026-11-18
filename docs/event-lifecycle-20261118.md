# Boston event lifecycle

The current city directory treats `events.date` as the Boston local calendar date.
Upcoming listings and new RSVP writes include that entire date, then exclude it
at the following America/New_York midnight (DST-aware). Concierge retrieval and
admin upcoming/past filters use the same database-clock expression. This does not
set `is_active=false`, delete an event, or erase any RSVP/source-review history.
Explicit include_past requests, detail history, and My RSVPs remain available under
existing source-review/privacy rules. Already rendered pages update on their next
request; this change does not add a client midnight timer. Multi-day event support
needs a reviewed end-date contract before importing such events as multi-day.

## Automatic additions are NOT enabled

`event-ingestion-job` currently stages Ticketmaster observations, with bounded
requests, leases and source-status evidence. `qa/run-event-ingestion.cjs` refuses
non-loopback/non-disposable databases and is not a production scheduler. Staged
records do not enter public `events` or acquire a source-reviewed status merely
because an API returned them. A missing result or provider outage is not proof of
cancellation and must not delete source records or RSVP history.

Production activation still needs a verified production backup/restore path,
authorization for source/account/configuration and permitted API usage, a reviewed
promotion/cancellation/rescheduling contract, native PostgreSQL integration gates,
and an actual scheduler with failure reporting. No provider calls, new credentials,
schema migration, production DB writes or scheduled jobs are performed by this
calendar correction. Do not claim automatic imports are live on its basis.
