import { useState } from 'react';
import { fetchMyPaymentLink } from '../api/participants.js';
import { fmtMoney } from '../lib/money.js';

/**
 * Self-serve "pay now" CTA for a swimmer/diver's own registration — the
 * parent's counterpart to the admin roster's copy-a-link flow
 * (RosterTable.jsx). Renders nothing for Adult participants (no trip fee)
 * or once nothing is owed; the deposit/final status pills (AccountHome.jsx,
 * built from lib/rosterStatus.js) already cover the "paid" case in pill
 * form wherever this sits.
 *
 * variant="default" (post-signup success screen): full-size primary/ghost
 * buttons, since paying is the main thing to do next.
 * variant="compact" (account-home roster row): text-link-style buttons
 * inline with the existing payment-status text and Edit link.
 */
export default function PaymentPrompt({ participant, variant = 'default' }) {
  const [state, setState] = useState({ status: 'idle' });
  const [pending, setPending] = useState(null);

  if (participant.role === 'Adult') return null;

  const { deposit_balance, final_payment_balance } = participant;
  if (deposit_balance == null && final_payment_balance == null) return null;

  const totalBalance = (deposit_balance ?? 0) + (final_payment_balance ?? 0);
  if (totalBalance <= 0) return null;

  const depositOwed = deposit_balance > 0;
  const compact = variant === 'compact';
  const primaryClass = compact ? 'link-btn payment-prompt-btn' : 'btn btn--primary payment-prompt-btn';
  const secondaryClass = compact ? 'link-btn payment-prompt-btn' : 'btn btn--ghost payment-prompt-btn';

  const handlePay = async (installment) => {
    setPending(installment);
    setState({ status: 'loading' });
    try {
      const { url } = await fetchMyPaymentLink(participant.id, installment);
      window.location.href = url;
    } catch (err) {
      setState({ status: 'error', message: err.body?.error || 'Something went wrong starting checkout.' });
    }
  };

  const loading = state.status === 'loading';

  return (
    <div className={`payment-prompt ${compact ? 'payment-prompt--compact' : ''}`}>
      {depositOwed && (
        <button
          type="button"
          className={primaryClass}
          disabled={loading}
          onClick={() => handlePay('deposit')}
        >
          {loading && pending === 'deposit' ? 'Redirecting…' : `Pay deposit — ${fmtMoney(deposit_balance)}`}
        </button>
      )}
      <button
        type="button"
        className={depositOwed ? secondaryClass : primaryClass}
        disabled={loading}
        onClick={() => handlePay('full')}
      >
        {loading && pending === 'full'
          ? 'Redirecting…'
          : `${depositOwed ? 'Pay in full' : 'Pay remaining balance'} — ${fmtMoney(totalBalance)}`}
      </button>
      {state.status === 'error' && (
        <span className="payment-prompt-error">
          {state.message}{' '}
          <button type="button" className="link-btn" onClick={() => handlePay(pending)}>
            try again
          </button>
        </span>
      )}
    </div>
  );
}
