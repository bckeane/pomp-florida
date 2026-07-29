import { ROLES } from '../constants.js';

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
  gradYears,
}) {
  const { q, role, grad_year, sort, showInactive } = filters;

  const setFilter = (patch) => onFiltersChange({ ...filters, ...patch });

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
              <td colSpan={7} className="empty-row">
                No participants match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
