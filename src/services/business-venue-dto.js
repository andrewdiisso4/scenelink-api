'use strict';
const {fieldEvidence} = require('./venue-facts');
const {safePublicHttps} = require('./venue-helpers');

/** Owner editing view, not the consumer display policy. Keep editable stored
 * values unchanged, but never expose internal review notes or duplicate links.
 * Apply at every business venue response, even today's narrow SELECTs, so later
 * projection changes cannot accidentally expose the review columns.
 */
function businessVenue(row) {
  if (row == null) return null;
  const venue = {...row};
  delete venue.duplicate_of;
  delete venue.duplicate_review;
  const evidence = fieldEvidence(row, safePublicHttps);
  venue.field_provenance = evidence;
  venue.reviewed_fields = Object.keys(evidence).sort();
  return venue;
}
module.exports = {businessVenue};
