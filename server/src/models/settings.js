import { db } from '../db/connection.js';

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function getCurrentTripId() {
  const value = getSetting('current_trip_id');
  return value ? Number(value) : null;
}

export function setCurrentTripId(id) {
  setSetting('current_trip_id', String(id));
}
