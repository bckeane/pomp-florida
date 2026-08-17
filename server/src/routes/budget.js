import { Router } from 'express';
import { z } from 'zod';
import { getCurrentTrip, getTripById } from '../models/trips.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  listAllCategories,
  createCategory,
  retireCategory,
  unretireCategory,
  getBudgetForTrip,
  getBudgetTrend,
  attachCategoryToTrip,
  detachCategoryFromTrip,
  updateLineItemValue,
  switchLineItemType,
  updateStudentCountOverride,
  setExclusion,
  clearExclusion,
  listDailyItems,
  addDailyItem,
  updateDailyItem,
  deleteDailyItem,
  autoCreateDailyItems,
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

// Every trip year at once, not just current-vs-prior — see getBudgetTrend.
router.get('/budget/trend', requireAdmin, (req, res) => {
  res.json(getBudgetTrend());
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
  res.json(retireCategory(Number(req.params.id)));
});

router.post('/budget/categories/:id/unretire', requireAdmin, (req, res) => {
  res.json(unretireCategory(Number(req.params.id)));
});

// Attaches a category to a trip that's missing it (a newly-added category,
// or a trip that predates the Budget Tab feature entirely) — a distinct
// action from editing a row's value below, since a brand-new row has no
// existing type of its own to key validation off of yet.
const attachSchema = z.object({
  trip_id: z.coerce.number().int(),
  category_id: z.coerce.number().int(),
});

router.post('/budget/items/attach', requireAdmin, (req, res) => {
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  const { trip_id, category_id } = parsed.data;
  try {
    res.json(attachCategoryToTrip(trip_id, category_id));
  } catch (err) {
    if (err.code === 'TRIP_NOT_FOUND') return res.status(400).json({ error: err.message });
    throw err;
  }
});

// Removes a category from a single trip's budget table (the "per year"
// counterpart to the global retire above) — only succeeds at zero value.
router.delete('/budget/items/:tripId/:categoryId', requireAdmin, (req, res) => {
  const tripId = Number(req.params.tripId);
  const categoryId = Number(req.params.categoryId);
  try {
    detachCategoryFromTrip(tripId, categoryId);
    res.status(204).end();
  } catch (err) {
    if (err.code === 'ITEM_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'ITEM_HAS_VALUE') return res.status(409).json({ error: err.message });
    throw err;
  }
});

// Edits an existing row's value — exactly one of total (for a 'totals' row),
// rate_per_athlete (for a 'per_swimmer' row), or percent_rate (for a
// 'service_charge' row), keyed off that row's own stored type server-side.
const lineItemSchema = z
  .object({
    trip_id: z.coerce.number().int(),
    category_id: z.coerce.number().int(),
    total: z.coerce.number().optional(),
    rate_per_athlete: z.coerce.number().optional(),
    percent_rate: z.coerce.number().optional(),
  })
  .refine(
    (data) =>
      [data.total, data.rate_per_athlete, data.percent_rate].filter((v) => v !== undefined).length === 1,
    { message: 'Provide exactly one of total, rate_per_athlete, or percent_rate' }
  );

router.put('/budget/items', requireAdmin, (req, res) => {
  const parsed = lineItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  const { trip_id, category_id, total, rate_per_athlete, percent_rate } = parsed.data;
  if (!getTripById(trip_id)) return res.status(400).json({ error: 'Unknown trip_id' });

  try {
    res.json(updateLineItemValue(trip_id, category_id, { total, rate_per_athlete, percent_rate }));
  } catch (err) {
    if (
      err.code === 'INVALID_TOTAL' ||
      err.code === 'INVALID_RATE' ||
      err.code === 'INVALID_PERCENT' ||
      err.code === 'WRONG_FIELD_FOR_TYPE'
    ) {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'ITEM_NOT_FOUND') return res.status(404).json({ error: err.message });
    throw err;
  }
});

const typeSchema = z.object({
  type: z.enum(['totals', 'per_swimmer', 'service_charge', 'food_planner']),
});

router.put('/budget/items/:id/type', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Line item not found' });

  const parsed = typeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  try {
    const item = switchLineItemType(id, parsed.data.type);
    if (!item) return res.status(404).json({ error: 'Line item not found' });
    res.json(item);
  } catch (err) {
    if (err.code === 'SERVICE_CHARGE_LIMIT') return res.status(409).json({ error: err.message });
    throw err;
  }
});

// Day-by-day entries for a 'food_planner' row (see migration 020) — a
// separate sub-resource keyed off the trip_budget_item id, same shape as the
// exclusions routes below.
router.get('/budget/items/:id/daily', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Line item not found' });
  res.json(listDailyItems(id));
});

const dailyItemSchema = z.object({
  date: z.string(),
  budget: z.coerce.number().optional(),
  cash: z.coerce.number().optional(),
  meals_covered: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function dailyItemErrorStatus(err) {
  if (
    err.code === 'INVALID_DATE' ||
    err.code === 'INVALID_AMOUNT' ||
    err.code === 'FOOD_PLANNER_TYPE_REQUIRED' ||
    err.code === 'TRIP_DATES_MISSING'
  ) {
    return 400;
  }
  if (err.code === 'ITEM_NOT_FOUND' || err.code === 'DAILY_ITEM_NOT_FOUND') return 404;
  if (err.code === 'DUPLICATE_DATE') return 409;
  return null;
}

router.post('/budget/items/:id/daily', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Line item not found' });

  const parsed = dailyItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  try {
    res.status(201).json(addDailyItem(id, parsed.data));
  } catch (err) {
    const status = dailyItemErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

// Bulk-populates a $0 entry for every day of the trip's date range (see
// autoCreateDailyItems) — the "Manage days" table's one-click alternative to
// POST /daily above. Idempotent: already-populated dates are left alone.
router.post('/budget/items/:id/daily/auto-create', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Line item not found' });

  try {
    res.json(autoCreateDailyItems(id));
  } catch (err) {
    const status = dailyItemErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

const dailyItemUpdateSchema = dailyItemSchema.partial();

router.put('/budget/items/:id/daily/:dailyId', requireAdmin, (req, res) => {
  const dailyId = Number(req.params.dailyId);
  if (!Number.isInteger(dailyId)) return res.status(404).json({ error: 'Day-by-day entry not found' });

  const parsed = dailyItemUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  try {
    res.json(updateDailyItem(dailyId, parsed.data));
  } catch (err) {
    const status = dailyItemErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

router.delete('/budget/items/:id/daily/:dailyId', requireAdmin, (req, res) => {
  const dailyId = Number(req.params.dailyId);
  if (!Number.isInteger(dailyId)) return res.status(404).json({ error: 'Day-by-day entry not found' });

  try {
    deleteDailyItem(dailyId);
    res.status(204).end();
  } catch (err) {
    const status = dailyItemErrorStatus(err);
    if (status) return res.status(status).json({ error: err.message });
    throw err;
  }
});

// Pins (or, with null, clears) this row's # Students figure — independent
// of type/value, so it's its own endpoint rather than folded into either
// PUT /budget/items or PUT /budget/items/:id/type.
const studentCountOverrideSchema = z.object({
  student_count_override: z.coerce.number().int().min(0).nullable(),
});

router.put('/budget/items/:id/student-count-override', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Line item not found' });

  const parsed = studentCountOverrideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  const item = updateStudentCountOverride(id, parsed.data.student_count_override);
  if (!item) return res.status(404).json({ error: 'Line item not found' });
  res.json(item);
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
    if (err.code === 'TRIP_MISMATCH') {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

router.delete('/budget/exclusions/:tripBudgetItemId/:participantId', requireAdmin, (req, res) => {
  try {
    clearExclusion(Number(req.params.tripBudgetItemId), Number(req.params.participantId));
    res.status(204).end();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(404).json({ error: 'Unknown trip_budget_item_id or participant_id' });
    }
    throw err;
  }
});

export default router;
