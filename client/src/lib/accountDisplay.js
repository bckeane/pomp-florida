export function displayField(value) {
  if (value === null || value === undefined || value === '') return '—';
  return value;
}
