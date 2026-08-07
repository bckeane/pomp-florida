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

export function fetchAdminAccounts() {
  return request('/admin/accounts');
}

export function fetchAllAccounts() {
  return request('/admin/accounts/all');
}

/** password is optional — omit it to promote an existing account to admin. */
export function addAdminAccount(email, password) {
  const body = password ? { email, password } : { email };
  return request('/admin/accounts', { method: 'POST', body: JSON.stringify(body) });
}

export function changeAccountRole(id, role) {
  return request(`/admin/accounts/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) });
}
