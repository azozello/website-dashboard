import { buildApp } from './app.ts';
import { loadSettings } from './config.ts';

const settings = loadSettings();
const { app, gsc } = await buildApp(settings);
const stopSync = gsc.startScheduler();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopSync();
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: settings.host, port: settings.port });
app.log.info(
  `app API on ${settings.host}:${settings.port} for ${settings.appBaseUrl} (google sign-in ${settings.google ? 'on' : 'off'}, ` +
    `search console ${gsc.available ? 'on' : settings.google ? 'off: TOKEN_ENCRYPTION_KEY missing' : 'off'}, mail ${settings.smtpUrl ? 'smtp' : 'printed to log'})`,
);
