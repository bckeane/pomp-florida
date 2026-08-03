import { useState } from 'react';
import { ROLES } from '../constants.js';
import { fmtMoney, totalBalance } from '../lib/money.js';

const SORT_OPTIONS = [
  { value: 'last_name', label: 'Last name' },
  { value: 'grad_year', label: 'Grad year' },
  { value: 'age', label: 'Age' },
];

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
              <td className="row-actions" data-label="">
                <button className="link-btn" onClick={() => onEdit(p)}>
                  Edit
                </button>
                <button className="link-btn link-btn--danger" onClick={() => onDelete(p)}>
                  {p.active ? 'Remove' : 'Restore'}
                </button>
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
