# Inactive local staging import only

This tool does not provide a production import or activation mode. It does not download data. The existing unmounted adminVenues HTTP route is deliberately not exposed.

Inputs must be the Overture mapper's candidate-import.json, provenance.json and report.json, plus the reviewed license/NOTICE texts before applying. They are prepared separately by `venue-bulk-candidate/prepare_overture.py`; this repo does not contain a new real venue batch. A provider release is not independent proof that a venue is currently open.

Default dry-run (no database connection):

    node qa/tools/stage-venue-import.cjs /absolute/reviewed-candidate

It validates 1–5000 source records, full source IDs and explicit Massachusetts address/coordinates within the planned bbox, allowed categories, confidence range, source metadata, known closure exclusion, and null unverified metrics/photos/hours. It prints candidate SHA and count; it never claims production readiness.

For an authorized LOCAL staging rehearsal only:
1. Initialize a fresh local database named scenelink_import_<name>, using schema and reviewed migrations through011. Do not use a production URL, `.env`, Render database or real user data.
2. Preserve source download, complete license/NOTICE texts, mapper output and hashes; manually review examples and held duplicates. No automatic data-source license conclusion is made by checking a file exists.
3. Set NODE_ENV=test, SCENELINK_ALLOW_LOCAL_IMPORT=yes, and IMPORT_DATABASE_URL securely to that localhost database. Never paste or log a connection secret.
4. Pass --apply --reviewed-sha EXACT_DRY_RUN_SHA --notices /path/to/reviewed-license-notices.txt.

CLI refuses non-local DBs, production NODE_ENV, unexpected DB names or query-string connection overrides. Exported apply also checks the target; the isolated QA harness has a narrow additional allowance for its already guarded localhost scenelink_test_* database.

Migration011 adds external_id and source-record/batch audit tables; it imports no data. Apply holds a transaction-scoped advisory lock and uses an insert-only transaction with lock/statement deadlines. Existing source IDs or exact case/whitespace-normalized name+city+address are skipped without any row/source-ID overwrite. Same-brand different-address venues are not merged by neighborhood. Full provenance, source report and download/candidate/provenance/NOTICE hashes are retained. New rows are INACTIVE and need manual review; unknown rating/count/price/activity/open-now values stay NULL. Transaction errors roll back the complete batch and discard the client rather than reusing a failed connection.

This is not fuzzy/geospatial cross-source reconciliation. Existing duplicates, nearby same-name venues and conflicting operator facts still require manual review. Activation is an independent reviewed action, not supported by this tool. No cleanup/deletion of successful batches is automated. Batch IDs provide an audit list for later approved reconciliation.

Tests use fictional fixtures only. Native PostgreSQL proof remains gated by the execution environment/GitHub write denial; PostgreSQL-WASM coverage is supplemental, not native concurrent-isolation evidence.
