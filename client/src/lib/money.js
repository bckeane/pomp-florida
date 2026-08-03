export function fmtMoney(value) {
  if (value === null || value === undefined) return '—';
  return `$${Math.round(value).toLocaleString()}`;
}

// null when the trip itself has no deposit_amount/final_payment_estimate set
// (e.g. an archived trip with no detail fields) — "—" in the UI rather than
// a misleading $0 owed.
export function totalBalance({ deposit_balance, final_payment_balance }) {
  if (deposit_balance == null && final_payment_balance == null) return null;
  return (deposit_balance ?? 0) + (final_payment_balance ?? 0);
}
