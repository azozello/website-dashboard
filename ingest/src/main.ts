import { buildApp } from './app.js';
import { loadSettings } from './config.js';
import { migrate, pgDb } from './db.js';
import { retention } from './ingest.js';

const settings = loadSettings();
const db = pgDb(settings.databaseUrl);

// Wait for Postgres (compose start order), then migrate.
for (let i = 0; ; i++) {
  try {
    const applied = await migrate(db);
    if (applied.length) console.log(JSON.stringify({ msg: 'migrations applied', applied }));
    break;
  } catch (e) {
    if (i >= 30) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const app = buildApp({ db, settings });
await app.listen({ port: settings.port, host: settings.host });

const runRetention = () => retention(db, new Date()).catch((e) => app.log.error({ message: String(e) }, 'retention failed'));
await runRetention();
setInterval(runRetention, 6 * 3600_000).unref();

for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.on(sig, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
