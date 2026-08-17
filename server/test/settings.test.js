import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { getSetting, setSetting, getCurrentTripId, setCurrentTripId } from '../src/models/settings.js';

beforeEach(() => {
  db.exec('DELETE FROM settings;');
});

describe('getSetting / setSetting', () => {
  it('returns null for a key that has never been set', () => {
    expect(getSetting('nope')).toBeNull();
  });

  it('setSetting inserts a new key and getSetting reads it back', () => {
    setSetting('foo', 'bar');
    expect(getSetting('foo')).toBe('bar');
  });

  it('setSetting overwrites an existing key rather than erroring on conflict', () => {
    setSetting('foo', 'bar');
    setSetting('foo', 'baz');

    expect(getSetting('foo')).toBe('baz');
    expect(db.prepare('SELECT COUNT(*) AS count FROM settings WHERE key = ?').get('foo').count).toBe(1);
  });
});

describe('getCurrentTripId / setCurrentTripId', () => {
  it('returns null when no current trip has been set', () => {
    expect(getCurrentTripId()).toBeNull();
  });

  it('setCurrentTripId stores the id as text; getCurrentTripId reads it back as a number', () => {
    setCurrentTripId(42);

    expect(db.prepare("SELECT value FROM settings WHERE key = 'current_trip_id'").get().value).toBe('42');
    expect(getCurrentTripId()).toBe(42);
  });

  it('setCurrentTripId overwrites a previously set trip id', () => {
    setCurrentTripId(1);
    setCurrentTripId(2);

    expect(getCurrentTripId()).toBe(2);
  });
});
