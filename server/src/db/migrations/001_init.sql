CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grad_year TEXT,
  grade_2026 INTEGER,
  birth_date TEXT,
  role TEXT NOT NULL CHECK (role IN ('Swimmer', 'Diver', 'Adult')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_participants_last_name ON participants (last_name);
CREATE INDEX IF NOT EXISTS idx_participants_role ON participants (role);
CREATE INDEX IF NOT EXISTS idx_participants_active ON participants (active);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('trip_date', '2026-02-12');
