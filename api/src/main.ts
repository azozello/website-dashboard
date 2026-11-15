import { buildApp } from './app.ts';
import { loadSettings } from './config.ts';

const settings = loadSettings();
const { app } = await buildApp(settings);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: settings.host, port: settings.port });
app.log.info(
  `app API on ${settings.host}:${settings.port} for ${settings.appBaseUrl} (google sign-in ${settings.google ? 'on' : 'off'}, mail ${settings.smtpUrl ? 'smtp' : 'printed to log'})`,
);
