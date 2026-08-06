import { Router } from 'express';
import { requireAccount } from '../middleware/auth.js';
import { validateParticipant } from '../lib/validation.js';
import { getCurrentTrip } from '../models/trips.js';
import {
  listParticipants,
  listParticipantHistory,
  findDuplicate,
  createParticipant,
  getParticipantById,
  updateParticipant,
} from '../models/participants.js';

const router = Router();

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

export default router;
