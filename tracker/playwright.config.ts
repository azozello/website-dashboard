import { defineConfig, devices } from '@playwright/test';

const COLLECT_PORT = 4020;
const SITE_PORT = 4021;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // one shared mock collector, reset per test
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${SITE_PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'node server.mjs',
      cwd: '../contract/mock-collector',
      env: { PORT: String(COLLECT_PORT), HOST: '127.0.0.1', R1_JS: '../../tracker/dist/r1.js' },
      url: `http://127.0.0.1:${COLLECT_PORT}/healthz`,
      reuseExistingServer: false,
    },
    {
      command: 'node e2e/site-server.mjs',
      env: { SITE_PORT: String(SITE_PORT), COLLECT_URL: `http://127.0.0.1:${COLLECT_PORT}` },
      url: `http://localhost:${SITE_PORT}/index.html`,
      reuseExistingServer: false,
    },
  ],
});
