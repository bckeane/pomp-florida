import { db } from '../db/connection.js';

// Idempotency ledger for routes/stripeWebhook.js — Stripe redelivers events
// it doesn't get a prompt 2xx for, so the same checkout.session.completed
// can arrive more than once.
export function hasProcessedEvent(eventId) {
  return Boolean(db.prepare('SELECT 1 FROM stripe_events WHERE event_id = ?').get(eventId));
}

export function markEventProcessed(eventId) {
  db.prepare('INSERT INTO stripe_events (event_id, processed_at) VALUES (?, ?)').run(
    eventId,
    new Date().toISOString()
  );
}
