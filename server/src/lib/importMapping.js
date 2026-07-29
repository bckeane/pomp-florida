import { normalizeDate } from './dates.js';

const ROLE_ALIASES = {
  swim: 'Swimmer',
  swimmer: 'Swimmer',
  dive: 'Diver',
  diver: 'Diver',
  adult: 'Adult',
};

// Recognizes the spreadsheet's original header row. "Grade 2026" is
// intentionally not mapped to anything — grade is always derived from
// grad_year + trip year now, so any grade column in pasted data is ignored.
const SPREADSHEET_HEADER_MAP = {
  'first name': 'first_name',
  'last name': 'last_name',
  'grad year': 'grad_year',
  'birth date': 'birth_date',
  role: 'role',
};

/** Accepts either the spreadsheet's human headers or the internal field names. */
export function mapImportRecord(rawRecord) {
  const record = {};
  for (const [key, value] of Object.entries(rawRecord)) {
    const normalizedKey = key.trim().toLowerCase();
    const field = SPREADSHEET_HEADER_MAP[normalizedKey] || key.trim();
    record[field] = typeof value === 'string' ? value.trim() : value;
  }

  return {
    first_name: (record.first_name || '').trim(),
    last_name: (record.last_name || '').trim(),
    grad_year: record.grad_year ? String(record.grad_year).trim() : null,
    birth_date: normalizeDate(record.birth_date),
    role: normalizeRole(record.role),
  };
}

function normalizeRole(value) {
  if (!value) return value;
  const key = String(value).trim().toLowerCase();
  return ROLE_ALIASES[key] || value;
}
