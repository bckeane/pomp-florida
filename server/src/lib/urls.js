// The client app's own origin (not this API's) — used to build Stripe
// success/cancel redirect URLs from either the admin or self-serve payment
// routes. Same fallback env vars auth.js's resetUrlFor uses.
export function clientBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}
