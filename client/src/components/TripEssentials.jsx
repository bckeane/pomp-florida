import { useEffect, useState } from 'react';
import { fetchCurrentTripSchedule } from '../api/trips.js';
import { formatLongDate, parseLocalDate } from '../lib/dates.js';
import { renderMarkdownInline } from '../lib/markdown.js';
import Markdown from './Markdown.jsx';

function splitLines(text) {
  return (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDayLabel(iso) {
  const date = parseLocalDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Parent-facing trip-essentials summary — the in-app equivalent of
 * Swim_&_Dive_Team_Florida_Trip_2026.png (a one-off graphic generated
 * externally for the 2026 trip). Rendered from live trip data instead of a
 * yearly-regenerated image, so it never drifts out of sync with the trip
 * details an admin edits in TripDetailsForm. Shown on the register-success
 * screen and account-home (see RegisterPage.jsx). Renders nothing if the
 * current trip has none of this content filled in yet.
 */
export default function TripEssentials({ trip }) {
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentTripSchedule()
      .then((rows) => {
        if (!cancelled) setSchedule(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip?.id]);

  if (!trip) return null;

  const packing = splitLines(trip.packing_list);
  const hasFacts = trip.training_location || trip.lodging;
  const hasSchedule = schedule.length > 0;
  const hasTravelSection = trip.departure_logistics || trip.return_logistics || packing.length > 0;
  if (!hasFacts && !hasSchedule && !hasTravelSection) return null;

  const hasNotes = schedule.some((day) => day.notes);

  return (
    <div className="form-card trip-essentials">
      <h2>Trip Essentials</h2>
      <p className="hint">
        {formatLongDate(trip.trip_date) || '—'}
        {trip.return_date ? ` → ${formatLongDate(trip.return_date)}` : ''}
      </p>

      {hasFacts && (
        <dl className="trip-essentials-facts">
          {trip.training_location && (
            <div className="trip-essentials-fact">
              <dt>Training venue</dt>
              <dd>
                {trip.training_location_url ? (
                  <a href={trip.training_location_url} target="_blank" rel="noreferrer">
                    {trip.training_location}
                  </a>
                ) : (
                  trip.training_location
                )}
              </dd>
            </div>
          )}
          {trip.lodging && (
            <div className="trip-essentials-fact">
              <dt>Accommodation</dt>
              <dd>
                {trip.lodging_url ? (
                  <a href={trip.lodging_url} target="_blank" rel="noreferrer">
                    {trip.lodging}
                  </a>
                ) : (
                  trip.lodging
                )}
              </dd>
            </div>
          )}
        </dl>
      )}

      {hasSchedule && (
        <>
          <h3 className="trip-essentials-subhead">Daily pool-time schedule</h3>
          <div className="preview-table-wrap">
            <table className="preview-table trip-essentials-schedule">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Morning</th>
                  <th>Afternoon</th>
                  {hasNotes && <th>Notes</th>}
                </tr>
              </thead>
              <tbody>
                {schedule.map((day) => (
                  <tr key={day.id}>
                    <td>{formatDayLabel(day.date)}</td>
                    <td>{day.morning_window || 'None'}</td>
                    <td>{day.afternoon_window || 'None'}</td>
                    {hasNotes && <td>{day.notes || ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasTravelSection && (
        <>
          <h3 className="trip-essentials-subhead">Travel &amp; daily life</h3>
          {trip.departure_logistics && (
            <Markdown className="hint markdown-body" content={trip.departure_logistics} />
          )}
          {trip.return_logistics && (
            <Markdown className="hint markdown-body" content={trip.return_logistics} />
          )}
          {packing.length > 0 && (
            <>
              <p className="trip-essentials-pack-label">What to pack</p>
              <ul className="trip-essentials-pack-list">
                {packing.map((line, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: renderMarkdownInline(line) }} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
