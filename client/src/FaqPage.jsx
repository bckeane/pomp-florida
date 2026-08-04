import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { fetchCurrentTrip } from './api/trips.js';
import { fetchFaqQuestions, submitFaqQuestion } from './api/questions.js';
import pantherLogo from './img/pomp_icon.png';
import './faq.css';

function formatFaqDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function FaqPage() {
  const [trip, setTrip] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [status, setStatus] = useState('loading');
  const [question, setQuestion] = useState('');
  const [askerName, setAskerName] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    fetchCurrentTrip()
      .then((currentTrip) => {
        setTrip(currentTrip);
        return fetchFaqQuestions(currentTrip.id);
      })
      .then((faqQuestions) => {
        setQuestions(faqQuestions);
        setStatus('ok');
      })
      .catch((err) => setStatus(err.status === 404 ? 'not-found' : 'error'));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setNotice(null);
    try {
      const created = await submitFaqQuestion({
        trip_id: trip?.id,
        asker_name: askerName.trim() || undefined,
        question,
      });
      setQuestions((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setQuestion('');
      setAskerName('');
      setNotice('Your question was added and is waiting for an answer.');
    } catch (err) {
      setErrors(err.body?.errors || { _root: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="faq-page">
        <p className="faq-hint">Loading…</p>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="faq-page faq-page--empty">
        <img className="faq-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="faq-eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1 className="faq-title">No trip announced yet</h1>
        <p className="faq-hint">The FAQ will appear here once the next trip is set.</p>
        <Link className="btn btn--ghost" to="/">
          Back to home
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="faq-page faq-page--empty">
        <div className="banner banner--error">Could not reach the server.</div>
      </div>
    );
  }

  return (
    <div className="faq-page">
      <header className="faq-hero">
        <div className="faq-hero__top">
          <Link className="faq-back" to="/">
            ← Back to trip info
          </Link>
          <Link className="faq-back faq-back--ghost" to="/register">
            Register a swimmer
          </Link>
        </div>
        <img className="faq-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="faq-eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1 className="faq-title">FAQ</h1>
        <p className="faq-subtitle">
          Ask a question here. It will appear right away as pending until an admin answers it.
        </p>
        {trip?.name && <p className="faq-trip-name">{trip.name}</p>}
      </header>

      <section className="faq-layout">
        <form className="faq-form" onSubmit={handleSubmit}>
          <h2>Submit a question</h2>
          <p className="faq-hint">Keep it short and specific so the answer can be useful to everyone.</p>

          {errors._root && <div className="form-error form-error--root">{errors._root}</div>}
          {notice && <div className="form-notice--ok">{notice}</div>}

          <div className="form-row">
            <label>
              Your name
              <input
                type="text"
                value={askerName}
                onChange={(e) => setAskerName(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Question
              <textarea
                rows="5"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What do I need to know about the trip?"
              />
              {errors.question && <span className="field-error">{errors.question}</span>}
            </label>
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Submitting…' : 'Submit question'}
            </button>
          </div>
        </form>

        <div className="faq-list-shell">
          <div className="faq-list-header">
            <h2>Questions & answers</h2>
            <p className="faq-hint">New questions appear with a pending answer until the admin team responds.</p>
          </div>

          {questions.length === 0 ? (
            <div className="faq-empty">
              <p>No questions yet. Be the first to ask.</p>
            </div>
          ) : (
            <div className="faq-list">
              {questions.map((item) => (
                <article key={item.id} className={`faq-card ${item.answer ? 'faq-card--answered' : 'faq-card--pending'}`}>
                  <div className="faq-card__top">
                    <span className={`faq-pill ${item.answer ? 'faq-pill--answered' : 'faq-pill--pending'}`}>
                      {item.answer ? 'answered' : 'pending...'}
                    </span>
                    <span className="faq-card__date">{formatFaqDate(item.created_at)}</span>
                  </div>
                  <p className="faq-card__question">{item.question}</p>
                  {item.asker_name && <p className="faq-card__asker">Asked by {item.asker_name}</p>}
                  <p className={`faq-card__answer ${item.answer ? '' : 'faq-card__answer--pending'}`}>
                    {item.answer || 'pending...'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
