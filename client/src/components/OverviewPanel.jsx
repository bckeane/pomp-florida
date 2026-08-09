const DATE_FIELDS = [
  { key: 'trip_date', label: 'Departure' },
  { key: 'return_date', label: 'Return' },
  { key: 'commitment_deadline', label: 'Commitment deadline' },
  { key: 'final_payment_due', label: 'Final payment due' },
  { key: 'overrun_due_date', label: 'Overrun due' },
];

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatCard({ value, label, accent }) {
  return (
    <div className="stat-card" style={{ '--stat-accent': accent }}>
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__label">{label}</span>
    </div>
  );
}

function GradYearChart({ byGradYear }) {
  const entries = Object.entries(byGradYear || {}).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...entries.map(([, count]) => count));

  if (!entries.length) {
    return <p className="hint">No grad-year data yet.</p>;
  }

  return (
    <div className="bar-chart">
      {entries.map(([year, count]) => (
        <div className="bar-chart__row" key={year}>
          <span className="bar-chart__label">{year}</span>
          <div className="bar-chart__track">
            <div className="bar-chart__fill" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="bar-chart__count">{count}</span>
        </div>
      ))}
    </div>
  );
}

function KeyDatesCard({ trip }) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = DATE_FIELDS.filter((f) => trip?.[f.key]).sort((a, b) =>
    trip[a.key].localeCompare(trip[b.key])
  );

  if (!dates.length) {
    return <p className="hint">No key dates set yet — add them under Trip details.</p>;
  }

  const nextKey = dates.find((f) => trip[f.key] >= today)?.key;

  return (
    <ul className="dates-list">
      {dates.map((f) => {
        const isPast = trip[f.key] < today;
        const isNext = f.key === nextKey;
        return (
          <li
            key={f.key}
            className={`dates-list__item ${isPast ? 'dates-list__item--past' : ''} ${
              isNext ? 'dates-list__item--next' : ''
            }`}
          >
            <span className="dates-list__date">{fmtDate(trip[f.key])}</span>
            <span className="dates-list__label">{f.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function OverviewPanel({ stats, trip }) {
  if (!stats) return null;

  const payment = stats.payment_status || { paid_in_full: 0, partial_or_unpaid: 0, no_cost_set: 0 };
  const showPayment = payment.paid_in_full + payment.partial_or_unpaid > 0;

  return (
    <section className="overview">
      <div className="overview__stats">
        <StatCard value={stats.total_active} label="Total" accent="var(--primary)" />
        <StatCard value={stats.by_role.Swimmer || 0} label="Swimmers" accent="#2563eb" />
        <StatCard value={stats.by_role.Diver || 0} label="Divers" accent="#0891b2" />
        <StatCard value={stats.by_role.Adult || 0} label="Adults" accent="#6b7280" />
        {showPayment && (
          <>
            <StatCard value={payment.paid_in_full} label="Paid in full" accent="var(--ok)" />
            <StatCard value={payment.partial_or_unpaid} label="Balance due" accent="var(--danger)" />
          </>
        )}
      </div>

      <div className="overview__panels">
        <div className="overview-card">
          <h3 className="overview-card__title">Roster by grad year</h3>
          <GradYearChart byGradYear={stats.by_grad_year} />
        </div>
        <div className="overview-card">
          <h3 className="overview-card__title">Key dates</h3>
          <KeyDatesCard trip={trip} />
        </div>
      </div>
    </section>
  );
}
