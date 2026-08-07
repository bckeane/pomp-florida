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

export function unretireBudgetCategory(id) {
  return request(`/budget/categories/${id}/unretire`, { method: 'POST' });
}

/** Removes a category from just this trip's budget table — only succeeds
 * if the line item is at zero value. Separate from retireBudgetCategory,
 * which is global and doesn't touch any trip's existing line items. */
export function detachBudgetCategory(tripId, categoryId) {
  return request(`/budget/items/${tripId}/${categoryId}`, { method: 'DELETE' });
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
 * row), rate_per_athlete (for a 'per_swimmer' row), or percent_rate (for a
 * 'service_charge' row). */
export function updateBudgetLineItem(tripId, categoryId, { total, rate_per_athlete, percent_rate } = {}) {
  return request('/budget/items', {
    method: 'PUT',
    body: JSON.stringify({ trip_id: tripId, category_id: categoryId, total, rate_per_athlete, percent_rate }),
  });
}

export function switchBudgetItemType(tripBudgetItemId, type) {
  return request(`/budget/items/${tripBudgetItemId}/type`, {
    method: 'PUT',
    body: JSON.stringify({ type }),
  });
}

/** Pins (value: a number) or clears (value: null) this row's # Students
 * figure — overriding the live roster count minus this item's own
 * exclusions. */
export function setBudgetStudentCountOverride(tripBudgetItemId, value) {
  return request(`/budget/items/${tripBudgetItemId}/student-count-override`, {
    method: 'PUT',
    body: JSON.stringify({ student_count_override: value }),
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
