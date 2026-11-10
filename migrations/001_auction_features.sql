-- Additive migration. No existing rows, budgets, or assignments are changed.
CREATE TABLE IF NOT EXISTS auction_queue (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 driver_id INTEGER NOT NULL REFERENCES drivers(id),
 starting_price INTEGER NOT NULL CHECK(starting_price >= 250000 AND starting_price % 250000 = 0),
 scheduled_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','started','cancelled')),
 auction_id INTEGER REFERENCES auctions(id),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS auction_queue_pending_driver ON auction_queue(driver_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS auction_queue_due ON auction_queue(status, scheduled_at, id);
CREATE TABLE IF NOT EXISTS auction_notifications (
 event_key TEXT PRIMARY KEY,
 auction_id INTEGER NOT NULL REFERENCES auctions(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('started','ended')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL,
 lease_until TEXT,
 sent_at TEXT
);
