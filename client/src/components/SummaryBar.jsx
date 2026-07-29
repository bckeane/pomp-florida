export default function SummaryBar({ stats }) {
  if (!stats) return null;

  const gradYearEntries = Object.entries(stats.by_grad_year || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="summary-bar">
      <div className="summary-stat">
        <span className="summary-value">{stats.total_active}</span>
        <span className="summary-label">Total</span>
      </div>
      <div className="summary-stat">
        <span className="summary-value">{stats.by_role.Swimmer || 0}</span>
        <span className="summary-label">Swimmers</span>
      </div>
      <div className="summary-stat">
        <span className="summary-value">{stats.by_role.Diver || 0}</span>
        <span className="summary-label">Divers</span>
      </div>
      <div className="summary-stat">
        <span className="summary-value">{stats.by_role.Adult || 0}</span>
        <span className="summary-label">Adults</span>
      </div>
      {gradYearEntries.map(([year, count]) => (
        <div className="summary-stat summary-stat--muted" key={year}>
          <span className="summary-value">{count}</span>
          <span className="summary-label">{year}</span>
        </div>
      ))}
    </div>
  );
}
