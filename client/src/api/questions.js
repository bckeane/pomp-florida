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

export function fetchFaqQuestions(tripId) {
  const query = tripId ? `?trip_id=${tripId}` : '';
  return request(`/faq${query}`);
}

export function submitFaqQuestion(data) {
  return request('/faq', { method: 'POST', body: JSON.stringify(data) });
}

export function fetchAdminQuestions(tripId) {
  const query = tripId ? `?trip_id=${tripId}` : '';
  return request(`/admin/questions${query}`);
}

export function answerFaqQuestion(id, answer) {
  return request(`/admin/questions/${id}`, { method: 'PATCH', body: JSON.stringify({ answer }) });
}
