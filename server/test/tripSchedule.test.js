import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createTrip, updateTrip, listDailySchedule, addScheduleDay, updateScheduleDay, deleteScheduleDay, autoCreateSchedule } from '../src/models/trips.js';

beforeEach(() => {
  db.exec('DELETE FROM trip_daily_schedule; DELETE FROM trip_budget_items; DELETE FROM trips;');
});

describe('addScheduleDay / listDailySchedule', () => {
  it('adds a day and lists it back sorted by date', () => {
    const trip = createTrip({ year: '2140', name: 'Test', trip_date: '2140-02-12' });
    addScheduleDay(trip.id, { date: '2140-02-13', morning_window: '6am-9am window', afternoon_window: '3-5pm' });
    addScheduleDay(trip.id, { date: '2140-02-12', afternoon_window: '3-5pm' });

    const days = listDailySchedule(trip.id);
    expect(days.map((d) => d.date)).toEqual(['2140-02-12', '2140-02-13']);
    expect(days[1].morning_window).toBe('6am-9am window');
  });

  it('rejects a malformed date', () => {
    const trip = createTrip({ year: '2141', name: 'Test', trip_date: '2141-02-12' });
    expect(() => addScheduleDay(trip.id, { date: '02/12/2141' })).toThrowError(/YYYY-MM-DD/);
  });

  it('rejects an unknown trip_id', () => {
    expect(() => addScheduleDay(999999, { date: '2141-02-12' })).toThrowError(/Unknown trip_id/);
  });

  it('rejects a duplicate date for the same trip', () => {
    const trip = createTrip({ year: '2142', name: 'Test', trip_date: '2142-02-12' });
    addScheduleDay(trip.id, { date: '2142-02-12' });
    expect(() => addScheduleDay(trip.id, { date: '2142-02-12' })).toThrowError(/already exists/);
  });

  it('allows the same date across two different trips', () => {
    const tripA = createTrip({ year: '2143', name: 'A', trip_date: '2143-02-12' });
    const tripB = createTrip({ year: '2144', name: 'B', trip_date: '2143-02-12' });
    addScheduleDay(tripA.id, { date: '2143-02-12' });
    expect(() => addScheduleDay(tripB.id, { date: '2143-02-12' })).not.toThrow();
  });
});

describe('updateScheduleDay', () => {
  it('partially updates the fields given', () => {
    const trip = createTrip({ year: '2145', name: 'Test', trip_date: '2145-02-12' });
    const day = addScheduleDay(trip.id, { date: '2145-02-12', morning_window: 'None', afternoon_window: '3-5pm' });

    const updated = updateScheduleDay(day.id, { morning_window: '7-9am' });
    expect(updated.morning_window).toBe('7-9am');
    expect(updated.afternoon_window).toBe('3-5pm');
  });

  it('rejects renaming to a date that collides with another row on the same trip', () => {
    const trip = createTrip({ year: '2146', name: 'Test', trip_date: '2146-02-12' });
    addScheduleDay(trip.id, { date: '2146-02-12' });
    const dayTwo = addScheduleDay(trip.id, { date: '2146-02-13' });

    expect(() => updateScheduleDay(dayTwo.id, { date: '2146-02-12' })).toThrowError(/already exists/);
  });

  it('throws for an unknown schedule entry', () => {
    expect(() => updateScheduleDay(999999, { morning_window: 'None' })).toThrowError(/Unknown schedule entry/);
  });
});

describe('deleteScheduleDay', () => {
  it('removes the row', () => {
    const trip = createTrip({ year: '2147', name: 'Test', trip_date: '2147-02-12' });
    const day = addScheduleDay(trip.id, { date: '2147-02-12' });

    deleteScheduleDay(day.id);
    expect(listDailySchedule(trip.id)).toHaveLength(0);
  });

  it('throws for an unknown schedule entry', () => {
    expect(() => deleteScheduleDay(999999)).toThrowError(/Unknown schedule entry/);
  });
});

describe('autoCreateSchedule', () => {
  it('fills in one blank entry per day of the trip range, inclusive', () => {
    const trip = createTrip({ year: '2148', name: 'Test', trip_date: '2148-02-12' });
    updateTrip(trip.id, { return_date: '2148-02-15' });

    const days = autoCreateSchedule(trip.id);
    expect(days.map((d) => d.date)).toEqual(['2148-02-12', '2148-02-13', '2148-02-14', '2148-02-15']);
  });

  it('skips dates that already have an entry', () => {
    const trip = createTrip({ year: '2149', name: 'Test', trip_date: '2149-02-12' });
    updateTrip(trip.id, { return_date: '2149-02-13' });
    addScheduleDay(trip.id, { date: '2149-02-12', morning_window: 'Custom' });

    const days = autoCreateSchedule(trip.id);
    expect(days.find((d) => d.date === '2149-02-12').morning_window).toBe('Custom');
    expect(days).toHaveLength(2);
  });

  it('rejects a trip missing a departure or return date', () => {
    const trip = createTrip({ year: '2150', name: 'Test', trip_date: '2150-02-12' });
    expect(() => autoCreateSchedule(trip.id)).toThrowError(/departure or return date/);
  });
});
