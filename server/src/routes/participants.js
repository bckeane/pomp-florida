import { Router } from 'express';
import { validateParticipant } from '../lib/validation.js';
import { mapImportRecord } from '../lib/importMapping.js';
import { parseCSV, toCSV } from '../lib/csv.js';
import { getCurrentTrip, getTripById } from '../models/trips.js';
import { requireAdmin } from '../middleware/auth.js';
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

  rawRecords.forEach((raw, index) => {
    const mapped = mapImportRecord(raw);
    const { data, errors: rowErrors } = validateParticipant(mapped);

    if (rowErrors.length) {
      rowErrors.forEach((e) => errors.push({ row: index + 1, field: e.field, message: e.message }));
      return;
    }

    const duplicate = findDuplicate({ ...data, trip_id: tripId });
    if (duplicate) {
      errors.push({
        row: index + 1,
        field: '_root',
        message: 'Duplicate of an existing participant on this trip (same first name, last name, birth date).',
      });
      return;
    }

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
