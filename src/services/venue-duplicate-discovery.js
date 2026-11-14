'use strict';
const {availableVenueSQL} = require('./venue-helpers');
/** Discovery ONLY. Never use for saved references, direct details, events or writes.
 * to_jsonb keeps pre-017 schemas readable. Missing/invalid evidence fails visible.
 * A closed, missing, changed or itself-aliased canonical never hides this row.
 */
function visibleDiscoveryVenueSQL(alias = 'v') {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias) || alias === 'duplicate_canonical') throw new Error('Explicit safe outer venue alias required');
  const metadata=alias.toLowerCase()==='duplicate_metadata'?'duplicate_metadata_alt':'duplicate_metadata';
  const candidate=alias.toLowerCase()==='duplicate_candidate'?'duplicate_candidate_alt':'duplicate_candidate';
  const r=`(${metadata}.record->'duplicate_review')`;
  const identity=a=>`jsonb_build_object('name',${a}.name,'address',${a}.address,'city',${a}.city)`;
  // Without a target, the equality in the subquery cannot match. Keep that
  // common pre-017/null case out of the canonical scan. Materializing the
  // non-null target avoids repeatedly serializing the outer wide row when a
  // canonical is missing. Only the matched canonical needs JSON inspection.
  // Empty/malformed targets and every original validity check are preserved.
  return `(to_jsonb(${alias})->>'duplicate_of' IS NULL OR NOT EXISTS (
    WITH ${metadata} AS MATERIALIZED (SELECT to_jsonb(${alias}) AS record),
    ${candidate} AS MATERIALIZED (
      SELECT duplicate_canonical.* FROM venues duplicate_canonical
      WHERE duplicate_canonical.id::text = (SELECT record->>'duplicate_of' FROM ${metadata})
        AND duplicate_canonical.id <> ${alias}.id
        AND ${availableVenueSQL('duplicate_canonical')}
    )
    SELECT 1 FROM ${candidate} duplicate_canonical CROSS JOIN ${metadata}
    WHERE NULLIF(to_jsonb(duplicate_canonical)->>'duplicate_of','') IS NULL
      AND ${r}->>'status' = 'reviewed_duplicate'
      AND ${r}->>'canonical_id' = duplicate_canonical.id::text
      AND ${r}->'alias_identity' = ${identity(alias)}
      AND ${r}->'canonical_identity' = ${identity('duplicate_canonical')}
  ))`;
}
module.exports={visibleDiscoveryVenueSQL};
