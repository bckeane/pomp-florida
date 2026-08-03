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

/** password is optional — omit it to promote an existing account to admin. */
export function addAdminAccount(email, password) {
  const body = password ? { email, password } : { email };
  return request('/admin/accounts', { method: 'POST', body: JSON.stringify(body) });
}
