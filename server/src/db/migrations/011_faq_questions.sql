-- Public FAQ / question inbox. Parents can submit questions without sending
-- email; admins answer them later and the FAQ page shows pending questions
-- until a response is added.
CREATE TABLE faq_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  asker_name TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  answered_at TEXT,
  CHECK (length(trim(question)) > 0)
);

CREATE INDEX idx_faq_questions_trip_created_at ON faq_questions(trip_id, created_at DESC);
