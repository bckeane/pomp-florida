import { db } from '../db/connection.js';
import { getCurrentTripId, setCurrentTripId } from './settings.js';
import { seedBudgetForNewTrip } from './budget.js';

// Deposit defaults to 60% of the estimated cost (adjustable per trip via
// deposit_percent, e.g. a slider in the admin UI), final payment the
// remainder — computed here (not stored) so the two always sum exactly to
// estimated_cost with no separate numbers to keep in sync. The deposit is
// floored to the nearest $100 (a cleaner number to ask families for than an
// arbitrary percentage of an estimate), with final payment absorbing the
// rounding difference. Exported so participants.js can derive the same
// per-trip target for balance-owed math.
export function computeDepositAndFinal(estimatedCost, depositPercent) {
  if (estimatedCost == null) return { deposit_amount: null, final_payment_estimate: null };
  const percent = depositPercent ?? 60;
  const deposit_amount = Math.floor((estimatedCost * percent) / 100 / 100) * 100;
  return { deposit_amount, final_payment_estimate: estimatedCost - deposit_amount };
}

// The low/high range shown to families is estimated_cost ± the admin-set
// spread percent (defaults to 0 — no spread — when unset).
function computeCostRange(estimatedCost, spreadPercent) {
  if (estimatedCost == null) return { cost_low: null, cost_high: null };
  const spread = spreadPercent ?? 0;
  return {
    cost_low: Math.round(estimatedCost * (1 - spread / 100)),
    cost_high: Math.round(estimatedCost * (1 + spread / 100)),
  };
}

function withComputedCostFields(trip) {
  if (!trip) return trip;
  return {
    ...trip,
    ...computeDepositAndFinal(trip.estimated_cost, trip.deposit_percent),
    ...computeCostRange(trip.estimated_cost, trip.cost_spread_percent),
  };
}

export function listTrips() {
  const trips = db.prepare('SELECT * FROM trips ORDER BY year DESC, id DESC').all();
  const currentId = getCurrentTripId();
  return trips.map((t) => ({ ...withComputedCostFields(t), is_current: t.id === currentId }));
}

export function getTripById(id) {
  return withComputedCostFields(db.prepare('SELECT * FROM trips WHERE id = ?').get(id));
}

export function getCurrentTrip() {
  const id = getCurrentTripId();
  return id ? getTripById(id) : null;
}

// Detail fields are all optional/nullable — they back the public home page's
// copy and aren't required for a trip to exist or run the roster.
const DETAIL_FIELDS = [
  'intro_message',
  'return_date',
  'commitment_deadline',
  'final_payment_due',
  'estimated_cost',
  'deposit_percent',
  'cost_spread_percent',
  'overrun_amount',
  'overrun_due_date',
  'training_location',
  'training_location_url',
  'lodging',
  'lodging_url',
  'meals_info',
  'whats_included',
  'payment_notes',
  'coordinators',
  'contact_email',
  'miss_school_note',
];
const UPDATABLE_FIELDS = ['name', 'trip_date', ...DETAIL_FIELDS];

// New trips start as a copy of the most recent trip's detail fields (lodging,
// coordinators, what's included, etc. rarely change year to year) so the
// public home page has real content immediately and an admin only has to
// touch what actually changed (dates, cost) instead of retyping everything.
// createTrip + seedBudgetForNewTrip run in one transaction (Failure Modes,
// CRITICAL) — a trip must never exist without its budget line items, and
// vice versa; either both commit or neither does.
const createTripAndSeedBudget = db.transaction(({ year, name, trip_date }) => {
  const now = new Date().toISOString();
  const previous = db.prepare('SELECT * FROM trips ORDER BY year DESC, id DESC LIMIT 1').get();

  const columns = ['year', 'name', 'trip_date', 'created_at', ...DETAIL_FIELDS];
  const values = { year, name, trip_date, created_at: now };
  for (const field of DETAIL_FIELDS) {
    values[field] = previous ? previous[field] : null;
  }

  const info = db
    .prepare(`INSERT INTO trips (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`)
    .run(values);

  seedBudgetForNewTrip(info.lastInsertRowid, previous ? previous.id : null);

  return info.lastInsertRowid;
});

export function createTrip({ year, name, trip_date }) {
  const id = createTripAndSeedBudget({ year, name, trip_date });
  return getTripById(id);
}

export function updateTrip(id, data) {
  const existing = getTripById(id);
  if (!existing) return null;
  const merged = {};
  for (const field of UPDATABLE_FIELDS) {
    merged[field] = data[field] !== undefined ? data[field] : existing[field];
  }
  const assignments = UPDATABLE_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE trips SET ${assignments} WHERE id = @id`).run({ ...merged, id });
  return getTripById(id);
}

export function activateTrip(id) {
  const trip = getTripById(id);
  if (!trip) return null;
  setCurrentTripId(id);
  return trip;
}
