-- Departure/return day-of logistics and a packing list, plus a day-by-day
-- pool-time schedule (morning/afternoon windows) — the remaining trip-detail
-- content for the parent-facing "trip essentials" summary (see
-- Swim_&_Dive_Team_Florida_Trip_2026.png in the repo root for the reference
-- layout). Everything else the summary needs already lives on trips
-- (training_location, lodging, whats_included, etc.).
ALTER TABLE trips ADD COLUMN departure_logistics TEXT;
ALTER TABLE trips ADD COLUMN return_logistics TEXT;
ALTER TABLE trips ADD COLUMN packing_list TEXT;

CREATE TABLE trip_daily_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  date TEXT NOT NULL,
  morning_window TEXT,
  afternoon_window TEXT,
  notes TEXT,
  UNIQUE (trip_id, date)
);
