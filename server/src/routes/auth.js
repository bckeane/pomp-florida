import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createAccount,
  findAccountByEmail,
  verifyAccountPassword,
  getAccountById,
  updateAccountPassword,
  updateAccountProfile,
} from '../models/accounts.js';
import { createSession, deleteSession, deleteSessionsByAccount } from '../models/sessions.js';
import { createResetToken, consumeResetToken } from '../models/passwordResets.js';
import { requireAccount, SESSION_COOKIE } from '../middleware/auth.js';
import { isBreakGlassLogin } from '../lib/breakGlass.js';
import { sendPasswordResetEmail, resetUrlFor } from '../lib/email.js';

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

const profileSchema = z.object({
  parent_name: z.string().trim().min(1, 'name is required'),
  emergency_phone: z.string().trim().min(1, 'emergency contact number is required'),
});

// Brute-force protection: only failed attempts count against the limit, so a
// legitimate user who mistypes their password once or twice never gets
// locked out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({ errors: { _root: 'Too many login attempts. Please try again later.' } });
  },
});

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

router.post('/auth/login', loginLimiter, (req, res) => {
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

// Parent name + emergency contact, collected once per account via the
// one-time gate on the register page (see RegisterPage.jsx / ParentProfileGate).
// Both fields are required here — this is the only route that sets them,
// so there's no partial-update path that could leave one populated and the
// other blank.
router.patch('/auth/profile', requireAccount, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });
  }

  const account = updateAccountProfile(req.account.id, parsed.data);
  res.json({ account });
});

export default router;
