import { db } from '../db/connection.js';
import { getCurrentTripId, setCurrentTripId } from './settings.js';

export function listTrips() {
  const trips = db.prepare('SELECT * FROM trips ORDER BY year DESC, id DESC').all();
  const currentId = getCurrentTripId();
  return trips.map((t) => ({ ...t, is_current: t.id === currentId }));
}

export function getTripById(id) {
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
}

export function getCurrentTrip() {
  const id = getCurrentTripId();
  return id ? getTripById(id) : null;
}

export function createTrip({ year, name, trip_date }) {
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO trips (year, name, trip_date, created_at) VALUES (?, ?, ?, ?)')
    .run(year, name, trip_date, now);
  return getTripById(info.lastInsertRowid);
}

export function updateTrip(id, { name, trip_date }) {
  const existing = getTripById(id);
  if (!existing) return null;
  db.prepare('UPDATE trips SET name = ?, trip_date = ? WHERE id = ?').run(
    name ?? existing.name,
    trip_date ?? existing.trip_date,
    id
  );
  return getTripById(id);
}

export function activateTrip(id) {
  const trip = getTripById(id);
  if (!trip) return null;
  setCurrentTripId(id);
  return trip;
}
