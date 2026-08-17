import { API_BASE as BASE } from './base.js';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const error = new Error('Request failed');
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function fetchTrips() {
  return request('/trips');
}

export function fetchCurrentTrip() {
  return request('/trips/current');
}

/** The current trip's day-by-day pool-time schedule, for the parent-facing
 * trip essentials summary — public, same exposure as fetchCurrentTrip. */
export function fetchCurrentTripSchedule() {
  return request('/trips/current/schedule');
}

export function createTrip(data) {
  return request('/trips', { method: 'POST', body: JSON.stringify(data) });
}

export function activateTrip(id) {
  return request(`/trips/${id}/activate`, { method: 'POST' });
}

export function updateTrip(id, data) {
  return request(`/trips/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function fetchTripSchedule(tripId) {
  return request(`/trips/${tripId}/schedule`);
}

export function addTripScheduleDay(tripId, { date, morning_window, afternoon_window, notes } = {}) {
  return request(`/trips/${tripId}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ date, morning_window, afternoon_window, notes }),
  });
}

export function updateTripScheduleDay(tripId, scheduleId, fields) {
  return request(`/trips/${tripId}/schedule/${scheduleId}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

export function deleteTripScheduleDay(tripId, scheduleId) {
  return request(`/trips/${tripId}/schedule/${scheduleId}`, { method: 'DELETE' });
}

/** Bulk-populates a blank entry for every day of the trip's date range —
 * skips dates that already have an entry, so it's safe to call again. */
export function autoCreateTripSchedule(tripId) {
  return request(`/trips/${tripId}/schedule/auto-create`, { method: 'POST' });
}
