'use strict';

// Source labels and completeness scores are not field verification. Only a
// reviewed fact whose recorded value still matches may support a public claim.
const {isDeepStrictEqual} = require('node:util');
const FIELDS = new Set(['name','address','city','state','zip_code','neighborhood','website','phone','hours_display','hours_json','lat','lng','price_level','price_label']);
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value &&
    value <= new Date().toISOString().slice(0,10);
}
function fieldEvidence(row, safeUrl) {
  const source = row.field_provenance;
  const out = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const [field, evidence] of Object.entries(source)) {
    if (!FIELDS.has(field) || !Object.hasOwn(row,field) || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)) continue;
    if (evidence.status !== 'reviewed' || !validDate(evidence.observed_at) || !safeUrl(evidence.source_url)) continue;
    // pg returns NUMERIC coordinates as strings; compare their numeric value
    // without treating an empty/missing coordinate as zero.
    const value = ['lat','lng'].includes(field) && typeof row[field] === 'string' && row[field].trim() !== '' ? Number(row[field]) : row[field];
    if (!isDeepStrictEqual(evidence.value,value)) continue;
    out[field] = {status:'reviewed',value,source_url:safeUrl(evidence.source_url),observed_at:evidence.observed_at};
  }
  return out;
}

// JSON extraction keeps this read path compatible with the pre-provenance
// schema. The separate reviewed-correction migration need not run to suppress
// the old default $$ claims. SQL must never cast arbitrary provider strings.
function reviewedPriceSQL(alias = 'v') {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  const p = `(to_jsonb(${alias})->'field_provenance'->'price_level')`;
  return `(CASE WHEN ${alias}.price_level BETWEEN 1 AND 4 AND ${p}->>'status'='reviewed'
    AND ${p}->'value'=to_jsonb(${alias}.price_level)
    AND ${p}->>'source_url' ~ '^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(:443)?(/[^[:space:]]*)?$'
    AND CASE WHEN ${p}->>'observed_at' ~ '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$'
      AND ${p}->>'observed_at' >= '0001-01-01'
      THEN to_char(make_date(substring(${p}->>'observed_at',1,4)::int,substring(${p}->>'observed_at',6,2)::int,1)
        + (substring(${p}->>'observed_at',9,2)::int-1),'YYYY-MM-DD') = ${p}->>'observed_at'
        AND ${p}->>'observed_at' <= to_char(CURRENT_DATE,'YYYY-MM-DD')
      ELSE false END
    THEN ${alias}.price_level ELSE NULL END)`;
}

function generatedDescription(row) {
  if (!['osm','openstreetmap'].includes(row.source)) return false;
  return typeof row.description === 'string' && row.description ===
    `${row.name} — a popular ${String(row.category || '').toLowerCase()} in ${row.neighborhood}.`;
}

module.exports = {fieldEvidence,reviewedPriceSQL,generatedDescription,validDate};
