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

export function fetchParticipants(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  ).toString();
  return request(`/participants${query ? `?${query}` : ''}`);
}

export function fetchStats(tripId) {
  const query = tripId ? `?trip_id=${tripId}` : '';
  return request(`/stats${query}`);
}

export function createParticipant(data, tripId) {
  const query = tripId ? `?trip_id=${tripId}` : '';
  return request(`/participants${query}`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateParticipant(id, data) {
  return request(`/participants/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteParticipant(id, { hard = false } = {}) {
  return request(`/participants/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' });
}

export function importParticipants(csv, { partial = false, tripId } = {}) {
  const params = new URLSearchParams();
  if (partial) params.set('partial', 'true');
  if (tripId) params.set('trip_id', tripId);
  const query = params.toString();
  return request(`/participants/import${query ? `?${query}` : ''}`, {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
}

export function exportUrl(tripId) {
  return `${BASE}/participants/export${tripId ? `?trip_id=${tripId}` : ''}`;
}

// Self-serve registration: requires a signed-in account (see api/auth.js);
// creates the participant against the current trip, linked to that account.
export function fetchMyParticipants() {
  return request('/my/participants');
}

// Every distinct person this account has ever registered, across all trip
// years — powers "add someone you've registered before" on the register page.
export function fetchMyParticipantHistory() {
  return request('/my/participants/history');
}

export function createMyParticipant(data) {
  return request('/my/participants', { method: 'POST', body: JSON.stringify(data) });
}

export function updateMyParticipant(id, data) {
  return request(`/my/participants/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
