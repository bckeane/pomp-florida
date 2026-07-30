import { Router } from 'express';
import { z } from 'zod';
import { listTrips, getTripById, getCurrentTrip, createTrip, updateTrip, activateTrip } from '../models/trips.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

// Detail fields power the public home page's copy. They're all optional and
// blank out to null rather than failing validation, since a trip can exist
// before an admin has filled any of them in.
// Only '' collapses to null here — undefined (key omitted) must pass through
// unchanged so a partial PUT doesn't wipe out fields the admin didn't touch.
const optionalDate = z
  .union([isoDate, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' ? null : v));
// '' must be checked before the coercing number branch — Number('') is 0,
// not NaN, so a blank input would otherwise silently save as zero.
const optionalInt = z
  .union([z.literal(''), z.null(), z.coerce.number().int().nonnegative()])
  .optional()
  .transform((v) => (v === '' ? null : v));
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === '' ? null : v));

const tripSchema = z.object({
  year: z.string().trim().min(1, 'year is required'),
  name: z.string().trim().min(1, 'name is required'),
  trip_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'trip_date must be an ISO date (YYYY-MM-DD)'),
  intro_message: optionalText,
  return_date: optionalDate,
  commitment_deadline: optionalDate,
  deposit_amount: optionalInt,
  final_payment_due: optionalDate,
  final_payment_estimate: optionalInt,
  cost_low: optionalInt,
  cost_high: optionalInt,
  training_location: optionalText,
  training_location_url: optionalText,
  lodging: optionalText,
  lodging_url: optionalText,
  meals_info: optionalText,
  whats_included: optionalText,
  payment_notes: optionalText,
  coordinators: optionalText,
  contact_email: optionalText,
  miss_school_note: optionalText,
});

// Public: the self-serve registration page needs the current trip's name
// and year before a parent has signed in. Everything else below manages
// trip years and is admin-only.
router.get('/trips/current', (req, res) => {
  const trip = getCurrentTrip();
  if (!trip) return res.status(404).json({ error: 'No current trip is set' });
  res.json(trip);
});

router.get('/trips', requireAdmin, (req, res) => {
  res.json(listTrips());
});

router.get('/trips/:id', requireAdmin, (req, res) => {
  const trip = getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

router.post('/trips', requireAdmin, (req, res) => {
  const parsed = tripSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join('.') || '_root'] = issue.message;
    return res.status(400).json({ errors });
  }
  const trip = createTrip(parsed.data);
  res.status(201).json(trip);
});

router.put('/trips/:id', requireAdmin, (req, res) => {
  const existing = getTripById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trip not found' });

  const parsed = tripSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    const errors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join('.') || '_root'] = issue.message;
    return res.status(400).json({ errors });
  }
  const trip = updateTrip(req.params.id, parsed.data);
  res.json(trip);
});

router.post('/trips/:id/activate', requireAdmin, (req, res) => {
  const trip = activateTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

export default router;
