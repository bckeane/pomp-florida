import { useCallback, useEffect, useState } from 'react';
import { fetchParticipants, updateParticipantBooking } from '../api/participants.js';
import { formatShortDate } from '../lib/dates.js';

const FIELDS = [
  { key: 'group_number', label: 'Group number' },
  { key: 'seat_mate_group', label: 'Seat mate group' },
  { key: 'reservation_number', label: 'Reservation number' },
  { key: 'seat_to_fl', label: 'Seat to FL' },
  { key: 'seat_to_ct', label: 'Seat to CT' },
];

/** Admin-only, booking-phase logistics per participant — group/seat/
 * reservation numbers filled in once flights are booked, plus a one-per-
 * group leader flag. Fetches its own roster independent of the Roster tab's
 * search/filter state (same pattern as AccountsPanel/TrafficPanel), always
 * active participants. */
export default function BookingPanel({ tripId }) {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [q, setQ] = useState('');
  const [groupNumber, setGroupNumber] = useState('');
  const [leadersOnly, setLeadersOnly] = useState(false);
  const [sort, setSort] = useState('last_name');
  const [dir, setDir] = useState('asc');

  const load = useCallback(async () => {
    if (!tripId) return;
    setError(null);
    try {
      setParticipants(
        await fetchParticipants({
          trip_id: tripId,
          sort,
          dir,
          active: '1',
          q,
          group_number: groupNumber,
          leaders_only: leadersOnly ? '1' : undefined,
        })
      );
    } catch {
      setError('Could not load participants. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, [tripId, sort, dir, q, groupNumber, leadersOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSort = (key) => {
    if (sort === key) {
      setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(key);
      setDir('asc');
    }
  };

  const draftKey = (id, field) => `${id}:${field}`;

  const handleBlur = async (p, field) => {
    const key = draftKey(p.id, field);
    const raw = drafts[key];
    if (raw === undefined) return;
    const value = raw.trim();
    if (value !== (p[field] ?? '')) {
      await updateParticipantBooking(p.id, { [field]: value === '' ? null : value });
      await load();
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  const handleLeaderChange = async (p, checked) => {
    setError(null);
    try {
      await updateParticipantBooking(p.id, { group_leader: checked });
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not update group leader.');
    }
  };

  const renderHeader = (key, label) => {
    const active = sort === key;
    return (
      <th key={key}>
        <button
          type="button"
          className={`sortable-header ${active ? 'sortable-header--active' : ''}`}
          onClick={() => handleSort(key)}
          aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
        >
          {label}
          <span className="sort-indicator" aria-hidden="true">
            {active ? (dir === 'desc' ? '▼' : '▲') : ''}
          </span>
        </button>
      </th>
    );
  };

  if (loading) return <p className="hint">Loading booking info…</p>;

  return (
    <div className="roster">
      {error && <div className="banner banner--error">{error}</div>}
      <div className="roster-controls">
        <input
          className="search-input"
          type="search"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="search-input"
          type="text"
          placeholder="Group number…"
          value={groupNumber}
          onChange={(e) => setGroupNumber(e.target.value)}
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={leadersOnly}
            onChange={(e) => setLeadersOnly(e.target.checked)}
          />
          Group leaders only
        </label>
      </div>
      <div className="roster-table-wrap">
        <table className="roster-table">
          <thead>
            <tr>
              {renderHeader('last_name', 'Name')}
              <th>Birthday</th>
              {FIELDS.map((f) => renderHeader(f.key, f.label))}
              {renderHeader('group_leader', 'Leader')}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id}>
                <td data-label="Name" className="col-name">{p.full_name}</td>
                <td data-label="Birthday">{formatShortDate(p.birth_date) ?? '—'}</td>
                {FIELDS.map((f) => (
                  <td key={f.key} data-label={f.label}>
                    <input
                      type="text"
                      value={drafts[draftKey(p.id, f.key)] ?? p[f.key] ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [draftKey(p.id, f.key)]: e.target.value }))
                      }
                      onBlur={() => handleBlur(p, f.key)}
                    />
                  </td>
                ))}
                <td data-label="Leader">
                  <input
                    type="checkbox"
                    checked={p.group_leader}
                    onChange={(e) => handleLeaderChange(p, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
            {participants.length === 0 && (
              <tr>
                <td colSpan={3 + FIELDS.length} className="empty-row">
                  No active participants match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
