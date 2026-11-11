ALTER TABLE drivers ADD COLUMN racing_number INTEGER CHECK(racing_number IS NULL OR (typeof(racing_number)='integer' AND racing_number BETWEEN 1 AND 99));
CREATE UNIQUE INDEX drivers_unique_racing_number ON drivers(racing_number) WHERE racing_number IS NOT NULL;
CREATE TABLE discord_number_sync (
 channel_id TEXT PRIMARY KEY,
 last_message_id TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 next_poll_at TEXT,
 last_checked_at TEXT,
 last_error TEXT
);
-- Start with new messages; historical posts never retroactively assign numbers.
INSERT INTO discord_number_sync(channel_id,last_message_id)
VALUES('1570008456981905460',CAST((unixepoch('now')*1000-1420070400000)*4194304 AS TEXT));
CREATE TABLE discord_number_commands (
 message_id TEXT PRIMARY KEY,
 channel_id TEXT NOT NULL REFERENCES discord_number_sync(channel_id),
 discord_id TEXT NOT NULL,
 requested_number INTEGER,
 outcome TEXT NOT NULL CHECK(outcome IN ('accepted','taken','unknown_driver','invalid')),
 created_at TEXT NOT NULL,
 delivered_at TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL
);
CREATE INDEX discord_number_replies_due ON discord_number_commands(delivered_at,next_attempt_at,message_id);
