import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { runMigrations } from './db/migrate.js';
import { requestLogger } from './middleware/requestLog.js';
import participantsRouter from './routes/participants.js';
import statsRouter from './routes/stats.js';
import tripsRouter from './routes/trips.js';
import authRouter from './routes/auth.js';
import myParticipantsRouter from './routes/myParticipants.js';
import adminAccountsRouter from './routes/adminAccounts.js';
import adminTrafficRouter from './routes/adminTraffic.js';
import budgetRouter from './routes/budget.js';
import questionsRouter from './routes/questions.js';
import stripeWebhookRouter from './routes/stripeWebhook.js';

runMigrations();

const app = express();
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  throw new Error(
    'CORS_ALLOWED_ORIGINS is not set. Refusing to start with CORS open to all ' +
      'origins while credentials are enabled — set it to the real origin(s) ' +
      '(e.g. http://localhost:48311) in server/.env.'
  );
}

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  const err = new Error(`Origin ${origin} not allowed by CORS`);
  err.status = 403;
  return callback(err);
}

// helmet also disables X-Powered-By; the explicit call below is redundant
// but documents the intent directly.
// connect-src override: the swim-records feature fetches api.ctkeane.com
// directly from the browser by design (docs/designs/swim-records-integration.md,
// Premise 2) — helmet's default CSP has no connect-src, which falls back to
// default-src 'self' and silently blocks that fetch client-side. Every other
// directive keeps helmet's default.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'connect-src': ["'self'", 'https://api.ctkeane.com'],
      },
    },
  })
);
app.disable('x-powered-by');

// credentials:true + reflected origin (rather than '*') is required for the
// browser to accept/send the session cookie set by /api/auth/*.
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(requestLogger);

// Mounted before express.json(): Stripe webhook signature verification
// needs the raw request body, and its own route-scoped express.raw() (see
// routes/stripeWebhook.js) would otherwise be shadowed by the global JSON
// parser consuming the stream first.
app.use('/api', stripeWebhookRouter);

app.use(express.json({ limit: '2mb' }));

app.use('/api', participantsRouter);
app.use('/api', statsRouter);
app.use('/api', tripsRouter);
app.use('/api', authRouter);
app.use('/api', myParticipantsRouter);
app.use('/api', adminAccountsRouter);
app.use('/api', adminTrafficRouter);
app.use('/api', budgetRouter);
app.use('/api', questionsRouter);

// Serve the built client from the same origin as the API. Session cookies
// use SameSite=None to survive the GitHub Pages -> Render split, but Safari
// (desktop and iOS) blocks third-party cookies outright regardless of that
// setting, breaking sign-up/login there. Serving both from one origin makes
// the cookie same-site instead, which Safari allows.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.message);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 48310;
app.listen(PORT, () => {
  console.log(`Florida Trip API listening on http://localhost:${PORT}`);
});
