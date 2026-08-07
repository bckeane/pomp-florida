import { Router } from 'express';
import express from 'express';
import { constructWebhookEvent } from '../services/stripe.js';
import { recordPaymentReceived } from '../models/participants.js';
import { hasProcessedEvent, markEventProcessed } from '../models/stripeEvents.js';

const router = Router();

// express.raw() is scoped to this one route (not a blanket app.use), so it
// never shadows the global express.json() the rest of the API relies on —
// see index.js for the mount-order note. Signature verification
// (constructWebhookEvent) needs the exact raw bytes Stripe sent; a
// JSON.parse/stringify round trip would break the signature hash.
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    if (err.code === 'STRIPE_NOT_CONFIGURED' || err.code === 'STRIPE_WEBHOOK_NOT_CONFIGURED') {
      console.error('[stripe-webhook]', err.message);
      return res.status(500).json({ error: 'Stripe webhook is not configured on this server.' });
    }
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  if (hasProcessedEvent(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  const session = event.data.object;
  const metadata = session.metadata || {};
  const participantId = Number(metadata.participant_id);
  const installment = metadata.installment;
  // amount_total is in cents; every unit_amount this app ever sends Stripe
  // is a whole-dollar toCents() value (see services/stripe.js), so this
  // division is always exact.
  const amountDollars = session.amount_total != null ? session.amount_total / 100 : 0;

  let depositAmount = 0;
  let finalAmount = 0;
  if (installment === 'deposit') {
    depositAmount = amountDollars;
  } else if (installment === 'final') {
    finalAmount = amountDollars;
  } else if (installment === 'full') {
    depositAmount = metadata.deposit_portion != null ? Number(metadata.deposit_portion) : 0;
    finalAmount = metadata.final_portion != null ? Number(metadata.final_portion) : 0;
  }

  if (Number.isInteger(participantId)) {
    recordPaymentReceived(participantId, { depositAmount, finalAmount });
  }
  markEventProcessed(event.id);

  res.status(200).json({ received: true });
});

export default router;
