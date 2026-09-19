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
 * reservation numbers filled in once flights are booked. Fetches its own
 * roster independent of the Roster tab's search/filter state (same pattern
 * as AccountsPanel/TrafficPanel), always active participants sorted by
 * last name. */
export default function BookingPanel({ tripId }) {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    if (!tripId) return;
    setError(null);
    try {
      setParticipants(
        await fetchParticipants({ trip_id: tripId, sort: 'last_name', dir: 'asc', active: '1' })
      );
    } catch {
      setError('Could not load participants. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (loading) return <p className="hint">Loading booking info…</p>;

  return (
    <div className="roster">
      {error && <div className="banner banner--error">{error}</div>}
      <div className="roster-table-wrap">
        <table className="roster-table">
          <thead>
            <tr>
              <th className="col-name">Name</th>
              <th>Birthday</th>
              {FIELDS.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
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
              </tr>
            ))}
            {participants.length === 0 && (
              <tr>
                <td colSpan={2 + FIELDS.length} className="empty-row">
                  No active participants on this trip.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
