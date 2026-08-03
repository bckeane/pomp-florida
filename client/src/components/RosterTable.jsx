import { useState } from 'react';
import { ROLES } from '../constants.js';
import { fmtMoney, totalBalance } from '../lib/money.js';

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

  const setFilter = (patch) => onFiltersChange({ ...filters, ...patch });

  const draftKey = (id, field) => `${id}:${field}`;

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
            <th></th>
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
              <td data-label="">
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
  );
}
