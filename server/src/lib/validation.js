import { z } from 'zod';

const ROLES = ['Swimmer', 'Diver', 'Adult'];
const ADULT_GRAD_YEARS = ['Coach', 'Med'];

/** Valid student grad years — the 4 classes of high school (9-12), starting
 * from the earliest class that hasn't graduated yet. Registration for a
 * given trip typically opens the fall before it (e.g. a Feb 2027 trip opens
 * for registration in fall 2026) — by then the class of that same calendar
 * year has already graduated (June), so once we're past June the window
 * shifts to start at next year instead of the current one. */
function studentGradYearsFor() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return [start, start + 1, start + 2, start + 3].map(String);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

const baseShape = {
  first_name: z.string().trim().min(1, 'first name is required'),
  last_name: z.string().trim().min(1, 'last name is required'),
  grad_year: z.string().trim().nullish(),
  birth_date: z.union([isoDate, z.literal(''), z.null(), z.undefined()]),
  role: z.enum(ROLES, { errorMap: () => ({ message: `role must be one of ${ROLES.join(', ')}` }) }),
  active: z.coerce.boolean().optional(),
  deposit_paid: z.coerce.boolean().optional(),
  final_payment_paid: z.coerce.boolean().optional(),
};

const participantSchema = z.object(baseShape);

/**
 * Validates a single participant record. Returns { data, errors } — errors
 * is an array of { field, message }, empty when the record is valid.
 */
export function validateParticipant(input) {
  const errors = [];
  const parsed = participantSchema.safeParse(input);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ field: issue.path.join('.') || '_root', message: issue.message });
    }
    return { data: null, errors };
  }

  const data = { ...parsed.data };
  data.birth_date = data.birth_date === '' ? null : data.birth_date ?? null;
  data.grad_year = data.grad_year || null;

  if (data.role === 'Adult') {
    if (data.grad_year && !ADULT_GRAD_YEARS.includes(data.grad_year)) {
      errors.push({
        field: 'grad_year',
        message: `adult grad_year must be one of ${ADULT_GRAD_YEARS.join(', ')} or blank`,
      });
    }
  } else {
    const studentGradYears = studentGradYearsFor();
    if (!data.birth_date) {
      errors.push({ field: 'birth_date', message: 'birth_date is required for students' });
    }
    if (data.grad_year && studentGradYears.length && !studentGradYears.includes(data.grad_year)) {
      errors.push({
        field: 'grad_year',
        message: `student grad_year must be one of ${studentGradYears.join(', ')}`,
      });
    }
  }

  return { data: errors.length ? null : data, errors };
}

export { ROLES, ADULT_GRAD_YEARS, studentGradYearsFor };
