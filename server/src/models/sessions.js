import crypto from 'node:crypto';
import { db } from '../db/connection.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare('INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    accountId,
    now.toISOString(),
    expiresAt.toISOString()
  );
  return { token, expiresAt };
}

export function getSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    deleteSession(token);
    return null;
  }
  return row;
}

export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Revokes every existing session for an account — used after a password reset. */
export function deleteSessionsByAccount(accountId) {
  db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
}
