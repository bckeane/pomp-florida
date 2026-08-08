import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip } from '../src/models/trips.js';
import { createParticipant } from '../src/models/participants.js';
import {
  listActiveCategories,
  createCategory,
  retireCategory,
  unretireCategory,
  getBudgetForTrip,
  attachCategoryToTrip,
  detachCategoryFromTrip,
  updateLineItemValue,
  switchLineItemType,
  updateStudentCountOverride,
  setExclusion,
  clearExclusion,
  listDailyItems,
  dailyTotalsByItem,
  addDailyItem,
  updateDailyItem,
  deleteDailyItem,
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
    DELETE FROM trip_budget_daily_items;
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

  it('retires a category even while a trip still references it, without touching that row', () => {
    const trip = createTrip({ year: '2065', name: 'Test', trip_date: '2065-01-01' });
    // A freshly created category, not the shared 'Airfare' fixture — retiring
    // it must not leak into other tests in this file that rely on 'Airfare'
    // remaining active.
    const fresh = createCategory('Still-Referenced Test Category');
    setTotal(trip.id, fresh.id, 100);

    const retired = retireCategory(fresh.id);
    expect(retired.retired).toBe(1);

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === fresh.id);
    expect(row.total).toBe(100);
  });

  it('allows retiring a category with no line items', () => {
    const fresh = createCategory('Unused Test Category');
    const retired = retireCategory(fresh.id);
    expect(retired.retired).toBe(1);
  });

  it('unretireCategory reverses a retire', () => {
    const fresh = createCategory('Restorable Test Category');
    retireCategory(fresh.id);
    const restored = unretireCategory(fresh.id);
    expect(restored.retired).toBe(0);
  });
});

describe('detachCategoryFromTrip', () => {
  it('removes a zero-value line item from just this trip', () => {
    const trip = createTrip({ year: '2090', name: 'Test', trip_date: '2090-01-01' });
    const airfare = category('Airfare');

    detachCategoryFromTrip(trip.id, airfare.id);

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(row).toBeUndefined();
  });

  it('rejects a totals row with a nonzero total', () => {
    const trip = createTrip({ year: '2091', name: 'Test', trip_date: '2091-01-01' });
    const airfare = category('Airfare');
    setTotal(trip.id, airfare.id, 250);

    expect(() => detachCategoryFromTrip(trip.id, airfare.id)).toThrowError(/Zero out/);
    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(row.total).toBe(250);
  });

  it('rejects a per_swimmer row with a nonzero rate', () => {
    const trip = createTrip({ year: '2092', name: 'Test', trip_date: '2092-01-01' });
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'per_swimmer');
    updateLineItemValue(trip.id, airfare.id, { rate_per_athlete: 40 });

    expect(() => detachCategoryFromTrip(trip.id, airfare.id)).toThrowError(/Zero out/);
  });

  it('does not affect other trips referencing the same category', () => {
    const other = createTrip({ year: '2093', name: 'Other', trip_date: '2093-01-01' });
    const trip = createTrip({ year: '2094', name: 'Test', trip_date: '2094-01-01' });
    const airfare = category('Airfare');
    setTotal(other.id, airfare.id, 300);

    detachCategoryFromTrip(trip.id, airfare.id);

    const otherRow = getBudgetForTrip(other.id).find((i) => i.category_id === airfare.id);
    expect(otherRow.total).toBe(300);
  });

  it('errors when no line item exists for this trip/category', () => {
    const trip = createTrip({ year: '2095', name: 'Test', trip_date: '2095-01-01' });
    const fresh = createCategory('Detach-Test-Only Category');
    expect(() => detachCategoryFromTrip(trip.id, fresh.id)).toThrowError(/No line item/);
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

describe('service_charge rows', () => {
  it("applies percent_rate to the summed Total/Panther of every OTHER item, not to itself", () => {
    const trip = createTrip({ year: '2082', name: 'Test', trip_date: '2082-01-01' });
    for (let i = 0; i < 10; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const hotel = category('Hotel');
    const overrun = category('Overrun');
    setTotal(trip.id, airfare.id, 1000);
    setTotal(trip.id, hotel.id, 1000);

    const item = attachCategoryToTrip(trip.id, overrun.id);
    switchLineItemType(item.id, 'service_charge');
    updateLineItemValue(trip.id, overrun.id, { percent_rate: 2.9 });

    // No exclusions here, so every row shares the same 10-student divisor —
    // summed Total/Panther (100 + 100 = 200/panther) times students (2000)
    // coincides with the grand total, same as the dedicated exclusions test
    // below where they diverge.
    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === overrun.id);
    expect(row.total_per_panther).toBeCloseTo(200 * 0.029);
    expect(row.total).toBe(Math.round(2000 * 0.029));

    const grandTotal = getBudgetForTrip(trip.id).reduce((sum, i) => sum + i.total, 0);
    expect(grandTotal).toBe(2000 + row.total);
  });

  it('bases the percentage on summed Total/Panther, not the grand total, when categories have different opt-out divisors', () => {
    const trip = createTrip({ year: '2098', name: 'Test', trip_date: '2098-01-01' });
    const s1 = addStudent(trip.id);
    addStudent(trip.id);
    const airfare = category('Airfare');
    const hotel = category('Hotel');
    const overrun = category('Overrun');
    setTotal(trip.id, airfare.id, 1000); // 2 students -> $500/panther
    setTotal(trip.id, hotel.id, 1000);

    const hotelItem = getBudgetForTrip(trip.id).find((i) => i.category_id === hotel.id);
    setExclusion(hotelItem.trip_budget_item_id, s1.id); // 1 student -> $1000/panther

    const item = attachCategoryToTrip(trip.id, overrun.id);
    switchLineItemType(item.id, 'service_charge');
    updateLineItemValue(trip.id, overrun.id, { percent_rate: 10 });

    // Grand total is 2000 (10% -> 200), but Total/Panther basis is
    // 500 (airfare) + 1000 (hotel) = 1500/panther (10% -> 150/panther).
    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === overrun.id);
    expect(row.total_per_panther).toBeCloseTo(150);
    expect(row.total).toBe(150 * 2);
  });

  it('defaults percent_rate to 2.9 on switch, and resets total/rate_per_athlete', () => {
    const trip = createTrip({ year: '2083', name: 'Test', trip_date: '2083-01-01' });
    const airfare = category('Airfare');
    const item = setTotal(trip.id, airfare.id, 500);

    const switched = switchLineItemType(item.id, 'service_charge');
    expect(switched.type).toBe('service_charge');
    expect(switched.percent_rate).toBe(2.9);
    expect(switched.total).toBe(0);
    expect(switched.rate_per_athlete).toBeNull();
  });

  it('rejects a second service_charge row on the same trip', () => {
    const trip = createTrip({ year: '2084', name: 'Test', trip_date: '2084-01-01' });
    const airfare = category('Airfare');
    const hotel = category('Hotel');
    const first = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(first.id, 'service_charge');

    const second = attachCategoryToTrip(trip.id, hotel.id);
    expect(() => switchLineItemType(second.id, 'service_charge')).toThrowError(/only one is allowed/);
  });

  it('allows a service_charge row on a different trip', () => {
    const tripA = createTrip({ year: '2085', name: 'A', trip_date: '2085-01-01' });
    const tripB = createTrip({ year: '2086', name: 'B', trip_date: '2086-01-01' });
    const airfare = category('Airfare');

    const itemA = attachCategoryToTrip(tripA.id, airfare.id);
    switchLineItemType(itemA.id, 'service_charge');

    const itemB = attachCategoryToTrip(tripB.id, airfare.id);
    expect(() => switchLineItemType(itemB.id, 'service_charge')).not.toThrow();
  });

  it('rejects total and rate_per_athlete on a service_charge row', () => {
    const trip = createTrip({ year: '2087', name: 'Test', trip_date: '2087-01-01' });
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'service_charge');

    expect(() => updateLineItemValue(trip.id, airfare.id, { total: 100 })).toThrowError(
      /service charge/
    );
    expect(() => updateLineItemValue(trip.id, airfare.id, { rate_per_athlete: 50 })).toThrowError(
      /service charge/
    );
  });

  it('rejects a negative percent_rate', () => {
    const trip = createTrip({ year: '2088', name: 'Test', trip_date: '2088-01-01' });
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'service_charge');
    expect(() => updateLineItemValue(trip.id, airfare.id, { percent_rate: -1 })).toThrowError(
      /non-negative/
    );
  });

  it("detachCategoryFromTrip rejects a service_charge row with a nonzero percent_rate", () => {
    const trip = createTrip({ year: '2089', name: 'Test', trip_date: '2089-01-01' });
    const airfare = category('Airfare');
    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'service_charge');

    expect(() => detachCategoryFromTrip(trip.id, airfare.id)).toThrowError(/Zero out/);
  });
});

describe('student_count_override', () => {
  it('overrides the live roster count for just that row', () => {
    const trip = createTrip({ year: '2099', name: 'Test', trip_date: '2099-01-01' });
    for (let i = 0; i < 4; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const hotel = category('Hotel');
    setTotal(trip.id, airfare.id, 400);
    setTotal(trip.id, hotel.id, 400);

    const item = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    updateStudentCountOverride(item.trip_budget_item_id, 8);

    const after = getBudgetForTrip(trip.id);
    const airfareRow = after.find((i) => i.category_id === airfare.id);
    expect(airfareRow.students).toBe(8);
    expect(airfareRow.student_count_override).toBe(8);
    expect(airfareRow.total_per_panther).toBe(50);
    // A different row's category is untouched by another row's override.
    expect(after.find((i) => i.category_id === hotel.id).students).toBe(4);
  });

  it('clearing the override (null) reverts to the live roster count', () => {
    const trip = createTrip({ year: '2100', name: 'Test', trip_date: '2100-01-01' });
    for (let i = 0; i < 5; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const item = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);

    updateStudentCountOverride(item.trip_budget_item_id, 20);
    expect(getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id).students).toBe(20);

    updateStudentCountOverride(item.trip_budget_item_id, null);
    const restored = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(restored.students).toBe(5);
    expect(restored.student_count_override).toBeNull();
  });

  it('feeds into per_swimmer and service_charge computations too', () => {
    const trip = createTrip({ year: '2101', name: 'Test', trip_date: '2101-01-01' });
    for (let i = 0; i < 3; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const overrun = category('Overrun');

    const item = attachCategoryToTrip(trip.id, airfare.id);
    switchLineItemType(item.id, 'per_swimmer');
    updateLineItemValue(trip.id, airfare.id, { rate_per_athlete: 100 });
    updateStudentCountOverride(item.id, 10);

    const svcItem = attachCategoryToTrip(trip.id, overrun.id);
    switchLineItemType(svcItem.id, 'service_charge');
    updateLineItemValue(trip.id, overrun.id, { percent_rate: 10 });
    updateStudentCountOverride(svcItem.id, 10);

    const budget = getBudgetForTrip(trip.id);
    // per_swimmer total = rate(100) x overridden students(10), not the
    // real 3-student roster.
    expect(budget.find((i) => i.category_id === airfare.id).total).toBe(1000);
    // service_charge total_per_panther is 10% of airfare's 100/panther rate
    // (unaffected by its own override — that only scales its own total),
    // and its total uses ITS OWN overridden student count (10).
    const svcRow = budget.find((i) => i.category_id === overrun.id);
    expect(svcRow.total_per_panther).toBeCloseTo(10);
    expect(svcRow.total).toBe(100);
  });

  it('rejects a negative override', () => {
    const trip = createTrip({ year: '2102', name: 'Test', trip_date: '2102-01-01' });
    const airfare = category('Airfare');
    const item = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(() => updateStudentCountOverride(item.trip_budget_item_id, -1)).toThrowError(
      /non-negative/
    );
  });

  it('rejects a non-integer override', () => {
    const trip = createTrip({ year: '2103', name: 'Test', trip_date: '2103-01-01' });
    const airfare = category('Airfare');
    const item = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(() => updateStudentCountOverride(item.trip_budget_item_id, 2.5)).toThrowError(
      /non-negative/
    );
  });

  it('returns null for an unknown line item id', () => {
    expect(updateStudentCountOverride(999999, 5)).toBeNull();
  });

  it('never carries forward to a new trip year', () => {
    const prior = createTrip({ year: '2104', name: 'Prior', trip_date: '2104-01-01' });
    const airfare = category('Airfare');
    const priorItem = getBudgetForTrip(prior.id).find((i) => i.category_id === airfare.id);
    updateStudentCountOverride(priorItem.trip_budget_item_id, 99);

    const current = createTrip({ year: '2105', name: 'Current', trip_date: '2105-01-01' });
    const currentItem = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(current.id, airfare.id);
    expect(currentItem.student_count_override).toBeNull();
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

describe('food_planner rows', () => {
  it("total_per_panther IS the summed daily rate (per-participant, like per_swimmer), and total is rate × students", () => {
    const trip = createTrip({ year: '2106', name: 'Test', trip_date: '2106-01-01' });
    for (let i = 0; i < 4; i++) addStudent(trip.id);
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');

    addDailyItem(item.id, { date: '2027-02-12', budget: 50, cash: 50, meals_covered: 'Lunch & Dinner' });
    addDailyItem(item.id, { date: '2027-02-13', budget: 50, cash: 25, meals_covered: 'Lunch & Team Dinner', notes: "Bo's" });

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === food.id);
    expect(row.total_per_panther).toBe(100);
    expect(row.total).toBe(400);
  });

  it('renders total 0 (not null/NaN) when no days have been entered yet', () => {
    const trip = createTrip({ year: '2107', name: 'Test', trip_date: '2107-01-01' });
    addStudent(trip.id);
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === food.id);
    expect(row.total).toBe(0);
    expect(row.total_per_panther).toBe(0);
  });

  it('rejects adding a day to a row that is not food_planner', () => {
    const trip = createTrip({ year: '2108', name: 'Test', trip_date: '2108-01-01' });
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    expect(() => addDailyItem(item.id, { date: '2027-02-12', budget: 50, cash: 50 })).toThrowError(
      /day-by-day planner/
    );
  });

  it('rejects a duplicate date on the same row', () => {
    const trip = createTrip({ year: '2109', name: 'Test', trip_date: '2109-01-01' });
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');
    addDailyItem(item.id, { date: '2027-02-12', budget: 50, cash: 50 });
    expect(() => addDailyItem(item.id, { date: '2027-02-12', budget: 10, cash: 10 })).toThrowError(
      /already exists/
    );
  });

  it('rejects an invalid date format and a negative amount', () => {
    const trip = createTrip({ year: '2110', name: 'Test', trip_date: '2110-01-01' });
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');
    expect(() => addDailyItem(item.id, { date: '2/12/2027', budget: 50, cash: 50 })).toThrowError(
      /YYYY-MM-DD/
    );
    expect(() => addDailyItem(item.id, { date: '2027-02-12', budget: -5, cash: 50 })).toThrowError(
      /non-negative/
    );
  });

  it('updateDailyItem edits an existing row in place and re-checks duplicate dates', () => {
    const trip = createTrip({ year: '2111', name: 'Test', trip_date: '2111-01-01' });
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');
    const day1 = addDailyItem(item.id, { date: '2027-02-12', budget: 50, cash: 50 });
    addDailyItem(item.id, { date: '2027-02-13', budget: 50, cash: 50 });

    const updated = updateDailyItem(day1.id, { budget: 75 });
    expect(updated.budget).toBe(75);
    expect(listDailyItems(item.id)).toHaveLength(2);

    expect(() => updateDailyItem(day1.id, { date: '2027-02-13' })).toThrowError(/already exists/);
  });

  it('deleteDailyItem removes a day and the row total drops accordingly', () => {
    const trip = createTrip({ year: '2112', name: 'Test', trip_date: '2112-01-01' });
    addStudent(trip.id);
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');
    const day1 = addDailyItem(item.id, { date: '2027-02-12', budget: 50, cash: 50 });
    addDailyItem(item.id, { date: '2027-02-13', budget: 25, cash: 25 });

    expect(getBudgetForTrip(trip.id).find((i) => i.category_id === food.id).total).toBe(75);
    deleteDailyItem(day1.id);
    expect(getBudgetForTrip(trip.id).find((i) => i.category_id === food.id).total).toBe(25);
  });

  it('dailyTotalsByItem batches sums across multiple items in one call', () => {
    const trip = createTrip({ year: '2113', name: 'Test', trip_date: '2113-01-01' });
    const food = category('Food');
    const overrun = category('Overrun');
    const foodItem = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(foodItem.id, 'food_planner');
    const overrunItem = attachCategoryToTrip(trip.id, overrun.id);
    switchLineItemType(overrunItem.id, 'food_planner');
    addDailyItem(foodItem.id, { date: '2027-02-12', budget: 50, cash: 50 });
    addDailyItem(overrunItem.id, { date: '2027-02-12', budget: 20, cash: 0 });

    const totals = dailyTotalsByItem([foodItem.id, overrunItem.id]);
    expect(totals[foodItem.id]).toBe(50);
    expect(totals[overrunItem.id]).toBe(20);
  });

  it('diffs correctly against a prior trip whose same category was also food_planner', () => {
    const prior = createTrip({ year: '2114', name: 'Prior', trip_date: '2114-01-01' });
    const current = createTrip({ year: '2115', name: 'Current', trip_date: '2115-01-01' });
    for (let i = 0; i < 5; i++) addStudent(prior.id);
    for (let i = 0; i < 5; i++) addStudent(current.id);
    const food = category('Food');

    const priorItem = attachCategoryToTrip(prior.id, food.id);
    switchLineItemType(priorItem.id, 'food_planner');
    addDailyItem(priorItem.id, { date: '2026-02-12', budget: 50, cash: 50 });

    const currentItem = attachCategoryToTrip(current.id, food.id);
    switchLineItemType(currentItem.id, 'food_planner');
    addDailyItem(currentItem.id, { date: '2027-02-12', budget: 75, cash: 75 });

    const row = getBudgetForTrip(current.id).find((i) => i.category_id === food.id);
    expect(row.total_per_panther).toBe(75);
    expect(row.total).toBe(375);
    expect(row.diff).toBe(125);
    expect(row.prior_total_per_panther).toBe(50);
  });

  it('switching away from food_planner and back preserves the day entries', () => {
    const trip = createTrip({ year: '2116', name: 'Test', trip_date: '2116-01-01' });
    addStudent(trip.id);
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');
    addDailyItem(item.id, { date: '2027-02-12', budget: 50, cash: 50 });

    switchLineItemType(item.id, 'totals');
    expect(listDailyItems(item.id)).toHaveLength(1);

    switchLineItemType(item.id, 'food_planner');
    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === food.id);
    expect(row.total_per_panther).toBe(50);
    expect(row.total).toBe(50);
  });

  it('writes are rejected on a day-by-day entry while its row is switched to another type', () => {
    const trip = createTrip({ year: '2117', name: 'Test', trip_date: '2117-01-01' });
    const food = category('Food');
    const item = attachCategoryToTrip(trip.id, food.id);
    switchLineItemType(item.id, 'food_planner');
    const day = addDailyItem(item.id, { date: '2027-02-12', budget: 50, cash: 50 });

    switchLineItemType(item.id, 'totals');
    expect(() => updateDailyItem(day.id, { budget: 60 })).toThrowError(/day-by-day planner/);
    expect(() => deleteDailyItem(day.id)).toThrowError(/day-by-day planner/);
  });
});
