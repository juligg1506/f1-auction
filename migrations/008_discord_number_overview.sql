CREATE TABLE IF NOT EXISTS discord_number_overview (
 channel_id TEXT PRIMARY KEY,
 message_id TEXT,
 content_hash TEXT,
 generation INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT
);
