-- Deposit split (default 60/40, see migration 014) is now adjustable per
-- trip via a slider in the admin UI instead of being a hardcoded 60. Null
-- means "use the 60% default" (see computeDepositAndFinal in
-- models/trips.js), so existing trips behave identically until an admin
-- actually moves the slider.
ALTER TABLE trips ADD COLUMN deposit_percent INTEGER;
