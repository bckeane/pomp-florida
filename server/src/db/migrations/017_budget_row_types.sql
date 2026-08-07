-- Budget row types (see office-hours design doc, 2026-08-07): a budget row is
-- either 'totals' (a third-party lump sum divided across the roster — today's
-- only behavior) or 'per_swimmer' (a fixed cost per athlete, entered as a
-- rate rather than a total). Lives on trip_budget_items, per trip-year — NOT
-- on budget_categories — so a later reclassification never retroactively
-- changes how a closed prior year already computed (Premise 2).
--
-- Existing rows default to 'totals', matching today's behavior exactly; no
-- row is auto-switched to 'per_swimmer' by this migration.
ALTER TABLE trip_budget_items
  ADD COLUMN type TEXT NOT NULL DEFAULT 'totals' CHECK (type IN ('totals', 'per_swimmer'));

ALTER TABLE trip_budget_items ADD COLUMN rate_per_athlete INTEGER;
