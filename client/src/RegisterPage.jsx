import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import ParticipantForm from './components/ParticipantForm.jsx';
import AuthGate from './components/AuthGate.jsx';
import { me, logout } from './api/auth.js';
import { createMyParticipant, fetchMyParticipants, fetchMyParticipantHistory } from './api/participants.js';
import { fetchCurrentTrip } from './api/trips.js';
import pantherLogo from './img/pomp_icon.png';
import './register.css';

export default function RegisterPage() {
  const [trip, setTrip] = useState(null);
  const [account, setAccount] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [myParticipants, setMyParticipants] = useState([]);
  const [history, setHistory] = useState([]);
  const [prefill, setPrefill] = useState(null);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);

  useEffect(() => {
    fetchCurrentTrip()
      .then(setTrip)
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const loadSession = async () => {
    try {
      const { account } = await me();
      setAccount(account);
      const [mine, past] = await Promise.all([fetchMyParticipants(), fetchMyParticipantHistory()]);
      setMyParticipants(mine);
      setHistory(past);
    } catch {
      setAccount(null);
      setMyParticipants([]);
      setHistory([]);
    } finally {
      setCheckingSession(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  const handleAuthenticated = async (account) => {
    setAccount(account);
    const [mine, past] = await Promise.all([fetchMyParticipants(), fetchMyParticipantHistory()]);
    setMyParticipants(mine);
    setHistory(past);
  };

  const handleSave = async (data) => {
    const participant = await createMyParticipant(data);
    setMyParticipants((prev) => [...prev, participant]);
    setPrefill(null);
    setLastAdded(participant);
    setSubmitted(true);
  };

  const personKey = (p) => `${p.first_name}|${p.last_name}|${p.birth_date ?? ''}`.toLowerCase();
  const registeredKeys = new Set(myParticipants.map(personKey));
  const returningPeople = history.filter((p) => !registeredKeys.has(personKey(p)));

  const handleLogout = async () => {
    await logout();
    setAccount(null);
    setMyParticipants([]);
    setHistory([]);
    setPrefill(null);
    setSubmitted(false);
  };

  return (
    <div className="register-page">
      <header className="register-header">
        <Link className="reg-back" to="/">
          ← Back to trip info
        </Link>
        <img className="reg-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="reg-eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1>{trip ? trip.name : 'Trip'} Registration</h1>
        <p className="subtitle">Add a swimmer, diver, or adult to the roster.</p>
      </header>
      <div className="reg-divider" aria-hidden="true" />

      {error && <div className="banner banner--error">{error}</div>}

      {checkingSession ? (
        <p className="hint">Loading…</p>
      ) : !account ? (
        <AuthGate onAuthenticated={handleAuthenticated} />
      ) : (
        <>
          <div className="account-bar">
            <span>Signed in as {account.email}</span>
            <button type="button" className="link-btn" onClick={handleLogout}>
              Log out
            </button>
          </div>

          {myParticipants.length > 0 && (
            <div className="form-card registered-card">
              <h2>Added to this trip</h2>
              <ul className="roster-chips">
                {myParticipants.map((p) => (
                  <li key={p.id} className="roster-chip">
                    {p.first_name} {p.last_name}
                    <span className="roster-chip-role">{p.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitted ? (
            <div className="form-card register-success">
              <p>{lastAdded ? `${lastAdded.first_name} is on the roster.` : "You're on the roster."}</p>
              <button
                className="btn btn--primary"
                onClick={() => {
                  setPrefill(null);
                  setSubmitted(false);
                }}
              >
                Add another person
              </button>
            </div>
          ) : (
            trip && (
              <>
                {returningPeople.length > 0 && (
                  <div className="form-card returning-card">
                    <h2>Add someone you've registered before</h2>
                    <p className="hint">Pick a name to fill in their details — you can still change anything before you submit.</p>
                    <ul className="lane-cards">
                      {returningPeople.map((p) => {
                        const selected = prefill && personKey(prefill) === personKey(p);
                        return (
                          <li key={personKey(p)}>
                            <button
                              type="button"
                              className={`lane-card ${selected ? 'lane-card--selected' : ''}`}
                              onClick={() =>
                                setPrefill({
                                  first_name: p.first_name,
                                  last_name: p.last_name,
                                  grad_year: p.grad_year,
                                  birth_date: p.birth_date,
                                  role: p.role,
                                })
                              }
                            >
                              <span className="lane-card-role">{p.role}</span>
                              <span className="lane-card-name">{p.last_name}</span>
                              <span className="lane-card-first">{p.first_name}</span>
                              <span className="lane-card-add" aria-hidden="true">
                                {selected ? '✓' : '+'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {prefill && (
                      <button type="button" className="link-btn" onClick={() => setPrefill(null)}>
                        Or start blank instead
                      </button>
                    )}
                  </div>
                )}
                <ParticipantForm key={prefill ? personKey(prefill) : 'blank'} variant="public" participant={prefill} onSave={handleSave} />
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
