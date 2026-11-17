-- PROPOSAL ONLY. Not in startup migrations. Requires explicit release/schema approval.
-- No user identifiers, prompts, credentials or response bodies are stored.
CREATE TABLE IF NOT EXISTS concierge_ai_daily_quota (
  quota_day date PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0)
);
