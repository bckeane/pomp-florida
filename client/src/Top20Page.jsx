import { Link, useParams, useSearchParams } from 'react-router';
import { useRecords } from './hooks/useRecords.js';
import { fetchTop20 } from './api/records.js';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './home.css';
import './records.css';

function Top20Row({ row }) {
  const swimmers = [row.Swimmer_Name, row.Swimmer_Name2, row.Swimmer_Name3, row.Swimmer_Name4].filter(
    (name) => name && name.trim() !== ''
  );

  return (
    <tr>
      <td className="records-col-place">{row.Swim_Place}</td>
      <td className="records-col-year">{row.Event_Year}</td>
      <td className="records-col-time">{row.Time_Formatted}</td>
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

export default function Top20Page() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const gender = searchParams.get('gender') === 'girls' ? 'girls' : 'boys';
  const linkedEventName = searchParams.get('event') || null;

  const { status, data, error } = useRecords((signal) => fetchTop20(eventId, gender, signal), [eventId, gender]);

  const eventName = status === 'success' && data[0] ? data[0].Event_Name : linkedEventName;

  useDocumentTitle(eventName ? `${eventName} — Top 20` : 'Top 20 Best Times');

  return (
    <div className="home-page records-page">
      <header className="hero">
        <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <div className="hero-text">
          <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
          <h1 className="hero-title">Top 20 Best Times</h1>
          {eventName && <p className="hero-intro">{eventName}</p>}
        </div>
      </header>

      {status === 'loading' && <p className="hint">Loading…</p>}

      {status === 'error' && (
        <div className="banner banner--error">
          This event's records are temporarily unavailable. {error?.status ? `(${error.status})` : ''}
        </div>
      )}

      {status === 'success' &&
        (data.length === 0 ? (
          <p className="records-empty">No results on file for this event.</p>
        ) : (
          <div className="records-board">
            <table className="records-table records-table--zebra">
              <thead>
                <tr>
                  <th className="records-col-place">Place</th>
                  <th className="records-col-year">Year</th>
                  <th className="records-col-time">Time</th>
                  <th>Swimmer(s)</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 20).map((row, i) => (
                  <Top20Row key={i} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Link className="records-back-link" to="/records">
        &larr; Back to Team Records
      </Link>
    </div>
  );
}
