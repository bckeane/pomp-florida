import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';

vi.mock('../src/models/budget.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, seedBudgetForNewTrip: vi.fn(actual.seedBudgetForNewTrip) };
});

const { createTrip } = await import('../src/models/trips.js');
const { seedBudgetForNewTrip } = await import('../src/models/budget.js');

beforeEach(() => {
  db.exec('DELETE FROM trip_budget_items; DELETE FROM trips;');
  vi.mocked(seedBudgetForNewTrip).mockClear();
});

describe('createTrip', () => {
  it('seeds a trip_budget_items row for every active category, at $0', () => {
    const trip = createTrip({ year: '2099', name: 'Test', trip_date: '2099-01-01' });
    const items = db.prepare('SELECT * FROM trip_budget_items WHERE trip_id = ?').all(trip.id);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.total === 0)).toBe(true);
  });

  it('CRITICAL: rolls back the trip insert if seeding the budget fails', () => {
    vi.mocked(seedBudgetForNewTrip).mockImplementationOnce(() => {
      throw new Error('seed boom');
    });

    expect(() => createTrip({ year: '2098', name: 'Test', trip_date: '2098-01-01' })).toThrow(
      'seed boom'
    );

    const orphan = db.prepare('SELECT * FROM trips WHERE year = ?').get('2098');
    expect(orphan).toBeUndefined();
  });
});
