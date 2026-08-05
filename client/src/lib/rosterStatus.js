import { fmtMoney } from './money.js';

// has_allergy_medication is tri-state (true/false/null — see migration 013
// on the server). null means "never asked" (always true for participants
// added before this field existed) and must read as a call to action, not
// as a quiet "no".
export function allergyStatusLabel(value) {
  if (value === true) return { variant: 'flag', text: 'Allergy/medication on file' };
  if (value === false) return { variant: 'ok', text: 'No allergy/medication' };
  return { variant: 'warn', text: 'Needs allergy info' };
}

// Joins whichever installment balances are actually tracked on the trip
// (null means the trip has no deposit_amount/final_payment_estimate set,
// not a false "nothing owed") into one line for the account-home roster row.
export function paymentStatusText({ deposit_balance, final_payment_balance }) {
  if (deposit_balance == null && final_payment_balance == null) return null;

  const parts = [];
  if (deposit_balance != null) {
    parts.push(deposit_balance > 0 ? `${fmtMoney(deposit_balance)} deposit due` : 'Deposit paid');
  }
  if (final_payment_balance != null) {
    parts.push(final_payment_balance > 0 ? `${fmtMoney(final_payment_balance)} balance due` : 'Balance paid');
  }
  return parts.join(' · ');
}
