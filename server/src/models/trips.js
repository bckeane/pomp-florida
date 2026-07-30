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

// Detail fields are all optional/nullable — they back the public home page's
// copy and aren't required for a trip to exist or run the roster.
const DETAIL_FIELDS = [
  'intro_message',
  'return_date',
  'commitment_deadline',
  'deposit_amount',
  'final_payment_due',
  'final_payment_estimate',
  'cost_low',
  'cost_high',
  'training_location',
  'training_location_url',
  'lodging',
  'lodging_url',
  'meals_info',
  'whats_included',
  'payment_notes',
  'coordinators',
  'contact_email',
  'miss_school_note',
];
const UPDATABLE_FIELDS = ['name', 'trip_date', ...DETAIL_FIELDS];

// New trips start as a copy of the most recent trip's detail fields (lodging,
// coordinators, what's included, etc. rarely change year to year) so the
// public home page has real content immediately and an admin only has to
// touch what actually changed (dates, cost) instead of retyping everything.
export function createTrip({ year, name, trip_date }) {
  const now = new Date().toISOString();
  const previous = db.prepare('SELECT * FROM trips ORDER BY year DESC, id DESC LIMIT 1').get();

  const columns = ['year', 'name', 'trip_date', 'created_at', ...DETAIL_FIELDS];
  const values = { year, name, trip_date, created_at: now };
  for (const field of DETAIL_FIELDS) {
    values[field] = previous ? previous[field] : null;
  }

  const info = db
    .prepare(`INSERT INTO trips (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`)
    .run(values);
  return getTripById(info.lastInsertRowid);
}

export function updateTrip(id, data) {
  const existing = getTripById(id);
  if (!existing) return null;
  const merged = {};
  for (const field of UPDATABLE_FIELDS) {
    merged[field] = data[field] !== undefined ? data[field] : existing[field];
  }
  const assignments = UPDATABLE_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE trips SET ${assignments} WHERE id = @id`).run({ ...merged, id });
  return getTripById(id);
}

export function activateTrip(id) {
  const trip = getTripById(id);
  if (!trip) return null;
  setCurrentTripId(id);
  return trip;
}
