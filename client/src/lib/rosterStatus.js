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

// One colored status-pill per installment (see AllergyStatus for the same
// pattern) — null when that installment isn't tracked at all (the trip has
// no estimated_cost set), not a false "nothing owed".
export function depositStatusLabel(deposit_balance) {
  if (deposit_balance == null) return null;
  return deposit_balance > 0
    ? { variant: 'warn', text: `${fmtMoney(deposit_balance)} deposit due` }
    : { variant: 'ok', text: 'Deposit paid' };
}

export function finalPaymentStatusLabel(final_payment_balance) {
  if (final_payment_balance == null) return null;
  return final_payment_balance > 0
    ? { variant: 'warn', text: `${fmtMoney(final_payment_balance)} balance due` }
    : { variant: 'ok', text: 'Balance paid' };
}
