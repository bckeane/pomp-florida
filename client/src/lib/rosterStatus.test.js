import { describe, it, expect } from 'vitest';
import { allergyStatusLabel, depositStatusLabel, finalPaymentStatusLabel } from './rosterStatus.js';

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

describe('depositStatusLabel', () => {
  it('is null when the trip has no deposit amount set', () => {
    expect(depositStatusLabel(null)).toBeNull();
  });

  it('warns with the amount due when a balance is owed', () => {
    expect(depositStatusLabel(250)).toEqual({ variant: 'warn', text: '$250 deposit due' });
  });

  it('shows ok "paid" when the balance is fully covered', () => {
    expect(depositStatusLabel(0)).toEqual({ variant: 'ok', text: 'Deposit paid' });
  });
});

describe('finalPaymentStatusLabel', () => {
  it('is null when the trip has no final payment amount set', () => {
    expect(finalPaymentStatusLabel(null)).toBeNull();
  });

  it('warns with the amount due when a balance is owed', () => {
    expect(finalPaymentStatusLabel(500)).toEqual({ variant: 'warn', text: '$500 balance due' });
  });

  it('shows ok "paid" when the balance is fully covered', () => {
    expect(finalPaymentStatusLabel(0)).toEqual({ variant: 'ok', text: 'Balance paid' });
  });
});
