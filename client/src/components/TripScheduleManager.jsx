import { useCallback, useEffect, useState } from 'react';
import {
  fetchTripSchedule,
  addTripScheduleDay,
  updateTripScheduleDay,
  deleteTripScheduleDay,
  autoCreateTripSchedule,
} from '../api/trips.js';

function rowToDraft(row) {
  return {
    morning_window: row.morning_window ?? '',
    afternoon_window: row.afternoon_window ?? '',
    notes: row.notes ?? '',
  };
}

const EMPTY_DRAFT = { date: '', morning_window: '', afternoon_window: '', notes: '' };

/** Admin editor for a trip's day-by-day pool-time schedule (see migration
 * 021) — free-text morning/afternoon windows ("6am-9am window", "3-5pm",
 * "None"), not structured times, matching how the committee actually words
 * the real schedule day to day. Feeds the parent-facing TripEssentials
 * summary. Own immediate-save state, same pattern as BudgetPanel's
 * food-planner day-by-day table — independent of TripDetailsForm's single
 * bundled submit, since each day is its own row to save. */
export default function TripScheduleManager({ tripId }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editDrafts, setEditDrafts] = useState({});
  const [newDraft, setNewDraft] = useState(EMPTY_DRAFT);
  const [autoCreating, setAutoCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchTripSchedule(tripId);
      setDays(rows);
      setEditDrafts(Object.fromEntries(rows.map((row) => [row.id, rowToDraft(row)])));
    } catch {
      setError('Could not load the pool-time schedule.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!newDraft.date) return;
    setError(null);
    try {
      await addTripScheduleDay(tripId, newDraft);
      setNewDraft(EMPTY_DRAFT);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not add that day.');
    }
  };

  const handleBlur = async (row) => {
    const draft = editDrafts[row.id];
    if (!draft) return;
    const unchanged =
      draft.morning_window === (row.morning_window ?? '') &&
      draft.afternoon_window === (row.afternoon_window ?? '') &&
      draft.notes === (row.notes ?? '');
    if (unchanged) return;
    try {
      await updateTripScheduleDay(tripId, row.id, draft);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not save that day.');
    }
  };

  const handleDelete = async (row) => {
    setError(null);
    try {
      await deleteTripScheduleDay(tripId, row.id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not remove that day.');
    }
  };

  const handleAutoCreate = async () => {
    setAutoCreating(true);
    setError(null);
    try {
      await autoCreateTripSchedule(tripId);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not auto-create days for this trip.');
    } finally {
      setAutoCreating(false);
    }
  };

  if (loading) return <p className="hint">Loading…</p>;

  return (
    <div>
      {error && <div className="form-error form-error--root">{error}</div>}
      <button type="button" className="btn btn--ghost" style={{ marginBottom: '0.4rem' }} disabled={autoCreating} onClick={handleAutoCreate}>
        {autoCreating ? 'Adding days…' : '+ Auto-create days for trip dates'}
      </button>
      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Morning</th>
              <th>Afternoon</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {days.map((row) => {
              const draft = editDrafts[row.id] ?? rowToDraft(row);
              return (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    <input
                      type="text"
                      placeholder="e.g. 6am-9am window"
                      value={draft.morning_window}
                      onChange={(e) =>
                        setEditDrafts((d) => ({ ...d, [row.id]: { ...draft, morning_window: e.target.value } }))
                      }
                      onBlur={() => handleBlur(row)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="e.g. 3-5pm"
                      value={draft.afternoon_window}
                      onChange={(e) =>
                        setEditDrafts((d) => ({ ...d, [row.id]: { ...draft, afternoon_window: e.target.value } }))
                      }
                      onBlur={() => handleBlur(row)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={draft.notes}
                      onChange={(e) => setEditDrafts((d) => ({ ...d, [row.id]: { ...draft, notes: e.target.value } }))}
                      onBlur={() => handleBlur(row)}
                    />
                  </td>
                  <td>
                    <button type="button" className="link-btn link-btn--danger" onClick={() => handleDelete(row)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td>
                <input type="date" value={newDraft.date} onChange={(e) => setNewDraft((d) => ({ ...d, date: e.target.value }))} />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="e.g. 6am-9am window"
                  value={newDraft.morning_window}
                  onChange={(e) => setNewDraft((d) => ({ ...d, morning_window: e.target.value }))}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="e.g. 3-5pm"
                  value={newDraft.afternoon_window}
                  onChange={(e) => setNewDraft((d) => ({ ...d, afternoon_window: e.target.value }))}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Notes"
                  value={newDraft.notes}
                  onChange={(e) => setNewDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </td>
              <td>
                <button type="button" className="btn btn--ghost" onClick={handleAdd}>
                  + Add day
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
