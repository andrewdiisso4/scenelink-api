'use strict';
const {availableVenueSQL} = require('./venue-helpers');
/** Discovery ONLY. Never use for saved references, direct details, events or writes.
 * to_jsonb keeps pre-017 schemas readable. Missing/invalid evidence fails visible.
 * A closed, missing, changed or itself-aliased canonical never hides this row.
 */
function visibleDiscoveryVenueSQL(alias = 'v') {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias) || alias === 'duplicate_canonical') throw new Error('Explicit safe outer venue alias required');
  const r=`(to_jsonb(${alias})->'duplicate_review')`;
  const identity=a=>`jsonb_build_object('name',${a}.name,'address',${a}.address,'city',${a}.city)`;
  return `NOT EXISTS (
    SELECT 1 FROM venues duplicate_canonical
    WHERE duplicate_canonical.id::text = to_jsonb(${alias})->>'duplicate_of'
      AND duplicate_canonical.id <> ${alias}.id
      AND ${availableVenueSQL('duplicate_canonical')}
      AND NULLIF(to_jsonb(duplicate_canonical)->>'duplicate_of','') IS NULL
      AND ${r}->>'status' = 'reviewed_duplicate'
      AND ${r}->>'canonical_id' = duplicate_canonical.id::text
      AND ${r}->'alias_identity' = ${identity(alias)}
      AND ${r}->'canonical_identity' = ${identity('duplicate_canonical')}
  )`;
}
module.exports={visibleDiscoveryVenueSQL};
