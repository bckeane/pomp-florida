import { Router } from 'express';
import { z } from 'zod';
import {
  createAccount,
  findAccountByEmail,
  verifyAccountPassword,
  getAccountById,
  updateAccountPassword,
} from '../models/accounts.js';
import { createSession, deleteSession, deleteSessionsByAccount } from '../models/sessions.js';
import { createResetToken, consumeResetToken } from '../models/passwordResets.js';
import { requireAccount, SESSION_COOKIE } from '../middleware/auth.js';
import { isBreakGlassLogin } from '../lib/breakGlass.js';
import { sendPasswordResetEmail } from '../lib/email.js';

const router = Router();

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().trim().email('must be a valid email address'),
  password: z.string().min(8, 'password must be at least 8 characters'),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('must be a valid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'missing token'),
  password: z.string().min(8, 'password must be at least 8 characters'),
});

/**
 * The reset link points at the client app, not this API — in prod they're
 * the same origin (see index.js), so falling back to the first allowed CORS
 * origin covers local dev too, where the client runs on a different port.
 */
function resetUrlFor(token) {
  const base = (process.env.APP_BASE_URL || process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return `${base}/reset-password?token=${token}`;
}

function setSessionCookie(res, token) {
  const sameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    sameSite === 'none' ||
    process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
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
    // account's password is broken/forgotten. Does NOT persist role='admin'
    // here — getAccountById grants admin dynamically to whichever account
    // currently matches BREAK_GLASS_EMAIL (see models/accounts.js), so
    // rotating/unsetting the env var revokes access immediately on the next
    // request instead of leaving a permanent admin row behind. Routes
    // through getAccountById (not the raw findAccountByEmail row) so the
    // response never includes password_hash.
    const existing = findAccountByEmail(email);
    account = existing ? getAccountById(existing.id) : createAccount(email, password);
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

router.post('/auth/forgot-password', async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });
  }

  const { email } = parsed.data;
  const account = findAccountByEmail(email);

  // Always respond the same way whether or not the account exists, so this
  // endpoint can't be used to enumerate registered emails.
  if (account) {
    const token = createResetToken(account.id);
    try {
      await sendPasswordResetEmail(account.email, resetUrlFor(token));
    } catch (err) {
      console.error('Failed to send password reset email:', err.message);
    }
  }

  res.json({ ok: true });
});

router.post('/auth/reset-password', (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });
  }

  const { token, password } = parsed.data;
  const accountId = consumeResetToken(token);
  if (!accountId) {
    return res.status(400).json({ errors: { _root: 'This reset link is invalid or has expired.' } });
  }

  updateAccountPassword(accountId, password);
  deleteSessionsByAccount(accountId);

  const { token: sessionToken } = createSession(accountId);
  setSessionCookie(res, sessionToken);
  res.json({ account: getAccountById(accountId) });
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
