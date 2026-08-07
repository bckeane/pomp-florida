import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import {
  listAdminAccounts,
  listAllAccounts,
  findAccountByEmail,
  createAccount,
  setAccountRole,
  getAccountById,
} from '../models/accounts.js';
import { isBreakGlassEmail } from '../lib/breakGlass.js';

const router = Router();

const addAdminSchema = z.object({
  email: z.string().trim().email('must be a valid email address'),
  password: z.string().min(8, 'password must be at least 8 characters').optional(),
});

const roleSchema = z.object({
  role: z.enum(['admin', 'parent']),
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

router.get('/admin/accounts/all', requireAdmin, (req, res) => {
  res.json(listAllAccounts());
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

// Promote or demote an existing account. A dedicated endpoint rather than a
// rework of POST /admin/accounts above — that route conflates create+promote
// with email/password fields and hardcodes role to 'admin', which doesn't
// cleanly support demote.
router.post('/admin/accounts/:id/role', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });
  }

  const target = getAccountById(id);
  if (!target) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Self-demotion guard: prevents the acting admin from ever locking
  // themselves out — since they can never demote themselves, at least one
  // admin (the one making the request) always remains.
  if (id === req.account.id) {
    return res.status(403).json({ error: 'You cannot change your own role' });
  }

  // Defense-in-depth, not a UI-reachable case — the break-glass account is
  // already excluded from listAllAccounts()/listAdminAccounts(), so this
  // only matters against a crafted/direct request.
  if (isBreakGlassEmail(target.email)) {
    return res.status(403).json({ error: 'Cannot change the break-glass account role' });
  }

  const account = setAccountRole(id, parsed.data.role);
  res.json({ account });
});

export default router;
