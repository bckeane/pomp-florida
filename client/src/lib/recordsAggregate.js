/** Splits a Promise.allSettled() result array into fulfilled values and a
 * failure count, and classifies the failure severity — used by both
 * SwimmerSearchPage and Top25ExportPage, which each fan out one fetch per
 * event and need to tell the user when some (or all) of those fetches
 * failed instead of silently presenting a partial answer as complete. */
export function aggregateSettled(results) {
  const fulfilled = [];
  let failedCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      fulfilled.push(result.value);
    } else {
      failedCount += 1;
    }
  }

  const total = results.length;
  return {
    fulfilled,
    failedCount,
    total,
    // 100% failure escalates to the full error state rather than the
    // softer "may be incomplete" notice (docs/designs/swim-records-integration.md,
    // Failure Modes) — a total outage deserves the same clear signal as
    // everywhere else on these pages, not an undersold caption on a 0-of-N result.
    allFailed: total > 0 && failedCount === total,
    somePartialFailure: failedCount > 0 && failedCount < total,
  };
}
