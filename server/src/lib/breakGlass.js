import crypto from 'node:crypto';

/**
 * Hashing both sides to a fixed-length digest before comparing avoids ever
 * branching on raw input length, which crypto.timingSafeEqual itself would
 * throw on if the two buffers differ in length.
 */
function safeStringEqual(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

/**
 * True if (email, password) matches BREAK_GLASS_EMAIL/PASSWORD from the
 * environment. Deliberately does not touch the database — this has to keep
 * working even if the accounts table is empty, corrupted, or every admin
 * account is locked out.
 */
export function isBreakGlassLogin(email, password) {
  const bgEmail = process.env.BREAK_GLASS_EMAIL;
  const bgPassword = process.env.BREAK_GLASS_PASSWORD;
  if (!bgEmail || !bgPassword) return false;

  const emailMatches = safeStringEqual(String(email).trim().toLowerCase(), bgEmail.trim().toLowerCase());
  const passwordMatches = safeStringEqual(password, bgPassword);
  return emailMatches && passwordMatches;
}

export function isBreakGlassEmail(email) {
  const bgEmail = process.env.BREAK_GLASS_EMAIL;
  if (!bgEmail) return false;
  return email.trim().toLowerCase() === bgEmail.trim().toLowerCase();
}
