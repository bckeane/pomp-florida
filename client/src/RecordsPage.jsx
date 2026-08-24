import { Link } from 'react-router';
import { useRecords } from './hooks/useRecords.js';
import { fetchAllRecords } from './api/records.js';
import { top20Link } from './lib/top20Link.js';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './home.css';
import './records.css';

function splitByGender(records) {
  const boys = [];
  const girls = [];
  for (const record of records) {
    if (!record.Event_Name || record.Event_Name === 'Diving 11') continue;
    if ((record.TeamGender || '').toLowerCase() === 'boys') {
      boys.push(record);
    } else {
      girls.push(record);
    }
  }
  return { boys, girls };
}

function RecordRow({ record }) {
  const swimmers = [record.Swimmer_Name, record.Swimmer_Name2, record.Swimmer_Name3, record.Swimmer_Name4].filter(
    (name) => name && name.trim() !== ''
  );

  return (
    <tr>
      <td>
        <Link
          className="records-event-link"
          to={top20Link(record.Event_Id, record.TeamGender, record.Event_Name)}
        >
          {record.Event_Name}
        </Link>
      </td>
      <td className="records-col-year">{record.Event_Year}</td>
      <td className="records-col-time">{record.Time_Formatted}</td>
      <td>
        <span className="records-swimmers">
          {swimmers.map((name, i) => (
            <span key={i}>{name}</span>
          ))}
        </span>
      </td>
    </tr>
  );
}

function RecordBoard({ title, records }) {
  return (
    <div className="records-board">
      <h2 className="section-title">{title}</h2>
      <table className="records-table">
        <thead>
          <tr>
            <th>Event</th>
            <th className="records-col-year">Year</th>
            <th className="records-col-time">Time</th>
            <th>Swimmer(s)</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <RecordRow key={record.Event_Id} record={record} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RecordsPage() {
  useDocumentTitle('Team Records');
  const { status, data, error } = useRecords((signal) => fetchAllRecords(signal), []);

  return (
    <div className="home-page records-page">
      <header className="hero">
        <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1 className="hero-title">Team Records</h1>
        <p className="hero-intro">All-Time Best Times</p>
      </header>

      <Link className="btn records-search-cta" to="/records/search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Search for a swimmer
      </Link>

      {status === 'loading' && <p className="hint">Loading records…</p>}

      {status === 'error' && (
        <div className="banner banner--error">
          Records are temporarily unavailable. {error?.status ? `(${error.status})` : ''}
        </div>
      )}

      {status === 'success' &&
        (() => {
          const { boys, girls } = splitByGender(data);
          if (boys.length === 0 && girls.length === 0) {
            return <p className="records-empty">No records on file yet.</p>;
          }
          return (
            <div className="records-boards">
              <RecordBoard title="Boys" records={boys} />
              <RecordBoard title="Girls" records={girls} />
            </div>
          );
        })()}

      <footer className="home-footer">
        <p className="hint">
          Missing the exports you need? <Link to="/records/top25-export">Export Top 25</Link>
        </p>
        <div className="footer-links">
          <Link className="footer-admin-link" to="/">
            Home
          </Link>
          <Link className="footer-admin-link" to="/faq">
            FAQ
          </Link>
          <Link className="footer-admin-link" to="/register">
            Register
          </Link>
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
