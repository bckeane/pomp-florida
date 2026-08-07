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

// Soft-retire only — never deletes the category row, so any trip_budget_items
// row that already references it keeps resolving its name/sort_order for
// historical display exactly as before. retired only affects two forward-
// looking things: the "add existing category" picker (listAllCategories
// callers filter it client-side) and seedBudgetForNewTrip's active-category
// scan below — it does not touch any trip's existing line items.
export function retireCategory(id) {
  db.prepare('UPDATE budget_categories SET retired = 1 WHERE id = ?').run(id);
  return db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(id);
}

export function unretireCategory(id) {
  db.prepare('UPDATE budget_categories SET retired = 0 WHERE id = ?').run(id);
  return db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(id);
}

// Detaches a category from a single trip's budget table — the "per year"
// counterpart to retireCategory's global scope. Only allowed at zero value
// (zero total, or zero/unset rate_per_athlete) so a real dollar figure can
// never be silently dropped; the admin must zero it out first, same spirit
// as switchLineItemType resetting rather than converting a value.
export function detachCategoryFromTrip(tripId, categoryId) {
  const item = db.prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?').get(tripId, categoryId);
  if (!item) {
    const err = new Error('No line item exists for this trip/category');
    err.code = 'ITEM_NOT_FOUND';
    throw err;
  }

  const hasValue =
    item.type === 'totals'
      ? item.total !== 0
      : item.type === 'per_swimmer'
        ? (item.rate_per_athlete ?? 0) !== 0
        : (item.percent_rate ?? 0) !== 0;
  if (hasValue) {
    const err = new Error('Zero out the total before removing this category from this trip');
    err.code = 'ITEM_HAS_VALUE';
    throw err;
  }

  const detachTx = db.transaction(() => {
    db.prepare('DELETE FROM trip_budget_exclusions WHERE trip_budget_item_id = ?').run(item.id);
    db.prepare('DELETE FROM trip_budget_items WHERE id = ?').run(item.id);
  });
  detachTx();
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
function computeSingleAmount(item, students) {
  if (item.type === 'per_swimmer') {
    const rate = item.rate_per_athlete;
    return { total: (rate ?? 0) * students, total_per_panther: rate };
  }
  return { total: item.total, total_per_panther: perPanther(item.total, students) };
}

// 'service_charge' rows (e.g. Stripe's 2.9%) apply to the summed Total/Panther
// of every OTHER item — the per-family figure, not the trip's grand total —
// so two categories with different opt-out divisors are weighted per-family
// the same way the footer's own Total/Panther sum already is (a null
// total_per_panther, from a zero-student divisor, counts as 0 toward that
// sum). Computed in a second pass once that base is known — never carried in
// from a prior year's stale figure, and never applied to itself.
// total_per_panther for the service_charge row is percent × that base
// directly (independent of this row's own student count, same as
// per_swimmer's rate); total is that rate × this row's own students,
// rounded to the nearest whole dollar (Premise 6).
function computeAmountsForItems(items, studentsForItem) {
  const amounts = {};
  let basePerPanther = 0;
  for (const item of items) {
    if (item.type === 'service_charge') continue;
    const result = computeSingleAmount(item, studentsForItem(item));
    amounts[item.id] = result;
    basePerPanther += result.total_per_panther ?? 0;
  }
  for (const item of items) {
    if (item.type !== 'service_charge') continue;
    const total_per_panther = ((item.percent_rate ?? 0) / 100) * basePerPanther;
    const total = Math.round(total_per_panther * studentsForItem(item));
    amounts[item.id] = { total, total_per_panther };
  }
  return amounts;
}

function lineItemsForTrip(tripId) {
  return db
    .prepare(
      `SELECT i.id, i.category_id, i.total, i.type, i.rate_per_athlete, i.percent_rate,
              i.student_count_override, c.name AS category, c.sort_order
       FROM trip_budget_items i
       JOIN budget_categories c ON c.id = i.category_id
       WHERE i.trip_id = ?
       ORDER BY c.sort_order`
    )
    .all(tripId);
}

// The live roster count minus this item's own exclusions, UNLESS an admin
// has pinned a manual student_count_override for this line item — set,
// it replaces the roster-derived figure outright (see migration 019).
function resolveStudents(item, studentsActive, excludedIds) {
  if (item.student_count_override != null) return item.student_count_override;
  return Math.max(0, studentsActive - excludedIds.length);
}

// Returns null if the trip doesn't exist, so the route can 400 (Data Flow).
export function getBudgetForTrip(tripId) {
  const trip = db.prepare('SELECT id, year FROM trips WHERE id = ?').get(tripId);
  if (!trip) return null;

  const items = lineItemsForTrip(trip.id);
  const exclusions = exclusionsByItem(items.map((i) => i.id));
  const studentsActive = getStats(trip.id).students_active;
  const studentsForItem = (item) => resolveStudents(item, studentsActive, exclusions[item.id]);
  const amounts = computeAmountsForItems(items, studentsForItem);

  const previousTrip = resolvePreviousTrip(trip.year);
  const priorItems = previousTrip ? lineItemsForTrip(previousTrip.id) : [];
  const priorExclusions = exclusionsByItem(priorItems.map((i) => i.id));
  const priorStudentsActive = previousTrip ? getStats(previousTrip.id).students_active : 0;
  const priorStudentsForItem = (item) => resolveStudents(item, priorStudentsActive, priorExclusions[item.id]);
  const priorAmounts = computeAmountsForItems(priorItems, priorStudentsForItem);
  const priorByCategory = Object.fromEntries(priorItems.map((i) => [i.category_id, i]));

  return items.map((item) => {
    const excludedIds = exclusions[item.id];
    const students = studentsForItem(item);
    const { total, total_per_panther } = amounts[item.id];

    // Symmetric branch: the prior item's OWN stored type drives its own
    // computation — never retroactively affected by this year's row type.
    const priorItem = priorByCategory[item.category_id];
    let priorTotal = null;
    let priorTotalPerPanther = null;
    if (priorItem) {
      priorTotal = priorAmounts[priorItem.id].total;
      priorTotalPerPanther = priorAmounts[priorItem.id].total_per_panther;
    }

    return {
      trip_budget_item_id: item.id,
      category_id: item.category_id,
      category: item.category,
      type: item.type,
      rate_per_athlete: item.rate_per_athlete,
      percent_rate: item.percent_rate,
      total,
      students,
      student_count_override: item.student_count_override,
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
// for a 'per_swimmer' row, percent_rate for a 'service_charge' row, keyed off
// that row's own stored type. Rejects the fields that don't match
// (WRONG_FIELD_FOR_TYPE) the same way a negative value is rejected —
// creation is a separate action (attachCategoryToTrip).
export function updateLineItemValue(tripId, categoryId, { total, rate_per_athlete, percent_rate }) {
  const item = db
    .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
    .get(tripId, categoryId);
  if (!item) {
    const err = new Error('No line item exists for this trip/category — attach the category first');
    err.code = 'ITEM_NOT_FOUND';
    throw err;
  }

  if (item.type === 'totals') {
    if (rate_per_athlete !== undefined || percent_rate !== undefined) {
      const err = new Error('This row is totals-based; set total, not rate_per_athlete or percent_rate');
      err.code = 'WRONG_FIELD_FOR_TYPE';
      throw err;
    }
    if (!Number.isFinite(total) || total < 0) {
      const err = new Error('total must be a non-negative number');
      err.code = 'INVALID_TOTAL';
      throw err;
    }
    db.prepare('UPDATE trip_budget_items SET total = ? WHERE id = ?').run(total, item.id);
  } else if (item.type === 'per_swimmer') {
    if (total !== undefined || percent_rate !== undefined) {
      const err = new Error('This row is per-swimmer-based; set rate_per_athlete, not total or percent_rate');
      err.code = 'WRONG_FIELD_FOR_TYPE';
      throw err;
    }
    if (!Number.isFinite(rate_per_athlete) || rate_per_athlete < 0) {
      const err = new Error('rate_per_athlete must be a non-negative number');
      err.code = 'INVALID_RATE';
      throw err;
    }
    db.prepare('UPDATE trip_budget_items SET rate_per_athlete = ? WHERE id = ?').run(rate_per_athlete, item.id);
  } else {
    if (total !== undefined || rate_per_athlete !== undefined) {
      const err = new Error('This row is a service charge; set percent_rate, not total or rate_per_athlete');
      err.code = 'WRONG_FIELD_FOR_TYPE';
      throw err;
    }
    if (!Number.isFinite(percent_rate) || percent_rate < 0) {
      const err = new Error('percent_rate must be a non-negative number');
      err.code = 'INVALID_PERCENT';
      throw err;
    }
    db.prepare('UPDATE trip_budget_items SET percent_rate = ? WHERE id = ?').run(percent_rate, item.id);
  }

  return db.prepare('SELECT * FROM trip_budget_items WHERE id = ?').get(item.id);
}

// Switches an existing row's type, clearing the other fields rather than
// converting them — a computed guess (e.g. deriving a rate from
// total ÷ current students) would present a fabricated number as if it were
// a real fact. Returns null if the row doesn't exist (route 404s).
//
// 'service_charge' defaults its percent_rate to 2.9 (Stripe's processing
// fee, the reason this type exists) rather than NULL like the other types'
// reset fields — a concrete starting point since the real-world value is
// almost always exactly this, still editable afterward if a fee changes.
// Only one service_charge row is allowed per trip (SERVICE_CHARGE_LIMIT) —
// a second would be ambiguous about what base it applies to — backstopped
// by the partial unique index in migration 018.
export function switchLineItemType(tripBudgetItemId, type) {
  if (type !== 'totals' && type !== 'per_swimmer' && type !== 'service_charge') {
    const err = new Error("type must be 'totals', 'per_swimmer', or 'service_charge'");
    err.code = 'INVALID_TYPE';
    throw err;
  }
  const item = db.prepare('SELECT * FROM trip_budget_items WHERE id = ?').get(tripBudgetItemId);
  if (!item) return null;

  if (type === 'service_charge') {
    const existing = db
      .prepare(
        `SELECT 1 FROM trip_budget_items WHERE trip_id = ? AND type = 'service_charge' AND id != ?`
      )
      .get(item.trip_id, tripBudgetItemId);
    if (existing) {
      const err = new Error('This trip already has a service charge row — only one is allowed per trip');
      err.code = 'SERVICE_CHARGE_LIMIT';
      throw err;
    }
  }

  const percentRate = type === 'service_charge' ? 2.9 : null;
  db.prepare(
    'UPDATE trip_budget_items SET type = ?, total = 0, rate_per_athlete = NULL, percent_rate = ? WHERE id = ?'
  ).run(type, percentRate, tripBudgetItemId);
  return db.prepare('SELECT * FROM trip_budget_items WHERE id = ?').get(tripBudgetItemId);
}

// Pins (or, with value=null, clears) this row's # Students figure — see
// resolveStudents/migration 019. Independent of type/exclusions, so unlike
// switchLineItemType this never resets any other field. Returns null if the
// row doesn't exist (route 404s).
export function updateStudentCountOverride(tripBudgetItemId, value) {
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    const err = new Error('student_count_override must be null or a non-negative integer');
    err.code = 'INVALID_STUDENT_COUNT';
    throw err;
  }
  if (!db.prepare('SELECT 1 FROM trip_budget_items WHERE id = ?').get(tripBudgetItemId)) {
    return null;
  }
  db.prepare('UPDATE trip_budget_items SET student_count_override = ? WHERE id = ?').run(
    value,
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
