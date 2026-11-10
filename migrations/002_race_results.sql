-- Additive migration: auction tables and budgets remain unchanged.
CREATE TABLE IF NOT EXISTS races (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 season TEXT NOT NULL,
 name TEXT NOT NULL,
 race_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS races_identity ON races(season, name COLLATE NOCASE, race_date);
CREATE INDEX IF NOT EXISTS races_season_date ON races(season, status, race_date, id);
CREATE TABLE IF NOT EXISTS race_results (
 race_id INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
 driver_id INTEGER NOT NULL REFERENCES drivers(id),
 driver_name TEXT NOT NULL,
 team_id INTEGER REFERENCES teams(id),
 team_name TEXT,
 position INTEGER CHECK(position BETWEEN 1 AND 60),
 status TEXT NOT NULL CHECK(status IN ('classified','dnf','dns','dsq')),
 points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
 PRIMARY KEY(race_id, driver_id),
 UNIQUE(race_id, position),
 CHECK((status = 'classified' AND position IS NOT NULL) OR (status != 'classified' AND position IS NULL))
);
CREATE INDEX IF NOT EXISTS race_results_driver ON race_results(driver_id, race_id);
