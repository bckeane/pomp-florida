import { describe, it, expect } from 'vitest';
import { fmtMoney, totalBalance } from './money.js';

describe('fmtMoney', () => {
  it('renders null/undefined as an em dash', () => {
    expect(fmtMoney(null)).toBe('—');
    expect(fmtMoney(undefined)).toBe('—');
  });

  it('rounds to the nearest whole dollar and adds a thousands separator', () => {
    expect(fmtMoney(637.3793103448276)).toBe('$637');
    expect(fmtMoney(1842.68)).toBe('$1,843');
  });

  it('preserves the sign for negative diffs', () => {
    expect(fmtMoney(-1409)).toBe('$-1,409');
  });

  it('formats zero as $0, not the em dash', () => {
    expect(fmtMoney(0)).toBe('$0');
  });
});

describe('totalBalance', () => {
  it('sums both installment balances', () => {
    expect(totalBalance({ deposit_balance: 250, final_payment_balance: 1000 })).toBe(1250);
  });

  it('treats a null balance as 0 when the other is set', () => {
    expect(totalBalance({ deposit_balance: 250, final_payment_balance: null })).toBe(250);
  });

  it('is null when neither installment has an amount set on the trip', () => {
    expect(totalBalance({ deposit_balance: null, final_payment_balance: null })).toBeNull();
  });

  it('can be negative when a family has overpaid', () => {
    expect(totalBalance({ deposit_balance: -50, final_payment_balance: 0 })).toBe(-50);
  });
});
