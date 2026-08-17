import { Router } from 'express';
import { z } from 'zod';
import {
  listTrips,
  getTripById,
  getCurrentTrip,
  createTrip,
  updateTrip,
  activateTrip,
  listDailySchedule,
  addScheduleDay,
  updateScheduleDay,
  deleteScheduleDay,
  autoCreateSchedule,
} from '../models/trips.js';
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
// Whole-percent spread (e.g. 10 for ±10%) — same blank-to-null handling as
// optionalInt, just bounded to a sane 0–100 range.
const optionalPercent = z
  .union([z.literal(''), z.null(), z.coerce.number().int().min(0).max(100)])
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
  final_payment_due: optionalDate,
  estimated_cost: optionalInt,
  deposit_percent: optionalPercent,
  cost_spread_percent: optionalPercent,
  overrun_amount: optionalInt,
  overrun_due_date: optionalDate,
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
  departure_logistics: optionalText,
  return_logistics: optionalText,
  packing_list: optionalText,
});

// Public: the self-serve registration page needs the current trip's name
// and year before a parent has signed in. Everything else below manages
// trip years and is admin-only.
router.get('/trips/current', (req, res) => {
  const trip = getCurrentTrip();
  if (!trip) return res.status(404).json({ error: 'No current trip is set' });
  res.json(trip);
});

// Public: the current trip's day-by-day pool-time schedule, for the
// parent-facing trip essentials summary (register-success screen,
// account-home) — same current-trip-only exposure as GET /trips/current
// above. Registered before /trips/:id/schedule below so "current" here is
// never swallowed by that route's :id param.
router.get('/trips/current/schedule', (req, res) => {
  const trip = getCurrentTrip();
  if (!trip) return res.status(404).json({ error: 'No current trip is set' });
  res.json(listDailySchedule(trip.id));
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

// Admin CRUD for a trip's day-by-day pool-time schedule — a separate
// sub-resource keyed off the trip id, same shape as the food-planner daily
// items routes in routes/budget.js.
router.get('/trips/:id/schedule', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!getTripById(id)) return res.status(404).json({ error: 'Trip not found' });
  res.json(listDailySchedule(id));
});

const scheduleDaySchema = z.object({
  date: z.string(),
  morning_window: optionalText,
  afternoon_window: optionalText,
  notes: optionalText,
});

function scheduleErrorStatus(err) {
  if (err.code === 'INVALID_DATE' || err.code === 'TRIP_DATES_MISSING') return 400;
  if (err.code === 'TRIP_NOT_FOUND' || err.code === 'SCHEDULE_NOT_FOUND') return 404;
  if (err.code === 'DUPLICATE_DATE') return 409;
  return null;
}

router.post('/trips/:id/schedule', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const parsed = scheduleDaySchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join('.') || '_root'] = issue.message;
    return res.status(400).json({ errors });
  }
  try {
    res.status(201).json(addScheduleDay(id, parsed.data));
  } catch (err) {
    const status = scheduleErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

// Bulk-populates a blank entry for every day of the trip's date range (see
// autoCreateSchedule) — the "Manage days" table's one-click alternative to
// POST /schedule above. Idempotent: already-populated dates are left alone.
router.post('/trips/:id/schedule/auto-create', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  try {
    res.json(autoCreateSchedule(id));
  } catch (err) {
    const status = scheduleErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

const scheduleDayUpdateSchema = scheduleDaySchema.partial();

router.put('/trips/:id/schedule/:scheduleId', requireAdmin, (req, res) => {
  const scheduleId = Number(req.params.scheduleId);
  if (!Number.isInteger(scheduleId)) return res.status(404).json({ error: 'Schedule entry not found' });

  const parsed = scheduleDayUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join('.') || '_root'] = issue.message;
    return res.status(400).json({ errors });
  }
  try {
    res.json(updateScheduleDay(scheduleId, parsed.data));
  } catch (err) {
    const status = scheduleErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

router.delete('/trips/:id/schedule/:scheduleId', requireAdmin, (req, res) => {
  const scheduleId = Number(req.params.scheduleId);
  if (!Number.isInteger(scheduleId)) return res.status(404).json({ error: 'Schedule entry not found' });

  try {
    deleteScheduleDay(scheduleId);
    res.status(204).end();
  } catch (err) {
    const status = scheduleErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

export default router;
