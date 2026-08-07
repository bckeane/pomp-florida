import { useCallback, useEffect, useState } from 'react';
import { fetchAllAccounts, addAdminAccount, changeAccountRole } from '../api/adminAccounts.js';
import { displayField } from '../lib/accountDisplay.js';

/** Admin-only, lists every registered account regardless of role — independent
 * of the selected trip. Replaces the old ManageAdmins.jsx modal entirely:
 * promote/demote lives inline per row, and the "add admin by email" form
 * (create-or-promote) moved here from that modal. */
export default function AccountsPanel({ currentAccountId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAccounts(await fetchAllAccounts());
    } catch {
      setError('Could not load accounts. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (account, role) => {
    setBusyId(account.id);
    setError(null);
    try {
      await changeAccountRole(account.id, role);
      await load();
    } catch (err) {
      setError(err.body?.error || "Could not change that account's role.");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormErrors({});
    setNotice(null);
    try {
      const { account, promoted } = await addAdminAccount(email.trim(), password || undefined);
      setNotice(
        promoted ? `${account.email} was promoted to admin.` : `${account.email} was created as an admin.`
      );
      setEmail('');
      setPassword('');
      await load();
    } catch (err) {
      setFormErrors(err.body?.errors || { _root: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="accounts-tab">
      <p className="hint">Every registered account, independent of the selected trip.</p>

      {error && <div className="form-error form-error--root">{error}</div>}

      {loading ? (
        <p className="hint">Loading…</p>
      ) : (
        <table className="roster-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Parent/guardian name</th>
              <th>Emergency phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const isSelf = a.id === currentAccountId;
              return (
                <tr key={a.id}>
                  <td data-label="Email">{a.email}</td>
                  <td data-label="Role">{a.role}</td>
                  <td data-label="Parent/guardian name">{displayField(a.parent_name)}</td>
                  <td data-label="Emergency phone">{displayField(a.emergency_phone)}</td>
                  <td data-label="">
                    {isSelf ? (
                      <span className="hint">(you)</span>
                    ) : a.role === 'admin' ? (
                      <button
                        type="button"
                        className="link-btn link-btn--danger"
                        disabled={busyId === a.id}
                        onClick={() => handleRoleChange(a, 'parent')}
                      >
                        Demote
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={busyId === a.id}
                        onClick={() => handleRoleChange(a, 'admin')}
                      >
                        Promote
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form onSubmit={handleAddAdmin} style={{ marginTop: '1rem' }}>
        <p className="hint">
          Add an existing account as admin by entering just their email, or set a temporary
          password to create a brand-new admin account for someone who hasn't signed up.
        </p>

        {formErrors._root && <div className="form-error form-error--root">{formErrors._root}</div>}
        {notice && <div className="form-notice--ok">{notice}</div>}

        <div className="form-row">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {formErrors.email && <span className="field-error">{formErrors.email}</span>}
          </label>
          <label>
            Temporary password (only if new)
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {formErrors.password && <span className="field-error">{formErrors.password}</span>}
          </label>
          <button type="submit" className="btn btn--primary" disabled={saving || !email.trim()}>
            {saving ? 'Saving…' : 'Add admin'}
          </button>
        </div>
      </form>
    </div>
  );
}
