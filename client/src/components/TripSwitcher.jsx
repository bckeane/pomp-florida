import { useState } from 'react';
import { createTrip, activateTrip } from '../api/trips.js';

export default function TripSwitcher({ trips, selectedTripId, onSelectTrip, onTripsChanged }) {
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [form, setForm] = useState({ year: '', name: '', trip_date: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const selectedTrip = trips.find((t) => t.id === selectedTripId);

  const openNewTripForm = () => {
    const nextYear = String(Number(trips[0]?.year || new Date().getFullYear()) + 1);
    setForm({ year: nextYear, name: `Florida Trip ${nextYear}`, trip_date: '' });
    setErrors({});
    setShowNewTrip(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trip = await createTrip(form);
      await activateTrip(trip.id);
      setShowNewTrip(false);
      await onTripsChanged(trip.id);
    } catch (err) {
      setErrors(err.body?.errors || { _root: 'Could not create the trip.' });
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id) => {
    await activateTrip(id);
    await onTripsChanged(id);
  };

  return (
    <div className="trip-switcher">
      <label className="trip-select">
        Trip
        <select value={selectedTripId || ''} onChange={(e) => onSelectTrip(Number(e.target.value))}>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.is_current ? '(current)' : ''}
            </option>
          ))}
        </select>
      </label>

      {selectedTrip && !selectedTrip.is_current && (
        <button className="btn btn--ghost" onClick={() => handleActivate(selectedTrip.id)}>
          Make current
        </button>
      )}

      <button className="btn btn--ghost" onClick={openNewTripForm}>
        Start new year
      </button>

      {showNewTrip && (
        <div className="modal-backdrop" onClick={() => setShowNewTrip(false)}>
          <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>Start a new trip year</h2>
            <p className="hint">
              Creates a fresh, empty roster for the new year and makes it the current trip. Past
              years stay exactly as they are — switch back to them anytime from the trip dropdown.
            </p>

            {errors._root && <div className="form-error form-error--root">{errors._root}</div>}

            <div className="form-row">
              <label>
                Year
                <input
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                />
                {errors.year && <span className="field-error">{errors.year}</span>}
              </label>
              <label>
                Trip date
                <input
                  type="date"
                  value={form.trip_date}
                  onChange={(e) => setForm((f) => ({ ...f, trip_date: e.target.value }))}
                />
                {errors.trip_date && <span className="field-error">{errors.trip_date}</span>}
              </label>
            </div>

            <div className="form-row">
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowNewTrip(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create & switch'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
