import { describe, it, expect } from 'vitest';
import { fmtMoney, totalBalance, splitEstimatedCost } from './money.js';

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

describe('splitEstimatedCost', () => {
  it('defaults to a 60/40 split, summing exactly to the estimate', () => {
    expect(splitEstimatedCost(2000, 0)).toEqual({
      depositAmount: 1200,
      finalPayment: 800,
      costLow: 2000,
      costHigh: 2000,
    });
  });

  it('floors the deposit to the nearest $100 and derives final payment as the exact remainder', () => {
    const { depositAmount, finalPayment } = splitEstimatedCost(1250, 0);
    expect(depositAmount).toBe(700);
    expect(finalPayment).toBe(550);
    expect(depositAmount + finalPayment).toBe(1250);
  });

  it('never rounds the deposit up, even when close to the next $100', () => {
    const { depositAmount, finalPayment } = splitEstimatedCost(999, 0);
    expect(depositAmount).toBe(500);
    expect(finalPayment).toBe(499);
    expect(depositAmount + finalPayment).toBe(999);
  });

  it('applies an adjustable deposit percent (the slider) instead of the 60% default', () => {
    expect(splitEstimatedCost(2000, 0, 50)).toMatchObject({ depositAmount: 1000, finalPayment: 1000 });
    expect(splitEstimatedCost(2000, 0, 25)).toMatchObject({ depositAmount: 500, finalPayment: 1500 });
  });

  it('applies the spread percent to get low/high', () => {
    expect(splitEstimatedCost(2000, 10)).toEqual({
      depositAmount: 1200,
      finalPayment: 800,
      costLow: 1800,
      costHigh: 2200,
    });
  });

  it('treats a missing/blank spread as 0', () => {
    expect(splitEstimatedCost(2000, null)).toMatchObject({ costLow: 2000, costHigh: 2000 });
    expect(splitEstimatedCost(2000, '')).toMatchObject({ costLow: 2000, costHigh: 2000 });
  });

  it('returns all-null when the estimate itself is unset', () => {
    expect(splitEstimatedCost(null, 10)).toEqual({
      depositAmount: null,
      finalPayment: null,
      costLow: null,
      costHigh: null,
    });
    expect(splitEstimatedCost('', 10)).toEqual({
      depositAmount: null,
      finalPayment: null,
      costLow: null,
      costHigh: null,
    });
  });
});
