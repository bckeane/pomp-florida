import { useState } from 'react';
import { signup, login } from '../api/auth.js';

/**
 * Sign-up/log-in card. Used two ways:
 *  - allowSignup=true (default): the public registration page — Sign up or
 *    Log in, either creates/resumes a 'parent' account.
 *  - allowSignup=false: the admin login gate — log in only. There's no
 *    self-serve way to become an admin (see server/scripts/create-admin.js).
 */
export default function AuthGate({ onAuthenticated, allowSignup = true, description }) {
  const [mode, setMode] = useState(allowSignup ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { account } = mode === 'signup' ? await signup(email, password) : await login(email, password);
      onAuthenticated(account);
    } catch (err) {
      setErrors(err.body?.errors || { _root: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  const defaultDescription =
    mode === 'signup'
      ? "Create an account to register your swimmer, diver, or yourself as a chaperone. One account can register multiple people."
      : 'Log in to add another person or review who you’ve registered.';

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      {allowSignup && (
        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn ${mode === 'signup' ? 'segmented-btn--active' : ''}`}
            onClick={() => setMode('signup')}
          >
            Sign up
          </button>
          <button
            type="button"
            className={`segmented-btn ${mode === 'login' ? 'segmented-btn--active' : ''}`}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
        </div>
      )}

      <p className="hint">{description ?? defaultDescription}</p>

      {errors._root && <div className="form-error form-error--root">{errors._root}</div>}

      <div className="form-row">
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
      </div>

      <div className="form-row">
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </div>
    </form>
  );
}
