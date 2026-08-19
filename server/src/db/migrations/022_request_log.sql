-- Traffic log populated by middleware/requestLog.js. No IP address or user
-- agent is stored — this app is used mostly by families of minors, and
-- path/method/status/account is enough to answer "who's using what."
CREATE TABLE request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_request_log_created_at ON request_log (created_at);
CREATE INDEX idx_request_log_path ON request_log (path);
