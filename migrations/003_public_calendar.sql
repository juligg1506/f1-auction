-- Apply once after checking PRAGMA table_info(races).
ALTER TABLE races ADD COLUMN calendar_visible INTEGER NOT NULL DEFAULT 0 CHECK(calendar_visible IN (0,1));
CREATE INDEX IF NOT EXISTS races_calendar ON races(season, calendar_visible, race_date, id);
