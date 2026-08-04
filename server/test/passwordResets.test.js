import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createAccount } from '../src/models/accounts.js';
import { createResetToken, consumeResetToken } from '../src/models/passwordResets.js';

let account;

beforeEach(() => {
  db.exec('DELETE FROM password_reset_tokens; DELETE FROM sessions; DELETE FROM accounts;');
  account = createAccount('reset-test@example.com', 'password123');
});

describe('createResetToken / consumeResetToken', () => {
  it('consuming a valid token returns the account id', () => {
    const token = createResetToken(account.id);
    expect(consumeResetToken(token)).toBe(account.id);
  });

  it('never stores the raw token — only a hash is persisted', () => {
    const token = createResetToken(account.id);
    const row = db.prepare('SELECT token_hash FROM password_reset_tokens WHERE account_id = ?').get(account.id);
    expect(row.token_hash).not.toBe(token);
  });

  it('a token can only be consumed once', () => {
    const token = createResetToken(account.id);
    expect(consumeResetToken(token)).toBe(account.id);
    expect(consumeResetToken(token)).toBeNull();
  });

  it('an unknown token is rejected', () => {
    expect(consumeResetToken('not-a-real-token')).toBeNull();
  });

  it('an expired token is rejected', () => {
    const token = createResetToken(account.id);
    db.prepare('UPDATE password_reset_tokens SET expires_at = ? WHERE account_id = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      account.id
    );
    expect(consumeResetToken(token)).toBeNull();
  });
});
