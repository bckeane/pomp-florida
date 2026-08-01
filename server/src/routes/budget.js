import { Router } from 'express';
import { z } from 'zod';
import { getCurrentTrip, getTripById } from '../models/trips.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  listAllCategories,
  createCategory,
  retireCategory,
  getBudgetForTrip,
  upsertLineItem,
  setExclusion,
  clearExclusion,
} from '../models/budget.js';

const router = Router();

function fieldKeyedZodErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) errors[issue.path.join('.') || '_root'] = issue.message;
  return errors;
}

// Same trip_id-or-current-trip resolution as GET /api/stats.
function resolveTripId(req, res) {
  if (req.query.trip_id) {
    const id = Number(req.query.trip_id);
    if (!getTripById(id)) {
      res.status(400).json({ error: 'Unknown trip_id' });
      return null;
    }
    return id;
  }
  const current = getCurrentTrip();
  if (!current) {
    res.status(400).json({ error: 'No current trip is set' });
    return null;
  }
  return current.id;
}

router.get('/budget', requireAdmin, (req, res) => {
  const tripId = resolveTripId(req, res);
  if (tripId === null) return;
  res.json(getBudgetForTrip(tripId));
});

router.get('/budget/categories', requireAdmin, (req, res) => {
  res.json(listAllCategories());
});

const categorySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
});

router.post('/budget/categories', requireAdmin, (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  try {
    res.status(201).json(createCategory(parsed.data.name));
  } catch (err) {
    if (err.code === 'DUPLICATE_CATEGORY') return res.status(400).json({ error: err.message });
    throw err;
  }
});

router.post('/budget/categories/:id/retire', requireAdmin, (req, res) => {
  try {
    const category = retireCategory(Number(req.params.id));
    res.json(category);
  } catch (err) {
    if (err.code === 'CATEGORY_IN_USE') return res.status(409).json({ error: err.message });
    throw err;
  }
});

const lineItemSchema = z.object({
  trip_id: z.coerce.number().int(),
  category_id: z.coerce.number().int(),
  total: z.coerce.number(),
});

router.put('/budget/items', requireAdmin, (req, res) => {
  const parsed = lineItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  const { trip_id, category_id, total } = parsed.data;
  if (!getTripById(trip_id)) return res.status(400).json({ error: 'Unknown trip_id' });

  try {
    res.json(upsertLineItem(trip_id, category_id, total));
  } catch (err) {
    if (err.code === 'INVALID_TOTAL') return res.status(400).json({ error: err.message });
    throw err;
  }
});

const exclusionSchema = z.object({
  trip_budget_item_id: z.coerce.number().int(),
  participant_id: z.coerce.number().int(),
});

router.post('/budget/exclusions', requireAdmin, (req, res) => {
  const parsed = exclusionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  try {
    setExclusion(parsed.data.trip_budget_item_id, parsed.data.participant_id);
    res.status(204).end();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(400).json({ error: 'Unknown trip_budget_item_id or participant_id' });
    }
    throw err;
  }
});

router.delete('/budget/exclusions/:tripBudgetItemId/:participantId', requireAdmin, (req, res) => {
  clearExclusion(Number(req.params.tripBudgetItemId), Number(req.params.participantId));
  res.status(204).end();
});

export default router;
