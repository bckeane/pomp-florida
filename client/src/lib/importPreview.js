import { ADULT_GRAD_YEARS } from '../constants.js';
import { studentGradYears } from './derived.js';

const ROLE_ALIASES = { swim: 'Swimmer', swimmer: 'Swimmer', dive: 'Diver', diver: 'Diver', adult: 'Adult' };

// "Grade 2026" is intentionally not mapped — grade is always derived from
// grad_year + trip year now, so any grade column in pasted data is ignored.
const HEADER_MAP = {
  'first name': 'first_name',
  'last name': 'last_name',
  'grad year': 'grad_year',
  'birth date': 'birth_date',
  role: 'role',
};

function normalizeDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

export function mapRow(rawRecord) {
  const record = {};
  for (const [key, value] of Object.entries(rawRecord)) {
    const normalizedKey = key.trim().toLowerCase();
    const field = HEADER_MAP[normalizedKey] || key.trim();
    record[field] = typeof value === 'string' ? value.trim() : value;
  }

  const role = record.role ? ROLE_ALIASES[record.role.trim().toLowerCase()] || record.role : '';

  return {
    first_name: record.first_name || '',
    last_name: record.last_name || '',
    grad_year: record.grad_year || '',
    birth_date: normalizeDate(record.birth_date) || '',
    role,
  };
}

/** Lightweight client-side preview check — the server remains authoritative. */
export function previewValidate(row, tripYear) {
  const errors = [];
  if (!row.first_name) errors.push('first name is required');
  if (!row.last_name) errors.push('last name is required');
  if (!['Swimmer', 'Diver', 'Adult'].includes(row.role)) {
    errors.push('role must be Swimmer, Diver, or Adult (or alias Swim/Dive)');
  }

  const isAdult = row.role === 'Adult';
  if (isAdult) {
    if (row.grad_year && !ADULT_GRAD_YEARS.includes(row.grad_year)) {
      errors.push(`adult grad year must be ${ADULT_GRAD_YEARS.join(' or ')}`);
    }
  } else {
    const gradYearOptions = studentGradYears(tripYear);
    if (!row.birth_date) errors.push('birth date is required for students');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date)) errors.push('birth date not recognized');
    if (row.grad_year && gradYearOptions.length && !gradYearOptions.includes(row.grad_year)) {
      errors.push(`student grad year must be one of ${gradYearOptions.join(', ')}`);
    }
  }

  return errors;
}
