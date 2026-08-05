import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/connection.js';
import { createAccount, getAccountById, updateAccountProfile } from '../src/models/accounts.js';

beforeEach(() => {
  db.exec('DELETE FROM sessions; DELETE FROM accounts;');
});

describe('parent profile (parent_name / emergency_phone)', () => {
  it('is null on a freshly created account', () => {
    const account = createAccount('profile@example.com', 'password123');
    expect(account.parent_name).toBeNull();
    expect(account.emergency_phone).toBeNull();
  });

  it('updateAccountProfile sets both fields and getAccountById reflects them', () => {
    const account = createAccount('profile2@example.com', 'password123');
    const updated = updateAccountProfile(account.id, {
      parent_name: 'Jamie Rivera',
      emergency_phone: '555-123-4567',
    });
    expect(updated.parent_name).toBe('Jamie Rivera');
    expect(updated.emergency_phone).toBe('555-123-4567');

    const reloaded = getAccountById(account.id);
    expect(reloaded.parent_name).toBe('Jamie Rivera');
    expect(reloaded.emergency_phone).toBe('555-123-4567');
  });
});
