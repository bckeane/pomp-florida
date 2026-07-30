import { Router } from 'express';
import { z } from 'zod';
import {
  createAccount,
  findAccountByEmail,
  verifyAccountPassword,
  setAccountRole,
} from '../models/accounts.js';
import { createSession, deleteSession } from '../models/sessions.js';
import { requireAccount, SESSION_COOKIE } from '../middleware/auth.js';
import { isBreakGlassLogin } from '../lib/breakGlass.js';

const router = Router();

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().trim().email('must be a valid email address'),
  password: z.string().min(8, 'password must be at least 8 characters'),
});

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

function fieldKeyedZodErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    errors[issue.path.join('.') || '_root'] = issue.message;
  }
  return errors;
}

router.post('/auth/signup', (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });
  }

  const { email, password } = parsed.data;
  if (findAccountByEmail(email)) {
    return res.status(400).json({ errors: { email: 'An account with this email already exists' } });
  }

  const account = createAccount(email, password);
  if (!account) {
    return res.status(400).json({ errors: { email: 'An account with this email already exists' } });
  }

  const { token } = createSession(account.id);
  setSessionCookie(res, token);
  res.status(201).json({ account });
});

router.post('/auth/login', (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });
  }

  const { email, password } = parsed.data;
  let account;

  if (isBreakGlassLogin(email, password)) {
    // Deliberately bypasses verifyAccountPassword entirely — this has to
    // keep working even if the accounts table is empty or every admin
    // account's password is broken/forgotten. Materializes (or re-asserts)
    // a real admin row so sessions/requireAdmin work normally afterward.
    account = findAccountByEmail(email) || createAccount(email, password);
    account = account && setAccountRole(account.id, 'admin');
  } else {
    account = verifyAccountPassword(email, password);
  }

  if (!account) {
    return res.status(401).json({ errors: { _root: 'Invalid email or password' } });
  }

  const { token } = createSession(account.id);
  setSessionCookie(res, token);
  res.json({ account });
});

router.post('/auth/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) deleteSession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/auth/me', requireAccount, (req, res) => {
  res.json({ account: req.account });
});

export default router;
