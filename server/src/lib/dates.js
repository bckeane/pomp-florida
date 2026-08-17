// Inclusive list of 'YYYY-MM-DD' strings from startDate to endDate. Built
// entirely in UTC (never a local Date, never .getDate()/.setDate()) so a
// day boundary never shifts under DST — a local-time walk would skip or
// repeat a date on the day clocks change.
export function datesInRange(startDate, endDate) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const end = Date.UTC(ey, em - 1, ed);
  const dates = [];
  for (let cursor = Date.UTC(sy, sm - 1, sd); cursor <= end; cursor += 86400000) {
    const d = new Date(cursor);
    dates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    );
  }
  return dates;
}

/** Normalizes a date string to ISO YYYY-MM-DD, accepting ISO or US M/D/YYYY input. */
export function normalizeDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return trimmed; // let downstream validation reject anything unrecognized
}
