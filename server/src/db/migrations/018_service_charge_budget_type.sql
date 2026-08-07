-- Third budget row type: 'service_charge' — a percentage (e.g. Stripe's 2.9%)
-- applied to the sum of every OTHER line item's total in the same trip-year,
-- computed in application code (see computeAmountsForItems in budget.js) so
-- it always reflects this year's own totals/rates, never a stale snapshot.
-- Only one service_charge row is allowed per trip (enforced in JS at
-- switchLineItemType, and backstopped here by the partial unique index
-- below) since a second one would be ambiguous about what base it applies to.
--
-- SQLite has no ALTER COLUMN, so widening the existing CHECK on `type`
-- requires a table rebuild. trip_budget_exclusions FK-references this table,
-- and PRAGMA foreign_keys can't be toggled mid-transaction (migrations run
-- inside one — see migrate.js), so the rebuild backs up/drops the child
-- table first and recreates it after, rather than trying to disable FK
-- enforcement.
CREATE TABLE trip_budget_exclusions_backup AS SELECT * FROM trip_budget_exclusions;
DROP TABLE trip_budget_exclusions;

CREATE TABLE trip_budget_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  category_id INTEGER NOT NULL REFERENCES budget_categories(id),
  total INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'totals' CHECK (type IN ('totals', 'per_swimmer', 'service_charge')),
  rate_per_athlete INTEGER,
  percent_rate REAL,
  UNIQUE (trip_id, category_id)
);
INSERT INTO trip_budget_items_new (id, trip_id, category_id, total, type, rate_per_athlete, percent_rate)
  SELECT id, trip_id, category_id, total, type, rate_per_athlete, NULL FROM trip_budget_items;
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
