-- D1 is the authoritative overlay; existing KV entries remain readable until expiry.
CREATE TABLE IF NOT EXISTS session_storage (
 key TEXT PRIMARY KEY,
 value TEXT,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_storage_expiry ON session_storage(expires_at);
CREATE TABLE IF NOT EXISTS kv_write_budget (
 day TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 1000)
);
-- Existing usage cannot be counted reliably from delayed KV analytics.
-- No further KV writes on the UTC day this migration is applied.
INSERT INTO kv_write_budget(day,attempts) VALUES(date('now'),1000)
ON CONFLICT(day) DO UPDATE SET attempts=1000;
