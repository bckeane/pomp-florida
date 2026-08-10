import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { resetPassword } from './api/auth.js';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './register.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useDocumentTitle('Reset Password');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.body?.errors?._root || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="register-page">
      <header className="register-header">
        <Link className="reg-back" to="/">
          ← Back to trip info
        </Link>
        <img className="reg-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="reg-eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1>Set a new password</h1>
      </header>
      <div className="reg-divider" aria-hidden="true" />

      {!token ? (
        <div className="banner banner--error">This reset link is missing its token — use the link from your email.</div>
      ) : done ? (
        <div className="form-card">
          <p className="hint">Your password has been updated and you're signed in.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn--primary" onClick={() => navigate('/register')}>
              Continue
            </button>
          </div>
        </div>
      ) : (
        <form className="form-card" onSubmit={handleSubmit}>
          {error && <div className="form-error form-error--root">{error}</div>}
          <div className="form-row">
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Set new password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
