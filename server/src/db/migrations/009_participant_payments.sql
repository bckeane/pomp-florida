-- Per-participant tracking for the two payment installments already defined
-- at the trip level (deposit_amount, final_payment_estimate) — until now the
-- roster had no way to mark who has actually paid either one.
ALTER TABLE participants ADD COLUMN deposit_paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN final_payment_paid INTEGER NOT NULL DEFAULT 0;
