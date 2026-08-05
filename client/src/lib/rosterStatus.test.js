import { describe, it, expect } from 'vitest';
import { allergyStatusLabel, paymentStatusText } from './rosterStatus.js';

describe('allergyStatusLabel', () => {
  it('flags true as an on-file allergy/medication', () => {
    expect(allergyStatusLabel(true)).toEqual({ variant: 'flag', text: 'Allergy/medication on file' });
  });

  it('shows false as an explicit "no"', () => {
    expect(allergyStatusLabel(false)).toEqual({ variant: 'ok', text: 'No allergy/medication' });
  });

  it('treats null (never asked) as a call to action, not a quiet no', () => {
    expect(allergyStatusLabel(null)).toEqual({ variant: 'warn', text: 'Needs allergy info' });
  });

  it('treats undefined the same as null', () => {
    expect(allergyStatusLabel(undefined)).toEqual({ variant: 'warn', text: 'Needs allergy info' });
  });
});

describe('paymentStatusText', () => {
  it('is null when the trip has no amounts set on either installment', () => {
    expect(paymentStatusText({ deposit_balance: null, final_payment_balance: null })).toBeNull();
  });

  it('shows amount due when a balance is owed', () => {
    expect(paymentStatusText({ deposit_balance: 250, final_payment_balance: null })).toBe('$250 deposit due');
  });

  it('shows "paid" when the balance is fully covered', () => {
    expect(paymentStatusText({ deposit_balance: 0, final_payment_balance: null })).toBe('Deposit paid');
  });

  it('joins both installments when both are tracked', () => {
    expect(paymentStatusText({ deposit_balance: 0, final_payment_balance: 500 })).toBe(
      'Deposit paid · $500 balance due'
    );
  });
});
