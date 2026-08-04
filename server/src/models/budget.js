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

function lineItemsForTrip(tripId) {
  return db
    .prepare(
      `SELECT i.id, i.category_id, i.total, c.name AS category, c.sort_order
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
    const priorItem = priorByCategory[item.category_id];
    const priorTotal = priorItem ? priorItem.total : null;
    const priorStudents = priorItem
      ? Math.max(0, priorStudentsActive - priorExclusions[priorItem.id].length)
      : null;

    return {
      trip_budget_item_id: item.id,
      category_id: item.category_id,
      category: item.category,
      total: item.total,
      students,
      total_per_panther: perPanther(item.total, students),
      diff: priorTotal == null ? null : item.total - priorTotal,
      prior_total_per_panther: priorTotal == null ? null : perPanther(priorTotal, priorStudents),
      excluded_participant_ids: excludedIds,
    };
  });
}

export function upsertLineItem(tripId, categoryId, total) {
  if (!Number.isFinite(total) || total < 0) {
    const err = new Error('total must be a non-negative number');
    err.code = 'INVALID_TOTAL';
    throw err;
  }
  db.prepare(
    `INSERT INTO trip_budget_items (trip_id, category_id, total)
     VALUES (?, ?, ?)
     ON CONFLICT (trip_id, category_id) DO UPDATE SET total = excluded.total`
  ).run(tripId, categoryId, total);
  return db.prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?').get(tripId, categoryId);
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
export function seedBudgetForNewTrip(tripId) {
  const insert = db.prepare('INSERT INTO trip_budget_items (trip_id, category_id, total) VALUES (?, ?, 0)');
  for (const category of listActiveCategories()) {
    insert.run(tripId, category.id);
  }
}
