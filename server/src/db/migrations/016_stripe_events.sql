-- Idempotency ledger for the Stripe webhook (see routes/stripeWebhook.js) —
-- Stripe retries undelivered/slow-acked events, so the same
-- checkout.session.completed can arrive more than once. Recording the event
-- id here lets the webhook no-op on a repeat instead of double-crediting a
-- participant's deposit/final payment.
CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
