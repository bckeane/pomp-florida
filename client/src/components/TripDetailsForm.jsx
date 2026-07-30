import { useState } from 'react';
import { updateTrip } from '../api/trips.js';

const FIELDS = [
  'intro_message',
  'return_date',
  'commitment_deadline',
  'deposit_amount',
  'final_payment_due',
  'final_payment_estimate',
  'cost_low',
  'cost_high',
  'training_location',
  'training_location_url',
  'lodging',
  'lodging_url',
  'meals_info',
  'whats_included',
  'payment_notes',
  'coordinators',
  'contact_email',
  'miss_school_note',
];

function toFormState(trip) {
  const state = {};
  for (const field of FIELDS) {
    state[field] = trip[field] ?? '';
  }
  return state;
}

/** Admin-only editor for the rich, family-facing copy shown on the public
 * home page (deadlines, cost, lodging, coordinators, etc). Separate from
 * TripSwitcher, which only manages the trip's identity (year/name/date). */
export default function TripDetailsForm({ trip, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toFormState(trip));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateTrip(trip.id, form);
      onSaved(updated);
    } catch (err) {
      setErrors(err.body?.errors || { _root: 'Could not save trip details.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal-panel modal-panel--wide"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>Edit trip details</h2>
        <p className="hint">
          This copy powers the public home page — dates, cost, lodging, and coordinators families see
          before they commit.
        </p>

        {errors._root && <div className="form-error form-error--root">{errors._root}</div>}

        <div className="form-row">
          <label>
            Return date
            <input type="date" value={form.return_date} onChange={set('return_date')} />
          </label>
          <label>
            Intro message
            <textarea rows={2} value={form.intro_message} onChange={set('intro_message')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Commitment deadline
            <input type="date" value={form.commitment_deadline} onChange={set('commitment_deadline')} />
            {errors.commitment_deadline && <span className="field-error">{errors.commitment_deadline}</span>}
          </label>
          <label>
            Deposit amount ($)
            <input type="number" min="0" value={form.deposit_amount} onChange={set('deposit_amount')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Final payment due
            <input type="date" value={form.final_payment_due} onChange={set('final_payment_due')} />
          </label>
          <label>
            Final payment estimate ($)
            <input
              type="number"
              min="0"
              value={form.final_payment_estimate}
              onChange={set('final_payment_estimate')}
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Estimated cost — low ($)
            <input type="number" min="0" value={form.cost_low} onChange={set('cost_low')} />
          </label>
          <label>
            Estimated cost — high ($)
            <input type="number" min="0" value={form.cost_high} onChange={set('cost_high')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Training location
            <input value={form.training_location} onChange={set('training_location')} />
          </label>
          <label>
            Training location link
            <input value={form.training_location_url} onChange={set('training_location_url')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Lodging
            <input value={form.lodging} onChange={set('lodging')} />
          </label>
          <label>
            Lodging link
            <input value={form.lodging_url} onChange={set('lodging_url')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Meals info
            <textarea rows={2} value={form.meals_info} onChange={set('meals_info')} />
          </label>
          <label>
            Miss-school note
            <input value={form.miss_school_note} onChange={set('miss_school_note')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            What&rsquo;s included (one per line)
            <textarea rows={4} value={form.whats_included} onChange={set('whats_included')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Payment instructions
            <textarea rows={2} value={form.payment_notes} onChange={set('payment_notes')} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Coordinators (one per line)
            <textarea rows={2} value={form.coordinators} onChange={set('coordinators')} />
          </label>
          <label>
            Contact email
            <input type="email" value={form.contact_email} onChange={set('contact_email')} />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </div>
  );
}
