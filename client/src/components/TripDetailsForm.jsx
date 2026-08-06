import { useEffect, useState } from 'react';
import { updateTrip } from '../api/trips.js';
import Markdown from './Markdown.jsx';
import { renderMarkdownInline } from '../lib/markdown.js';
import { fmtMoney, splitEstimatedCost } from '../lib/money.js';

function splitLines(text) {
  return (text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

const FIELDS = [
  'intro_message',
  'return_date',
  'commitment_deadline',
  'final_payment_due',
  'estimated_cost',
  'deposit_percent',
  'cost_spread_percent',
  'overrun_amount',
  'overrun_due_date',
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

/** A large text field with a live markdown preview, for the free-form copy
 * fields that support bold/italic/link formatting. `linePreview` mirrors how
 * the "one per line" fields (whats_included, coordinators) actually render on
 * the public page — each line as its own item — rather than the paragraph/list
 * block parsing used elsewhere, so the preview matches production exactly. */
function MarkdownField({ label, value, onChange, rows = 3, linePreview = false }) {
  return (
    <div className="markdown-field field--full">
      <label>
        {label} <span className="markdown-hint">(supports **bold**, *italic*, [text](url))</span>
        <textarea rows={rows} value={value} onChange={onChange} />
      </label>
      <div className="markdown-field-preview">
        <span className="markdown-field-preview-label">Preview</span>
        {linePreview ? (
          <ul className="markdown-line-preview">
            {splitLines(value).map((line, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: renderMarkdownInline(line) }} />
            ))}
          </ul>
        ) : (
          <Markdown className="markdown-body" content={value} />
        )}
      </div>
    </div>
  );
}

function toFormState(trip) {
  const state = {};
  for (const field of FIELDS) {
    state[field] = trip[field] ?? '';
  }
  // Slider needs a real starting position — null means "use the 60%
  // default" everywhere else, but an empty range input has no sane default.
  if (trip.deposit_percent == null) state.deposit_percent = 60;
  return state;
}

/** Admin-only editor for the rich, family-facing copy shown on the public
 * home page (deadlines, cost, lodging, coordinators, etc). Rendered as its
 * own "Trip details" tab in AdminRoster, alongside Roster/Budget/Questions —
 * not a modal. Separate from TripSwitcher, which only manages the trip's
 * identity (year/name/date). */
export default function TripDetailsForm({ trip, onSaved }) {
  const [form, setForm] = useState(() => toFormState(trip));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // The selected trip can change out from under this tab (switching trips,
  // or a refetch after save) — resync local form state whenever the trip's
  // identity actually changes, not on every parent re-render.
  useEffect(() => {
    setForm(toFormState(trip));
    setErrors({});
  }, [trip.id]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const { depositAmount, finalPayment, costLow, costHigh } = splitEstimatedCost(
    form.estimated_cost,
    form.cost_spread_percent,
    form.deposit_percent
  );

  const handleReset = () => {
    setForm(toFormState(trip));
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedAt(null);
    try {
      const updated = await updateTrip(trip.id, form);
      setSavedAt(Date.now());
      onSaved(updated);
    } catch (err) {
      setErrors(err.body?.errors || { _root: 'Could not save trip details.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="trip-details-page" onSubmit={handleSubmit}>
      <div className="trip-details-page__header">
        <h2>Trip details</h2>
        <p className="hint">
          This copy powers the public home page — dates, cost, lodging, and coordinators families see
          before they commit.
        </p>
        {errors._root && <div className="form-error form-error--root">{errors._root}</div>}
      </div>

      <div className="trip-details-page__body">
        {/* Sections mirror the public home page top-to-bottom (hero → trip
            dates → training → staying → what's included → cost → coordinators),
            so editing here matches the mental model of the page being edited
            instead of grouping by data type. */}
          <div className="form-section">
            <h3>Intro</h3>
            <div className="form-grid">
              <MarkdownField
                label="Intro message"
                rows={2}
                value={form.intro_message}
                onChange={set('intro_message')}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Trip dates</h3>
            <div className="form-grid">
              <label>
                Return date
                <input type="date" value={form.return_date} onChange={set('return_date')} />
              </label>
              <label>
                Miss-school note
                <input value={form.miss_school_note} onChange={set('miss_school_note')} />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>Training</h3>
            <div className="form-grid">
              <label>
                Training location
                <input value={form.training_location} onChange={set('training_location')} />
              </label>
              <label>
                Training location link
                <input value={form.training_location_url} onChange={set('training_location_url')} />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>Staying</h3>
            <div className="form-grid">
              <label>
                Lodging
                <input value={form.lodging} onChange={set('lodging')} />
              </label>
              <label>
                Lodging link
                <input value={form.lodging_url} onChange={set('lodging_url')} />
              </label>
              <MarkdownField
                label="Meals info"
                rows={2}
                value={form.meals_info}
                onChange={set('meals_info')}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>What&rsquo;s included</h3>
            <div className="form-grid">
              <MarkdownField
                label="One per line"
                rows={4}
                value={form.whats_included}
                onChange={set('whats_included')}
                linePreview
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Cost &amp; payment</h3>
            <div className="form-grid">
              <label>
                Estimated cost ($)
                <input type="number" min="0" value={form.estimated_cost} onChange={set('estimated_cost')} />
              </label>
              <label>
                Spread shown to families (± %)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.cost_spread_percent}
                  onChange={set('cost_spread_percent')}
                />
              </label>
            </div>

            {/* Deposit/final payment are a split of the estimate above,
                computed live from the slider below — not separately entered —
                so they can never drift out of sync with it, and the deposit
                is always floored to the nearest $100 for a cleaner ask than
                an arbitrary percentage. Each due date sits directly next to
                the amount it governs instead of scattered across the grid. */}
            <div className="cost-breakdown">
              <label className="deposit-slider">
                Deposit split
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={form.deposit_percent}
                  onChange={set('deposit_percent')}
                />
                <span className="deposit-slider-value">
                  {form.deposit_percent}% deposit / {100 - Number(form.deposit_percent)}% final
                </span>
              </label>
              <div className="cost-breakdown-row">
                <span className="cost-breakdown-label">Deposit ({form.deposit_percent}%)</span>
                <span className="cost-breakdown-value">{fmtMoney(depositAmount)}</span>
                <label className="cost-breakdown-due">
                  due
                  <input
                    type="date"
                    value={form.commitment_deadline}
                    onChange={set('commitment_deadline')}
                  />
                  {errors.commitment_deadline && (
                    <span className="field-error">{errors.commitment_deadline}</span>
                  )}
                </label>
              </div>
              <div className="cost-breakdown-row">
                <span className="cost-breakdown-label">
                  Final payment ({100 - Number(form.deposit_percent)}%)
                </span>
                <span className="cost-breakdown-value">{fmtMoney(finalPayment)}</span>
                <label className="cost-breakdown-due">
                  due
                  <input type="date" value={form.final_payment_due} onChange={set('final_payment_due')} />
                </label>
              </div>
              <p className="hint cost-breakdown-range">
                Shown to families as a range: {fmtMoney(costLow)}–{fmtMoney(costHigh)}
              </p>
            </div>

            <div className="form-grid">
              <MarkdownField
                label="Payment instructions"
                rows={2}
                value={form.payment_notes}
                onChange={set('payment_notes')}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Overrun</h3>
            <p className="hint">
              Admin-only — tracked here if actual costs exceed the estimate, but not shown on the
              public home page.
            </p>
            <div className="form-grid">
              <label>
                Overrun amount ($)
                <input type="number" min="0" value={form.overrun_amount} onChange={set('overrun_amount')} />
              </label>
              <label>
                Overrun due date
                <input type="date" value={form.overrun_due_date} onChange={set('overrun_due_date')} />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>Trip coordinators</h3>
            <div className="form-grid">
              <MarkdownField
                label="One per line"
                rows={2}
                value={form.coordinators}
                onChange={set('coordinators')}
                linePreview
              />
              <label>
                Contact email
                <input type="email" value={form.contact_email} onChange={set('contact_email')} />
              </label>
            </div>
          </div>
      </div>

      <div className="trip-details-page__footer">
        {savedAt && <span className="form-notice--ok">Saved</span>}
        <button type="button" className="btn btn--ghost" onClick={handleReset} disabled={saving}>
          Reset changes
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  );
}
