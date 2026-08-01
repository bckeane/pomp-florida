import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { runMigrations } from './db/migrate.js';
import participantsRouter from './routes/participants.js';
import statsRouter from './routes/stats.js';
import tripsRouter from './routes/trips.js';
import authRouter from './routes/auth.js';
import myParticipantsRouter from './routes/myParticipants.js';
import adminAccountsRouter from './routes/adminAccounts.js';
import budgetRouter from './routes/budget.js';

runMigrations();

const app = express();
// credentials:true + reflected origin (rather than '*') is required for the
// browser to accept/send the session cookie set by /api/auth/*.
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

app.use('/api', participantsRouter);
app.use('/api', statsRouter);
app.use('/api', tripsRouter);
app.use('/api', authRouter);
app.use('/api', myParticipantsRouter);
app.use('/api', adminAccountsRouter);
app.use('/api', budgetRouter);

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 48310;
app.listen(PORT, () => {
  console.log(`Florida Trip API listening on http://localhost:${PORT}`);
});
