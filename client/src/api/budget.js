const BASE = '/api';

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

export function fetchBudget(tripId) {
  const query = tripId ? `?trip_id=${tripId}` : '';
  return request(`/budget${query}`);
}

export function fetchBudgetCategories() {
  return request('/budget/categories');
}

export function createBudgetCategory(name) {
  return request('/budget/categories', { method: 'POST', body: JSON.stringify({ name }) });
}

export function retireBudgetCategory(id) {
  return request(`/budget/categories/${id}/retire`, { method: 'POST' });
}

export function upsertBudgetLineItem(tripId, categoryId, total) {
  return request('/budget/items', {
    method: 'PUT',
    body: JSON.stringify({ trip_id: tripId, category_id: categoryId, total }),
  });
}

export function setBudgetExclusion(tripBudgetItemId, participantId) {
  return request('/budget/exclusions', {
    method: 'POST',
    body: JSON.stringify({ trip_budget_item_id: tripBudgetItemId, participant_id: participantId }),
  });
}

export function clearBudgetExclusion(tripBudgetItemId, participantId) {
  return request(`/budget/exclusions/${tripBudgetItemId}/${participantId}`, { method: 'DELETE' });
}
