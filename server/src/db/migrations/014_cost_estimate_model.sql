-- Replace the manually-entered deposit/final/low/high fields with a single
-- estimated cost + a spread percent. Deposit (60%) and final payment (40%)
-- are now computed at read time (see withComputedCostFields in
-- models/trips.js) instead of being typed in separately, and the low/high
-- range shown to families is derived from the spread instead of two
-- independent numbers that could drift apart. Also adds an admin-only
-- overrun amount/due-date for tracking if actual costs run over the
-- estimate (not shown on the public home page).
--
-- This is a clean break, not a backfill: existing deposit_amount/
-- final_payment_estimate/cost_low/cost_high values don't reconcile cleanly
-- against the new 60/40 split, so admins re-enter the real estimated cost
-- once through the Trip details tab after this migration runs.
ALTER TABLE trips ADD COLUMN estimated_cost INTEGER;
ALTER TABLE trips ADD COLUMN cost_spread_percent INTEGER;
ALTER TABLE trips ADD COLUMN overrun_amount INTEGER;
ALTER TABLE trips ADD COLUMN overrun_due_date TEXT;

ALTER TABLE trips DROP COLUMN deposit_amount;
ALTER TABLE trips DROP COLUMN final_payment_estimate;
ALTER TABLE trips DROP COLUMN cost_low;
ALTER TABLE trips DROP COLUMN cost_high;
