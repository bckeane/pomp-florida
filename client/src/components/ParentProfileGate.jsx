import { useState } from 'react';
import { updateProfile } from '../api/auth.js';

/**
 * One-time gate shown after login/signup whenever the account has no
 * parent_name/emergency_phone on file yet — every account created before
 * this feature shipped, plus every brand-new signup. Blocks reaching the
 * roster (AccountHome / add-participant form) until both fields are set;
 * see the design doc's "render order" note for why this comes first.
 */
export default function ParentProfileGate({ account, onSaved }) {
  const [parentName, setParentName] = useState(account.parent_name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(account.emergency_phone || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { account: updated } = await updateProfile(parentName, emergencyPhone);
      onSaved(updated);
    } catch (err) {
      setErrors(err.body?.errors || { _root: 'Something went wrong saving your info.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <h2>Before you register</h2>
      <p className="hint">
        We need a parent/guardian name and an emergency contact number on file for this trip.
      </p>

      {errors._root && <div className="form-error form-error--root">{errors._root}</div>}

      <div className="form-row">
        <label>
          Parent/guardian name
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} />
          {errors.parent_name && <span className="field-error">{errors.parent_name}</span>}
        </label>
      </div>

      <div className="form-row">
        <label>
          Emergency contact number
          <input
            type="tel"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
          />
          {errors.emergency_phone && <span className="field-error">{errors.emergency_phone}</span>}
        </label>
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}
