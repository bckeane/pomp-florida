import { Router } from 'express';
import { validateParticipant } from '../lib/validation.js';
import { mapImportRecord } from '../lib/importMapping.js';
import { parseCSV, toCSV } from '../lib/csv.js';
import { getCurrentTrip, getTripById } from '../models/trips.js';
import { requireAdmin } from '../middleware/auth.js';
import { createCheckoutSession } from '../services/stripe.js';
import {
  listParticipants,
  getParticipantById,
  findDuplicate,
  createParticipant,
  updateParticipant,
  softDeleteParticipant,
  hardDeleteParticipant,
  insertParticipantsBulk,
  getStats,
} from '../models/participants.js';

// Charges the remaining balance (installment price minus whatever's already
// recorded as received via check/cash/Venmo), not the fixed installment
// price — otherwise a parent who's already paid something outside Stripe
// would be charged the full amount again. Same fields already surfaced as
// the roster's "Balance owed" column (lib/money.js totalBalance).
const INSTALLMENT_BALANCE_FIELDS = {
  deposit: 'deposit_balance',
  final: 'final_payment_balance',
};

// Same fallback as auth.js's resetUrlFor — the client app's origin, not this
// API's. No dedicated parent-facing return page exists (out of scope for
// this feature, see design doc), so these just land back on the public
// home page with a query param.
function clientBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}

const router = Router();
// Every route here is the admin roster's own CRUD/import/export — the
// public self-serve path lives entirely under /api/my/participants instead.
// requireAdmin is applied per-route (not via router.use()) because this
// router is mounted at the shared '/api' prefix alongside trips/auth/etc —
// an unconditional router.use(requireAdmin) here would intercept every
// /api/* request before Express even checks which router's route matches,
// wrongly 401-ing routes like /api/trips/current that belong to other
// routers mounted at the same prefix.

/** Resolves the trip a request should act on: ?trip_id= if given, else the active trip. */
function resolveTrip(req) {
  if (req.query.trip_id) {
    const trip = getTripById(Number(req.query.trip_id));
    return trip || undefined;
  }
  return getCurrentTrip() || null;
}

router.get('/participants', requireAdmin, (req, res) => {
  const trip = resolveTrip(req);
  if (trip === undefined) return res.status(400).json({ error: 'Unknown trip_id' });
  if (trip === null) return res.status(400).json({ error: 'No current trip is set' });

  const { role, grad_year, active, q, sort } = req.query;
  const participants = listParticipants({ role, grad_year, active, q, sort, trip_id: trip.id });
  res.json(participants);
});

router.get('/participants/export', requireAdmin, (req, res) => {
  const trip = resolveTrip(req);
  if (trip === undefined) return res.status(400).json({ error: 'Unknown trip_id' });
  if (trip === null) return res.status(400).json({ error: 'No current trip is set' });

  const participants = listParticipants({ trip_id: trip.id });
  const columns = [
    'id',
    'first_name',
    'last_name',
    'grad_year',
    'birth_date',
    'role',
    'active',
  ];
  const csv = toCSV(participants, columns);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="roster-export.csv"');
  res.send(csv);
});

router.get('/participants/:id', requireAdmin, (req, res) => {
  const participant = getParticipantById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });
  res.json(participant);
});

router.post('/participants', requireAdmin, (req, res) => {
  const trip = resolveTrip(req);
  if (trip === undefined) return res.status(400).json({ error: 'Unknown trip_id' });
  if (trip === null) return res.status(400).json({ error: 'No current trip is set' });

  const { data, errors } = validateParticipant(req.body);
  if (errors.length) {
    return res.status(400).json({ errors: fieldKeyed(errors) });
  }

  const duplicate = findDuplicate({ ...data, trip_id: trip.id });
  if (duplicate) {
    return res.status(400).json({
      errors: { _root: 'A participant with this first name, last name, and birth date already exists on this trip.' },
    });
  }

  const participant = createParticipant({ ...data, trip_id: trip.id });
  res.status(201).json(participant);
});

router.put('/participants/:id', requireAdmin, (req, res) => {
  const existing = getParticipantById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Participant not found' });

  const { data, errors } = validateParticipant({ ...existing, ...req.body });
  if (errors.length) {
    return res.status(400).json({ errors: fieldKeyed(errors) });
  }

  const duplicate = findDuplicate({ ...data, trip_id: existing.trip_id }, Number(req.params.id));
  if (duplicate) {
    return res.status(400).json({
      errors: { _root: 'A participant with this first name, last name, and birth date already exists on this trip.' },
    });
  }

  const participant = updateParticipant(req.params.id, { ...data, trip_id: existing.trip_id });
  res.json(participant);
});

router.post('/participants/:id/payment-link', requireAdmin, async (req, res) => {
  const participant = getParticipantById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  const { installment } = req.body;
  const balanceField = INSTALLMENT_BALANCE_FIELDS[installment];
  if (!balanceField) {
    return res.status(400).json({ error: "installment must be 'deposit' or 'final'" });
  }

  const amountDollars = participant[balanceField];
  if (amountDollars == null) {
    return res.status(400).json({
      error: "This trip has no estimated cost set, so a payment amount can't be calculated yet.",
    });
  }
  if (amountDollars <= 0) {
    return res.status(400).json({ error: 'Already paid in full — no balance is owed for this installment.' });
  }

  const base = clientBaseUrl();
  try {
    const session = await createCheckoutSession({
      participant,
      installment,
      amountDollars,
      successUrl: `${base}/?payment=success`,
      cancelUrl: `${base}/?payment=cancelled`,
    });
    res.json({ url: session.url, amount: amountDollars });
  } catch (err) {
    if (err.code === 'STRIPE_NOT_CONFIGURED') {
      return res.status(500).json({ error: 'Stripe is not configured on this server.' });
    }
    console.error('[payment-link] Stripe error:', err);
    res.status(502).json({ error: "Couldn't reach Stripe — try again shortly." });
  }
});

router.delete('/participants/:id', requireAdmin, (req, res) => {
  const hard = req.query.hard === 'true';
  const existing = getParticipantById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Participant not found' });

  const ok = hard ? hardDeleteParticipant(req.params.id) : softDeleteParticipant(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Participant not found' });
  res.json({ ok: true, hard });
});

router.post('/participants/import', requireAdmin, (req, res) => {
  const trip = resolveTrip(req);
  if (trip === undefined) return res.status(400).json({ error: 'Unknown trip_id' });
  if (trip === null) return res.status(400).json({ error: 'No current trip is set' });
  const tripId = trip.id;

  const partial = req.query.partial === 'true';

  let rawRecords;
  if (Array.isArray(req.body)) {
    rawRecords = req.body;
  } else if (typeof req.body?.csv === 'string') {
    rawRecords = parseCSV(req.body.csv);
  } else {
    return res.status(400).json({ error: 'Expected a JSON array or a { csv: string } body' });
  }

  const results = [];
  const errors = [];
  // Same (first_name, last_name, birth_date) key findDuplicate() checks
  // against the DB, tracked here too so two identical rows earlier in the
  // same batch don't both slip past the DB check and both get inserted.
  const seenInBatch = new Set();

  rawRecords.forEach((raw, index) => {
    const mapped = mapImportRecord(raw);
    const { data, errors: rowErrors } = validateParticipant(mapped);

    if (rowErrors.length) {
      rowErrors.forEach((e) => errors.push({ row: index + 1, field: e.field, message: e.message }));
      return;
    }

    const batchKey = JSON.stringify([data.first_name, data.last_name, data.birth_date ?? null]);

    const duplicate = findDuplicate({ ...data, trip_id: tripId });
    if (duplicate) {
      errors.push({
        row: index + 1,
        field: '_root',
        message: 'Duplicate of an existing participant on this trip (same first name, last name, birth date).',
      });
      return;
    }
    if (seenInBatch.has(batchKey)) {
      errors.push({
        row: index + 1,
        field: '_root',
        message: 'Duplicate of another row earlier in this same import (same first name, last name, birth date).',
      });
      return;
    }

    seenInBatch.add(batchKey);
    results.push(data);
  });

  if (errors.length && !partial) {
    return res.status(400).json({ imported: 0, skipped: rawRecords.length, errors });
  }

  if (results.length) {
    insertParticipantsBulk(results, tripId);
  }

  res.json({
    imported: results.length,
    skipped: rawRecords.length - results.length,
    errors,
  });
});

function fieldKeyed(errors) {
  const out = {};
  for (const e of errors) {
    out[e.field] = e.message;
  }
  return out;
}

export default router;
