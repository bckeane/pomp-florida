CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year TEXT NOT NULL,
  name TEXT NOT NULL,
  trip_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO trips (year, name, trip_date, created_at)
SELECT '2026', 'Florida Trip 2026', COALESCE((SELECT value FROM settings WHERE key = 'trip_date'), '2026-02-12'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM trips);

ALTER TABLE participants ADD COLUMN trip_id INTEGER REFERENCES trips(id);

UPDATE participants SET trip_id = (SELECT id FROM trips ORDER BY id LIMIT 1) WHERE trip_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_participants_trip_id ON participants (trip_id);

INSERT INTO settings (key, value)
SELECT 'current_trip_id', CAST((SELECT id FROM trips ORDER BY id LIMIT 1) AS TEXT)
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'current_trip_id');

DELETE FROM settings WHERE key = 'trip_date';
