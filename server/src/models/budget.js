import { db } from '../db/connection.js';
import { getStats } from './participants.js';

export function listActiveCategories() {
  return db.prepare('SELECT * FROM budget_categories WHERE retired = 0 ORDER BY sort_order').all();
}

export function listAllCategories() {
  return db.prepare('SELECT * FROM budget_categories ORDER BY sort_order').all();
}

export function createCategory(name) {
  const existing = db
    .prepare('SELECT 1 FROM budget_categories WHERE name = ? COLLATE NOCASE')
    .get(name);
  if (existing) {
    const err = new Error(`Category "${name}" already exists`);
    err.code = 'DUPLICATE_CATEGORY';
    throw err;
  }
  const { maxSort } = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM budget_categories')
    .get();
  const info = db
    .prepare('INSERT INTO budget_categories (name, sort_order) VALUES (?, ?)')
    .run(name, maxSort + 1);
  return db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(info.lastInsertRowid);
}

// Soft-retire only (Premise 7) — a category that any trip_budget_items row
// still references can't be retired, since that row's category name/sort
// order needs to keep resolving for historical display.
export function retireCategory(id) {
  const referenced = db
    .prepare('SELECT 1 FROM trip_budget_items WHERE category_id = ? LIMIT 1')
    .get(id);
  if (referenced) {
    const err = new Error('Category is still referenced by a trip budget item');
    err.code = 'CATEGORY_IN_USE';
    throw err;
  }
  db.prepare('UPDATE budget_categories SET retired = 1 WHERE id = ?').run(id);
  return db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(id);
}

// Most recent trip strictly before `year` — not `year - 1`, so a skipped
// year still resolves to the real prior trip (Premise 11).
function resolvePreviousTrip(year) {
  return db.prepare('SELECT * FROM trips WHERE year < ? ORDER BY year DESC, id DESC LIMIT 1').get(year);
}

// Batch-fetches exclusion rows for a set of trip_budget_items in one query
// (Premise 14 / Revision 1) instead of one query per line item.
function exclusionsByItem(tripBudgetItemIds) {
  const byItem = {};
  for (const id of tripBudgetItemIds) byItem[id] = [];
  if (tripBudgetItemIds.length === 0) return byItem;

  const placeholders = tripBudgetItemIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT trip_budget_item_id, participant_id
       FROM trip_budget_exclusions
       WHERE trip_budget_item_id IN (${placeholders})`
    )
    .all(...tripBudgetItemIds);

  for (const row of rows) {
    byItem[row.trip_budget_item_id].push(row.participant_id);
  }
  return byItem;
}

function perPanther(total, students) {
  return students === 0 ? null : total / students;
}

// A 'totals' row divides an entered total across the roster, same as every
// row did before row types existed. A 'per_swimmer' row is a fixed rate —
// total_per_panther IS the rate (never divided, so it can't drift when the
// roster changes), and total is derived (rate × students) purely for Diff
// and the grand-totals footer. rate_per_athlete NULL (no rate set yet) means
// total_per_panther renders "—" and total is 0, not NaN.
function computeAmounts(item, students) {
  if (item.type === 'per_swimmer') {
    const rate = item.rate_per_athlete;
    return { total: (rate ?? 0) * students, total_per_panther: rate };
  }
  return { total: item.total, total_per_panther: perPanther(item.total, students) };
}

function lineItemsForTrip(tripId) {
  return db
    .prepare(
      `SELECT i.id, i.category_id, i.total, i.type, i.rate_per_athlete,
              c.name AS category, c.sort_order
       FROM trip_budget_items i
       JOIN budget_categories c ON c.id = i.category_id
       WHERE i.trip_id = ?
       ORDER BY c.sort_order`
    )
    .all(tripId);
}

// Returns null if the trip doesn't exist, so the route can 400 (Data Flow).
export function getBudgetForTrip(tripId) {
  const trip = db.prepare('SELECT id, year FROM trips WHERE id = ?').get(tripId);
  if (!trip) return null;

  const items = lineItemsForTrip(trip.id);
  const exclusions = exclusionsByItem(items.map((i) => i.id));
  const studentsActive = getStats(trip.id).students_active;

  const previousTrip = resolvePreviousTrip(trip.year);
  const priorItems = previousTrip ? lineItemsForTrip(previousTrip.id) : [];
  const priorExclusions = exclusionsByItem(priorItems.map((i) => i.id));
  const priorStudentsActive = previousTrip ? getStats(previousTrip.id).students_active : 0;
  const priorByCategory = Object.fromEntries(priorItems.map((i) => [i.category_id, i]));

  return items.map((item) => {
    const excludedIds = exclusions[item.id];
    const students = Math.max(0, studentsActive - excludedIds.length);
    const { total, total_per_panther } = computeAmounts(item, students);

    // Symmetric branch: the prior item's OWN stored type drives its own
    // computation — never retroactively affected by this year's row type.
    const priorItem = priorByCategory[item.category_id];
    let priorTotal = null;
    let priorTotalPerPanther = null;
    if (priorItem) {
      const priorStudents = Math.max(0, priorStudentsActive - priorExclusions[priorItem.id].length);
      const priorAmounts = computeAmounts(priorItem, priorStudents);
      priorTotal = priorAmounts.total;
      priorTotalPerPanther = priorAmounts.total_per_panther;
    }

    return {
      trip_budget_item_id: item.id,
      category_id: item.category_id,
      category: item.category,
      type: item.type,
      rate_per_athlete: item.rate_per_athlete,
      total,
      students,
      total_per_panther,
      diff: priorTotal == null ? null : total - priorTotal,
      prior_total_per_panther: priorTotalPerPanther,
      excluded_participant_ids: excludedIds,
    };
  });
}

// The type a NEW row for this category should start as, carried forward
// from that category's most recent prior-year item (Premise 5) — 'totals'
// if no prior item exists. Used by attachCategoryToTrip (an existing trip
// missing a category) — seedBudgetForNewTrip (whole-trip creation) has its
// own batched version of this same lookup, since it already has the
// previous trip's id in scope and iterates every category at once.
function carriedForwardType(tripId, categoryId) {
  const trip = db.prepare('SELECT year FROM trips WHERE id = ?').get(tripId);
  if (!trip) return 'totals';
  const previousTrip = resolvePreviousTrip(trip.year);
  if (!previousTrip) return 'totals';
  const priorItem = db
    .prepare('SELECT type FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
    .get(previousTrip.id, categoryId);
  return priorItem ? priorItem.type : 'totals';
}

// Attaches a category to a trip at zero value (an existing trip missing a
// category — either newly added, or a trip that predates this category).
// Type carries forward (carriedForwardType); total/rate_per_athlete always
// start at 0/NULL regardless of type. Idempotent — ON CONFLICT DO NOTHING,
// so "add all missing" is safe even if a row already exists.
export function attachCategoryToTrip(tripId, categoryId) {
  if (!db.prepare('SELECT 1 FROM trips WHERE id = ?').get(tripId)) {
    const err = new Error('Unknown trip_id');
    err.code = 'TRIP_NOT_FOUND';
    throw err;
  }
  const type = carriedForwardType(tripId, categoryId);
  db.prepare(
    `INSERT INTO trip_budget_items (trip_id, category_id, total, type)
     VALUES (?, ?, 0, ?)
     ON CONFLICT (trip_id, category_id) DO NOTHING`
  ).run(tripId, categoryId, type);
  return db.prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?').get(tripId, categoryId);
}

// Edits an EXISTING row's value — total for a 'totals' row, rate_per_athlete
// for a 'per_swimmer' row, keyed off that row's own stored type. Rejects the
// field that doesn't match (WRONG_FIELD_FOR_TYPE) the same way a negative
// value is rejected — creation is a separate action (attachCategoryToTrip).
export function updateLineItemValue(tripId, categoryId, { total, rate_per_athlete }) {
  const item = db
    .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
    .get(tripId, categoryId);
  if (!item) {
    const err = new Error('No line item exists for this trip/category — attach the category first');
    err.code = 'ITEM_NOT_FOUND';
    throw err;
  }

  if (item.type === 'totals') {
    if (rate_per_athlete !== undefined) {
      const err = new Error('This row is totals-based; set total, not rate_per_athlete');
      err.code = 'WRONG_FIELD_FOR_TYPE';
      throw err;
    }
    if (!Number.isFinite(total) || total < 0) {
      const err = new Error('total must be a non-negative number');
      err.code = 'INVALID_TOTAL';
      throw err;
    }
    db.prepare('UPDATE trip_budget_items SET total = ? WHERE id = ?').run(total, item.id);
  } else {
    if (total !== undefined) {
      const err = new Error('This row is per-swimmer-based; set rate_per_athlete, not total');
      err.code = 'WRONG_FIELD_FOR_TYPE';
      throw err;
    }
    if (!Number.isFinite(rate_per_athlete) || rate_per_athlete < 0) {
      const err = new Error('rate_per_athlete must be a non-negative number');
      err.code = 'INVALID_RATE';
      throw err;
    }
    db.prepare('UPDATE trip_budget_items SET rate_per_athlete = ? WHERE id = ?').run(rate_per_athlete, item.id);
  }

  return db.prepare('SELECT * FROM trip_budget_items WHERE id = ?').get(item.id);
}

// Switches an existing row's type, clearing the other field rather than
// converting it — a computed guess (e.g. deriving a rate from
// total ÷ current students) would present a fabricated number as if it were
// a real fact. Returns null if the row doesn't exist (route 404s).
export function switchLineItemType(tripBudgetItemId, type) {
  if (type !== 'totals' && type !== 'per_swimmer') {
    const err = new Error("type must be 'totals' or 'per_swimmer'");
    err.code = 'INVALID_TYPE';
    throw err;
  }
  if (!db.prepare('SELECT 1 FROM trip_budget_items WHERE id = ?').get(tripBudgetItemId)) {
    return null;
  }
  db.prepare('UPDATE trip_budget_items SET type = ?, total = 0, rate_per_athlete = NULL WHERE id = ?').run(
    type,
    tripBudgetItemId
  );
  return db.prepare('SELECT * FROM trip_budget_items WHERE id = ?').get(tripBudgetItemId);
}

// Both rows must exist (enforced by the FK columns) AND belong to the same
// trip — without this check, excluding a participant from an unrelated
// trip's line item silently corrupts that trip's per-panther math (and,
// via resolvePreviousTrip, the following year's prior-year comparison too).
export function setExclusion(tripBudgetItemId, participantId) {
  const item = db.prepare('SELECT trip_id FROM trip_budget_items WHERE id = ?').get(tripBudgetItemId);
  const participant = db.prepare('SELECT trip_id FROM participants WHERE id = ?').get(participantId);

  if (!item || !participant) {
    const err = new Error('Unknown trip_budget_item_id or participant_id');
    err.code = 'SQLITE_CONSTRAINT_FOREIGNKEY';
    throw err;
  }
  if (item.trip_id !== participant.trip_id) {
    const err = new Error('trip_budget_item_id and participant_id belong to different trips');
    err.code = 'TRIP_MISMATCH';
    throw err;
  }

  db.prepare(
    `INSERT OR IGNORE INTO trip_budget_exclusions (trip_budget_item_id, participant_id) VALUES (?, ?)`
  ).run(tripBudgetItemId, participantId);
}

export function clearExclusion(tripBudgetItemId, participantId) {
  db.prepare(
    `DELETE FROM trip_budget_exclusions WHERE trip_budget_item_id = ? AND participant_id = ?`
  ).run(tripBudgetItemId, participantId);
}

// Called from within createTrip() (T5) so a new trip's category list carries
// forward from the global budget_categories table — NOT from the previous
// trip's row, which is a different mechanism (DETAIL_FIELDS in trips.js).
// `previousTripId` is passed straight through by the caller (which already
// has it in scope) rather than looked up again here — each category's row
// `type` DOES carry forward from that previous trip's item (Premise 5),
// distinct from the total/rate reset below, which always starts fresh.
export function seedBudgetForNewTrip(tripId, previousTripId) {
  const priorTypes = previousTripId
    ? Object.fromEntries(
        db
          .prepare('SELECT category_id, type FROM trip_budget_items WHERE trip_id = ?')
          .all(previousTripId)
          .map((row) => [row.category_id, row.type])
      )
    : {};
  const insert = db.prepare(
    'INSERT INTO trip_budget_items (trip_id, category_id, total, type) VALUES (?, ?, 0, ?)'
  );
  for (const category of listActiveCategories()) {
    insert.run(tripId, category.id, priorTypes[category.id] ?? 'totals');
  }
}
