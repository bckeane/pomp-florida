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
  deleteAccount,
} from '../models/accounts.js';
import { isBreakGlassEmail } from '../lib/breakGlass.js';
import { createResetToken } from '../models/passwordResets.js';
import { sendPasswordResetEmail, resetUrlFor } from '../lib/email.js';

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

// Admin-initiated password reset: sends the same emailed reset link as the
// self-serve /auth/forgot-password flow, so it reuses that token model and
// 1-hour expiry rather than e.g. setting a temp password directly. Unlike
// forgot-password, failures are reported back (no enumeration risk here —
// the admin already knows this account exists, it's in front of them).
router.post('/admin/accounts/:id/reset-password', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const target = getAccountById(id);
  if (!target) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Same break-glass guard as the role-change/delete routes above — that
  // account's login bypasses the DB password entirely, so a reset link
  // would be sent but wouldn't actually change how it logs in.
  if (isBreakGlassEmail(target.email)) {
    return res.status(403).json({ error: 'Cannot reset the break-glass account password' });
  }

  const token = createResetToken(target.id);
  try {
    await sendPasswordResetEmail(target.email, resetUrlFor(token));
  } catch (err) {
    console.error('Failed to send admin-initiated password reset email:', err.message);
    return res.status(502).json({ error: 'Could not send the reset email. Try again in a moment.' });
  }

  res.json({ ok: true });
});

router.delete('/admin/accounts/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const target = getAccountById(id);
  if (!target) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Same self-lockout and break-glass guards as the role-change route above.
  if (id === req.account.id) {
    return res.status(403).json({ error: 'You cannot delete your own account' });
  }
  if (isBreakGlassEmail(target.email)) {
    return res.status(403).json({ error: 'Cannot delete the break-glass account' });
  }

  const result = deleteAccount(id);
  if (result.error === 'has_participants') {
    return res.status(409).json({
      error: `Cannot delete: this account has ${result.count} swimmer(s)/diver(s) registered. Reassign or remove them first.`,
    });
  }

  res.status(204).end();
});

export default router;
