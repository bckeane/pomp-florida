CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions (account_id);

-- Nullable: admin-created participants have no account. Participants added
-- through the public /register flow are always tied to the account that
-- registered them, so one account can register multiple students.
ALTER TABLE participants ADD COLUMN account_id INTEGER REFERENCES accounts(id);

CREATE INDEX IF NOT EXISTS idx_participants_account_id ON participants (account_id);
