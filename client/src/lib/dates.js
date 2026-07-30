/** Parses an ISO 'YYYY-MM-DD' string as a local-midnight Date, avoiding the
 * UTC-parsing off-by-one that `new Date(iso)` produces near midnight. */
export function parseLocalDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatLongDate(iso) {
  const date = parseLocalDate(iso);
  if (!date) return null;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatShortDate(iso) {
  const date = parseLocalDate(iso);
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
