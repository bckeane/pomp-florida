import { useState } from 'react';
import { ROLES } from '../constants.js';
import { fmtMoney, totalBalance } from '../lib/money.js';
import { fetchPaymentLink } from '../api/participants.js';

const SORT_OPTIONS = [
  { value: 'last_name', label: 'Last name' },
  { value: 'grad_year', label: 'Grad year' },
  { value: 'age', label: 'Age' },
];

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export default function RosterTable({
  participants,
  filters,
  onFiltersChange,
  onEdit,
  onDelete,
  onUpdatePayment,
  gradYears,
}) {
  const { q, role, grad_year, sort, showInactive } = filters;
  const [drafts, setDrafts] = useState({});
  const [paymentLinks, setPaymentLinks] = useState({});

  const setFilter = (patch) => onFiltersChange({ ...filters, ...patch });

  const draftKey = (id, field) => `${id}:${field}`;

  const handleGetPaymentLink = async (p, installment) => {
    const key = draftKey(p.id, installment);
    setPaymentLinks((s) => ({ ...s, [key]: { status: 'loading' } }));
    try {
      const { url, amount } = await fetchPaymentLink(p.id, installment);
      setPaymentLinks((s) => ({ ...s, [key]: { status: 'success', url, amount, copied: false } }));
    } catch (err) {
      const message = err.body?.error || "Couldn't reach Stripe — try again";
      setPaymentLinks((s) => ({ ...s, [key]: { status: 'error', message } }));
    }
  };

  const handleCopyPaymentLink = async (p, installment, url) => {
    const key = draftKey(p.id, installment);
    await navigator.clipboard.writeText(url);
    setPaymentLinks((s) => ({ ...s, [key]: { ...s[key], copied: true } }));
    setTimeout(() => {
      setPaymentLinks((s) => (s[key]?.copied ? { ...s, [key]: { ...s[key], copied: false } } : s));
    }, 2000);
  };

  const handlePaymentBlur = async (p, field) => {
    const key = draftKey(p.id, field);
    const raw = drafts[key];
    if (raw === undefined) return;
    const value = Number(raw);
    if (raw === '' || Number.isNaN(value) || value < 0) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      return;
    }
    if (value !== p[field]) {
      await onUpdatePayment(p, field, value);
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  const renderPaymentAction = (p, installment) => {
    const key = draftKey(p.id, installment);
    const state = paymentLinks[key];
    const label = installment === 'deposit' ? 'deposit' : 'final';
    const balance = installment === 'deposit' ? p.deposit_balance : p.final_payment_balance;

    if (balance != null && balance <= 0 && state?.status !== 'success') {
      return (
        <span className="payment-link-status" title="Already paid in full">
          Paid in full
        </span>
      );
    }

    if (state?.status === 'loading') {
      return (
        <span className="payment-link-status">
          <Spinner /> Generating…
        </span>
      );
    }

    if (state?.status === 'error') {
      return (
        <span className="payment-link-status payment-link-status--error">
          <span className="payment-link-message">{state.message}</span>{' '}
          <button className="link-btn payment-link-btn" onClick={() => handleGetPaymentLink(p, installment)}>
            try again
          </button>
        </span>
      );
    }

    if (state?.status === 'success') {
      return (
        <span className="payment-link-success">
          <span className="payment-link-summary">
            {label === 'deposit' ? 'Deposit' : 'Final'} link for <strong>{p.full_name}</strong> —{' '}
            <strong>{fmtMoney(state.amount)}</strong>
          </span>
          <span className="payment-link-url" title={state.url}>
            {state.url}
          </span>
          <button
            className="link-btn payment-link-btn"
            onClick={() => handleCopyPaymentLink(p, installment, state.url)}
            aria-label={`Copy ${label} payment link for ${p.full_name}`}
          >
            {state.copied ? '✓ Copied' : 'Copy'}
          </button>
          <button className="link-btn payment-link-btn" onClick={() => handleGetPaymentLink(p, installment)}>
            Regenerate {label} link
          </button>
        </span>
      );
    }

    return (
      <button className="link-btn payment-link-btn" onClick={() => handleGetPaymentLink(p, installment)}>
        Get {label} link
      </button>
    );
  };

  return (
    <div className="roster">
      <div className="roster-controls">
        <input
          className="search-input"
          type="search"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setFilter({ q: e.target.value })}
        />

        <div className="chip-group">
          <button
            className={`chip ${role === '' ? 'chip--active' : ''}`}
            onClick={() => setFilter({ role: '' })}
          >
            All roles
          </button>
          {ROLES.map((r) => (
            <button
              key={r}
              className={`chip ${role === r ? 'chip--active' : ''}`}
              onClick={() => setFilter({ role: role === r ? '' : r })}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="chip-group">
          <button
            className={`chip ${grad_year === '' ? 'chip--active' : ''}`}
            onClick={() => setFilter({ grad_year: '' })}
          >
            All classes
          </button>
          {gradYears.map((g) => (
            <button
              key={g}
              className={`chip ${grad_year === g ? 'chip--active' : ''}`}
              onClick={() => setFilter({ grad_year: grad_year === g ? '' : g })}
            >
              {g}
            </button>
          ))}
        </div>

        <label className="sort-select">
          Sort by
          <select value={sort} onChange={(e) => setFilter({ sort: e.target.value })}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setFilter({ showInactive: e.target.checked })}
          />
          Show inactive
        </label>
      </div>

      <div className="roster-table-wrap">
      <table className="roster-table">
        <thead>
          <tr>
            <th>Last, First</th>
            <th>Role</th>
            <th>Grad year</th>
            <th>Grade</th>
            <th>Age</th>
            <th>Status</th>
            <th>Deposit paid</th>
            <th>Final pmt paid</th>
            <th>Balance owed</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'row--inactive'}>
              <td data-label="Name">{p.full_name}</td>
              <td data-label="Role">{p.role}</td>
              <td data-label="Grad year">{p.grad_year || '—'}</td>
              <td data-label="Grade">{p.grade ?? '—'}</td>
              <td data-label="Age">{p.age_at_trip ?? '—'}</td>
              <td data-label="Status">{p.active ? 'Active' : 'Inactive'}</td>
              <td data-label="Deposit paid">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={drafts[draftKey(p.id, 'deposit_received')] ?? String(p.deposit_received)}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [draftKey(p.id, 'deposit_received')]: e.target.value }))
                  }
                  onBlur={() => handlePaymentBlur(p, 'deposit_received')}
                />
              </td>
              <td data-label="Final pmt paid">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    drafts[draftKey(p.id, 'final_payment_received')] ?? String(p.final_payment_received)
                  }
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [draftKey(p.id, 'final_payment_received')]: e.target.value,
                    }))
                  }
                  onBlur={() => handlePaymentBlur(p, 'final_payment_received')}
                />
              </td>
              <td data-label="Balance owed">{fmtMoney(totalBalance(p))}</td>
              <td data-label="" className="col-actions">
                <div className="row-actions">
                  <button
                    className="link-btn icon-btn"
                    onClick={() => onEdit(p)}
                    aria-label={`Edit ${p.first_name} ${p.last_name}`}
                    title="Edit"
                  >
                    <EditIcon />
                  </button>
                  <button
                    className={`link-btn icon-btn ${p.active ? 'link-btn--danger' : ''}`}
                    onClick={() => onDelete(p)}
                    aria-label={`${p.active ? 'Remove' : 'Restore'} ${p.first_name} ${p.last_name}`}
                    title={p.active ? 'Remove' : 'Restore'}
                  >
                    {p.active ? <TrashIcon /> : <RestoreIcon />}
                  </button>
                  <div className="payment-actions" aria-live="polite">
                    {renderPaymentAction(p, 'deposit')}
                    {renderPaymentAction(p, 'final')}
                  </div>
                </div>
              </td>
            </tr>
          ))}
          {participants.length === 0 && (
            <tr>
              <td colSpan={10} className="empty-row">
                No participants match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
