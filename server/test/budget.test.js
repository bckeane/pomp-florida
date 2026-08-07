import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip } from '../src/models/trips.js';
import { createParticipant } from '../src/models/participants.js';
import {
  listActiveCategories,
  createCategory,
  retireCategory,
  getBudgetForTrip,
  attachCategoryToTrip,
  updateLineItemValue,
  switchLineItemType,
  setExclusion,
  clearExclusion,
} from '../src/models/budget.js';

function addStudent(tripId) {
  return createParticipant({ first_name: 'S', last_name: 'Test', role: 'Swimmer', trip_id: tripId });
}

function category(name) {
  return listActiveCategories().find((c) => c.name === name);
}

// Attach + set a total in one call — the pre-row-types tests all just want a
// 'totals' row with a specific value in one step, mirroring the pre-row-types
// upsert-style API these tests were originally written against.
function setTotal(tripId, categoryId, total) {
  attachCategoryToTrip(tripId, categoryId);
  return updateLineItemValue(tripId, categoryId, { total });
}

// Wipe trips/items/participants (not budget_categories — the real seeded
// list is shared fixture data) before every test so trip years and
// resolvePreviousTrip's "most recent prior trip" logic are fully isolated.
beforeEach(() => {
  db.exec(`
    DELETE FROM trip_budget_exclusions;
    DELETE FROM trip_budget_items;
    DELETE FROM participants;
    DELETE FROM trips;
  `);
});

describe('getBudgetForTrip', () => {
  it('computes total_per_panther and diff against the prior trip', () => {
    const prior = createTrip({ year: '2060', name: 'Prior', trip_date: '2060-01-01' });
    const current = createTrip({ year: '2061', name: 'Current', trip_date: '2061-01-01' });
    for (let i = 0; i < 4; i++) addStudent(prior.id);
    for (let i = 0; i < 5; i++) addStudent(current.id);

    const airfare = category('Airfare');
    setTotal(prior.id, airfare.id, 400);
    setTotal(current.id, airfare.id, 1000);

    const row = getBudgetForTrip(current.id).find((i) => i.category_id === airfare.id);
    expect(row.students).toBe(5);
    expect(row.total_per_panther).toBe(200);
    expect(row.diff).toBe(600);
    expect(row.prior_total_per_panther).toBe(100);
  });

  it('guards against divide-by-zero when the roster is empty', () => {
    const trip = createTrip({ year: '2062', name: 'Empty roster', trip_date: '2062-01-01' });
    const airfare = category('Airfare');
    setTotal(trip.id, airfare.id, 500);

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(row.students).toBe(0);
    expect(row.total_per_panther).toBeNull();
  });

  it('returns null diff/prior_total_per_panther when there is no earlier trip', () => {
    const trip = createTrip({ year: '1999', name: 'First ever', trip_date: '1999-01-01' });
    const airfare = category('Airfare');
    setTotal(trip.id, airfare.id, 500);

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(row.diff).toBeNull();
    expect(row.prior_total_per_panther).toBeNull();
  });
});

describe('per-student exclusions', () => {
  it("excluding a student lowers only that category's divisor", () => {
    const trip = createTrip({ year: '2063', name: 'Test', trip_date: '2063-01-01' });
    const s1 = addStudent(trip.id);
    addStudent(trip.id);
    const airfare = category('Airfare');
    const hotel = category('Hotel');
    setTotal(trip.id, airfare.id, 200);
    setTotal(trip.id, hotel.id, 200);

    const airfareItem = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    setExclusion(airfareItem.trip_budget_item_id, s1.id);

    const after = getBudgetForTrip(trip.id);
    expect(after.find((i) => i.category_id === airfare.id).students).toBe(1);
    expect(after.find((i) => i.category_id === hotel.id).students).toBe(2);
  });

  it('excluding every student hits the same divide-by-zero guard as an empty roster', () => {
    const trip = createTrip({ year: '2064', name: 'Test', trip_date: '2064-01-01' });
    const s1 = addStudent(trip.id);
    const airfare = category('Airfare');
    setTotal(trip.id, airfare.id, 200);

    const item = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    setExclusion(item.trip_budget_item_id, s1.id);

    const excluded = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(excluded.students).toBe(0);
    expect(excluded.total_per_panther).toBeNull();

    clearExclusion(item.trip_budget_item_id, s1.id);
    const restored = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(restored.students).toBe(1);
  });
});

describe('category management', () => {
  it('rejects a duplicate category name, case-insensitively', () => {
    expect(() => createCategory('airfare')).toThrowError(/already exists/);
  });

  it('blocks retiring a category still referenced by a trip line item', () => {
    const trip = createTrip({ year: '2065', name: 'Test', trip_date: '2065-01-01' });
    const airfare = category('Airfare');
    setTotal(trip.id, airfare.id, 100);

    expect(() => retireCategory(airfare.id)).toThrowError(/referenced/);
  });

  it('allows retiring a category with no line items', () => {
    const fresh = createCategory('Unused Test Category');
    const retired = retireCategory(fresh.id);
    expect(retired.retired).toBe(1);
  });
});

describe('attachCategoryToTrip', () => {
  it('creates a new totals row for a category added after the trip already existed', () => {
    const trip = createTrip({ year: '2068', name: 'Test', trip_date: '2068-01-01' });
    // createTrip already auto-seeds every currently-active category — a
    // category created AFTER that has no row on this trip yet, which is the
    // real "missing category" case attachCategoryToTrip exists for.
    const newCategory = createCategory('Test-Only Category 2068');
    const item = attachCategoryToTrip(trip.id, newCategory.id);
    expect(item.type).toBe('totals');
    expect(item.total).toBe(0);
    expect(item.rate_per_athlete).toBeNull();
  });

  it('is idempotent — does not clobber an already-priced row', () => {
    const trip = createTrip({ year: '2069', name: 'Test', trip_date: '2069-01-01' });
    const airfare = category('Airfare');
    setTotal(trip.id, airfare.id, 500);

    attachCategoryToTrip(trip.id, airfare.id);
    const item = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(item.total).toBe(500);
  });

  it('rejects an unknown trip', () => {
    const airfare = category('Airfare');
    expect(() => attachCategoryToTrip(999999, airfare.id)).toThrowError(/Unknown trip_id/);
  });
});

describe('updateLineItemValue', () => {
  it('rejects a negative total', () => {
    const trip = createTrip({ year: '2066', name: 'Test', trip_date: '2066-01-01' });
    const airfare = category('Airfare');
    attachCategoryToTrip(trip.id, airfare.id);
    expect(() => updateLineItemValue(trip.id, airfare.id, { total: -5 })).toThrowError(/non-negative/);
  });

  it('updates the total in place instead of duplicating the row', () => {
    const trip = createTrip({ year: '2067', name: 'Test', trip_date: '2067-01-01' });
    const airfare = category('Airfare');
    setTotal(trip.id, airfare.id, 100);
    setTotal(trip.id, airfare.id, 250);

    const rows = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .all(trip.id, airfare.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(250);
  });

  it('errors if no row exists yet for this trip/category', () => {
    const trip = createTrip({ year: '2070', name: 'Test', trip_date: '2070-01-01' });
    // createTrip already auto-seeds every currently-active category — use a
    // category created after the trip existed, which genuinely has no row.
    const newCategory = createCategory('Update-Test-Only Category 2070');
    expect(() => updateLineItemValue(trip.id, newCategory.id, { total: 100 })).toThrowError(
      /attach the category/
    );
  });

  it('rejects total on a per_swimmer row, and rate_per_athlete on a totals row', () => {
    const trip = createTrip({ year: '2071', name: 'Test', trip_date: '2071-01-01' });
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'per_swimmer');

    expect(() => updateLineItemValue(trip.id, airfare.id, { total: 100 })).toThrowError(
      /per-swimmer-based/
    );

    switchLineItemType(item.id, 'totals');
    expect(() => updateLineItemValue(trip.id, airfare.id, { rate_per_athlete: 50 })).toThrowError(
      /totals-based/
    );
  });
});

describe('per_swimmer rows', () => {
  it('total_per_panther equals the entered rate exactly, regardless of roster size', () => {
    const trip = createTrip({ year: '2072', name: 'Test', trip_date: '2072-01-01' });
    for (let i = 0; i < 30; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'per_swimmer');
    updateLineItemValue(trip.id, airfare.id, { rate_per_athlete: 50 });

    const before = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(before.total_per_panther).toBe(50);
    expect(before.total).toBe(1500);

    // Roster shrinks after the rate was set — the regression this design
    // exists to prevent: total_per_panther must stay 50, not recompute as
    // total ÷ new (smaller) student count.
    const rows = db.prepare('SELECT id FROM participants WHERE trip_id = ?').all(trip.id);
    db.prepare('UPDATE participants SET active = 0 WHERE id = ?').run(rows[0].id);

    const after = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(after.total_per_panther).toBe(50);
    expect(after.total).toBe(29 * 50);
  });

  it('renders total_per_panther as null (not NaN) and total as 0 when no rate is set yet', () => {
    const trip = createTrip({ year: '2073', name: 'Test', trip_date: '2073-01-01' });
    for (let i = 0; i < 5; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'per_swimmer');

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(row.total_per_panther).toBeNull();
    expect(row.total).toBe(0);
  });

  it('rejects a negative rate', () => {
    const trip = createTrip({ year: '2074', name: 'Test', trip_date: '2074-01-01' });
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'per_swimmer');
    expect(() => updateLineItemValue(trip.id, airfare.id, { rate_per_athlete: -10 })).toThrowError(
      /non-negative/
    );
  });
});

describe('switchLineItemType', () => {
  it('clears rate_per_athlete when switching totals → per_swimmer', () => {
    const trip = createTrip({ year: '2075', name: 'Test', trip_date: '2075-01-01' });
    const airfare = category('Airfare');
    const item = setTotal(trip.id, airfare.id, 300);

    const switched = switchLineItemType(item.id, 'per_swimmer');
    expect(switched.type).toBe('per_swimmer');
    expect(switched.rate_per_athlete).toBeNull();
    expect(switched.total).toBe(0);
  });

  it('clears total when switching per_swimmer → totals', () => {
    const trip = createTrip({ year: '2076', name: 'Test', trip_date: '2076-01-01' });
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'per_swimmer');
    updateLineItemValue(trip.id, airfare.id, { rate_per_athlete: 40 });

    const switched = switchLineItemType(item.id, 'totals');
    expect(switched.type).toBe('totals');
    expect(switched.total).toBe(0);
    expect(switched.rate_per_athlete).toBeNull();
  });

  it('returns null for an unknown line item id', () => {
    expect(switchLineItemType(999999, 'totals')).toBeNull();
  });
});

describe('closed-prior-year immutability (Premise 2 regression)', () => {
  it("changing this year's row type never alters the prior year's already-computed figures", () => {
    const prior = createTrip({ year: '2077', name: 'Prior', trip_date: '2077-01-01' });
    const current = createTrip({ year: '2078', name: 'Current', trip_date: '2078-01-01' });
    for (let i = 0; i < 10; i++) addStudent(prior.id);
    for (let i = 0; i < 10; i++) addStudent(current.id);

    const airfare = category('Airfare');
    const priorItem = attachCategoryToTrip(prior.id, airfare.id);
    switchLineItemType(priorItem.id, 'per_swimmer');
    updateLineItemValue(prior.id, airfare.id, { rate_per_athlete: 75 });

    const priorRowBefore = getBudgetForTrip(prior.id).find((i) => i.category_id === airfare.id);
    expect(priorRowBefore.total_per_panther).toBe(75);
    expect(priorRowBefore.total).toBe(750);

    // Current year's row for the same category starts as 'totals' (no prior
    // item to carry forward from when THIS trip was created, since prior's
    // type was set after the fact) — switch it to something different.
    const currentItem = attachCategoryToTrip(current.id, airfare.id);
    switchLineItemType(currentItem.id, 'per_swimmer');
    updateLineItemValue(current.id, airfare.id, { rate_per_athlete: 999 });

    const priorRowAfter = getBudgetForTrip(prior.id).find((i) => i.category_id === airfare.id);
    expect(priorRowAfter.total_per_panther).toBe(75);
    expect(priorRowAfter.total).toBe(750);

    const currentDiff = getBudgetForTrip(current.id).find((i) => i.category_id === airfare.id);
    expect(currentDiff.prior_total_per_panther).toBe(75);
    expect(currentDiff.diff).toBe(999 * 10 - 750);
  });
});

describe('type carry-forward on trip creation', () => {
  it("a new trip's row copies type from the same category's most recent prior-year item", () => {
    const prior = createTrip({ year: '2079', name: 'Prior', trip_date: '2079-01-01' });
    const airfare = category('Airfare');
    const priorItem = attachCategoryToTrip(prior.id, airfare.id);
    switchLineItemType(priorItem.id, 'per_swimmer');

    const current = createTrip({ year: '2080', name: 'Current', trip_date: '2080-01-01' });
    const currentItem = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(current.id, airfare.id);
    expect(currentItem.type).toBe('per_swimmer');
    expect(currentItem.total).toBe(0);
    expect(currentItem.rate_per_athlete).toBeNull();
  });

  it('defaults to totals when the category has no prior-year item', () => {
    const trip = createTrip({ year: '2081', name: 'First ever for this category set', trip_date: '2081-01-01' });
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    expect(item.type).toBe('totals');
  });
});
