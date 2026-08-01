import { describe, it, expect } from 'vitest';
import { fmtMoney } from './money.js';

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
