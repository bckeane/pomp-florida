import Stripe from 'stripe';

// Lazily constructed, same pattern as lib/email.js — local dev/tests never
// need a real key; the route surfaces a clear error instead of crashing at
// import time when STRIPE_SECRET_KEY is unset.
function getClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  return apiKey ? new Stripe(apiKey) : null;
}

// Whole-dollar integers are the only money representation anywhere else in
// this app (trips.deposit_amount, participants.deposit_received, etc.) —
// conversion to Stripe's smallest-unit cents happens only here, at the
// boundary, per the eng review's reversal of a whole-schema cents migration.
export function toCents(wholeDollars) {
  return Math.round(wholeDollars * 100);
}

const INSTALLMENT_LABELS = {
  deposit: 'Deposit',
  final: 'Final payment',
};

/**
 * Creates a Checkout Session on demand for one participant/installment,
 * priced from whatever the caller passes in (the route reads the
 * participant's *current* deposit_amount/final_payment_estimate right
 * before calling this, so pricing never goes stale like a pre-created
 * Payment Link would).
 */
export async function createCheckoutSession({ participant, installment, amountDollars, successUrl, cancelUrl }) {
  const client = getClient();
  if (!client) {
    const err = new Error('STRIPE_SECRET_KEY is not configured');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }

  const label = INSTALLMENT_LABELS[installment];
  const studentName = `${participant.first_name} ${participant.last_name}`;

  return client.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: toCents(amountDollars),
          product_data: {
            name: `${label} — Pomperaug Panthers Florida Trip`,
            description: `${label} for ${studentName}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      participant_id: String(participant.id),
      installment,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}
