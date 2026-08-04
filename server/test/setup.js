// Runs before each test file's own imports resolve, so every model that
// imports db/connection.js gets a fresh in-memory database, migrated from
// scratch — no shared state with the real dev DB (data/trip.db).
process.env.DB_PATH = ':memory:';
process.env.APP_BASE_URL = 'http://localhost:48311';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
