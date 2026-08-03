-- Replace the paid/unpaid boolean with actual dollar amounts received, so
-- the roster can show a real balance owed (matches the spreadsheet's
-- original "Paid" / "Missing" installment columns) instead of a flat
-- yes/no marker that couldn't represent a partial payment.
ALTER TABLE participants ADD COLUMN deposit_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN final_payment_received INTEGER NOT NULL DEFAULT 0;

-- Backfill: a participant already marked paid is assumed to have paid that
-- trip's full installment amount (the best information available — the old
-- boolean never recorded a partial amount).
UPDATE participants
SET deposit_received = (
  SELECT COALESCE(t.deposit_amount, 0) FROM trips t WHERE t.id = participants.trip_id
)
WHERE deposit_paid = 1;

UPDATE participants
SET final_payment_received = (
  SELECT COALESCE(t.final_payment_estimate, 0) FROM trips t WHERE t.id = participants.trip_id
)
WHERE final_payment_paid = 1;

ALTER TABLE participants DROP COLUMN deposit_paid;
ALTER TABLE participants DROP COLUMN final_payment_paid;
