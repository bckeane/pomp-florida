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
  full: 'Full payment',
};

/**
 * Creates a Checkout Session on demand for one participant/installment,
 * priced from whatever the caller passes in (the route reads the
 * participant's *current* deposit_amount/final_payment_estimate right
 * before calling this, so pricing never goes stale like a pre-created
 * Payment Link would).
 *
 * depositPortion/finalPortion are only meaningful for installment 'full':
 * they record how much of the combined charge applies to each bucket *at
 * the moment of purchase*, so the webhook (routes/stripeWebhook.js) can
 * split a single successful payment back into deposit_received/
 * final_payment_received deterministically, independent of whether the
 * trip's cost model changes before the webhook fires.
 */
export async function createCheckoutSession({
  participant,
  installment,
  amountDollars,
  successUrl,
  cancelUrl,
  depositPortion,
  finalPortion,
}) {
  const client = getClient();
  if (!client) {
    const err = new Error('STRIPE_SECRET_KEY is not configured');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }

  const label = INSTALLMENT_LABELS[installment];
  const studentName = `${participant.first_name} ${participant.last_name}`;

  const metadata = {
    participant_id: String(participant.id),
    installment,
  };
  if (depositPortion != null) metadata.deposit_portion = String(depositPortion);
  if (finalPortion != null) metadata.final_portion = String(finalPortion);

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
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

/**
 * Verifies and parses an incoming Stripe webhook payload. Must be called
 * with the raw (unparsed) request body — signature verification hashes the
 * exact bytes Stripe sent, which a JSON.parse/stringify round-trip would
 * not reproduce.
 */
export function constructWebhookEvent(rawBody, signature) {
  const client = getClient();
  if (!client) {
    const err = new Error('STRIPE_SECRET_KEY is not configured');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    const err = new Error('STRIPE_WEBHOOK_SECRET is not configured');
    err.code = 'STRIPE_WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
