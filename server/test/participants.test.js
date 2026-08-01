import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip } from '../src/models/trips.js';
import { createParticipant, getStats } from '../src/models/participants.js';

beforeEach(() => {
  db.exec(`
    DELETE FROM trip_budget_items;
    DELETE FROM participants;
    DELETE FROM trips;
  `);
});

describe('getStats', () => {
  it('students_active counts only Swimmer + Diver; total_active counts everyone', () => {
    const trip = createTrip({ year: '2050', name: 'Test', trip_date: '2050-01-01' });
    createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    createParticipant({ first_name: 'B', last_name: 'B', role: 'Diver', trip_id: trip.id });
    createParticipant({ first_name: 'C', last_name: 'C', role: 'Adult', trip_id: trip.id });

    const stats = getStats(trip.id);
    expect(stats.total_active).toBe(3);
    expect(stats.students_active).toBe(2);
  });

  it('excludes inactive participants from both counts', () => {
    const trip = createTrip({ year: '2051', name: 'Test', trip_date: '2051-01-01' });
    createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id, active: false });

    const stats = getStats(trip.id);
    expect(stats.total_active).toBe(0);
    expect(stats.students_active).toBe(0);
  });
});
