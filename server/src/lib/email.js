import { Resend } from 'resend';

/**
 * Lazily constructed so tests / local dev without RESEND_API_KEY don't need
 * a real key — sendPasswordResetEmail falls back to logging the link instead
 * of throwing, matching the local-dev-friendly pattern used elsewhere (e.g.
 * break-glass admin) of never hard-requiring optional external services.
 */
function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

/**
 * The reset link points at the client app, not this API — in prod they're
 * the same origin (see index.js), so falling back to the first allowed CORS
 * origin covers local dev too, where the client runs on a different port.
 */
export function resetUrlFor(token) {
  const base = (process.env.APP_BASE_URL || process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return `${base}/reset-password?token=${token}`;
}

export async function sendPasswordResetEmail(to, resetUrl) {
  const client = getClient();
  const from = process.env.EMAIL_FROM;

  if (!client || !from) {
    console.warn(
      `[email] RESEND_API_KEY/EMAIL_FROM not configured — not sending. Reset link for ${to}: ${resetUrl}`
    );
    return;
  }

  // The Resend SDK resolves with { data, error } instead of rejecting on
  // API-level failures (e.g. a 422 for an invalid recipient) — only
  // network-level failures throw on their own. Without this check, an
  // await here always "succeeds" even when Resend refused to send.
  const { error } = await client.emails.send({
    from,
    to,
    subject: 'Reset your password — Pomperaug Panthers Florida Trip',
    html: `
      <p>Someone requested a password reset for this email address on the Pomperaug Panthers Florida Trip site.</p>
      <p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
    `,
  });
  if (error) {
    throw new Error(error.message || 'Resend API error');
  }
}
