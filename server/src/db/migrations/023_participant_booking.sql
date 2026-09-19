-- Booking-phase logistics, entered by the admin once flights/seats are
-- booked. All nullable: unset until the admin fills them in, and never
-- required at registration time.
ALTER TABLE participants ADD COLUMN group_number TEXT;
ALTER TABLE participants ADD COLUMN seat_mate_group TEXT;
ALTER TABLE participants ADD COLUMN reservation_number TEXT;
ALTER TABLE participants ADD COLUMN seat_to_fl TEXT;
ALTER TABLE participants ADD COLUMN seat_to_ct TEXT;
