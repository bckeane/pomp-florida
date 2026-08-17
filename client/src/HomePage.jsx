import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { fetchCurrentTrip } from './api/trips.js';
import { formatLongDate, formatShortDate, formatDateTile } from './lib/dates.js';
import { useCountdown } from './lib/useCountdown.js';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import { renderMarkdownInline } from './lib/markdown.js';
import Markdown from './components/Markdown.jsx';
import pantherLogo from './img/pomp_icon.png';
import './home.css';

function DateTile({ iso }) {
  const tile = formatDateTile(iso);
  if (!tile) return null;
  return (
    <div className="date-tile">
      <span className="date-tile-weekday">{tile.weekday}</span>
      <span className="date-tile-day">{tile.day}</span>
      <span className="date-tile-month">{tile.month}</span>
    </div>
  );
}

function Split({ value, label }) {
  return (
    <div className="split">
      <span className="split-value">{String(value).padStart(2, '0')}</span>
      <span className="split-label">{label}</span>
    </div>
  );
}

function CommitCountdown({ deadline }) {
  const countdown = useCountdown(deadline);
  if (!countdown) return null;

  if (countdown.expired) {
    return (
      <div className="scoreboard scoreboard--closed">
        <span className="scoreboard-title">Commitment window closed</span>
        <span className="scoreboard-sub">Deadline was {formatLongDate(deadline)}</span>
      </div>
    );
  }

  return (
    <div className="scoreboard">
      <span className="scoreboard-title">Commit by {formatLongDate(deadline)}</span>
      <div className="scoreboard-splits">
        <Split value={countdown.days} label="days" />
        <span className="scoreboard-colon">:</span>
        <Split value={countdown.hours} label="hrs" />
        <span className="scoreboard-colon">:</span>
        <Split value={countdown.minutes} label="min" />
        <span className="scoreboard-colon">:</span>
        <Split value={countdown.seconds} label="sec" />
      </div>
    </div>
  );
}

function formatCostRange(low, high) {
  const fmt = (n) => `$${Number(n).toLocaleString()}`;
  if (low != null && high != null) return `${fmt(low)}–${fmt(high)}`;
  if (low != null || high != null) return fmt(low ?? high);
  return null;
}

function splitLines(text) {
  return (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function HomePage() {
  const [trip, setTrip] = useState(null);
  const [status, setStatus] = useState('loading');

  useDocumentTitle();

  useEffect(() => {
    fetchCurrentTrip()
      .then((t) => {
        setTrip(t);
        setStatus('ok');
      })
      .catch((err) => setStatus(err.status === 404 ? 'not-found' : 'error'));
  }, []);

  if (status === 'loading') {
    return (
      <div className="home-page">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="home-page home-page--empty">
        <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1 className="hero-title">No trip announced yet</h1>
        <p className="hint">Check back soon for details.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="home-page home-page--empty">
        <div className="banner banner--error">Could not reach the server.</div>
      </div>
    );
  }

  const included = splitLines(trip.whats_included);
  const coordinators = splitLines(trip.coordinators);
  const cost = formatCostRange(trip.cost_low, trip.cost_high);
  const hasCostSection = cost || trip.deposit_amount != null || trip.final_payment_estimate != null;
  const hasContactSection = coordinators.length > 0 || trip.contact_email;

  return (
    <div className="home-page">
      <header className="hero">
        <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1 className="hero-title">{trip.name}</h1>
        <p className="hero-dates">
          {formatShortDate(trip.trip_date)}
          {trip.return_date ? ` – ${formatShortDate(trip.return_date)}` : ''}
        </p>
        {trip.intro_message && (
          <Markdown className="hero-intro markdown-body" content={trip.intro_message} />
        )}

        <CommitCountdown deadline={trip.commitment_deadline} />

        <div className="hero-actions">
          <Link className="btn btn--primary btn--lg" to="/register">
            Register a swimmer
          </Link>
          <Link className="btn btn--ghost btn--lg" to="/faq">
            Ask a question
          </Link>
        </div>
      </header>

      <div className="lane-divider" aria-hidden="true" />

      <section className="section">
        <h2 className="section-title">The trip at a glance</h2>
        <div className="glance-grid">
          <div className="glance-card">
            <h3 className="glance-label">Trip dates</h3>
            <div className="date-tiles">
              <DateTile iso={trip.trip_date} />
              <span className="date-tiles-arrow" aria-hidden="true">&rarr;</span>
              <DateTile iso={trip.return_date} />
            </div>
            <span className="glance-value">
              {formatLongDate(trip.trip_date) || '—'}
              <span className="glance-value-arrow">&rarr;</span>
              {formatLongDate(trip.return_date) || '—'}
            </span>
            {trip.miss_school_note && <p className="glance-note">{trip.miss_school_note}</p>}
          </div>

          {trip.training_location && (() => {
            const [trainingName, trainingDetail] = trip.training_location.split(/\s*—\s*/);
            return (
              <div className="glance-card">
                <h3 className="glance-label">Training</h3>
                <span className="glance-icon-tile" role="img" aria-label="Swimming pool">🏊</span>
                <span className="glance-value">
                  {trip.training_location_url ? (
                    <a href={trip.training_location_url} target="_blank" rel="noreferrer">
                      {trainingName}
                    </a>
                  ) : (
                    trainingName
                  )}
                </span>
                {trainingDetail && <p className="glance-note">{trainingDetail}</p>}
              </div>
            );
          })()}

          {trip.lodging && (
            <div className="glance-card">
              <h3 className="glance-label">Staying</h3>
              <span className="glance-icon-tile" role="img" aria-label="Hotel">🏨</span>
              <span className="glance-value">
                {trip.lodging_url ? (
                  <a href={trip.lodging_url} target="_blank" rel="noreferrer">
                    {trip.lodging}
                  </a>
                ) : (
                  trip.lodging
                )}
              </span>
              {trip.meals_info && (
              <Markdown className="glance-note markdown-body" content={trip.meals_info} />
            )}
            </div>
          )}
        </div>
      </section>

      {included.length > 0 && (
        <>
          <div className="lane-divider" aria-hidden="true" />
          <section className="section">
            <h2 className="section-title">What&rsquo;s included</h2>
            <ul className="included-list">
              {included.map((line, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: renderMarkdownInline(line) }} />
              ))}
            </ul>
          </section>
        </>
      )}

      {hasCostSection && (
        <>
          <div className="lane-divider" aria-hidden="true" />
          <section className="section">
            <h2 className="section-title">Cost &amp; payment splits</h2>
            <div className="cost-splits">
              {trip.deposit_amount != null && (
                <div className="cost-split">
                  <span className="cost-split-label">Split 1 — commit</span>
                  <span className="cost-split-value">${trip.deposit_amount.toLocaleString()}</span>
                  {trip.commitment_deadline && (
                    <span className="cost-split-due">due {formatLongDate(trip.commitment_deadline)}</span>
                  )}
                </div>
              )}
              {trip.final_payment_estimate != null && (
                <div className="cost-split">
                  <span className="cost-split-label">Split 2 — balance</span>
                  <span className="cost-split-value">~${trip.final_payment_estimate.toLocaleString()}</span>
                  {trip.final_payment_due && (
                    <span className="cost-split-due">due {formatLongDate(trip.final_payment_due)}</span>
                  )}
                </div>
              )}
            </div>
            {cost && <p className="cost-total">Estimated total: {cost}</p>}
            {trip.payment_notes && (
              <Markdown className="hint markdown-body" content={trip.payment_notes} />
            )}
          </section>
        </>
      )}

      {hasContactSection && (
        <>
          <div className="lane-divider" aria-hidden="true" />
          <section className="section section--contact">
            <h2 className="section-title">Trip coordinators</h2>
            {coordinators.map((name, i) => (
              <p
                key={i}
                className="coordinator-name"
                dangerouslySetInnerHTML={{ __html: renderMarkdownInline(name) }}
              />
            ))}
          </section>
        </>
      )}

      <div className="lane-divider" aria-hidden="true" />
      <section className="section section--faq">
        <h2 className="section-title">Questions</h2>
        <p className="hint">
          Visit the FAQ to see answers and submit a new one.
        </p>
        <Link className="btn btn--ghost" to="/faq">
          Go to FAQ
        </Link>
      </section>

      <footer className="home-footer">
        <Link className="btn btn--primary btn--lg" to="/register">
          Register a swimmer
        </Link>
        <p className="hint">Not attending? No problem — local practices continue as normal.</p>
        <div className="footer-links">
          <Link className="footer-admin-link" to="/admin">
            Team admin
          </Link>
          <Link className="footer-admin-link" to="/privacy">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}
