import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createAccount } from '../src/models/accounts.js';
import {
  createSession,
  getSession,
  deleteSession,
  deleteSessionsByAccount,
} from '../src/models/sessions.js';

beforeEach(() => {
  db.exec('DELETE FROM sessions; DELETE FROM accounts;');
});

function makeAccount(email = 'session-test@example.com') {
  return createAccount(email, 'password123');
}

describe('createSession', () => {
  it('returns a token and an expiry ~30 days out, and persists a matching row', () => {
    const account = makeAccount();
    const before = Date.now();
    const { token, expiresAt } = createSession(account.id);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime() - before).toBeGreaterThan(thirtyDaysMs - 5000);
    expect(expiresAt.getTime() - before).toBeLessThan(thirtyDaysMs + 5000);

    const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    expect(row).toBeTruthy();
    expect(row.account_id).toBe(account.id);
  });

  it('generates a unique token per call', () => {
    const account = makeAccount();
    const a = createSession(account.id);
    const b = createSession(account.id);
    expect(a.token).not.toBe(b.token);
  });
});

describe('getSession', () => {
  it('returns null for a missing or falsy token', () => {
    expect(getSession(undefined)).toBeNull();
    expect(getSession('')).toBeNull();
    expect(getSession('does-not-exist')).toBeNull();
  });

  it('returns the session row for a valid token', () => {
    const account = makeAccount();
    const { token } = createSession(account.id);
    const session = getSession(token);
    expect(session).toBeTruthy();
    expect(session.account_id).toBe(account.id);
  });

  it('returns null and deletes the row once a session has expired', () => {
    const account = makeAccount();
    const { token } = createSession(account.id);
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ?").run(token);

    expect(getSession(token)).toBeNull();
    expect(db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)).toBeUndefined();
  });
});

describe('deleteSession', () => {
  it('removes only the targeted session', () => {
    const account = makeAccount();
    const { token: tokenA } = createSession(account.id);
    const { token: tokenB } = createSession(account.id);

    deleteSession(tokenA);

    expect(getSession(tokenA)).toBeNull();
    expect(getSession(tokenB)).toBeTruthy();
  });

  it('is a no-op for a token that does not exist', () => {
    expect(() => deleteSession('nonexistent')).not.toThrow();
  });
});

describe('deleteSessionsByAccount', () => {
  it('removes every session for the given account but leaves other accounts intact', () => {
    const accountA = makeAccount('a@example.com');
    const accountB = makeAccount('b@example.com');
    createSession(accountA.id);
    createSession(accountA.id);
    const { token: tokenB } = createSession(accountB.id);

    deleteSessionsByAccount(accountA.id);

    const remaining = db.prepare('SELECT * FROM sessions').all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].token).toBe(tokenB);
    expect(getSession(tokenB)).toBeTruthy();
  });
});
