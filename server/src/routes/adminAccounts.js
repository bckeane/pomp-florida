import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { listAdminAccounts, findAccountByEmail, createAccount, setAccountRole } from '../models/accounts.js';

const router = Router();

const addAdminSchema = z.object({
  email: z.string().trim().email('must be a valid email address'),
  password: z.string().min(8, 'password must be at least 8 characters').optional(),
});

function fieldKeyedZodErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    errors[issue.path.join('.') || '_root'] = issue.message;
  }
  return errors;
}

router.get('/admin/accounts', requireAdmin, (req, res) => {
  res.json(listAdminAccounts());
});

router.post('/admin/accounts', requireAdmin, (req, res) => {
  const parsed = addAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });
  }

  const { email, password } = parsed.data;
  const existing = findAccountByEmail(email);

  if (existing) {
    const account = setAccountRole(existing.id, 'admin');
    return res.json({ account, promoted: true });
  }

  if (!password) {
    return res.status(400).json({
      errors: { password: "Required to create a new account — this email hasn't signed up yet" },
    });
  }

  const created = createAccount(email, password);
  if (!created) {
    return res.status(400).json({ errors: { email: 'Could not create an account for this email' } });
  }

  const account = setAccountRole(created.id, 'admin');
  res.status(201).json({ account, promoted: false });
});

export default router;
