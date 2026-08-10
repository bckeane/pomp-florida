import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import ParticipantForm from './components/ParticipantForm.jsx';
import AuthGate from './components/AuthGate.jsx';
import ParentProfileGate from './components/ParentProfileGate.jsx';
import AccountHome from './components/AccountHome.jsx';
import PaymentPrompt from './components/PaymentPrompt.jsx';
import { me, logout } from './api/auth.js';
import {
  createMyParticipant,
  updateMyParticipant,
  fetchMyParticipants,
  fetchMyParticipantHistory,
} from './api/participants.js';
import { fetchCurrentTrip } from './api/trips.js';
import { profileComplete } from './lib/profile.js';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './register.css';

// Stripe's redirect after Checkout — success_url/cancel_url in
// myParticipants.js both point back here with this query param. Reconciling
// deposit_received/final_payment_received itself happens server-side via
// the webhook (routes/stripeWebhook.js); this is purely a "here's what just
// happened" banner for the parent's benefit.
function paymentBannerFrom(searchParams) {
  const payment = searchParams.get('payment');
  if (payment === 'success') return { variant: 'success', text: 'Payment received — thank you!' };
  if (payment === 'cancelled') return { variant: 'error', text: 'Payment was cancelled — nothing was charged.' };
  return null;
}

export default function RegisterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentBanner] = useState(() => paymentBannerFrom(searchParams));
  const [trip, setTrip] = useState(null);
  const [account, setAccount] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [myParticipants, setMyParticipants] = useState([]);
  const [history, setHistory] = useState([]);
  const [prefill, setPrefill] = useState(null);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState(null);

  useDocumentTitle('Register');

  useEffect(() => {
    fetchCurrentTrip()
      .then(setTrip)
      .catch(() => setError('Could not reach the server.'));
  }, []);

  // Strip ?payment=... from the URL once read so a page refresh doesn't
  // keep re-showing a stale banner; paymentBanner itself was already
  // captured into state above before this runs.
  useEffect(() => {
    if (searchParams.has('payment')) {
      searchParams.delete('payment');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleProfileSaved = (updatedAccount) => {
    setAccount(updatedAccount);
    setEditingProfile(false);
  };

  const handleSave = async (data) => {
    const participant = await createMyParticipant(data);
    setMyParticipants((prev) => [...prev, participant]);
    setPrefill(null);
    setLastAdded(participant);
    setSubmitted(true);
  };

  const handleUpdateParticipant = async (data) => {
    const updated = await updateMyParticipant(editingParticipant.id, data);
    setMyParticipants((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingParticipant(null);
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
    setShowAddForm(false);
    setEditingProfile(false);
    setEditingParticipant(null);
  };

  const backToAccountHome = () => {
    setShowAddForm(false);
    setSubmitted(false);
    setPrefill(null);
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
      {paymentBanner && <div className={`banner banner--${paymentBanner.variant}`}>{paymentBanner.text}</div>}

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

          {!profileComplete(account) || editingProfile ? (
            <ParentProfileGate account={account} onSaved={handleProfileSaved} />
          ) : submitted ? (
            <div className="form-card register-success">
              <p>{lastAdded ? `${lastAdded.first_name} is on the roster.` : "You're on the roster."}</p>
              {lastAdded && <PaymentPrompt participant={lastAdded} />}
              <div className="modal-actions account-home-actions">
                <button type="button" className="link-btn" onClick={backToAccountHome}>
                  Back to my roster
                </button>
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
            </div>
          ) : editingParticipant ? (
            <>
              <ParticipantForm
                key={`edit-${editingParticipant.id}`}
                variant="public"
                participant={editingParticipant}
                onSave={handleUpdateParticipant}
              />
              <button type="button" className="link-btn" onClick={() => setEditingParticipant(null)}>
                ← Back to my roster
              </button>
            </>
          ) : showAddForm ? (
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
                <button type="button" className="link-btn" onClick={backToAccountHome}>
                  ← Back to my roster
                </button>
              </>
            )
          ) : (
            <AccountHome
              account={account}
              trip={trip}
              participants={myParticipants}
              onAddAnother={() => setShowAddForm(true)}
              onEditProfile={() => setEditingProfile(true)}
              onEditParticipant={setEditingParticipant}
            />
          )}
        </>
      )}
    </div>
  );
}
