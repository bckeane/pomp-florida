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

/** Attaches a category to a trip that's missing it, at zero value — type
 * carries forward from that category's most recent prior-year item. A
 * distinct action from editing a row's value below, since a brand-new row
 * has no existing type of its own yet. */
export function attachBudgetCategory(tripId, categoryId) {
  return request('/budget/items/attach', {
    method: 'POST',
    body: JSON.stringify({ trip_id: tripId, category_id: categoryId }),
  });
}

/** Edits an existing row's value — exactly one of total (for a 'totals'
 * row) or rate_per_athlete (for a 'per_swimmer' row). */
export function updateBudgetLineItem(tripId, categoryId, { total, rate_per_athlete } = {}) {
  return request('/budget/items', {
    method: 'PUT',
    body: JSON.stringify({ trip_id: tripId, category_id: categoryId, total, rate_per_athlete }),
  });
}

export function switchBudgetItemType(tripBudgetItemId, type) {
  return request(`/budget/items/${tripBudgetItemId}/type`, {
    method: 'PUT',
    body: JSON.stringify({ type }),
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
