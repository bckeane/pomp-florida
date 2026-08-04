import { useState } from 'react';
import { Link } from 'react-router';
import { forgotPassword } from './api/auth.js';
import pantherLogo from './img/pomp_icon.png';
import './register.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
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
        <h1>Reset your password</h1>
      </header>
      <div className="reg-divider" aria-hidden="true" />

      {error && <div className="banner banner--error">{error}</div>}

      {sent ? (
        <div className="form-card">
          <p className="hint">
            If an account exists for <strong>{email}</strong>, we've sent a link to reset the password. The
            link expires in 1 hour.
          </p>
        </div>
      ) : (
        <form className="form-card" onSubmit={handleSubmit}>
          <p className="hint">Enter the email address on your account and we'll send you a link to reset your password.</p>
          <div className="form-row">
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
