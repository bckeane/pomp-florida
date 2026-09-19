-- One designated leader per group_number, used by the Booking tab. Boolean-
-- as-int (not tri-state like has_allergy_medication): every participant
-- starts as a non-leader by default, there's no "unanswered" state here.
ALTER TABLE participants ADD COLUMN group_leader INTEGER NOT NULL DEFAULT 0;
