import { db } from '../db/connection.js';

export function logRequest({ method, path, status, durationMs, accountId }) {
  db.prepare(
    'INSERT INTO request_log (method, path, status, duration_ms, account_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(method, path, status, durationMs, accountId ?? null, new Date().toISOString());
}

/** Traffic summary for the admin view: daily request counts, top paths, and
 * signed-in-account activity over the trailing window. */
export function getTrafficSummary(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const dailyCounts = db
    .prepare(
      `SELECT date(created_at) AS date, COUNT(*) AS count
       FROM request_log
       WHERE created_at >= ?
       GROUP BY date(created_at)
       ORDER BY date ASC`
    )
    .all(since);

  const topPaths = db
    .prepare(
      `SELECT method, path, COUNT(*) AS count, AVG(duration_ms) AS avg_duration_ms
       FROM request_log
       WHERE created_at >= ?
       GROUP BY method, path
       ORDER BY count DESC
       LIMIT 15`
    )
    .all(since);

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total_requests,
         COUNT(DISTINCT account_id) AS unique_accounts
       FROM request_log
       WHERE created_at >= ?`
    )
    .get(since);

  return {
    since,
    total_requests: totals.total_requests,
    unique_accounts: totals.unique_accounts,
    daily_counts: dailyCounts,
    top_paths: topPaths.map((row) => ({
      ...row,
      avg_duration_ms: row.avg_duration_ms == null ? null : Math.round(row.avg_duration_ms),
    })),
  };
}
