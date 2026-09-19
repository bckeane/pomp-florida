import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip, updateTrip } from '../src/models/trips.js';
import {
  createParticipant,
  updateParticipant,
  updateParticipantBooking,
  listParticipants,
  getStats,
} from '../src/models/participants.js';

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

  it('buckets payment_status as no_cost_set when the trip has no estimated_cost', () => {
    const trip = createTrip({ year: '2054', name: 'Test', trip_date: '2054-01-01' });
    createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    const stats = getStats(trip.id);
    expect(stats.payment_status).toEqual({ paid_in_full: 0, partial_or_unpaid: 0, no_cost_set: 1 });
  });

  it('buckets payment_status by paid-in-full vs. still-owing once the trip has a cost', () => {
    const trip = createTrip({ year: '2055', name: 'Test', trip_date: '2055-01-01' });
    updateTrip(trip.id, { estimated_cost: 1000, deposit_percent: 60 });
    const paid = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    updateParticipant(paid.id, { deposit_received: 600, final_payment_received: 400 });
    createParticipant({ first_name: 'B', last_name: 'B', role: 'Diver', trip_id: trip.id });

    const stats = getStats(trip.id);
    expect(stats.payment_status).toEqual({ paid_in_full: 1, partial_or_unpaid: 1, no_cost_set: 0 });
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

  it("computes balance owed against 60%/40% of the trip's estimated_cost, deposit floored to the nearest $100", () => {
    const trip = createTrip({ year: '2054', name: 'Test', trip_date: '2054-01-01' });
    updateTrip(trip.id, { estimated_cost: 1250 });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    // 1250 * 60% = 750, floored to the nearest $100 -> 700; final payment
    // absorbs the rounding difference (550) so the two still sum to 1250.
    expect(p.deposit_balance).toBe(700);
    expect(p.final_payment_balance).toBe(550);

    const afterPartial = updateParticipant(p.id, { deposit_received: 500 });
    expect(afterPartial.deposit_balance).toBe(200);
  });

  it('honors a per-trip deposit_percent override instead of the 60% default', () => {
    const trip = createTrip({ year: '2058', name: 'Test', trip_date: '2058-01-01' });
    updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 25 });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    expect(p.deposit_balance).toBe(500);
    expect(p.final_payment_balance).toBe(1500);
  });

  it('balance is null (not a false $0 owed) when the trip has no amount set', () => {
    const trip = createTrip({ year: '2055', name: 'Test', trip_date: '2055-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });

    expect(p.deposit_balance).toBeNull();
    expect(p.final_payment_balance).toBeNull();
  });

  it('Adults are never billed — balance is $0, never null, whether or not the trip has an estimated_cost', () => {
    const tripWithCost = createTrip({ year: '2059', name: 'Test', trip_date: '2059-01-01' });
    updateTrip(tripWithCost.id, { estimated_cost: 1250 });
    const adultWithCost = createParticipant({
      first_name: 'A',
      last_name: 'A',
      role: 'Adult',
      trip_id: tripWithCost.id,
    });
    expect(adultWithCost.deposit_balance).toBe(0);
    expect(adultWithCost.final_payment_balance).toBe(0);

    const tripNoCost = createTrip({ year: '2060', name: 'Test', trip_date: '2060-01-01' });
    const adultNoCost = createParticipant({
      first_name: 'B',
      last_name: 'B',
      role: 'Adult',
      trip_id: tripNoCost.id,
    });
    expect(adultNoCost.deposit_balance).toBe(0);
    expect(adultNoCost.final_payment_balance).toBe(0);
  });
});

describe('has_allergy_medication (tri-state)', () => {
  it('defaults to null (unanswered), not false, when omitted', () => {
    const trip = createTrip({ year: '2056', name: 'Test', trip_date: '2056-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    expect(p.has_allergy_medication).toBeNull();
  });

  it('round-trips true and false distinctly from null', () => {
    const trip = createTrip({ year: '2057', name: 'Test', trip_date: '2057-01-01' });
    const p = createParticipant({
      first_name: 'A',
      last_name: 'A',
      role: 'Swimmer',
      trip_id: trip.id,
      has_allergy_medication: true,
    });
    expect(p.has_allergy_medication).toBe(true);

    const answeredNo = updateParticipant(p.id, { has_allergy_medication: false });
    expect(answeredNo.has_allergy_medication).toBe(false);

    const backToUnanswered = updateParticipant(p.id, { has_allergy_medication: null });
    expect(backToUnanswered.has_allergy_medication).toBeNull();
  });

  it('an update that omits the field preserves the existing answer', () => {
    const trip = createTrip({ year: '2058', name: 'Test', trip_date: '2058-01-01' });
    const p = createParticipant({
      first_name: 'A',
      last_name: 'A',
      role: 'Swimmer',
      trip_id: trip.id,
      has_allergy_medication: true,
    });

    const afterUnrelatedUpdate = updateParticipant(p.id, { first_name: 'Alice' });
    expect(afterUnrelatedUpdate.has_allergy_medication).toBe(true);
  });
});

describe('group_leader (one per group_number)', () => {
  it('defaults to false for a new participant', () => {
    const trip = createTrip({ year: '2061', name: 'Test', trip_date: '2061-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    expect(p.group_leader).toBe(false);
  });

  it('rejects setting a second leader on the same trip + group_number', () => {
    const trip = createTrip({ year: '2062', name: 'Test', trip_date: '2062-01-01' });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const b = createParticipant({ first_name: 'B', last_name: 'B', role: 'Swimmer', trip_id: trip.id });
    updateParticipantBooking(a.id, { group_number: '1', group_leader: true });

    expect(() => updateParticipantBooking(b.id, { group_number: '1', group_leader: true })).toThrow();

    const stillA = listParticipants({ trip_id: trip.id }).find((p) => p.id === a.id);
    const stillB = listParticipants({ trip_id: trip.id }).find((p) => p.id === b.id);
    expect(stillA.group_leader).toBe(true);
    expect(stillB.group_leader).toBe(false);
  });

  it('allows a second leader when it is a different group_number', () => {
    const trip = createTrip({ year: '2063', name: 'Test', trip_date: '2063-01-01' });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const b = createParticipant({ first_name: 'B', last_name: 'B', role: 'Swimmer', trip_id: trip.id });
    updateParticipantBooking(a.id, { group_number: '1', group_leader: true });

    const updatedB = updateParticipantBooking(b.id, { group_number: '2', group_leader: true });
    expect(updatedB.group_leader).toBe(true);
  });

  it('rejects setting group_leader true without a group_number', () => {
    const trip = createTrip({ year: '2064', name: 'Test', trip_date: '2064-01-01' });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    expect(() => updateParticipantBooking(a.id, { group_leader: true })).toThrow();
  });

  it('unsetting a leader then reassigning it to someone else in the same group works', () => {
    const trip = createTrip({ year: '2065', name: 'Test', trip_date: '2065-01-01' });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const b = createParticipant({ first_name: 'B', last_name: 'B', role: 'Swimmer', trip_id: trip.id });
    updateParticipantBooking(a.id, { group_number: '1', group_leader: true });

    updateParticipantBooking(a.id, { group_leader: false });
    const updatedB = updateParticipantBooking(b.id, { group_number: '1', group_leader: true });
    expect(updatedB.group_leader).toBe(true);
  });

  it('does not count an inactive participant as the existing leader', () => {
    const trip = createTrip({ year: '2066', name: 'Test', trip_date: '2066-01-01' });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const b = createParticipant({ first_name: 'B', last_name: 'B', role: 'Swimmer', trip_id: trip.id });
    updateParticipantBooking(a.id, { group_number: '1', group_leader: true });
    updateParticipant(a.id, { active: false });

    const updatedB = updateParticipantBooking(b.id, { group_number: '1', group_leader: true });
    expect(updatedB.group_leader).toBe(true);
  });
});

describe('listParticipants: group filters and sorting', () => {
  it('filters by exact group_number', () => {
    const trip = createTrip({ year: '2067', name: 'Test', trip_date: '2067-01-01' });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    createParticipant({ first_name: 'B', last_name: 'B', role: 'Swimmer', trip_id: trip.id });
    updateParticipantBooking(a.id, { group_number: '5' });

    const results = listParticipants({ trip_id: trip.id, group_number: '5' });
    expect(results.map((p) => p.id)).toEqual([a.id]);
  });

  it('filters to leaders_only', () => {
    const trip = createTrip({ year: '2068', name: 'Test', trip_date: '2068-01-01' });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    createParticipant({ first_name: 'B', last_name: 'B', role: 'Swimmer', trip_id: trip.id });
    updateParticipantBooking(a.id, { group_number: '5', group_leader: true });

    const results = listParticipants({ trip_id: trip.id, leaders_only: '1' });
    expect(results.map((p) => p.id)).toEqual([a.id]);
  });

  it.each([
    ['group_number', '2071'],
    ['seat_mate_group', '2072'],
    ['reservation_number', '2073'],
    ['seat_to_fl', '2074'],
    ['seat_to_ct', '2075'],
    ['group_leader', '2076'],
  ])('sorts by %s', (field, year) => {
    const trip = createTrip({ year, name: 'Test', trip_date: `${year}-01-01` });
    const a = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const b = createParticipant({ first_name: 'B', last_name: 'B', role: 'Swimmer', trip_id: trip.id });

    // For every text field, a < b ("AAA" < "ZZZ"); for group_leader, a is
    // the leader (1) and b is not (0), so a sorts AFTER b ascending.
    let low = a;
    let high = b;
    if (field === 'group_leader') {
      updateParticipantBooking(a.id, { group_number: '1', group_leader: true });
      low = b;
      high = a;
    } else {
      updateParticipantBooking(a.id, { [field]: 'AAA' });
      updateParticipantBooking(b.id, { [field]: 'ZZZ' });
    }

    const asc = listParticipants({ trip_id: trip.id, sort: field, dir: 'asc' });
    expect(asc[0].id).toBe(low.id);

    const desc = listParticipants({ trip_id: trip.id, sort: field, dir: 'desc' });
    expect(desc[0].id).toBe(high.id);
  });
});
