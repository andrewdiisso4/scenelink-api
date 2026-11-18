'use strict';
// SceneLink's current event directory is Boston-local. Expiry is a read filter,
// not a destructive cleanup: event/source records and RSVP history are retained.
// Use the database clock with an explicit IANA zone, independent of DB/session
// timezone and DST. A dated event remains current until the next local midnight.
const EVENT_TIME_ZONE = 'America/New_York';
const EVENT_TODAY_SQL = `(CURRENT_TIMESTAMP AT TIME ZONE '${EVENT_TIME_ZONE}')::date`;
module.exports = { EVENT_TIME_ZONE, EVENT_TODAY_SQL };
