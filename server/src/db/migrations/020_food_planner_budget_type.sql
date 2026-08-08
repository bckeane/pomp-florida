-- Fourth budget row type: 'food_planner' — a day-by-day cash-envelope table
-- (date, budget, cash, meals covered, notes) whose sum is a per-PARTICIPANT
-- rate, not a trip-wide lump sum — the committee's real spreadsheet prices
-- food per swimmer/diver per day. Computed the same way 'per_swimmer' is
-- (rate × students), except the rate is this live sum instead of a
-- hand-typed number (see computeSingleAmount in budget.js).
--
-- Same table-rebuild requirement as migration 018 (SQLite can't ALTER a
-- CHECK constraint, and trip_budget_exclusions FK-references this table).
CREATE TABLE trip_budget_exclusions_backup AS SELECT * FROM trip_budget_exclusions;
DROP TABLE trip_budget_exclusions;

CREATE TABLE trip_budget_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  category_id INTEGER NOT NULL REFERENCES budget_categories(id),
  total INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'totals' CHECK (type IN ('totals', 'per_swimmer', 'service_charge', 'food_planner')),
  rate_per_athlete INTEGER,
  percent_rate REAL,
  student_count_override INTEGER,
  UNIQUE (trip_id, category_id)
);
INSERT INTO trip_budget_items_new (id, trip_id, category_id, total, type, rate_per_athlete, percent_rate, student_count_override)
  SELECT id, trip_id, category_id, total, type, rate_per_athlete, percent_rate, student_count_override FROM trip_budget_items;
DROP TABLE trip_budget_items;
ALTER TABLE trip_budget_items_new RENAME TO trip_budget_items;

CREATE UNIQUE INDEX idx_trip_budget_items_one_service_charge
  ON trip_budget_items (trip_id)
  WHERE type = 'service_charge';

CREATE TABLE trip_budget_exclusions (
  trip_budget_item_id INTEGER NOT NULL REFERENCES trip_budget_items(id),
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  PRIMARY KEY (trip_budget_item_id, participant_id)
);
INSERT INTO trip_budget_exclusions SELECT * FROM trip_budget_exclusions_backup;
DROP TABLE trip_budget_exclusions_backup;

-- Independent of the rebuild above — a fresh table needs no CHECK widening.
-- Not linked to a single category; any 'food_planner' row (any category, any
-- trip year) can have its own set of daily rows.
CREATE TABLE trip_budget_daily_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_budget_item_id INTEGER NOT NULL REFERENCES trip_budget_items(id),
  date TEXT NOT NULL,
  budget INTEGER NOT NULL DEFAULT 0,
  cash INTEGER NOT NULL DEFAULT 0,
  meals_covered TEXT,
  notes TEXT,
  UNIQUE (trip_budget_item_id, date)
);
