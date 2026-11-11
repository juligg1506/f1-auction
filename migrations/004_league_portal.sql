CREATE TABLE IF NOT EXISTS league_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 season TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO league_settings(id,season) VALUES(1,NULL);
CREATE TABLE IF NOT EXISTS league_content (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 kind TEXT NOT NULL CHECK(kind IN ('news','rules')),
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 published_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS league_one_rules ON league_content(kind) WHERE kind='rules';
CREATE INDEX IF NOT EXISTS league_public_content ON league_content(kind,status,published_at,id);
