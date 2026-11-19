# Concierge AI guardrails: local proposal, NOT activated

## Verified runtime metadata
Render service srv-d7aspskvjg8s73emqoo0 is Node, branch main, not suspended, auto-deploy off. The supported read-only service response exposes no environment-variable names or values. This does not establish whether an API key, model, budget, or provider billing is configured. No secret read, credential change, provider call or Render sign-in attempted.

## Candidate controls
- A key alone no longer enables this candidate's provider path. It requires explicit CONCIERGE_AI_ENABLED=true and valid CONCIERGE_AI_DAILY_REQUEST_LIMIT in 1..10000. Missing/invalid config stays rule-based.
- One PostgreSQL UTC daily counter atomically reserves each attempted call before dispatch. All concierge instances using this database share it. Failures/timeouts retain their reservation because the provider may have charged. Missing table/database errors deny dispatch, never bypass it.
- The counter stores only date and attempt count, no prompts, user IDs, keys or responses. Quota reservation is not reset on app restart. Lowering the configured cap cannot refund consumed attempts.
- Request JSON <=24000 UTF-8 bytes; output config is bounded to100..1000 tokens (default700); timeout1..20seconds (default15) remains active through response-body parsing. Existing messages/history/candidate bounds remain.
- store:false disables Responses application response storage; it does NOT mean Zero Data Retention or eliminate provider abuse-monitoring retention. No account profile/favorites are sent. Provider error bodies are not retained in exceptions.

## Limits, not overclaims
This is a hard concierge request-attempt cap, NOT a dollar cap, rolling24-hour limit, or global OpenAI-project cap. Prices/model changes, midnight rollover, other endpoints/apps and already-running old builds must be considered separately. The existing support route and any other provider usage are outside this counter. PGlite tests validate SQL and competing promise calls but are not native multi-connection concurrency proof. Native PostgreSQL CI test is required before deployment. qa/concierge-quota-native.cjs and the isolated quota CI job now test 20 distinct backend connections against a seven-attempt cap and reconnect persistence. Native execution is pending; no local PostgreSQL installation is available.

## Deployment / activation gates
1. Keep production unchanged until explicit release/schema decision. Proposed SQL is deliberately in qa/proposed-migrations, outside automatic startup migration directories.
2. Establish current recoverable production backup/restore readiness before any schema mutation; canceled Render browser sign-in is not retried or bypassed. The venue import remains blocked separately.
3. Verify model, pricing and provider project limits without disclosing credentials; agree maximum daily requests and spending scope. Never assume sample values authorize spend.
4. Apply approved schema, deploy guarded code to every concierge instance with flag disabled. Verify missing quota/disabled paths cannot fetch and fallback remains useful.
5. Only after scope approval set the bounded flag/cap. If permitted, run one explicitly budgeted non-personal smoke prompt, verify grounded IDs and quota consumption. No smoke call has been performed.
6. Kill switch is CONCIERGE_AI_ENABLED=false. Keep counter rows; deleting today's row resets allowance. Do not truncate/refund casually. Roll back to guarded disabled code rather than old unguarded code while provider credentials remain active.

## Official references checked Nov17 2026
- https://developers.openai.com/api/reference/resources/responses/methods/create : store defaults true and controls later retrieval.
- https://developers.openai.com/api/docs/guides/your-data : distinguishes application state from abuse monitoring; store:false is not a claim of account ZDR.
