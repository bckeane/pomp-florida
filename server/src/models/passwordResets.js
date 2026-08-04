import crypto from 'node:crypto';
import { db } from '../db/connection.js';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Only the hash is stored — the raw token goes out in an emailed link, which
 * can end up in browser history, proxy logs, or referer headers, so it
 * shouldn't also sit in plaintext in the database.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Returns the raw token to embed in the reset link (never persisted as-is). */
export function createResetToken(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  db.prepare(
    'INSERT INTO password_reset_tokens (account_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(accountId, hashToken(token), now.toISOString(), expiresAt.toISOString());

  return token;
}

/**
 * Validates and burns a reset token in one step. Returns the account_id on
 * success, or null if the token is unknown, already used, or expired.
 */
export function consumeResetToken(token) {
  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').get(hashToken(token));
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  return row.account_id;
}
