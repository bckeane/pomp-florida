-- Parent identity (name + emergency contact), collected once per account
-- rather than per participant. Nullable: existing accounts predate this
-- feature and haven't provided it yet — the client prompts for it via a
-- one-time gate rather than the schema forcing a value on every row.
ALTER TABLE accounts ADD COLUMN parent_name TEXT;
ALTER TABLE accounts ADD COLUMN emergency_phone TEXT;

-- Tri-state, not boolean: NULL = never asked, 0 = asked and answered no,
-- 1 = asked and answered yes. A NOT NULL DEFAULT 0 column here would make
-- "no allergy" and "never asked" indistinguishable, which breaks the
-- account-home "needs review" flag for participants who predate this
-- column (they must show as unanswered, not silently as "no allergy").
ALTER TABLE participants ADD COLUMN has_allergy_medication INTEGER;
