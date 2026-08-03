import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip, updateTrip } from '../src/models/trips.js';
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
  it('defaults deposit_received and final_payment_received to 0 for a new participant', () => {
    const trip = createTrip({ year: '2052', name: 'Test', trip_date: '2052-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    expect(p.deposit_received).toBe(0);
    expect(p.final_payment_received).toBe(0);
  });

  it('tracks each installment independently', () => {
    const trip = createTrip({ year: '2053', name: 'Test', trip_date: '2053-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    const afterDeposit = updateParticipant(p.id, { deposit_received: 750 });
    expect(afterDeposit.deposit_received).toBe(750);
    expect(afterDeposit.final_payment_received).toBe(0);

    const afterFinal = updateParticipant(p.id, { final_payment_received: 500 });
    expect(afterFinal.deposit_received).toBe(750);
    expect(afterFinal.final_payment_received).toBe(500);
  });

  it("computes balance owed against the trip's deposit_amount/final_payment_estimate", () => {
    const trip = createTrip({ year: '2054', name: 'Test', trip_date: '2054-01-01' });
    updateTrip(trip.id, { deposit_amount: 750, final_payment_estimate: 1000 });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    expect(p.deposit_balance).toBe(750);
    expect(p.final_payment_balance).toBe(1000);

    const afterPartial = updateParticipant(p.id, { deposit_received: 500 });
    expect(afterPartial.deposit_balance).toBe(250);
  });

  it('balance is null (not a false $0 owed) when the trip has no amount set', () => {
    const trip = createTrip({ year: '2055', name: 'Test', trip_date: '2055-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    expect(p.deposit_balance).toBeNull();
    expect(p.final_payment_balance).toBeNull();
  });
});
