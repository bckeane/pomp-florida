const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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

export function createTrip(data) {
  return request('/trips', { method: 'POST', body: JSON.stringify(data) });
}

export function activateTrip(id) {
  return request(`/trips/${id}/activate`, { method: 'POST' });
}
