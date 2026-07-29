-- "grade_2026" only made sense while every trip was the 2026 trip. Now that
-- trips are first-class, the grade is always relative to that trip's own
-- year, so the column is renamed to a year-agnostic "grade".
ALTER TABLE participants RENAME COLUMN grade_2026 TO grade;
