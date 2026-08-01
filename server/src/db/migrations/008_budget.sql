-- Admin Budget Tab (see office-hours design doc, Approach B: reference-table
-- categories). Category names/totals below come from the committee's real
-- "Budget" tab in FloridaTrip2026.xlsx, confirmed cell-by-cell against the
-- full sheet (not just the earlier screenshot) before writing this seed data.
-- Totals are rounded to whole dollars per Premise 6 (matches deposit_amount/
-- cost_low/cost_high, which are already whole-dollar INTEGER columns).
CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  retired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trip_budget_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  category_id INTEGER NOT NULL REFERENCES budget_categories(id),
  total INTEGER NOT NULL DEFAULT 0,
  UNIQUE (trip_id, category_id)
);

CREATE TABLE IF NOT EXISTS trip_budget_exclusions (
  trip_budget_item_id INTEGER NOT NULL REFERENCES trip_budget_items(id),
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  PRIMARY KEY (trip_budget_item_id, participant_id)
);

INSERT INTO budget_categories (name, sort_order) VALUES
  ('Airfare', 10),
  ('Hotel', 20),
  ('Buses', 30),
  ('Pool', 40),
  ('Food', 50),
  ('Overrun', 60),
  ('Bfast', 70);

-- 2025 has no trip row yet (migration 002 only seeded 2026) but the
-- spreadsheet's 2025 column is real, closed-out actuals — backfilled here
-- purely so the Diff/prior-year columns have something to compare the 2026
-- row against. No participants are attached to this trip.
INSERT INTO trips (year, name, trip_date, created_at)
SELECT '2025', 'Florida Trip 2025', '2025-02-13', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM trips WHERE year = '2025');

INSERT INTO trip_budget_items (trip_id, category_id, total)
SELECT t.id, c.id, v.total
FROM (
  SELECT '2025' AS year, 'Airfare' AS category, 14959 AS total UNION ALL
  SELECT '2025', 'Hotel', 19799 UNION ALL
  SELECT '2025', 'Buses', 1250 UNION ALL
  SELECT '2025', 'Pool', 3360 UNION ALL
  SELECT '2025', 'Food', 9300 UNION ALL
  SELECT '2025', 'Overrun', 0 UNION ALL
  SELECT '2025', 'Bfast', 5041 UNION ALL
  SELECT '2026', 'Airfare', 18484 UNION ALL
  SELECT '2026', 'Hotel', 20445 UNION ALL
  SELECT '2026', 'Buses', 1565 UNION ALL
  SELECT '2026', 'Pool', 1951 UNION ALL
  SELECT '2026', 'Food', 7700 UNION ALL
  SELECT '2026', 'Overrun', 1450 UNION ALL
  SELECT '2026', 'Bfast', 0
) v
JOIN trips t ON t.year = v.year
JOIN budget_categories c ON c.name = v.category;
