import { run } from './admin.js';
import { loadSettings } from './config.js';
import { migrate, pgDb } from './db.js';

const settings = loadSettings();
const db = pgDb(settings.databaseUrl);
try {
  await migrate(db);
  console.log(JSON.stringify(await run(process.argv.slice(2), db, settings), null, 2));
} finally {
  await db.close();
}
