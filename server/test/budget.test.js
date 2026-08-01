import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip } from '../src/models/trips.js';
import { createParticipant } from '../src/models/participants.js';
import {
  listActiveCategories,
  createCategory,
  retireCategory,
  getBudgetForTrip,
  upsertLineItem,
  setExclusion,
  clearExclusion,
} from '../src/models/budget.js';

function addStudent(tripId) {
  return createParticipant({ first_name: 'S', last_name: 'Test', role: 'Swimmer', trip_id: tripId });
}

function category(name) {
  return listActiveCategories().find((c) => c.name === name);
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
    upsertLineItem(prior.id, airfare.id, 400);
    upsertLineItem(current.id, airfare.id, 1000);

    const row = getBudgetForTrip(current.id).find((i) => i.category_id === airfare.id);
    expect(row.students).toBe(5);
    expect(row.total_per_panther).toBe(200);
    expect(row.diff).toBe(600);
    expect(row.prior_total_per_panther).toBe(100);
  });

  it('guards against divide-by-zero when the roster is empty', () => {
    const trip = createTrip({ year: '2062', name: 'Empty roster', trip_date: '2062-01-01' });
    const airfare = category('Airfare');
    upsertLineItem(trip.id, airfare.id, 500);

    const row = getBudgetForTrip(trip.id).find((i) => i.category_id === airfare.id);
    expect(row.students).toBe(0);
    expect(row.total_per_panther).toBeNull();
  });

  it('returns null diff/prior_total_per_panther when there is no earlier trip', () => {
    const trip = createTrip({ year: '1999', name: 'First ever', trip_date: '1999-01-01' });
    const airfare = category('Airfare');
    upsertLineItem(trip.id, airfare.id, 500);

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
    upsertLineItem(trip.id, airfare.id, 200);
    upsertLineItem(trip.id, hotel.id, 200);

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
    upsertLineItem(trip.id, airfare.id, 200);

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
    upsertLineItem(trip.id, airfare.id, 100);

    expect(() => retireCategory(airfare.id)).toThrowError(/referenced/);
  });

  it('allows retiring a category with no line items', () => {
    const fresh = createCategory('Unused Test Category');
    const retired = retireCategory(fresh.id);
    expect(retired.retired).toBe(1);
  });
});

describe('upsertLineItem', () => {
  it('rejects a negative total', () => {
    const trip = createTrip({ year: '2066', name: 'Test', trip_date: '2066-01-01' });
    const airfare = category('Airfare');
    expect(() => upsertLineItem(trip.id, airfare.id, -5)).toThrowError(/non-negative/);
  });

  it('updates the total on conflict instead of duplicating the row', () => {
    const trip = createTrip({ year: '2067', name: 'Test', trip_date: '2067-01-01' });
    const airfare = category('Airfare');
    upsertLineItem(trip.id, airfare.id, 100);
    upsertLineItem(trip.id, airfare.id, 250);

    const rows = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .all(trip.id, airfare.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(250);
  });
});
