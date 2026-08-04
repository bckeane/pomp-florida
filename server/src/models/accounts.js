import { db } from '../db/connection.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { isBreakGlassEmail } from '../lib/breakGlass.js';

/**
 * The stored role, except an account currently matching BREAK_GLASS_EMAIL is
 * always treated as admin — this is computed on every read, never persisted,
 * so rotating/unsetting the env var revokes it instantly with no dangling
 * admin row left in the database. Every caller (session middleware, login/
 * signup responses, /auth/me) goes through this, so the client-visible role
 * always matches what requireAdmin will actually allow.
 */
export function getAccountById(id) {
  const account = db.prepare('SELECT id, email, role, created_at FROM accounts WHERE id = ?').get(id);
  if (!account) return null;
  if (account.role !== 'admin' && isBreakGlassEmail(account.email)) {
    return { ...account, role: 'admin' };
  }
  return account;
}

export function findAccountByEmail(email) {
  return db.prepare('SELECT * FROM accounts WHERE email = ?').get(email.trim().toLowerCase()) || null;
}

/**
 * Returns the created account, or null if the email is already taken.
 * Always creates a 'parent' account — there is no public API path that lets
 * a caller grant themselves 'admin'. Promoting to admin is a local-only
 * operation (see server/scripts/create-admin.js).
 */
export function createAccount(email, password) {
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);
  try {
    const info = db
      .prepare("INSERT INTO accounts (email, password_hash, role, created_at) VALUES (?, ?, 'parent', ?)")
      .run(email.trim().toLowerCase(), passwordHash, now);
    return getAccountById(info.lastInsertRowid);
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) return null;
    throw err;
  }
}

/** Returns the account if the password matches, else null. */
export function verifyAccountPassword(email, password) {
  const account = findAccountByEmail(email);
  if (!account) return null;
  if (!verifyPassword(password, account.password_hash)) return null;
  return getAccountById(account.id);
}

/**
 * Grants/revokes admin. Only reachable via server/scripts/create-admin.js
 * (local-only) or POST /api/admin/accounts (itself requireAdmin-gated) —
 * never from the public signup path.
 */
export function setAccountRole(id, role) {
  db.prepare('UPDATE accounts SET role = ? WHERE id = ?').run(role, id);
  return getAccountById(id);
}

/**
 * All admin accounts, for the "manage admins" screen — excluding the
 * break-glass account (if configured), which stays invisible even to other
 * admins.
 */
export function listAdminAccounts() {
  const rows = db
    .prepare("SELECT id, email, role, created_at FROM accounts WHERE role = 'admin' ORDER BY created_at")
    .all();
  return rows.filter((account) => !isBreakGlassEmail(account.email));
}
