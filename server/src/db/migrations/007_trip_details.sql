-- Rich, family-facing trip details for the public home page. Everything here
-- is optional/nullable so a trip can exist before an admin has filled in the
-- copy; the 2026 row is backfilled with last year's committment email so the
-- home page has real content from day one.
ALTER TABLE trips ADD COLUMN intro_message TEXT;
ALTER TABLE trips ADD COLUMN return_date TEXT;
ALTER TABLE trips ADD COLUMN commitment_deadline TEXT;
ALTER TABLE trips ADD COLUMN deposit_amount INTEGER;
ALTER TABLE trips ADD COLUMN final_payment_due TEXT;
ALTER TABLE trips ADD COLUMN final_payment_estimate INTEGER;
ALTER TABLE trips ADD COLUMN cost_low INTEGER;
ALTER TABLE trips ADD COLUMN cost_high INTEGER;
ALTER TABLE trips ADD COLUMN training_location TEXT;
ALTER TABLE trips ADD COLUMN training_location_url TEXT;
ALTER TABLE trips ADD COLUMN lodging TEXT;
ALTER TABLE trips ADD COLUMN lodging_url TEXT;
ALTER TABLE trips ADD COLUMN meals_info TEXT;
ALTER TABLE trips ADD COLUMN whats_included TEXT;
ALTER TABLE trips ADD COLUMN payment_notes TEXT;
ALTER TABLE trips ADD COLUMN coordinators TEXT;
ALTER TABLE trips ADD COLUMN contact_email TEXT;
ALTER TABLE trips ADD COLUMN miss_school_note TEXT;

UPDATE trips SET
  intro_message = 'Last year''s trip was an amazing experience — full of dedication, hard work, and team bonding — that helped lead to the 2025 Class M Championship and a Top 3 finish at the Open Championship!',
  return_date = '2026-02-17',
  commitment_deadline = '2025-10-24',
  deposit_amount = 750,
  final_payment_due = '2026-01-24',
  final_payment_estimate = 1000,
  cost_low = 1650,
  cost_high = 1850,
  training_location = 'International Swimming Hall of Fame — Fort Lauderdale, FL',
  training_location_url = 'https://ishof.org',
  lodging = 'Courtyard Marriott Fort Lauderdale Beach',
  lodging_url = NULL,
  meals_info = 'Local restaurants within walking distance of the hotel, coordinated by adult chaperones with a daily allowance.',
  whats_included = 'Round-trip flights (including baggage fees)
Coaching & pool time at ISHOF
A dedicated healthcare professional traveling with the team
Ground transportation: school to airport, airport to hotel, hotel to airport
Daily meal allowance',
  payment_notes = 'Checks payable to Pomperaug Swim & Dive, mailed to John Baldelli, 179 Short Rock Road, Southbury CT 06488.',
  coordinators = 'Brian & Kelly Keane
Tegan & Mike Famiglietti',
  contact_email = 'bckeane@gmail.com',
  miss_school_note = 'Swimmers will miss school on departure day.'
WHERE year = '2026';
