import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/migrate.js';
import participantsRouter from './routes/participants.js';
import statsRouter from './routes/stats.js';
import tripsRouter from './routes/trips.js';

runMigrations();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', participantsRouter);
app.use('/api', statsRouter);
app.use('/api', tripsRouter);

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 48310;
app.listen(PORT, () => {
  console.log(`Florida Trip API listening on http://localhost:${PORT}`);
});
