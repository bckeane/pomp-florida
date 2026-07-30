import { runMigrations } from '../src/db/migrate.js';
import { createAccount, findAccountByEmail, setAccountRole } from '../src/models/accounts.js';

runMigrations();

const email = process.argv[2];
const password = process.env.ADMIN_PASSWORD || process.argv[3];

if (!email || !password) {
  console.error('Usage:');
  console.error('  ADMIN_PASSWORD=yourpassword node scripts/create-admin.js <email>');
  console.error('  node scripts/create-admin.js <email> <password>   (ends up in shell history — prefer the env var form)');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const existing = findAccountByEmail(email);

if (existing) {
  const account = setAccountRole(existing.id, 'admin');
  console.log(`Promoted existing account to admin: ${account.email}`);
} else {
  const account = createAccount(email, password);
  if (!account) {
    console.error(`Could not create an account for ${email}.`);
    process.exit(1);
  }
  const admin = setAccountRole(account.id, 'admin');
  console.log(`Created admin account: ${admin.email}`);
}
