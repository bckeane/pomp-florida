import { Router } from 'express';
import { requireAccount } from '../middleware/auth.js';
import { validateParticipant } from '../lib/validation.js';
import { getCurrentTrip } from '../models/trips.js';
import { createCheckoutSession } from '../services/stripe.js';
import { clientBaseUrl } from '../lib/urls.js';
import {
  listParticipants,
  listParticipantHistory,
  findDuplicate,
  createParticipant,
  getParticipantById,
  updateParticipant,
} from '../models/participants.js';

const router = Router();

// Payments are only ever collected from swimmers/divers — adult chaperones
// don't pay a trip fee, so 'full' just means "deposit + final together" for
// whichever of those two still has a balance (mirrors the admin route's
// per-installment pricing in routes/participants.js).
function installmentAmount(participant, installment) {
  if (installment === 'deposit') return participant.deposit_balance;
  if (installment === 'final') return participant.final_payment_balance;
  if (installment === 'full') {
    if (participant.deposit_balance == null && participant.final_payment_balance == null) return null;
    return (participant.deposit_balance ?? 0) + (participant.final_payment_balance ?? 0);
  }
  return undefined;
}

function fieldKeyed(errors) {
  const out = {};
  for (const e of errors) out[e.field] = e.message;
  return out;
}

router.get('/my/participants', requireAccount, (req, res) => {
  const trip = getCurrentTrip();
  if (!trip) return res.status(400).json({ error: 'No current trip is set' });

  const mine = listParticipants({ trip_id: trip.id }).filter((p) => p.account_id === req.account.id);
  res.json(mine);
});

router.get('/my/participants/history', requireAccount, (req, res) => {
  res.json(listParticipantHistory(req.account.id));
});

router.post('/my/participants', requireAccount, (req, res) => {
  const trip = getCurrentTrip();
  if (!trip) return res.status(400).json({ error: 'No current trip is set' });

  const { data, errors } = validateParticipant(req.body);
  if (errors.length) {
    return res.status(400).json({ errors: fieldKeyed(errors) });
  }

  // Payment fields are admin-only — a self-serve caller must never be able to
  // set their own paid amounts, regardless of what the client sends.
  delete data.deposit_received;
  delete data.final_payment_received;

  const duplicate = findDuplicate({ ...data, trip_id: trip.id });
  if (duplicate) {
    return res.status(400).json({
      errors: { _root: 'This person is already on the roster for this trip.' },
    });
  }

  const participant = createParticipant({ ...data, trip_id: trip.id, account_id: req.account.id });
  res.status(201).json(participant);
});

// A parent can edit their own roster entries (name, role, grad year, birth
// date, allergy/medication flag) after submitting — e.g. to answer the
// allergy question they skipped at registration. 404 (not 403) when the
// participant belongs to someone else, so this can't be used to probe which
// ids exist on the trip.
router.put('/my/participants/:id', requireAccount, (req, res) => {
  const existing = getParticipantById(req.params.id);
  if (!existing || existing.account_id !== req.account.id) {
    return res.status(404).json({ error: 'Participant not found' });
  }

  const { data, errors } = validateParticipant({ ...existing, ...req.body });
  if (errors.length) {
    return res.status(400).json({ errors: fieldKeyed(errors) });
  }

  // Payment status and active/roster-removal are admin-only — a self-serve
  // caller must never be able to change these on their own participant.
  delete data.deposit_received;
  delete data.final_payment_received;
  delete data.active;

  const duplicate = findDuplicate({ ...data, trip_id: existing.trip_id }, Number(req.params.id));
  if (duplicate) {
    return res.status(400).json({
      errors: { _root: 'A participant with this first name, last name, and birth date already exists on this trip.' },
    });
  }

  const participant = updateParticipant(req.params.id, data);
  res.json(participant);
});

// Self-serve Checkout Session — a parent paying for their own child right
// after signup (or later, from their account roster), as opposed to the
// admin-generated link in routes/participants.js. Same 404-not-403 pattern
// as PUT above so this can't be used to probe which participant ids exist.
router.post('/my/participants/:id/payment-link', requireAccount, async (req, res) => {
  const participant = getParticipantById(req.params.id);
  if (!participant || participant.account_id !== req.account.id) {
    return res.status(404).json({ error: 'Participant not found' });
  }

  if (participant.role === 'Adult') {
    return res.status(400).json({ error: "Payments aren't collected for adult chaperones." });
  }

  const { installment } = req.body;
  const amountDollars = installmentAmount(participant, installment);
  if (amountDollars === undefined) {
    return res.status(400).json({ error: "installment must be 'deposit', 'final', or 'full'" });
  }
  if (amountDollars == null) {
    return res.status(400).json({
      error: "This trip has no estimated cost set, so a payment amount can't be calculated yet.",
    });
  }
  if (amountDollars <= 0) {
    return res.status(400).json({ error: 'Already paid in full — no balance is owed.' });
  }

  const base = clientBaseUrl();
  try {
    const session = await createCheckoutSession({
      participant,
      installment,
      amountDollars,
      successUrl: `${base}/register?payment=success`,
      cancelUrl: `${base}/register?payment=cancelled`,
      depositPortion: installment === 'full' ? participant.deposit_balance ?? 0 : undefined,
      finalPortion: installment === 'full' ? participant.final_payment_balance ?? 0 : undefined,
    });
    res.json({ url: session.url, amount: amountDollars });
  } catch (err) {
    if (err.code === 'STRIPE_NOT_CONFIGURED') {
      return res.status(500).json({ error: 'Stripe is not configured on this server.' });
    }
    console.error('[my-payment-link] Stripe error:', err);
    res.status(502).json({ error: "Couldn't reach Stripe — try again shortly." });
  }
});

export default router;
