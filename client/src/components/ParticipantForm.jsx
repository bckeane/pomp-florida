import { useEffect, useState } from 'react';
import { ROLES, ADULT_GRAD_YEARS } from '../constants.js';
import { studentGradYears } from '../lib/derived.js';

function emptyForm(variant) {
  return {
    first_name: '',
    last_name: '',
    role: variant === 'public' ? '' : 'Swimmer',
    grad_year: '',
    birth_date: '',
  };
}

/**
 * variant="admin" (default): modal dialog used by the roster page — role
 * defaults to Swimmer via a segmented control, Cancel/Save actions.
 * variant="public": plain embeddable form used by the self-serve
 * registration page — legal-name labels, role is a blank-by-default
 * dropdown (nothing pre-selected), Submit only, no Cancel/backdrop.
 *
 * Grade isn't collected here — it's always derived server-side from
 * grad_year + the trip's own year (same as age_at_trip from birth_date).
 */
export default function ParticipantForm({ participant, tripYear, onSave, onCancel, variant = 'admin' }) {
  const isPublic = variant === 'public';
  const [form, setForm] = useState(() => emptyForm(variant));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const gradYearOptions = studentGradYears(tripYear);

  useEffect(() => {
    if (participant) {
      setForm({
        first_name: participant.first_name || '',
        last_name: participant.last_name || '',
        role: participant.role || (isPublic ? '' : 'Swimmer'),
        grad_year: participant.grad_year || '',
        birth_date: participant.birth_date || '',
      });
    } else {
      setForm(emptyForm(variant));
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant]);

  const isAdult = form.role === 'Adult';

  const validate = () => {
    const errs = {};
    if (!form.role) errs.role = 'Please select one';
    if (!form.first_name.trim()) errs.first_name = 'First name is required';
    if (!form.last_name.trim()) errs.last_name = 'Last name is required';
    if (!isAdult && !form.birth_date) errs.birth_date = 'Birth date is required for students';
    if (!isAdult && form.grad_year && !gradYearOptions.includes(form.grad_year)) {
      errs.grad_year = `Must be one of ${gradYearOptions.join(', ')}`;
    }
    if (isAdult && form.grad_year && !ADULT_GRAD_YEARS.includes(form.grad_year)) {
      errs.grad_year = `Must be one of ${ADULT_GRAD_YEARS.join(', ')} or blank`;
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
        grad_year: form.grad_year || null,
        birth_date: form.birth_date || null,
      });
    } catch (err) {
      if (err.body?.errors) {
        setErrors(err.body.errors);
      } else {
        setErrors({ _root: 'Something went wrong saving this participant.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const firstNameLabel = isPublic ? 'Legal first name' : 'First name';
  const lastNameLabel = isPublic ? 'Legal last name' : 'Last name';

  const fields = (
    <>
      {errors._root && <div className="form-error form-error--root">{errors._root}</div>}

      <div className="form-row">
        <label>
          Role
          {isPublic ? (
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="" disabled>
                Select one…
              </option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <div className="segmented">
              {ROLES.map((r) => (
                <button
                  type="button"
                  key={r}
                  className={`segmented-btn ${form.role === r ? 'segmented-btn--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {errors.role && <span className="field-error">{errors.role}</span>}
        </label>
      </div>

      <div className="form-row">
        <label>
          {firstNameLabel}
          <input
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
          />
          {errors.first_name && <span className="field-error">{errors.first_name}</span>}
        </label>
        <label>
          {lastNameLabel}
          <input
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
          />
          {errors.last_name && <span className="field-error">{errors.last_name}</span>}
        </label>
      </div>

      <div className="form-row">
        <label>
          Grad year {isAdult ? '(Coach / Med)' : ''}
          {isAdult ? (
            <input
              value={form.grad_year}
              placeholder="Coach or Med"
              onChange={(e) => setForm((f) => ({ ...f, grad_year: e.target.value }))}
            />
          ) : (
            <select value={form.grad_year} onChange={(e) => setForm((f) => ({ ...f, grad_year: e.target.value }))}>
              <option value="">—</option>
              {gradYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          {errors.grad_year && <span className="field-error">{errors.grad_year}</span>}
        </label>
      </div>

      <div className="form-row">
        <label>
          Birth date {isAdult ? '(optional)' : ''}
          <input
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
          />
          {errors.birth_date && <span className="field-error">{errors.birth_date}</span>}
        </label>
      </div>
    </>
  );

  if (isPublic) {
    return (
      <form className="form-card" onSubmit={handleSubmit}>
        {fields}
        <div className="modal-actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{participant ? 'Edit participant' : 'Add participant'}</h2>
        {fields}
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
