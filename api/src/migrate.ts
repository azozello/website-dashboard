/** `npm run migrate`: apply pending migrations with DATABASE_URL (use the database owner, not app_rw). */
import { createPool, migrate } from './db.ts';

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (or MIGRATION_DATABASE_URL) is required');
const db = createPool(url);
try {
  const applied = await migrate(db);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date');
} finally {
  await db.end();
}
