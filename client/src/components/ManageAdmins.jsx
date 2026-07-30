import { useEffect, useState } from 'react';
import { fetchAdminAccounts, addAdminAccount } from '../api/adminAccounts.js';

export default function ManageAdmins({ onClose }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setAdmins(await fetchAdminAccounts());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setNotice(null);
    try {
      const { account, promoted } = await addAdminAccount(email.trim(), password || undefined);
      setNotice(promoted ? `${account.email} was promoted to admin.` : `${account.email} was created as an admin.`);
      setEmail('');
      setPassword('');
      await load();
    } catch (err) {
      setErrors(err.body?.errors || { _root: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Manage admins</h2>

        {loading ? (
          <p className="hint">Loading…</p>
        ) : admins.length ? (
          <ul className="registered-list">
            {admins.map((a) => (
              <li key={a.id}>{a.email}</li>
            ))}
          </ul>
        ) : (
          <p className="hint">No admins yet besides you.</p>
        )}

        <form onSubmit={handleSubmit}>
          <p className="hint">
            Add an existing account as admin by entering just their email, or set a temporary
            password to create a brand-new admin account for someone who hasn't signed up.
          </p>

          {errors._root && <div className="form-error form-error--root">{errors._root}</div>}
          {notice && <div className="form-notice--ok">{notice}</div>}

          <div className="form-row">
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </label>
            <label>
              Temporary password (only if new)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {errors.password && <span className="field-error">{errors.password}</span>}
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving || !email.trim()}>
              {saving ? 'Saving…' : 'Add admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
