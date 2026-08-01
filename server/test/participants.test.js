import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip } from '../src/models/trips.js';
import { createParticipant, updateParticipant, getStats } from '../src/models/participants.js';

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

describe('payment tracking', () => {
  it('defaults deposit_paid and final_payment_paid to false for a new participant', () => {
    const trip = createTrip({ year: '2052', name: 'Test', trip_date: '2052-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    expect(p.deposit_paid).toBe(0);
    expect(p.final_payment_paid).toBe(0);
  });

  it('toggling one payment field leaves the other untouched', () => {
    const trip = createTrip({ year: '2053', name: 'Test', trip_date: '2053-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    const afterDeposit = updateParticipant(p.id, { deposit_paid: true });
    expect(afterDeposit.deposit_paid).toBe(1);
    expect(afterDeposit.final_payment_paid).toBe(0);

    const afterFinal = updateParticipant(p.id, { final_payment_paid: true });
    expect(afterFinal.deposit_paid).toBe(1);
    expect(afterFinal.final_payment_paid).toBe(1);

    const afterUnmark = updateParticipant(p.id, { deposit_paid: false });
    expect(afterUnmark.deposit_paid).toBe(0);
    expect(afterUnmark.final_payment_paid).toBe(1);
  });
});
