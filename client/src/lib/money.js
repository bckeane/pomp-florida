export function fmtMoney(value) {
  if (value === null || value === undefined) return '—';
  return `$${Math.round(value).toLocaleString()}`;
}
