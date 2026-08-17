import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';

vi.mock('../src/models/budget.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, seedBudgetForNewTrip: vi.fn(actual.seedBudgetForNewTrip) };
});

const { createTrip, updateTrip } = await import('../src/models/trips.js');
const { seedBudgetForNewTrip } = await import('../src/models/budget.js');

beforeEach(() => {
  db.exec('DELETE FROM trip_daily_schedule; DELETE FROM trip_budget_items; DELETE FROM trips;');
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

  it('carries departure_logistics, return_logistics, and packing_list forward from the previous trip', () => {
    const prior = createTrip({ year: '2101', name: 'Prior', trip_date: '2101-01-01' });
    updateTrip(prior.id, {
      departure_logistics: 'Arrive at PHS by 4:00 AM.',
      return_logistics: 'Carpool pickup at 3:45 PM.',
      packing_list: 'Sunscreen\nSwim gear',
    });

    const next = createTrip({ year: '2102', name: 'Next', trip_date: '2102-01-01' });
    expect(next.departure_logistics).toBe('Arrive at PHS by 4:00 AM.');
    expect(next.return_logistics).toBe('Carpool pickup at 3:45 PM.');
    expect(next.packing_list).toBe('Sunscreen\nSwim gear');
  });
});
