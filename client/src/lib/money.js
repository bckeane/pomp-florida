export function fmtMoney(value) {
  if (value === null || value === undefined) return '—';
  return `$${Math.round(value).toLocaleString()}`;
}

/** Mirrors computeDepositAndFinal + the cost-range math in
 * server/src/models/trips.js, for the admin trip-details live preview.
 * Deposit defaults to 60% of the estimate (adjustable via the deposit-split
 * slider) floored to the nearest $100, final payment the exact remainder;
 * low/high is the estimate ± the spread percent (0 when unset). */
export function splitEstimatedCost(estimatedCost, spreadPercent, depositPercent) {
  if (estimatedCost == null || estimatedCost === '') {
    return { depositAmount: null, finalPayment: null, costLow: null, costHigh: null };
  }
  const cost = Number(estimatedCost);
  const percent = depositPercent === '' || depositPercent == null ? 60 : Number(depositPercent);
  const depositAmount = Math.floor((cost * percent) / 100 / 100) * 100;
  const spread = spreadPercent === '' || spreadPercent == null ? 0 : Number(spreadPercent);
  return {
    depositAmount,
    finalPayment: cost - depositAmount,
    costLow: Math.round(cost * (1 - spread / 100)),
    costHigh: Math.round(cost * (1 + spread / 100)),
  };
}

// null when the trip itself has no estimated_cost set (e.g. an archived trip
// with no detail fields) — "—" in the UI rather than a misleading $0 owed.
export function totalBalance({ deposit_balance, final_payment_balance }) {
  if (deposit_balance == null && final_payment_balance == null) return null;
  return (deposit_balance ?? 0) + (final_payment_balance ?? 0);
}
