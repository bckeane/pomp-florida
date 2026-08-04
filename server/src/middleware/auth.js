import { getSession } from '../models/sessions.js';
import { getAccountById } from '../models/accounts.js';

export const SESSION_COOKIE = 'session';

export function requireAccount(req, res, next) {
  const session = getSession(req.cookies?.[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const account = getAccountById(session.account_id);
  if (!account) return res.status(401).json({ error: 'Not signed in' });

  req.account = account;
  next();
}

// getAccountById folds break-glass status into `role` dynamically (see
// models/accounts.js) — rotating/unsetting BREAK_GLASS_EMAIL revokes access
// on the very next request, with no persisted admin row to clean up.
export function requireAdmin(req, res, next) {
  const session = getSession(req.cookies?.[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const account = getAccountById(session.account_id);
  if (!account) return res.status(401).json({ error: 'Not signed in' });
  if (account.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  req.account = account;
  next();
}
