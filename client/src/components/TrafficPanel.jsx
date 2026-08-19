import { useCallback, useEffect, useState } from 'react';
import { fetchTraffic } from '../api/adminTraffic.js';

const WINDOW_OPTIONS = [7, 30, 90];

function fmtShortDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

function StatCard({ value, label, accent }) {
  return (
    <div className="stat-card" style={{ '--stat-accent': accent }}>
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__label">{label}</span>
    </div>
  );
}

function DailyTrafficChart({ dailyCounts }) {
  if (!dailyCounts.length) {
    return <p className="hint">No traffic recorded yet.</p>;
  }
  const max = Math.max(1, ...dailyCounts.map((d) => d.count));

  return (
    <div className="bar-chart">
      {dailyCounts.map((d) => (
        <div className="bar-chart__row" key={d.date}>
          <span className="bar-chart__label">{fmtShortDate(d.date)}</span>
          <div className="bar-chart__track">
            <div className="bar-chart__fill" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="bar-chart__count">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function TopPathsTable({ paths }) {
  if (!paths.length) {
    return <p className="hint">No requests recorded yet.</p>;
  }

  return (
    <table className="roster-table">
      <thead>
        <tr>
          <th>Method</th>
          <th>Path</th>
          <th>Requests</th>
          <th>Avg time</th>
        </tr>
      </thead>
      <tbody>
        {paths.map((p) => (
          <tr key={`${p.method} ${p.path}`}>
            <td data-label="Method">{p.method}</td>
            <td data-label="Path">{p.path}</td>
            <td data-label="Requests">{p.count}</td>
            <td data-label="Avg time">{p.avg_duration_ms == null ? '—' : `${p.avg_duration_ms}ms`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Admin-only traffic dashboard backed by GET /api/admin/traffic, which reads
 * the request_log table populated by middleware/requestLog.js. No IP or user
 * agent is tracked — this is a site used mostly by families of minors, so
 * the log (and this view) is limited to path/method/status/account. */
export default function TrafficPanel() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchTraffic(days));
    } catch {
      setError('Could not load traffic data. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="traffic-tab">
      <div className="segmented" style={{ maxWidth: '20rem' }}>
        {WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`segmented-btn ${days === opt ? 'segmented-btn--active' : ''}`}
            onClick={() => setDays(opt)}
          >
            {opt} days
          </button>
        ))}
      </div>

      {error && <div className="form-error form-error--root">{error}</div>}

      {loading || !summary ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          <div className="overview__stats">
            <StatCard value={summary.total_requests} label="Requests" accent="var(--primary)" />
            <StatCard value={summary.unique_accounts} label="Signed-in accounts" accent="#2563eb" />
          </div>

          <div className="overview__panels">
            <div className="overview-card">
              <h3 className="overview-card__title">Requests per day</h3>
              <DailyTrafficChart dailyCounts={summary.daily_counts} />
            </div>
            <div className="overview-card">
              <h3 className="overview-card__title">Top paths</h3>
              <TopPathsTable paths={summary.top_paths} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
