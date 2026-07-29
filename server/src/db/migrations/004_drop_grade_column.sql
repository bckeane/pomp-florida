-- Grade is now always derived from grad_year + the trip's own year (see
-- suggestGrade in lib/derived.js) rather than manually entered/overridden,
-- the same way age_at_trip is derived from birth_date rather than stored.
ALTER TABLE participants DROP COLUMN grade;
